package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base32"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Provider struct{ Name, Base, Token string }
type Server struct {
	hotel, wisata Provider
	client        *http.Client
	store         Store
	demo          bool
}
type Store interface {
	Save(*Order) error
	Load(string) (*Order, error)
}
type FileStore struct {
	path string
	mu   sync.Mutex
}
type SupaStore struct {
	base, key string
	client    *http.Client
}
type Customer struct {
	Name  string `json:"name"`
	Email string `json:"email"`
	Phone string `json:"phone"`
}
type Item struct {
	Type          string `json:"type"`
	HotelID       string `json:"hotelId,omitempty"`
	RoomID        string `json:"roomId,omitempty"`
	CheckIn       string `json:"checkIn,omitempty"`
	CheckOut      string `json:"checkOut,omitempty"`
	Guests        int    `json:"guests,omitempty"`
	DestinationID int    `json:"destinationId,omitempty"`
	VisitDate     string `json:"visitDate,omitempty"`
	Quantity      int    `json:"quantity,omitempty"`
	Tier          string `json:"tier,omitempty"`
	// Traveler-owned planned times, not provider-confirmed reservation slots.
	PlannedStartTime string `json:"plannedStartTime,omitempty"`
	PlannedEndTime   string `json:"plannedEndTime,omitempty"`
}
type BookingInput struct {
	Customer Customer `json:"customer"`
	Items    []Item   `json:"items"`
}
type OrderItem struct {
	ComponentID       string `json:"componentId,omitempty"`
	AddOnID           string `json:"addOnId,omitempty"`
	Required          bool   `json:"required,omitempty"`
	Native            bool   `json:"native,omitempty"`
	LastCheckedAt     string `json:"lastCheckedAt,omitempty"`
	SyncError         string `json:"syncError,omitempty"`
	Item              Item   `json:"item"`
	Status            string `json:"status"`
	BookingID         string `json:"bookingId,omitempty"`
	ProviderBookingID string `json:"providerBookingId,omitempty"`
	Amount            int64  `json:"amount"`
	RawStatus         string `json:"rawStatus,omitempty"`
	Error             string `json:"error,omitempty"`
}
type Order struct {
	PackageID            string          `json:"packageId,omitempty"`
	StartDate            string          `json:"startDate,omitempty"`
	Guests               int             `json:"guests,omitempty"`
	SelectedAddOns       []SelectedAddOn `json:"selectedAddOns,omitempty"`
	Pricing              PackagePricing  `json:"pricing,omitempty"`
	RequiresManualAction bool            `json:"requiresManualAction,omitempty"`
	Revision             int             `json:"revision"`
	LastSyncedAt         string          `json:"lastSyncedAt,omitempty"`
	ID                   string          `json:"id"`
	SecretHash           string          `json:"-"`
	Status               string          `json:"status"`
	Customer             Customer        `json:"customer"`
	Items                []OrderItem     `json:"items"`
	Total                int64           `json:"total"`
	CreatedAt            string          `json:"createdAt"`
	UpdatedAt            string          `json:"updatedAt"`
}
type storedOrder struct {
	*Order
	Hash string `json:"secretHash"`
}

func getenv(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
func token() string {
	var b [24]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b[:])
}

var orderIDPattern = regexp.MustCompile(`^JT-[A-Z2-7]{12}$`)
var legacyOrderIDPattern = regexp.MustCompile(`^JT-[0-9a-f]{32}$`)

