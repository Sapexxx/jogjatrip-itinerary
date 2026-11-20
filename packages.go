package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Discount struct {
	Type  string `json:"type"`
	Value int64  `json:"value"`
}
type PackageComponent struct {
	ID            string `json:"id"`
	Kind          string `json:"kind"`
	Required      bool   `json:"required"`
	DayOffset     int    `json:"dayOffset"`
	HotelID       string `json:"hotelId,omitempty"`
	RoomID        string `json:"roomId,omitempty"`
	Nights        int    `json:"nights,omitempty"`
	DestinationID int    `json:"destinationId,omitempty"`
	Tier          string `json:"tier,omitempty"`
	Qty           int    `json:"qty,omitempty"`
}
type AddOn struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Kind              string            `json:"kind"`
	DependsOn         string            `json:"dependsOn,omitempty"`
	MaxQty            int               `json:"maxQty"`
	PriceSource       string            `json:"priceSource"`
	FixedIDR          int64             `json:"fixedIdr,omitempty"`
	Component         *PackageComponent `json:"component,omitempty"`
	TargetComponentID string            `json:"targetComponentId,omitempty"`
	UpgradeTier       string            `json:"upgradeTier,omitempty"`
}
type PackageTemplate struct {
	ID             string             `json:"id"`
	Name           string             `json:"name"`
	Description    string             `json:"description"`
	Region         string             `json:"region"`
	Nights         int                `json:"nights"`
	Components     []PackageComponent `json:"components"`
	AddOns         []AddOn            `json:"addOns"`
	BundleDiscount Discount           `json:"bundleDiscount"`
	Active         bool               `json:"active"`
}
type SelectedAddOn struct {
	ID  string `json:"id"`
	Qty int    `json:"qty"`
}
type PackagePricing struct {
	ComponentsSubtotal int64 `json:"componentsSubtotal"`
	AddOnsSubtotal     int64 `json:"addOnsSubtotal"`
	BundleDiscount     int64 `json:"bundleDiscount"`
	AppliedDiscount    int64 `json:"appliedDiscount"`
	Total              int64 `json:"total"`
}
type PlannedSlot struct {
	StartTime string `json:"startTime"`
	EndTime   string `json:"endTime"`
}
type PackageRequest struct {
	Schedules      map[string]PlannedSlot `json:"schedules,omitempty"`
	StartDate      string                 `json:"startDate"`
	Guests         int                    `json:"guests"`
	SelectedAddOns []SelectedAddOn        `json:"selectedAddOns"`
	Customer       Customer               `json:"customer"`
}
type expandedItem struct {
	Item        Item   `json:"item"`
	ComponentID string `json:"componentId"`
	AddOnID     string `json:"addOnId,omitempty"`
	Required    bool   `json:"required"`
	Native      bool   `json:"native,omitempty"`
	Amount      int64  `json:"amount"`
	Available   bool   `json:"available"`
	Error       string `json:"error,omitempty"`
}
type PackageQuote struct {
	PackageID string         `json:"packageId"`
	StartDate string         `json:"startDate"`
	Guests    int            `json:"guests"`
	Items     []expandedItem `json:"items"`
	Pricing   PackagePricing `json:"pricing"`
	Available bool           `json:"available"`
	Warnings  []string       `json:"warnings,omitempty"`
}

var packageMu sync.Mutex

