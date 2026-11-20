package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"

	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

func itProvider(it Item) string { return it.Type }
func authorized(o *Order, r *http.Request) bool {
	secret := r.Header.Get("X-Order-Token")
	return secret != "" && subtle.ConstantTimeCompare([]byte(o.SecretHash), []byte(hash(secret))) == 1
}

// Sync on demand: read from source-of-truth; errors do NOT create false booking status.
func (s *Server) refreshOrder(ctx context.Context, o *Order) {
	now := time.Now().UTC().Format(time.RFC3339)
	for i := range o.Items {
		it := &o.Items[i]
		if it.BookingID == "" {
			continue
		}
		adapter, ok := s.adapters()[it.Item.Type]
		if !ok {
			it.SyncError = "Jenis provider tidak terdaftar"
			continue
		}
		raw, e := adapter.GetBooking(ctx, it.BookingID)
		if e != nil {
			it.SyncError = e.Error()
			continue
		}
		it.RawStatus = raw
		it.Status = statusCanonical(it.Item.Type, raw)
		it.LastCheckedAt = now
		it.SyncError = ""
	}
	recompute(o)
	if o.PackageID != "" && (o.Status == "PARTIAL" || o.Status == "FAILED" || o.Status == "UNKNOWN") {
		o.RequiresManualAction = true
	}
	o.LastSyncedAt = now
	o.UpdatedAt = now
	o.Revision++
}
func (s *Server) syncOrder(w http.ResponseWriter, r *http.Request) {
	o, err := s.store.Load(r.PathValue("id"))
	if err != nil {
		fail(w, 404, "Pesanan tidak ditemukan")
		return
	}
	if !authorized(o, r) {
		fail(w, 403, "Token pesanan salah")
		return
	}
	s.refreshOrder(r.Context(), o)
	if e := s.store.Save(o); e != nil {
		fail(w, 503, "Gagal menyimpan sinkronisasi")
		return
	}
	send(w, 200, map[string]any{"order": o, "note": "Status dari API penyedia; jika syncError terisi maka data terbaru belum dapat diverifikasi."})
}

type PlanActivity struct {
	ID                string `json:"id"`
	Type              string `json:"type"`
	Title             string `json:"title"`
	Date              string `json:"date"`
	StartTime         string `json:"startTime"`
	EndTime           string `json:"endTime"`
	Region            string `json:"region"`
	ProviderBookingID string `json:"providerBookingId,omitempty"`
	SourceItem        *Item  `json:"sourceItem,omitempty"`
	OrderID           string `json:"orderId,omitempty"`
	BookingStatus     string `json:"bookingStatus,omitempty"`
	SyncError         string `json:"syncError,omitempty"`
	Notes             string `json:"notes,omitempty"`
}
type Plan struct {
	ID         string         `json:"id"`
	SecretHash string         `json:"-"`
	Title      string         `json:"title"`
	StartDate  string         `json:"startDate"`
	EndDate    string         `json:"endDate"`
	Activities []PlanActivity `json:"activities"`
	UpdatedAt  string         `json:"updatedAt"`
}
type storedPlan struct {
	*Plan
	Hash string `json:"secretHash"`
}

var planMu sync.Mutex

