package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestShortCodesAndStatuses(t *testing.T) {
	for i := 0; i < 100; i++ {
		id := shortOrderID()
		if !validOrderID(id) || len(id) != 15 {
			t.Fatalf("bad short code %q", id)
		}
	}
	for _, tc := range []struct{ provider, raw, want string }{{"hotel", "declined", "DECLINED"}, {"hotel", "confirmed", "CONFIRMED"}, {"wisata", "PAID", "CONFIRMED"}, {"wisata", "REFUNDED", "CANCELLED"}, {"hotel", "unrecognized", "UNKNOWN"}} {
		if got := statusCanonical(tc.provider, tc.raw); got != tc.want {
			t.Errorf("%s => %s want %s", tc.raw, got, tc.want)
		}
	}
}
func TestRefreshDeclinedChangesPackage(t *testing.T) {
	src := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/hotel-bookings/HB1":
			send(w, 200, map[string]any{"bookingId": "HB1", "status": "declined"})
		case "/api/v1/partner/bookings/WT1":
			send(w, 200, map[string]any{"code": "WT1", "status": "PAID"})
		default:
			fail(w, 404, "none")
		}
	}))
	defer src.Close()
	s := &Server{hotel: Provider{"hotel", src.URL, "secret"}, wisata: Provider{"wisata", src.URL, "secret"}, client: &http.Client{Timeout: 2 * time.Second}, store: &FileStore{path: t.TempDir()}}
	o := &Order{ID: shortOrderID(), SecretHash: hash("access"), Status: "CONFIRMED", Items: []OrderItem{{Item: Item{Type: "hotel"}, BookingID: "HB1", Amount: 150000, Status: "CONFIRMED"}, {Item: Item{Type: "wisata"}, BookingID: "WT1", Amount: 50000, Status: "CONFIRMED"}}}
	if err := s.store.Save(o); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/orders/"+o.ID, nil)
	r.SetPathValue("id", o.ID)
	r.Header.Set("X-Order-Token", "access")
	s.getOrder(w, r)
	if w.Code != 200 {
		t.Fatalf("code=%d body=%s", w.Code, w.Body.String())
	}
	var result Order
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Status != "PARTIAL" || result.Items[0].Status != "DECLINED" || result.Items[1].Status != "CONFIRMED" || result.Total != 50000 {
		t.Fatalf("incorrect reconciliation: %+v", result)
	}
}
func TestProviderDownRetainsPreviousStatusWithWarning(t *testing.T) {
	s := &Server{hotel: Provider{"hotel", "http://127.0.0.1:1", ""}, client: &http.Client{Timeout: 150 * time.Millisecond}}
	o := &Order{Items: []OrderItem{{Item: Item{Type: "hotel"}, BookingID: "HB1", Status: "CONFIRMED", Amount: 100}}}
	s.refreshOrder(httptest.NewRequest("GET", "/", nil).Context(), o)
	if o.Items[0].Status != "CONFIRMED" || o.Items[0].SyncError == "" {
		t.Fatalf("failed should retain prior status and show error: %+v", o)
	}
}
func TestIndependentPlanCrudAuthAndAnalysis(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PLAN_DATA_DIR", filepath.Join(dir, "plans"))
	t.Setenv("SUPABASE_URL", "")
	t.Setenv("SUPABASE_SERVICE_ROLE_KEY", "")
	s := &Server{}
	date := time.Now().AddDate(0, 0, 7).Format("2006-01-02")
	body := map[string]any{"title": "Akhir pekan", "startDate": date, "endDate": date, "activities": []any{map[string]any{"type": "hotel", "title": "Checkin", "date": date, "startTime": "09:00", "endTime": "11:00"}, map[string]any{"type": "wisata", "title": "Prambanan", "date": date, "startTime": "10:00", "endTime": "12:00"}}}
	bb, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	s.createItinerary(w, httptest.NewRequest("POST", "/api/itineraries", bytes.NewReader(bb)))
	if w.Code != 201 {
		t.Fatalf("create=%d %s", w.Code, w.Body.String())
	}
	var out struct {
		Itinerary   Plan   `json:"itinerary"`
		AccessToken string `json:"accessToken"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	if out.Itinerary.ID == "" || out.AccessToken == "" {
		t.Fatal("no access credential")
	}
	file := filepath.Join(dir, "plans", out.Itinerary.ID+".json")
	if _, err := os.Stat(file); err != nil {
		t.Fatal("plan not persisted", err)
	}
	r := httptest.NewRequest("POST", "/api/itineraries/"+out.Itinerary.ID+"/analyze", nil)
	r.SetPathValue("id", out.Itinerary.ID)
	w = httptest.NewRecorder()
	s.analyzeItinerary(w, r)
	if w.Code != 403 {
		t.Fatalf("expected auth rejection got %d", w.Code)
	}
	r.Header.Set("X-Plan-Token", out.AccessToken)
	w = httptest.NewRecorder()
	s.analyzeItinerary(w, r)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "bertabrakan") {
		t.Fatalf("analysis %d %s", w.Code, w.Body.String())
	}
}