func validOrderID(s string) bool {
	return orderIDPattern.MatchString(s) || legacyOrderIDPattern.MatchString(s)
}
func shortOrderID() string {
	var b [8]byte
	if _, e := rand.Read(b[:]); e != nil {
		panic(e)
	}
	return "JT-" + base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b[:])[:12]
}
func statusCanonical(provider, raw string) string {
	st := strings.ToUpper(strings.TrimSpace(raw))
	switch st {
	case "CONFIRMED", "PAID", "SUCCESS", "COMPLETED":
		return "CONFIRMED"
	case "DECLINED", "REJECTED":
		return "DECLINED"
	case "CANCELLED", "CANCELED", "REFUNDED":
		return "CANCELLED"
	case "FAILED":
		return "FAILED"
	case "PENDING", "HOLD", "PROCESSING":
		return "PENDING"
	default:
		return "UNKNOWN"
	}
}
func recompute(o *Order) {
	yes, bad, pending, unknown, unattempted := 0, 0, 0, 0, 0
	var amount int64
	requiredOK := true
	for _, i := range o.Items {
		switch i.Status {
		case "CONFIRMED":
			yes++
			amount += i.Amount
		case "DECLINED", "CANCELLED", "FAILED":
			bad++
		case "PENDING", "IN_FLIGHT":
			pending++
		case "NOT_ATTEMPTED":
			unattempted++
		default:
			unknown++
		}
		if o.PackageID != "" && i.Required && i.Status != "CONFIRMED" {
			requiredOK = false
		}
	}
	if o.PackageID != "" {
		discount := int64(0)
		// Discount is controlled by JogjaTrip but only earned when required provider bookings confirm.
		// Failed optional add-ons do not invalidate the required package.
		if requiredOK && unknown == 0 && pending == 0 && unattempted == 0 {
			discount = o.Pricing.BundleDiscount
		}
		if discount > amount {
			discount = amount
		}

		o.Pricing.AppliedDiscount = discount
		o.Pricing.Total = amount - discount
		if o.Pricing.Total < 0 {
			o.Pricing.Total = 0
		}
		o.Total = o.Pricing.Total
		switch {
		case unknown > 0:
			o.Status = "UNKNOWN"
		case pending > 0:
			o.Status = "PROCESSING"
		case unattempted > 0 && yes == 0 && bad == 0:
			o.Status = "PROCESSING"
		case !requiredOK && yes > 0:
			o.Status = "PARTIAL"
		case !requiredOK:
			o.Status = "FAILED"
		case yes > 0:
			o.Status = "CONFIRMED"
		default:
			o.Status = "FAILED"
		}
		return
	}
	o.Total = amount
	switch {
	case unknown > 0:
		o.Status = "UNKNOWN"
	case pending > 0:
		o.Status = "PROCESSING"
	case yes == len(o.Items) && yes > 0:
		o.Status = "CONFIRMED"
	case yes > 0:
		o.Status = "PARTIAL"
	case bad > 0:
		o.Status = "FAILED"
	case unattempted > 0:
		o.Status = "FAILED"
	default:
		o.Status = "UNKNOWN"
	}
}

