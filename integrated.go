package main

// Itinerary provider integration. JogjaTrip owns plans; provider systems retain
// ownership of price, availability and booking status.
import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

var regions = map[string]string{
	"sleman": "Sleman", "kabupaten-sleman": "Sleman",
	"bantul": "Bantul", "kabupaten-bantul": "Bantul",
	"gunungkidul": "Gunungkidul", "gunung kidul": "Gunungkidul", "kabupaten-gunungkidul": "Gunungkidul",
	"kulon progo": "Kulon Progo", "kulonprogo": "Kulon Progo", "kabupaten-kulon-progo": "Kulon Progo",
	"kota yogyakarta": "Kota Yogyakarta", "kota-yogyakarta": "Kota Yogyakarta", "yogyakarta": "Kota Yogyakarta", "jogja": "Kota Yogyakarta",
}

func canonicalRegion(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.ReplaceAll(s, "_", "-")
	if v, ok := regions[s]; ok {
		return v
	}
	for key, val := range regions {
		if (strings.HasPrefix(key, "kabupaten-") || strings.HasPrefix(key, "kota-")) && strings.Contains(s, key) {
			return val
		}
	}
	for _, key := range []string{"sleman", "bantul", "gunungkidul", "kulon progo", "kulonprogo"} {
		if strings.Contains(s, key) {
			return regions[key]
		}
	}
	if strings.Contains(s, "kota yogyakarta") || strings.Contains(s, "kota-yogyakarta") || strings.Contains(s, "malioboro") {
		return "Kota Yogyakarta"
	}
	return ""
}

func (s *Server) recommendations(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("hotelId")
	if id == "" {
		fail(w, 400, "Pilih hotel terlebih dahulu")
		return
	}
	hotelData, e := s.upstream(r.Context(), s.hotel, "GET", "/api/v1/hotels", nil, "")
	if e != nil {
		fail(w, 502, "Hotel API: "+e.Error())
		return
	}
	hs, ok := hotelData.([]any)
	if !ok {
		fail(w, 502, "Format katalog Hotel tidak dikenal")
		return
	}
	var hotel map[string]any
	for _, raw := range hs {
		h := asMap(raw)
		if str(h["hotelId"]) == id || str(h["id"]) == id {
			hotel = h
			break
		}
	}
	if hotel == nil {
		fail(w, 404, "Hotel tidak ditemukan dalam katalog penyedia")
		return
	}
	reg := canonicalRegion(str(hotel["city"]) + " " + str(hotel["region"]) + " " + str(hotel["area"]))
	if reg == "" {
		fail(w, 422, "Wilayah hotel tidak dapat dipetakan secara semantik; rekomendasi tidak ditebak")
		return
	}
	out, e := s.upstream(r.Context(), s.wisata, "GET", "/api/v1/destinations", nil, "")
	if e != nil {
		fail(w, 502, "Wisata API: "+e.Error())
		return
	}
	ds, ok := out.([]any)
	if !ok {
		fail(w, 502, "Format katalog Wisata tidak dikenal")
		return
	}
	found := []any{}
	for _, raw := range ds {
		d := asMap(raw)
		dr := canonicalRegion(str(d["region"]) + " " + str(d["city"]))
		if dr == reg {
			found = append(found, d)
		}
	}
	send(w, 200, map[string]any{"hotelId": id, "region": reg, "destinations": found, "reason": "Destinasi berada pada wilayah administratif yang sama; bukan klaim jarak terdekat.", "source": "live Hotel + Wisata API"})
}

var itineraryCheckoutMutex sync.Mutex

type planCheckoutRequest struct {
	Customer Customer `json:"customer"`
}