func packageDir() string { return getenv("PACKAGE_DATA_DIR", "./data/packages") }
func validateTemplate(p *PackageTemplate, registry map[string]ProviderAdapter) error {
	if p.ID == "" || p.Name == "" || p.Nights < 1 || p.Nights > 14 || len(p.Components) == 0 || len(p.Components) > 12 {
		return errors.New("definisi paket tidak valid")
	}
	ids := map[string]bool{}
	hasHotel := false
	for _, c := range p.Components {
		if c.ID == "" || ids[c.ID] || c.DayOffset < 0 || c.DayOffset > 14 {
			return errors.New("ID/offset komponen paket tidak valid")
		}
		ids[c.ID] = true
		if registry[c.Kind] == nil {
			return fmt.Errorf("jenis komponen %q belum terdaftar", c.Kind)
		}
		if c.Kind == "hotel" {
			hasHotel = true
			if c.HotelID == "" || c.RoomID == "" || c.Nights < 1 {
				return errors.New("referensi kamar tidak valid")
			}
		}
	}
	if !hasHotel {
		return errors.New("paket membutuhkan komponen hotel untuk validasi rentang menginap")
	}
	for _, a := range p.AddOns {
		if a.ID == "" || ids[a.ID] || a.MaxQty < 1 || a.MaxQty > 10 {
			return errors.New("add-on tidak valid")
		}
		ids[a.ID] = true
		if a.DependsOn != "" {
			found := false
			for _, c := range p.Components {
				if c.ID == a.DependsOn {
					found = true
				}
			}
			if !found {
				return errors.New("dependsOn tidak dikenal")
			}
		}
		switch a.Kind {
		case "native":
			if a.PriceSource != "fixed_idr" || a.FixedIDR < 0 {
				return errors.New("harga add-on native salah")
			}
		case "extra_component":
			if a.PriceSource != "provider_live" || a.Component == nil || registry[a.Component.Kind] == nil {
				return errors.New("extra component provider tidak tersedia")
			}
		case "upgrade":
			if a.PriceSource != "provider_live" || a.TargetComponentID == "" || a.UpgradeTier == "" {
				return errors.New("upgrade tidak didukung")
			}
			var target *PackageComponent
			for i := range p.Components {
				if p.Components[i].ID == a.TargetComponentID {
					target = &p.Components[i]
				}
			}
			if target == nil || target.Kind != "wisata" || !(a.UpgradeTier == "base" || a.UpgradeTier == "plus") {
				return errors.New("upgrade hanya tier wisata base/plus")
			}
		default:
			return errors.New("jenis add-on tidak dikenal")
		}
	}
	if p.BundleDiscount.Type != "percent" && p.BundleDiscount.Type != "fixed" {
		return errors.New("tipe diskon tidak didukung")
	}
	if p.BundleDiscount.Value < 0 || (p.BundleDiscount.Type == "percent" && p.BundleDiscount.Value > 100) {
		return errors.New("nilai diskon tidak valid")
	}
	return nil
}
func (s *Server) packageList() ([]PackageTemplate, error) {
	packageMu.Lock()
	defer packageMu.Unlock()
	files, e := os.ReadDir(packageDir())
	if os.IsNotExist(e) {
		return []PackageTemplate{}, nil
	}
	if e != nil {
		return nil, e
	}
	out := []PackageTemplate{}
	for _, f := range files {
		if f.IsDir() || !strings.HasSuffix(f.Name(), ".json") {
			continue
		}
		b, e := os.ReadFile(filepath.Join(packageDir(), f.Name()))
		if e != nil {
			return nil, e
		}
		var p PackageTemplate
		if e = json.Unmarshal(b, &p); e != nil {
			return nil, e
		}
		if !p.Active {
			continue
		}
		if e = validateTemplate(&p, s.adapters()); e != nil {
			return nil, fmt.Errorf("%s: %w", f.Name(), e)
		}
		out = append(out, p)
	}
	return out, nil
}
func (s *Server) packageGet(id string) (PackageTemplate, error) {
	ps, e := s.packageList()
	if e != nil {
		return PackageTemplate{}, e
	}
	for _, p := range ps {
		if p.ID == id {
			return p, nil
		}
	}
	return PackageTemplate{}, os.ErrNotExist
}
func parsePackageRequest(w http.ResponseWriter, r *http.Request) (PackageRequest, bool) {
	var v PackageRequest
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
	if json.NewDecoder(r.Body).Decode(&v) != nil || !validDate(v.StartDate) || v.Guests < 1 || v.Guests > 20 || len(v.SelectedAddOns) > 12 || len(v.Schedules) > 24 {
		fail(w, 400, "Input tanggal/tamu/add-on tidak valid")
		return v, false
	}
	for _, slot := range v.Schedules {
		// No provider guarantees a time slot; this is JogjaTrip-owned itinerary metadata.
		if slot.StartTime == "" || slot.EndTime == "" || validatePlannedTimes(slot.StartTime, slot.EndTime) != nil {
			fail(w, 400, "Waktu rencana paket tidak valid")
			return v, false
		}
	}
	return v, true
}
func addDays(d string, n int) string {
	t, _ := time.Parse("2006-01-02", d)
	return t.AddDate(0, 0, n).Format("2006-01-02")
}
func toItem(c PackageComponent, start string, guests int) Item {
	d := addDays(start, c.DayOffset)
	if c.Kind == "hotel" {
		return Item{Type: "hotel", HotelID: c.HotelID, RoomID: c.RoomID, CheckIn: d, CheckOut: addDays(d, c.Nights), Guests: guests}
	}
	q := c.Qty
	if q == 0 {
		q = guests
	}
	return Item{Type: "wisata", DestinationID: c.DestinationID, VisitDate: d, Quantity: q, Tier: c.Tier}
}
func (s *Server) expand(ctx context.Context, p PackageTemplate, r PackageRequest) (PackageQuote, error) {
	q := PackageQuote{PackageID: p.ID, StartDate: r.StartDate, Guests: r.Guests, Items: []expandedItem{}, Available: true, Warnings: []string{}}
	if !validDate(r.StartDate) || r.Guests < 1 || r.Guests > 20 {
		return q, errors.New("tanggal atau jumlah tamu tidak valid")
	}
	if len(r.SelectedAddOns) > 12 {
		return q, errors.New("terlalu banyak add-on")
	}
	active := map[string]int{}
	addons := map[string]AddOn{}
	for _, a := range p.AddOns {
		addons[a.ID] = a
	}
	for _, x := range r.SelectedAddOns {
		a, ok := addons[x.ID]
		if !ok || x.Qty < 1 || x.Qty > a.MaxQty || active[x.ID] > 0 {
			return q, errors.New("pilihan add-on tidak valid")
		}
		active[x.ID] = x.Qty
	}
	for id := range active {
		if d := addons[id].DependsOn; d != "" {
			found := false
			for _, c := range p.Components {
				if c.ID == d {
					found = true
				}
			}
			if !found {
				return q, errors.New("add-on dependency tidak terpenuhi")
			}
		}
	}
	comps := append([]PackageComponent{}, p.Components...)
	for _, a := range p.AddOns {
		if active[a.ID] > 0 && a.Kind == "upgrade" {
			for i := range comps {
				if comps[i].ID == a.TargetComponentID {
					comps[i].Tier = a.UpgradeTier
				}
			}
		}
	}
	ranges := [][2]string{}
	for _, c := range comps {
		if c.Kind == "hotel" {
			d := addDays(r.StartDate, c.DayOffset)
			ranges = append(ranges, [2]string{d, addDays(d, c.Nights)})
		}
	}
	add := func(c PackageComponent, addOnID string, required bool, native bool, fixed int64) {
		it := toItem(c, r.StartDate, r.Guests)
		if slot, ok := r.Schedules[c.ID]; ok {
			it.PlannedStartTime = slot.StartTime
			it.PlannedEndTime = slot.EndTime
		}
		x := expandedItem{Item: it, ComponentID: c.ID, AddOnID: addOnID, Required: required, Native: native, Available: true, Amount: fixed}
		if !native {
			if s.adapters()[c.Kind] == nil {
				x.Available = false
				x.Error = "jenis provider tidak terdaftar"
			} else {
				if it.Type == "wisata" {
					valid := false
					for _, rg := range ranges {
						if it.VisitDate >= rg[0] && it.VisitDate < rg[1] {
							valid = true
						}
					}
					if !valid {
						x.Available = false
						x.Error = "kunjungan wisata di luar masa menginap"
					}
				}
				if x.Available {
					price, e := s.adapters()[c.Kind].Availability(ctx, it)
					if e != nil {
						x.Available = false
						x.Error = e.Error()
					} else {
						x.Amount = price
					}
				}
			}
		}
		if !x.Available {
			q.Available = false
			q.Warnings = append(q.Warnings, c.ID+": "+x.Error)
		}
		q.Items = append(q.Items, x)
		if addOnID != "" {
			q.Pricing.AddOnsSubtotal += x.Amount
		} else {
			q.Pricing.ComponentsSubtotal += x.Amount
		}
	}
	for _, c := range comps {
		add(c, "", c.Required, false, 0)
	}
	for _, a := range p.AddOns {
		qty := active[a.ID]
		for j := 0; j < qty; j++ {
			switch a.Kind {
			case "native":
				add(PackageComponent{ID: a.ID, Kind: "native", DayOffset: 0}, a.ID, false, true, a.FixedIDR)
			case "extra_component":
				c := *a.Component
				c.ID = a.ID + "-" + strconv.Itoa(j+1)
				add(c, a.ID, false, false, 0)
			case "upgrade": // upgrades replace the target item's tier; delta is already reflected in its live quote.
			}
		}
	}
	q.Pricing.BundleDiscount = discountValue(p.BundleDiscount, q.Pricing.ComponentsSubtotal)
	q.Pricing.AppliedDiscount = q.Pricing.BundleDiscount
	q.Pricing.Total = q.Pricing.ComponentsSubtotal + q.Pricing.AddOnsSubtotal - q.Pricing.AppliedDiscount
	if q.Pricing.Total < 0 {
		q.Pricing.Total = 0
	}
	return q, nil
}
func discountValue(d Discount, subtotal int64) int64 {
	v := d.Value
	if d.Type == "percent" {
		v = subtotal * d.Value / 100
	}
	if v > subtotal {
		v = subtotal
	}
	return v
}
func (s *Server) packages(w http.ResponseWriter, r *http.Request) {
	ps, e := s.packageList()
	if e != nil {
		fail(w, 503, e.Error())
		return
	}
	send(w, 200, map[string]any{"packages": ps})
}
func (s *Server) packageDetail(w http.ResponseWriter, r *http.Request) {
	p, e := s.packageGet(r.PathValue("id"))
	if e != nil {
		fail(w, 404, "Paket tidak ditemukan")
		return
	}
	send(w, 200, p)
}
func (s *Server) packageQuote(w http.ResponseWriter, r *http.Request) {
	p, e := s.packageGet(r.PathValue("id"))
	if e != nil {
		fail(w, 404, "Paket tidak ditemukan")
		return
	}
	v, ok := parsePackageRequest(w, r)
	if !ok {
		return
	}
	q, e := s.expand(r.Context(), p, v)
	if e != nil {
		fail(w, 400, e.Error())
		return
	}
	send(w, 200, q)
}
func (s *Server) packageBook(w http.ResponseWriter, r *http.Request) {
	p, e := s.packageGet(r.PathValue("id"))
	if e != nil {
		fail(w, 404, "Paket tidak ditemukan")
		return
	}
	v, ok := parsePackageRequest(w, r)
	if !ok {
		return
	}
	if strings.TrimSpace(v.Customer.Name) == "" || !strings.Contains(v.Customer.Email, "@") {
		fail(w, 400, "Nama dan email wajib diisi")
		return
	}
	q, e := s.expand(r.Context(), p, v)
	if e != nil {
		fail(w, 400, e.Error())
		return
	}
	if !q.Available {
		send(w, 409, q)
		return
	}
	if len(q.Items) > 12 {
		fail(w, 400, "Paket melampaui batas 12 item")
		return
	}
	for _, x := range q.Items {
		if x.Native {
			continue
		}
		provider := s.hotel
		if x.Item.Type == "wisata" {
			provider = s.wisata
		}
		if provider.Base == "" || provider.Token == "" {
			fail(w, 503, "Token/URL partner belum dikonfigurasi")
			return
		}
	}
	secret := token()
	now := time.Now().UTC().Format(time.RFC3339)
	o := &Order{ID: shortOrderID(), PackageID: p.ID, StartDate: v.StartDate, Guests: v.Guests, SelectedAddOns: v.SelectedAddOns, Pricing: q.Pricing, SecretHash: hash(secret), Status: "PROCESSING", Customer: v.Customer, CreatedAt: now, UpdatedAt: now}
	for _, x := range q.Items {
		o.Items = append(o.Items, OrderItem{Item: x.Item, ComponentID: x.ComponentID, AddOnID: x.AddOnID, Required: x.Required, Native: x.Native, Amount: x.Amount, Status: "NOT_ATTEMPTED"})
	}
	if e = s.store.Save(o); e != nil {
		fail(w, 503, "Order gagal disimpan sebelum booking")
		return
	}
	aborted := false
	uncertain := false
	for i := range o.Items {
		oi := &o.Items[i]
		if oi.Native {
			oi.Status = "CONFIRMED"
			if e = s.store.Save(o); e != nil {
				fail(w, 503, "Gagal menyimpan status add-on")
				return
			}
			continue
		}
		if aborted {
			break
		}
		price, err := s.adapters()[oi.Item.Type].Availability(r.Context(), oi.Item)
		if err != nil {
			oi.Status = "FAILED"
			oi.Error = err.Error()
			if oi.Required {
				aborted = true
			}
			if e = s.store.Save(o); e != nil {
				fail(w, 503, "Gagal menyimpan kegagalan quote")
				return
			}
			continue
		}
		if price != oi.Amount {
			oi.Status = "FAILED"
			oi.Error = "Harga berubah saat konfirmasi. Permintaan booking untuk komponen ini tidak dikirim; minta quote baru."
			if oi.Required {
				aborted = true
			}
			if e = s.store.Save(o); e != nil {
				fail(w, 503, "Gagal menyimpan perubahan harga")
				return
			}
			continue
		}
		oi.Amount = price
		oi.Status = "IN_FLIGHT"
		o.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
		if e = s.store.Save(o); e != nil {
			fail(w, 503, "Tidak dapat menyimpan status sebelum booking; tidak mengirim request provider")
			return
		}
		id, raw, err := s.adapters()[oi.Item.Type].Book(r.Context(), o, i)
		if err != nil {
			oi.Status = "UNKNOWN"
			oi.Error = err.Error()
			uncertain = true
			aborted = true
		} else if id == "" {
			oi.Status = "UNKNOWN"
			oi.Error = "Provider tidak mengembalikan ID booking"
			uncertain = true
			aborted = true
		} else {
			oi.BookingID = id
			oi.ProviderBookingID = id
			oi.RawStatus = raw
			oi.Status = statusCanonical(oi.Item.Type, raw)
			if oi.Status == "UNKNOWN" {
				uncertain = true
				aborted = true
			}
			if oi.Required && oi.Status != "CONFIRMED" {
				aborted = true
			}
		}
		o.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
		if e = s.store.Save(o); e != nil {
			fail(w, 503, "Hasil provider tidak berhasil disimpan; jangan ulang checkout")
			return
		}
	}
	// Compensation never runs on unknown outcomes; provider may have accepted the request.
	if aborted && !uncertain {
		for i := len(o.Items) - 1; i >= 0; i-- {
			oi := &o.Items[i]
			if oi.Status != "CONFIRMED" || oi.Native {
				continue
			}
			if ca, ok := s.adapters()[oi.Item.Type].(CancelAdapter); ok {
				raw, ce := ca.Cancel(r.Context(), oi.BookingID)
				if ce != nil {
					oi.SyncError = "Kompensasi gagal: " + ce.Error()
					o.RequiresManualAction = true
				} else {
					oi.RawStatus = raw
					oi.Status = statusCanonical(oi.Item.Type, raw)
					if oi.Status != "CANCELLED" {
						oi.SyncError = "Pembatalan belum terkonfirmasi"
						o.RequiresManualAction = true
					}
				}
			} else {
				o.RequiresManualAction = true
				oi.SyncError = "Tidak ada kontrak cancel untuk provider ini"
			}
			if e = s.store.Save(o); e != nil {
				fail(w, 503, "Gagal menyimpan kompensasi")
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
	if e = s.store.Save(o); e != nil {
		fail(w, 503, "Status akhir belum dapat disimpan; jangan ulang checkout")
		return
	}
	result := map[string]any{"order": o, "accessToken": secret, "warning": "Jika PARTIAL/UNKNOWN, jangan checkout ulang. Verifikasi setiap reservasi penyedia."}
	for _, chosen := range v.SelectedAddOns {
		if chosen.ID == "agenda-otomatis" && o.Status == "CONFIRMED" {
			plan, planToken, planErr := newPlanFromOrder(o)
			if planErr == nil {
				planErr = planSave(plan)
			}
			if planErr != nil {
				result["itineraryWarning"] = "Booking berhasil, tetapi agenda otomatis tidak berhasil disimpan: " + planErr.Error()
			} else {
				result["itinerary"] = plan
				result["itineraryAccessToken"] = planToken
			}
			break
		}
	}
	send(w, 200, result)
}
func newPlanFromOrder(o *Order) (*Plan, string, error) {
	title := "Itinerary Paket " + o.PackageID
	activities := []PlanActivity{}
	end := o.StartDate
	for _, x := range o.Items {
		if x.Native || x.Status != "CONFIRMED" {
			continue
		}
		it := x.Item
		d := it.VisitDate
		kind := "wisata"
		start := "09:00"
		finish := "11:00"
		if it.Type == "hotel" {
			d = it.CheckIn
			kind = "hotel"
			start = "14:00"
			finish = "15:00"
			if it.CheckOut > end {
				end = it.CheckOut
			}
		}
		if d > end {
			end = d
		}
		if validatePlannedTimes(it.PlannedStartTime, it.PlannedEndTime) == nil && it.PlannedStartTime != "" {
			start = it.PlannedStartTime
			finish = it.PlannedEndTime
		}
		source := it
		activityID := x.ComponentID
		if activityID == "" {
			activityID = shortOrderID()
		}
		activities = append(activities, PlanActivity{ID: activityID, Type: kind, Title: kind + " - " + x.ComponentID, Date: d, StartTime: start, EndTime: finish, SourceItem: &source, OrderID: o.ID, ProviderBookingID: x.BookingID, BookingStatus: x.Status, SyncError: x.SyncError, Notes: "Jam agenda merupakan preferensi pengguna, bukan slot tiket/kamar yang dikonfirmasi provider."})
	}
	if len(activities) == 0 {
		return nil, "", errors.New("Belum ada reservasi terkonfirmasi untuk dibuat agenda")
	}
	access := token()
	plan := &Plan{ID: "PL-" + strings.TrimPrefix(shortOrderID(), "JT-"), SecretHash: hash(access), Title: title, StartDate: o.StartDate, EndDate: end, Activities: activities, UpdatedAt: time.Now().UTC().Format(time.RFC3339)}
	return plan, access, nil
}
func (s *Server) itineraryFromPackage(w http.ResponseWriter, r *http.Request) {
	o, e := s.store.Load(r.PathValue("id"))
	if e != nil {
		fail(w, 404, "Order tidak ditemukan")
		return
	}
	if !authorized(o, r) {
		fail(w, 403, "Token pesanan salah")
		return
	}
	if o.PackageID == "" {
		fail(w, 400, "Order ini bukan paket")
		return
	}
	plan, access, err := newPlanFromOrder(o)
	if err != nil {
		fail(w, 409, err.Error())
		return
	}
	if err = planSave(plan); err != nil {
		fail(w, 503, "Itinerary gagal disimpan")
		return
	}
	send(w, 201, map[string]any{"itinerary": plan, "accessToken": access})
}
func registerPackageRoutes(mux *http.ServeMux, s *Server) {
	mux.HandleFunc("GET /api/packages", s.packages)
	mux.HandleFunc("GET /api/packages/{id}", s.packageDetail)
	mux.HandleFunc("POST /api/packages/{id}/quote", s.packageQuote)
	mux.HandleFunc("POST /api/packages/{id}/book", s.packageBook)
	mux.HandleFunc("POST /api/orders/{id}/itinerary", s.itineraryFromPackage)
}