func hash(v string) string { x := sha256.Sum256([]byte(v)); return hex.EncodeToString(x[:]) }
func validDate(s string) bool {
	d, e := time.Parse("2006-01-02", s)
	return e == nil && d.Format("2006-01-02") == s
}
func send(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, status int, msg string) {
	send(w, status, map[string]string{"error": msg})
}
func (f *FileStore) Save(o *Order) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := os.MkdirAll(f.path, 0700); err != nil {
		return err
	}
	b, err := json.Marshal(storedOrder{Order: o, Hash: o.SecretHash})
	if err != nil {
		return err
	}
	tmp := filepath.Join(f.path, o.ID+".tmp")
	final := filepath.Join(f.path, o.ID+".json")
	if err = os.WriteFile(tmp, b, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, final)
}
func (f *FileStore) Load(id string) (*Order, error) {
	if !validOrderID(id) {
		return nil, os.ErrNotExist
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	b, err := os.ReadFile(filepath.Join(f.path, id+".json"))
	if err != nil {
		return nil, err
	}
	var x storedOrder
	if err = json.Unmarshal(b, &x); err != nil {
		return nil, err
	}
	if x.Order == nil {
		return nil, errors.New("corrupt")
	}
	x.Order.SecretHash = x.Hash
	return x.Order, nil
}
func (s *SupaStore) call(method, endpoint string, payload any) ([]byte, error) {
	var body io.Reader
	if payload != nil {
		b, _ := json.Marshal(payload)
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, s.base+endpoint, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", s.key)
	req.Header.Set("Authorization", "Bearer "+s.key)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Prefer", "resolution=merge-duplicates,return=representation")
	res, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 1024*1024))
	if res.StatusCode >= 300 {
		return nil, fmt.Errorf("storage HTTP %d: %s", res.StatusCode, string(b))
	}
	return b, nil
}
func (s *SupaStore) Save(o *Order) error {
	_, err := s.call("POST", "/rest/v1/jt_orders?on_conflict=id", []map[string]any{{"id": o.ID, "payload": storedOrder{Order: o, Hash: o.SecretHash}}})
	return err
}
func (s *SupaStore) Load(id string) (*Order, error) {
	b, err := s.call("GET", "/rest/v1/jt_orders?id=eq."+url.QueryEscape(id)+"&select=payload", nil)
	if err != nil {
		return nil, err
	}
	var rows []struct {
		Payload storedOrder `json:"payload"`
	}
	if err = json.Unmarshal(b, &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 || rows[0].Payload.Order == nil {
		return nil, os.ErrNotExist
	}
	o := rows[0].Payload.Order
	o.SecretHash = rows[0].Payload.Hash
	return o, nil
}
func (s *Server) upstream(ctx context.Context, p Provider, method, path string, body any, idem string) (any, error) {
	if p.Base == "" {
		return nil, fmt.Errorf("%s belum dikonfigurasi", p.Name)
	}
	var rd io.Reader
	if body != nil {
		b, e := json.Marshal(body)
		if e != nil {
			return nil, e
		}
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(p.Base, "/")+path, rd)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if p.Token != "" {
		req.Header.Set("Authorization", "Bearer "+p.Token)
	}
	if idem != "" {
		req.Header.Set("Idempotency-Key", idem)
	}
	res, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%s tidak dapat dihubungi: %w", p.Name, err)
	}
	defer res.Body.Close()
	b, e := io.ReadAll(io.LimitReader(res.Body, 2*1024*1024))
	if e != nil {
		return nil, e
	}
	if res.StatusCode >= 300 {
		return nil, fmt.Errorf("%s HTTP %d: %s", p.Name, res.StatusCode, string(b[:min(len(b), 240)]))
	}
	var out any
	if len(b) > 0 {
		if e = json.Unmarshal(b, &out); e != nil {
			return nil, fmt.Errorf("%s mengirim non-JSON", p.Name)
		}
	}
	return out, nil
}
func asMap(x any) map[string]any {
	m, _ := x.(map[string]any)
	if m == nil {
		return map[string]any{}
	}
	return m
}
func str(x any) string {
	switch v := x.(type) {
	case string:
		return v
	case float64:
		return strconv.FormatInt(int64(v), 10)
	default:
		return ""
	}
}
func num(x any) int64 {
	switch v := x.(type) {
	case float64:
		return int64(v)
	case int:
		return int64(v)
	case json.Number:
		n, _ := v.Int64()
		return n
	default:
		return 0
	}
}
func regionName(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	switch {
	case strings.Contains(s, "sleman"):
		return "Sleman"
	case strings.Contains(s, "bantul"):
		return "Bantul"
	case strings.Contains(s, "gunungkidul"), strings.Contains(s, "gunung kidul"):
		return "Gunungkidul"
	case strings.Contains(s, "kulon"):
		return "Kulon Progo"
	case strings.Contains(s, "yogyakarta"), strings.Contains(s, "jogja"):
		return "Kota Yogyakarta"
	default:
		return name
	}
}

// The upstream Hotel and Wisata APIs accept dates but do not expose confirmed
// hour slots. These fields are for the JogjaTrip schedule only.
func validatePlannedTimes(start, end string) error {
	if start == "" && end == "" { // backwards compatible with old orders
		return nil
	}
	if start == "" || end == "" {
		return errors.New("Jam rencana mulai dan selesai harus diisi bersama")
	}
	a, err := time.Parse("15:04", start)
	if err != nil {
		return errors.New("Jam mulai harus HH:MM")
	}
	b, err := time.Parse("15:04", end)
	if err != nil || !b.After(a) {
		return errors.New("Jam selesai harus setelah jam mulai")
	}
	return nil
}