func (s *Server) authorizedPlan(w http.ResponseWriter, r *http.Request) (*Plan, bool) {
	p, e := planLoad(r.PathValue("id"))
	if e != nil {
		fail(w, 404, "Itinerary tidak ditemukan")
		return nil, false
	}
	if !planAuthorized(p, r) {
		fail(w, 403, "Akses itinerary ditolak")
		return nil, false
	}
	return p, true
}
func bookableActivities(p *Plan) ([]int, error) {
	indices := []int{}
	for i, a := range p.Activities {
		if a.SourceItem == nil || a.OrderID != "" {
			continue
		}
		if len(indices) >= 12 {
			return nil, errors.New("Maksimal 12 layanan baru untuk satu checkout itinerary")
		}
		if a.SourceItem.Type != a.Type || (a.Type == "hotel" && a.SourceItem.CheckIn != a.Date) || (a.Type == "wisata" && a.SourceItem.VisitDate != a.Date) {
			return nil, fmt.Errorf("Tanggal/referensi layanan aktivitas %d tidak sesuai", i+1)
		}
		if e := validInput(BookingInput{Customer: Customer{Name: "Itinerary", Email: "itinerary@example.invalid"}, Items: []Item{*a.SourceItem}}); e != nil {
			return nil, e
		}
		indices = append(indices, i)
	}
	if len(indices) == 0 {
		return nil, errors.New("Tidak ada layanan belum dipesan. Pilih Hotel atau Wisata dari katalog API")
	}
	return indices, nil
}
func (s *Server) quoteItinerary(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authorizedPlan(w, r)
	if !ok {
		return
	}
	idx, e := bookableActivities(p)
	if e != nil {
		fail(w, 400, e.Error())
		return
	}
	lines := []map[string]any{}
	var total int64
	available := true
	for _, i := range idx {
		a := p.Activities[i]
		amount, err := s.adapters()[a.Type].Availability(r.Context(), *a.SourceItem)
		entry := map[string]any{"activityId": a.ID, "title": a.Title, "type": a.Type, "available": err == nil}
		if err != nil {
			entry["error"] = err.Error()
			available = false
		} else {
			entry["amount"] = amount
			total += amount
		}
		lines = append(lines, entry)
	}
	send(w, 200, map[string]any{"itineraryId": p.ID, "available": available, "items": lines, "total": total, "currency": "IDR", "note": "Quote live, tidak menahan stok. Booking melakukan validasi harga ulang; tidak ada pembayaran riil."})
}
func (s *Server) bookItinerary(w http.ResponseWriter, r *http.Request) {
	itineraryCheckoutMutex.Lock()
	defer itineraryCheckoutMutex.Unlock()
	p, ok := s.authorizedPlan(w, r)
	if !ok {
		return
	}
	var input planCheckoutRequest
	r.Body = http.MaxBytesReader(w, r.Body, 16*1024)
	if e := json.NewDecoder(r.Body).Decode(&input); e != nil {
		fail(w, 400, "JSON checkout tidak valid")
		return
	}
	if strings.TrimSpace(input.Customer.Name) == "" || !strings.Contains(input.Customer.Email, "@") {
		fail(w, 400, "Nama dan email pemesan diperlukan")
		return
	}
	idx, e := bookableActivities(p)
	if e != nil {
		fail(w, 400, e.Error())
		return
	}
	// No provider booking is sent until *all* selected services passed the quote.
	amounts := make([]int64, len(idx))
	for i, position := range idx {
		a := p.Activities[position]
		provider := s.hotel
		if a.Type == "wisata" {
			provider = s.wisata
		}
		if provider.Base == "" || provider.Token == "" {
			fail(w, 503, "URL/token partner "+a.Type+" belum dikonfigurasi")
			return
		}
		amount, err := s.adapters()[a.Type].Availability(r.Context(), *a.SourceItem)
		if err != nil {
			fail(w, 409, "Layanan "+a.Title+": "+err.Error())
			return
		}
		amounts[i] = amount
	}
	secret := token()
	now := time.Now().UTC().Format(time.RFC3339)
	o := &Order{ID: shortOrderID(), PackageID: "itinerary:" + p.ID, SecretHash: hash(secret), Customer: input.Customer, Status: "PROCESSING", CreatedAt: now, UpdatedAt: now}
	for i, position := range idx {
		a := p.Activities[position]
		o.Items = append(o.Items, OrderItem{ComponentID: a.ID, Item: *a.SourceItem, Required: true, Amount: amounts[i], Status: "NOT_ATTEMPTED"})
		o.Pricing.ComponentsSubtotal += amounts[i]
	}
	o.Pricing.Total = o.Pricing.ComponentsSubtotal
	if err := s.store.Save(o); err != nil {
		fail(w, 503, "Gagal menyimpan order sebelum reservasi")
		return
	}
	// Associate plan with durable order BEFORE any provider request. In a crash the
	// order remains traceable from the plan, preventing an accidental second checkout.
	for _, position := range idx {
		p.Activities[position].OrderID = o.ID
		p.Activities[position].BookingStatus = "NOT_ATTEMPTED"
	}
	if err := planSave(p); err != nil {
		fail(w, 503, "Order tersimpan tetapi gagal menghubungkan itinerary; jangan checkout ulang")
		return
	}
	aborted, uncertain := false, false
	for i := range o.Items {
		oi := &o.Items[i]
		if aborted {
			break
		}
		price, err := s.adapters()[oi.Item.Type].Availability(r.Context(), oi.Item)
		if err != nil || price != oi.Amount {
			oi.Status = "FAILED"
			if err != nil {
				oi.Error = err.Error()
			} else {
				oi.Error = "Harga berubah; periksa quote baru"
			}
			aborted = true
		} else {
			oi.Status = "IN_FLIGHT"
			if err = s.store.Save(o); err != nil {
				fail(w, 503, "Gagal menyimpan sebelum booking; tidak mengirim permintaan provider")
				return
			}
			id, raw, bookErr := s.adapters()[oi.Item.Type].Book(r.Context(), o, i)
			if bookErr != nil || id == "" {
				oi.Status = "UNKNOWN"
				uncertain = true
				aborted = true
				if bookErr != nil {
					oi.Error = bookErr.Error()
				} else {
					oi.Error = "Provider tidak mengembalikan ID booking"
				}
			} else {
				oi.BookingID = id
				oi.ProviderBookingID = id
				oi.RawStatus = raw
				oi.Status = statusCanonical(oi.Item.Type, raw)
				if oi.Status == "UNKNOWN" {
					uncertain = true
					aborted = true
				} else if oi.Status != "CONFIRMED" {
					aborted = true
				}
			}
		}
		if err = s.store.Save(o); err != nil {
			fail(w, 503, "Status provider tidak tersimpan; jangan mengulang checkout")
			return
		}
	}
	if aborted && !uncertain {
		for i := len(o.Items) - 1; i >= 0; i-- {
			oi := &o.Items[i]
			if oi.Status != "CONFIRMED" {
				continue
			}
			if cancel, ok := s.adapters()[oi.Item.Type].(CancelAdapter); ok {
				raw, ce := cancel.Cancel(r.Context(), oi.BookingID)
				if ce != nil {
					oi.SyncError = "Kompensasi gagal: " + ce.Error()
					o.RequiresManualAction = true
				} else {
					oi.RawStatus = raw
					oi.Status = statusCanonical(oi.Item.Type, raw)
					if oi.Status != "CANCELLED" {
						o.RequiresManualAction = true
					}
				}
			} else {
				oi.SyncError = "Penyedia tidak menyediakan cancel yang telah diverifikasi"
				o.RequiresManualAction = true
			}
			if err := s.store.Save(o); err != nil {
				fail(w, 503, "Kompensasi belum tersimpan; lakukan verifikasi manual")
				return
			}
		}
	}
	if uncertain {
		o.RequiresManualAction = true
	}
	recompute(o)
	o.Revision++
	o.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if err := s.store.Save(o); err != nil {
		fail(w, 503, "Gagal menyimpan hasil akhir; jangan checkout ulang")
		return
	}
	for i, position := range idx {
		p.Activities[position].ProviderBookingID = o.Items[i].ProviderBookingID
		p.Activities[position].BookingStatus = o.Items[i].Status
		p.Activities[position].SyncError = o.Items[i].SyncError
	}
	p.UpdatedAt = o.UpdatedAt
	if err := planSave(p); err != nil {
		send(w, 201, map[string]any{"order": o, "accessToken": secret, "warning": "Booking tercatat tetapi penyelarasan itinerary gagal; simpan ID order."})
		return
	}
	send(w, 201, map[string]any{"order": o, "accessToken": secret, "itinerary": p, "warning": "Status PARTIAL/UNKNOWN perlu pemeriksaan, jangan checkout ulang. Pembayaran hanya simulasi."})
}
func (s *Server) syncItinerary(w http.ResponseWriter, r *http.Request) {
	itineraryCheckoutMutex.Lock()
	defer itineraryCheckoutMutex.Unlock()
	p, ok := s.authorizedPlan(w, r)
	if !ok {
		return
	}
	cache := map[string]*Order{}
	for i := range p.Activities {
		a := &p.Activities[i]
		if a.OrderID == "" {
			continue
		}
		o := cache[a.OrderID]
		if o == nil {
			loaded, err := s.store.Load(a.OrderID)
			if err != nil {
				a.BookingStatus = "UNKNOWN"
				continue
			}
			o = loaded
			s.refreshOrder(r.Context(), o)
			if err = s.store.Save(o); err != nil {
				fail(w, 503, "Tidak dapat menyimpan sinkronisasi order")
				return
			}
			cache[a.OrderID] = o
		}
		for _, oi := range o.Items {
			if oi.ComponentID == a.ID {
				a.ProviderBookingID = oi.ProviderBookingID
				a.BookingStatus = oi.Status
				a.SyncError = oi.SyncError
				break
			}
		}
	}
	p.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if e := planSave(p); e != nil {
		fail(w, 503, "Gagal menyimpan status itinerary")
		return
	}
	send(w, 200, map[string]any{"itinerary": p, "note": "Booking provider yang offline mempertahankan status terakhir; lihat detail pesanan untuk syncError."})
}

func registerIntegratedRoutes(mux *http.ServeMux, s *Server) {
	mux.HandleFunc("GET /api/recommendations", s.recommendations)
	mux.HandleFunc("POST /api/itineraries/{id}/quote", s.quoteItinerary)
	mux.HandleFunc("POST /api/itineraries/{id}/book", s.bookItinerary)
	mux.HandleFunc("POST /api/itineraries/{id}/sync", s.syncItinerary)
}