func planDir() string { return getenv("PLAN_DATA_DIR", "./data/itineraries") }
func planLoad(id string) (*Plan, error) {
	if !strings.HasPrefix(id, "PL-") || len(id) != 15 {
		return nil, os.ErrNotExist
	}
	planMu.Lock()
	defer planMu.Unlock()
	if base, key := os.Getenv("SUPABASE_URL"), os.Getenv("SUPABASE_SERVICE_ROLE_KEY"); base != "" && key != "" {
		sup := &SupaStore{base: strings.TrimRight(base, "/"), key: key, client: &http.Client{Timeout: 12 * time.Second}}
		b, e := sup.call("GET", "/rest/v1/jt_plans?id=eq."+url.QueryEscape(id)+"&select=payload", nil)
		if e != nil {
			return nil, e
		}
		var rows []struct {
			Payload storedPlan `json:"payload"`
		}
		if e = json.Unmarshal(b, &rows); e != nil {
			return nil, e
		}
		if len(rows) == 0 || rows[0].Payload.Plan == nil {
			return nil, os.ErrNotExist
		}
		p := rows[0].Payload.Plan
		p.SecretHash = rows[0].Payload.Hash
		return p, nil
	}
	b, e := os.ReadFile(filepath.Join(planDir(), id+".json"))
	if e != nil {
		return nil, e
	}
	var x storedPlan
	if e = json.Unmarshal(b, &x); e != nil {
		return nil, e
	}
	if x.Plan == nil {
		return nil, errors.New("corrupt")
	}
	x.Plan.SecretHash = x.Hash
	return x.Plan, nil
}
func planSave(p *Plan) error {
	planMu.Lock()
	defer planMu.Unlock()
	if base, key := os.Getenv("SUPABASE_URL"), os.Getenv("SUPABASE_SERVICE_ROLE_KEY"); base != "" && key != "" {
		sup := &SupaStore{base: strings.TrimRight(base, "/"), key: key, client: &http.Client{Timeout: 12 * time.Second}}
		_, e := sup.call("POST", "/rest/v1/jt_plans?on_conflict=id", []map[string]any{{"id": p.ID, "payload": storedPlan{Plan: p, Hash: p.SecretHash}}})
		return e
	}
	if e := os.MkdirAll(planDir(), 0700); e != nil {
		return e
	}
	b, e := json.Marshal(storedPlan{Plan: p, Hash: p.SecretHash})
	if e != nil {
		return e
	}
	tmp := filepath.Join(planDir(), p.ID+".tmp")
	if e = os.WriteFile(tmp, b, 0600); e != nil {
		return e
	}
	return os.Rename(tmp, filepath.Join(planDir(), p.ID+".json"))
}
func planAuthorized(p *Plan, r *http.Request) bool {
	secret := r.Header.Get("X-Plan-Token")
	return secret != "" && subtle.ConstantTimeCompare([]byte(p.SecretHash), []byte(hash(secret))) == 1
}
func validatePlan(p *Plan) error {
	if strings.TrimSpace(p.Title) == "" || len(p.Title) > 100 || !validDate(p.StartDate) || !validDate(p.EndDate) || p.EndDate < p.StartDate {
		return errors.New("Judul dan rentang tanggal tidak valid")
	}
	if len(p.Activities) > 30 {
		return errors.New("Maksimal 30 aktivitas")
	}
	for i := range p.Activities {
		a := &p.Activities[i]
		if a.ID == "" {
			a.ID = shortOrderID()
		}
		if !validDate(a.Date) || a.Date < p.StartDate || a.Date > p.EndDate || strings.TrimSpace(a.Title) == "" || len(a.Title) > 130 {
			return fmt.Errorf("Aktivitas %d tidak valid", i+1)
		}
		if a.Type != "hotel" && a.Type != "wisata" && a.Type != "custom" {
			return errors.New("Jenis aktivitas tidak valid")
		}
		if a.SourceItem != nil {
			if a.Type == "custom" || a.SourceItem.Type != a.Type {
				return errors.New("Jenis referensi provider tidak sesuai aktivitas")
			}
			if err := validInput(BookingInput{Customer: Customer{Name: "Itinerary", Email: "itinerary@example.invalid"}, Items: []Item{*a.SourceItem}}); err != nil {
				return fmt.Errorf("Referensi booking aktivitas %d: %w", i+1, err)
			}
			if (a.Type == "hotel" && a.Date != a.SourceItem.CheckIn) || (a.Type == "wisata" && a.Date != a.SourceItem.VisitDate) {
				return errors.New("Tanggal agenda berbeda dengan tanggal layanan; perbarui pilihan provider")
			}
		}
		if len(a.StartTime) != 5 || len(a.EndTime) != 5 {
			return errors.New("Jam harus HH:MM")
		}
		st, e := time.Parse("15:04", a.StartTime)
		if e != nil {
			return errors.New("Jam mulai salah")
		}
		en, e := time.Parse("15:04", a.EndTime)
		if e != nil || !en.After(st) {
			return errors.New("Jam akhir harus lebih besar dari jam mulai")
		}
	}
	return nil
}
func readPlan(w http.ResponseWriter, r *http.Request) (Plan, bool) {
	var p Plan
	r.Body = http.MaxBytesReader(w, r.Body, 128*1024)
	if e := json.NewDecoder(r.Body).Decode(&p); e != nil {
		fail(w, 400, "JSON itinerary tidak valid")
		return p, false
	}
	if e := validatePlan(&p); e != nil {
		fail(w, 400, e.Error())
		return p, false
	}
	return p, true
}
func (s *Server) createItinerary(w http.ResponseWriter, r *http.Request) {
	p, ok := readPlan(w, r)
	if !ok {
		return
	}
	for i := range p.Activities {
		p.Activities[i].OrderID = ""
		p.Activities[i].ProviderBookingID = ""
		p.Activities[i].BookingStatus = ""
		p.Activities[i].SyncError = ""
	}
	sec := token()
	p.ID = "PL-" + strings.TrimPrefix(shortOrderID(), "JT-")
	p.SecretHash = hash(sec)
	p.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if e := planSave(&p); e != nil {
		fail(w, 503, "Gagal menyimpan itinerary")
		return
	}
	send(w, 201, map[string]any{"itinerary": p, "accessToken": sec})
}
func (s *Server) getItinerary(w http.ResponseWriter, r *http.Request) {
	p, e := planLoad(r.PathValue("id"))
	if e != nil {
		fail(w, 404, "Itinerary tidak ditemukan")
		return
	}
	if !planAuthorized(p, r) {
		fail(w, 403, "Akses itinerary ditolak")
		return
	}
	send(w, 200, p)
}
func (s *Server) updateItinerary(w http.ResponseWriter, r *http.Request) {
	itineraryCheckoutMutex.Lock()
	defer itineraryCheckoutMutex.Unlock()
	old, e := planLoad(r.PathValue("id"))
	if e != nil {
		fail(w, 404, "Itinerary tidak ditemukan")
		return
	}
	if !planAuthorized(old, r) {
		fail(w, 403, "Akses itinerary ditolak")
		return
	}
	p, ok := readPlan(w, r)
	if !ok {
		return
	}
	oldBooked := map[string]PlanActivity{}
	for _, a := range old.Activities {
		if a.OrderID != "" {
			oldBooked[a.ID] = a
		}
	}
	seen := map[string]bool{}
	for i := range p.Activities {
		a := &p.Activities[i]
		if prior, ok := oldBooked[a.ID]; ok {
			if a.SourceItem == nil || prior.SourceItem == nil || *a.SourceItem != *prior.SourceItem {
				fail(w, 409, "Layanan yang sudah dibooking tidak boleh diubah dari editor. Hubungi penyedia untuk reschedule.")
				return
			}
			a.OrderID = prior.OrderID
			a.ProviderBookingID = prior.ProviderBookingID
			a.BookingStatus = prior.BookingStatus
			a.SyncError = prior.SyncError
			seen[a.ID] = true
		} else {
			a.OrderID = ""
			a.ProviderBookingID = ""
			a.BookingStatus = ""
			a.SyncError = ""
		}
	}
	if len(seen) != len(oldBooked) {
		fail(w, 409, "Aktivitas dengan booking aktif tidak dapat dihapus dari itinerary")
		return
	}
	p.ID = old.ID
	p.SecretHash = old.SecretHash
	p.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if e = planSave(&p); e != nil {
		fail(w, 503, "Gagal menyimpan perubahan")
		return
	}
	send(w, 200, p)
}
func (s *Server) analyzeItinerary(w http.ResponseWriter, r *http.Request) {
	p, e := planLoad(r.PathValue("id"))
	if e != nil {
		fail(w, 404, "Itinerary tidak ditemukan")
		return
	}
	if !planAuthorized(p, r) {
		fail(w, 403, "Akses itinerary ditolak")
		return
	}
	warnings := []string{}
	for i, a := range p.Activities {
		if a.Type == "wisata" {
			hotelInRange := false
			for _, h := range p.Activities {
				if h.Type == "hotel" && h.Date <= a.Date {
					hotelInRange = true
					break
				}
			}
			if !hotelInRange {
				warnings = append(warnings, fmt.Sprintf("Wisata '%s' tidak memiliki kegiatan check-in hotel sebelumnya dalam rencana (bukan bukti booking hotel tidak ada)", a.Title))
			}
		}
		for j := i + 1; j < len(p.Activities); j++ {
			b := p.Activities[j]
			if a.Date == b.Date && a.StartTime < b.EndTime && b.StartTime < a.EndTime {
				warnings = append(warnings, fmt.Sprintf("Jadwal '%s' dan '%s' bertabrakan pada %s", a.Title, b.Title, a.Date))
			}
		}
	}
	send(w, 200, map[string]any{"itineraryId": p.ID, "warnings": warnings, "note": "Analisis konflik lokal, bukan perubahan otomatis pada booking provider."})
}

// Kept for contract-checking tests: no silent fake provider response.