func validInput(in BookingInput) error {
	if strings.TrimSpace(in.Customer.Name) == "" || !strings.Contains(in.Customer.Email, "@") {
		return errors.New("Nama dan email pelanggan wajib valid")
	}
	if len(in.Items) < 1 || len(in.Items) > 5 {
		return errors.New("Pilih 1–5 layanan")
	}
	for _, it := range in.Items {
		if err := validatePlannedTimes(it.PlannedStartTime, it.PlannedEndTime); err != nil {
			return err
		}
		switch it.Type {
		case "hotel":
			if it.HotelID == "" || it.RoomID == "" || !validDate(it.CheckIn) || !validDate(it.CheckOut) || it.Guests < 1 || it.Guests > 20 || it.CheckOut <= it.CheckIn {
				return errors.New("Parameter hotel tidak valid")
			}
		case "wisata":
			if it.DestinationID < 1 || !validDate(it.VisitDate) || it.Quantity < 1 || it.Quantity > 20 || !(it.Tier == "base" || it.Tier == "plus") {
				return errors.New("Parameter tiket wisata tidak valid")
			}
		default:
			return errors.New("Tipe layanan tidak terdaftar")
		}
	}
	return nil
}
func (s *Server) check(ctx context.Context, it Item) (int64, error) {
	switch it.Type {
	case "hotel":
		path := "/api/v1/hotels/" + url.PathEscape(it.HotelID) + "/availability?checkIn=" + url.QueryEscape(it.CheckIn) + "&checkOut=" + url.QueryEscape(it.CheckOut)
		res, err := s.upstream(ctx, s.hotel, "GET", path, nil, "")
		if err != nil {
			return 0, err
		}
		rs, _ := asMap(res)["rooms"].([]any)
		for _, r := range rs {
			v := asMap(r)
			if str(v["roomId"]) == it.RoomID {
				if num(v["unitsAvailable"]) < 1 {
					return 0, errors.New("Kamar penuh")
				}
				if num(v["capacity"]) < int64(it.Guests) {
					return 0, errors.New("Kapasitas kamar tidak cukup")
				}
				return num(v["totalPrice"]), nil
			}
		}
		return 0, errors.New("Kamar tidak tersedia")
	case "wisata":
		p := fmt.Sprintf("/api/v1/destinations/%d/availability?date=%s&qty=%d&tier=%s", it.DestinationID, url.QueryEscape(it.VisitDate), it.Quantity, it.Tier)
		res, err := s.upstream(ctx, s.wisata, "GET", p, nil, "")
		if err != nil {
			return 0, err
		}
		m := asMap(res)
		if m["available"] != true {
			return 0, errors.New("Tiket tidak tersedia")
		}
		return num(m["total"]), nil
	}
	return 0, errors.New("Unsupported")
}
func (s *Server) catalog(w http.ResponseWriter, r *http.Request) {
	which := r.PathValue("which")
	var p Provider
	var path string
	switch which {
	case "hotels":
		p = s.hotel
		path = "/api/v1/hotels"
	case "rooms":
		p = s.hotel
		path = "/api/v1/rooms"
	case "destinations":
		p = s.wisata
		path = "/api/v1/destinations"
	default:
		fail(w, 404, "Katalog tidak dikenal")
		return
	}
	if region := r.URL.Query().Get("region"); region != "" {
		if which == "hotels" || which == "rooms" {
			path += "?city=" + url.QueryEscape(regionName(region))
		} else {
			slug := strings.ToLower(strings.ReplaceAll(regionName(region), " ", "-"))
			if slug != "kota-yogyakarta" {
				slug = "kabupaten-" + slug
			}
			path += "?region=" + url.QueryEscape(slug)
		}
	}
	out, err := s.upstream(r.Context(), p, "GET", path, nil, "")
	if err != nil {
		fail(w, 502, err.Error())
		return
	}
	// Wisata returns photos as root-relative paths (/static/img/...).
	// Resolve against its public origin so the JogjaTrip frontend can load them.
	if which == "destinations" {
		if rows, ok := out.([]any); ok {
			baseURL, parseErr := url.Parse(p.Base)
			if parseErr == nil && (baseURL.Scheme == "https" || baseURL.Scheme == "http") {
				for _, row := range rows {
					m, ok := row.(map[string]any)
					if !ok {
						continue
					}
					photos, ok := m["photos"].([]any)
					if !ok || len(photos) == 0 {
						continue
					}
					photo, ok := photos[0].(string)
					if !ok || photo == "" {
						continue
					}
					ref, err := url.Parse(photo)
					if err != nil {
						continue
					}
					resolved := baseURL.ResolveReference(ref)
					if resolved.Scheme == "http" || resolved.Scheme == "https" {
						m["imageUrl"] = resolved.String()
					}
				}
			}
		}
	}
	send(w, 200, map[string]any{"provider": p.Name, "items": out})
}
func readInput(w http.ResponseWriter, r *http.Request) (BookingInput, bool) {
	var in BookingInput
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
	if json.NewDecoder(r.Body).Decode(&in) != nil {
		fail(w, 400, "JSON tidak valid")
		return in, false
	}
	if err := validInput(in); err != nil {
		fail(w, 400, err.Error())
		return in, false
	}
	return in, true
}
func (s *Server) quote(w http.ResponseWriter, r *http.Request) {
	in, ok := readInput(w, r)
	if !ok {
		return
	}
	out := []map[string]any{}
	var total int64
	for _, it := range in.Items {
		price, err := s.check(r.Context(), it)
		if err != nil {
			fail(w, 409, err.Error())
			return
		}
		total += price
		out = append(out, map[string]any{"item": it, "amount": price})
	}
	send(w, 200, map[string]any{"items": out, "total": total, "currency": "IDR", "note": "Harga akan dicek ulang pada saat booking; pembayaran hanya simulasi."})
}
func (s *Server) bookProvider(ctx context.Context, o *Order, i int) (string, string, error) {
	it := o.Items[i].Item
	idem := o.ID + "-" + strconv.Itoa(i)
	if it.Type == "hotel" {
		payload := map[string]any{"hotelId": it.HotelID, "roomId": it.RoomID, "guestName": o.Customer.Name, "guestEmail": o.Customer.Email, "guestPhone": o.Customer.Phone, "guests": it.Guests, "checkIn": it.CheckIn, "checkOut": it.CheckOut}
		res, err := s.upstream(ctx, s.hotel, "POST", "/api/v1/hotel-bookings", payload, idem)
		if err != nil {
			return "", "", err
		}
		m := asMap(res)
		return str(m["bookingId"]), str(m["status"]), nil
	}
	payload := map[string]any{"destination_id": it.DestinationID, "visit_date": it.VisitDate, "qty": it.Quantity, "tier": it.Tier, "external_ref": idem, "customer": map[string]any{"name": o.Customer.Name, "email": o.Customer.Email, "phone": o.Customer.Phone}}
	res, err := s.upstream(ctx, s.wisata, "POST", "/api/v1/partner/bookings", payload, idem)
	if err != nil {
		return "", "", err
	}
	m := asMap(res)
	id := str(m["code"])
	if id == "" {
		id = str(m["booking_code"])
	}
	return id, str(m["status"]), nil
}
func (s *Server) book(w http.ResponseWriter, r *http.Request) {
	in, ok := readInput(w, r)
	if !ok {
		return
	}
	for _, it := range in.Items {
		p := s.hotel
		if it.Type == "wisata" {
			p = s.wisata
		}
		if p.Base == "" || p.Token == "" {
			fail(w, 503, "Konfigurasi URL/token partner "+p.Name+" belum lengkap")
			return
		}
	}
	secret := token()
	o := &Order{ID: shortOrderID(), SecretHash: hash(secret), Status: "PROCESSING", Customer: in.Customer, CreatedAt: time.Now().UTC().Format(time.RFC3339)}
	for _, it := range in.Items {
		o.Items = append(o.Items, OrderItem{Item: it, Status: "NOT_ATTEMPTED"})
	}
	o.UpdatedAt = o.CreatedAt
	if err := s.store.Save(o); err != nil {
		fail(w, 503, "Gagal menyimpan order sebelum booking: "+err.Error())
		return
	}
	success := 0
	for i := range o.Items {
		price, err := s.check(r.Context(), o.Items[i].Item)
		if err != nil {
			o.Items[i].Status = "FAILED"
			o.Items[i].Error = err.Error()
			break
		}
		o.Items[i].Amount = price
		o.Items[i].Status = "IN_FLIGHT"
		o.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
		if err = s.store.Save(o); err != nil {
			o.Items[i].Status = "UNKNOWN"
			o.Items[i].Error = "Tidak berhasil menyimpan status sebelum booking"
			break
		}
		bid, raw, err := s.bookProvider(r.Context(), o, i)
		if err != nil {
			o.Items[i].Status = "UNKNOWN"
			o.Items[i].Error = err.Error()
			break
		}
		if bid == "" {
			o.Items[i].Status = "UNKNOWN"
			o.Items[i].Error = "Penyedia tidak mengembalikan ID booking"
			break
		}
		o.Items[i].BookingID = bid
		o.Items[i].RawStatus = raw
		o.Items[i].Status = statusCanonical(itProvider(o.Items[i].Item), raw)
		if o.Items[i].Status == "CONFIRMED" {
			success++
		}
		o.Total += price
		o.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
		if err = s.store.Save(o); err != nil {
			o.Items[i].Status = "UNKNOWN"
			o.Items[i].Error = "Tidak berhasil menyimpan status sebelum booking"
			break
		}
	}
	_ = success
	recompute(o)
	o.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if err := s.store.Save(o); err != nil {
		log.Printf("CRITICAL order save failed (ID redacted): %v", err)
		fail(w, 503, "Status booking belum dapat dipastikan; hubungi admin dengan ID "+o.ID)
		return
	}
	send(w, 200, map[string]any{"order": o, "accessToken": secret, "warning": "Jika parsial/UNKNOWN, jangan mengulang checkout. Hubungi operator; pemulihan manual diperlukan pada MVP."})
}
func (s *Server) getOrder(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	o, err := s.store.Load(id)
	if err != nil {
		fail(w, 404, "Order tidak ditemukan")
		return
	}
	secret := r.Header.Get("X-Order-Token")
	expected := []byte(o.SecretHash)
	given := []byte(hash(secret))
	if secret == "" || subtle.ConstantTimeCompare(expected, given) != 1 {
		fail(w, 403, "Token akses order tidak valid")
		return
	}
	// Refresh status from the provider when the user opens the order detail.
	// Provider outage never fabricates a new confirmation; surface SyncError per item.
	s.refreshOrder(r.Context(), o)
	if e := s.store.Save(o); e != nil {
		fail(w, 503, "Gagal menyimpan status terkini")
		return
	}
	send(w, 200, o)
}
func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	send(w, 200, map[string]any{"service": "JogjaTrip", "status": "ok", "providers": map[string]bool{"hotel": s.hotel.Base != "", "wisata": s.wisata.Base != ""}, "storage": func() string {
		if os.Getenv("SUPABASE_URL") != "" {
			return "supabase"
		}
		return "local-file-demo"
	}()})
}
func main() {
	hotel := Provider{"hotel", getenv("HOTEL_API_URL", ""), getenv("HOTEL_PARTNER_TOKEN", "")}
	wisata := Provider{"wisata", getenv("WISATA_API_URL", ""), getenv("WISATA_PARTNER_TOKEN", "")}
	client := &http.Client{Timeout: 12 * time.Second}
	var store Store = &FileStore{path: getenv("DATA_DIR", "./data/orders")}
	if base, key := os.Getenv("SUPABASE_URL"), os.Getenv("SUPABASE_SERVICE_ROLE_KEY"); base != "" && key != "" {
		store = &SupaStore{base: strings.TrimRight(base, "/"), key: key, client: client}
	}
	s := &Server{hotel: hotel, wisata: wisata, client: client, store: store}
	mux := http.NewServeMux()
	registerPackageRoutes(mux, s)
	registerIntegratedRoutes(mux, s)
	mux.HandleFunc("GET /api/health", s.health)
	mux.HandleFunc("GET /api/catalog/{which}", s.catalog)
	mux.HandleFunc("POST /api/quote", s.quote)
	mux.HandleFunc("POST /api/book", s.book)
	mux.HandleFunc("GET /api/orders/{id}", s.getOrder)
	mux.HandleFunc("GET /api/orders/{id}/details", s.orderDetails)
	mux.HandleFunc("POST /api/orders/{id}/sync", s.syncOrder)
	mux.HandleFunc("POST /api/itineraries", s.createItinerary)
	mux.HandleFunc("GET /api/itineraries/{id}", s.getItinerary)
	mux.HandleFunc("PUT /api/itineraries/{id}", s.updateItinerary)
	mux.HandleFunc("POST /api/itineraries/{id}/analyze", s.analyzeItinerary)
	mux.Handle("/", http.FileServer(http.Dir("./web")))
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		if r.URL.Path == "/" {
			w.Header().Set("Cache-Control", "no-store")
		}
		mux.ServeHTTP(w, r)
	})
	port := getenv("PORT", "8080")
	log.Println("JogjaTrip running on :" + port)
	log.Fatal(http.ListenAndServe(":"+port, handler))
}
