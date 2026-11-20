package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func intCall(t *testing.T, method, path, id, secret string, payload any, fn func(http.ResponseWriter, *http.Request)) (int, []byte) {
	t.Helper()
	b, _ := json.Marshal(payload)
	r := httptest.NewRequest(method, path, bytes.NewReader(b))
	if id != "" {
		r.SetPathValue("id", id)
	}
	if secret != "" {
		r.Header.Set("X-Plan-Token", secret)
	}
	w := httptest.NewRecorder()
	fn(w, r)
	return w.Code, w.Body.Bytes()
}
func futureIntegratedPlan() Plan {
	start := time.Now().AddDate(0, 0, 15).Format("2006-01-02")
	end := time.Now().AddDate(0, 0, 17).Format("2006-01-02")
	mid := time.Now().AddDate(0, 0, 16).Format("2006-01-02")
	return Plan{Title: "Trip API", StartDate: start, EndDate: end, Activities: []PlanActivity{
		{ID: "hotel-activity", Type: "hotel", Title: "Hotel Demo", Date: start, StartTime: "14:00", EndTime: "15:00", SourceItem: &Item{Type: "hotel", HotelID: "h1", RoomID: "r1", CheckIn: start, CheckOut: end, Guests: 2}},
		{ID: "wisata-activity", Type: "wisata", Title: "Prambanan", Date: mid, StartTime: "09:00", EndTime: "11:00", SourceItem: &Item{Type: "wisata", DestinationID: 1, VisitDate: mid, Quantity: 2, Tier: "base"}},
	}}
}
func createIntegratedPlan(t *testing.T, s *Server) (string, string) {
	t.Helper()
	code, data := intCall(t, "POST", "/api/itineraries", "", "", futureIntegratedPlan(), s.createItinerary)
	if code != 201 {
		t.Fatalf("create %d %s", code, data)
	}
	var result struct {
		Itinerary   Plan   `json:"itinerary"`
		AccessToken string `json:"accessToken"`
	}
	if e := json.Unmarshal(data, &result); e != nil {
		t.Fatal(e)
	}
	return result.Itinerary.ID, result.AccessToken
}
func TestIntegratedRecommendationsSemantic(t *testing.T) {
	s, _ := testServer(t)
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/recommendations?hotelId=h1", nil)
	s.recommendations(w, r)
	if w.Code != 200 {
		t.Fatalf("recommendations %d %s", w.Code, w.Body.String())
	}
	var out struct {
		Region       string `json:"region"`
		Destinations []any  `json:"destinations"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	if out.Region != "Sleman" || len(out.Destinations) != 1 {
		t.Fatalf("unexpected region mapping: %+v", out)
	}
	for from, want := range map[string]string{"kabupaten-sleman": "Sleman", "kabupaten-bantul": "Bantul", "kota-yogyakarta": "Kota Yogyakarta", "kabupaten-kulon-progo": "Kulon Progo"} {
		if got := canonicalRegion(from); got != want {
			t.Errorf("%s → %s not %s", from, got, want)
		}
	}
}
func TestIntegratedBookSyncAndProtection(t *testing.T) {
	m := &packageMock{hotelStatus: "confirmed", wisataStatus: "PAID"}
	s, _ := packageHarness(t, m)
	t.Setenv("PLAN_DATA_DIR", filepath.Join(t.TempDir(), "plans"))
	id, secret := createIntegratedPlan(t, s)
	code, data := intCall(t, "POST", "/api/itineraries/"+id+"/quote", id, "wrong", map[string]any{}, s.quoteItinerary)
	if code != 403 {
		t.Fatalf("without plan auth %d %s", code, data)
	}
	code, data = intCall(t, "POST", "/api/itineraries/"+id+"/quote", id, secret, map[string]any{}, s.quoteItinerary)
	if code != 200 {
		t.Fatalf("quote %d %s", code, data)
	}
	var q struct {
		Available bool  `json:"available"`
		Total     int64 `json:"total"`
	}
	_ = json.Unmarshal(data, &q)
	if !q.Available || q.Total != 260000 {
		t.Fatalf("quote unexpected %+v", q)
	}
	code, data = intCall(t, "POST", "/api/itineraries/"+id+"/book", id, secret, map[string]any{"customer": Customer{Name: "Demo", Email: "demo@example.com"}}, s.bookItinerary)
	if code != 201 {
		t.Fatalf("book %d %s", code, data)
	}
	var out struct {
		Order       Order  `json:"order"`
		AccessToken string `json:"accessToken"`
		Itinerary   Plan   `json:"itinerary"`
	}
	_ = json.Unmarshal(data, &out)
	if out.Order.Status != "CONFIRMED" || len(out.Order.Items) != 2 || out.Itinerary.Activities[0].OrderID != out.Order.ID {
		t.Fatalf("bad booking %+v", out.Order)
	}
	code, data = intCall(t, "POST", "/api/itineraries/"+id+"/book", id, secret, map[string]any{"customer": Customer{Name: "Demo", Email: "demo@example.com"}}, s.bookItinerary)
	if code != 400 {
		t.Fatalf("duplicate booking not blocked: %d %s", code, data)
	}
	m.hotelStatus = "declined"
	code, data = intCall(t, "POST", "/api/itineraries/"+id+"/sync", id, secret, map[string]any{}, s.syncItinerary)
	if code != 200 {
		t.Fatalf("sync %d %s", code, data)
	}
	var synced struct {
		Itinerary Plan `json:"itinerary"`
	}
	_ = json.Unmarshal(data, &synced)
	if synced.Itinerary.Activities[0].BookingStatus != "DECLINED" {
		t.Fatalf("status not synced: %+v", synced.Itinerary.Activities)
	}
	// Itinerary is the owner of the plan, but cannot forge a changed hotel booking.
	changed := synced.Itinerary
	changed.Activities[0].SourceItem.HotelID = "other"
	code, data = intCall(t, "PUT", "/api/itineraries/"+id, id, secret, changed, s.updateItinerary)
	if code != 409 {
		t.Fatalf("provider booking mutated: %d %s", code, data)
	}
}
func TestIntegratedQuoteFailsBeforeBooking(t *testing.T) {
	m := &packageMock{}
	s, _ := packageHarness(t, m)
	t.Setenv("PLAN_DATA_DIR", filepath.Join(t.TempDir(), "plans"))
	id, secret := createIntegratedPlan(t, s)
	m.wisataAvailable = false
	code, data := intCall(t, "POST", "/api/itineraries/"+id+"/book", id, secret, map[string]any{"customer": Customer{Name: "Demo", Email: "demo@example.com"}}, s.bookItinerary)
	if code != 409 {
		t.Fatalf("expected 409, got %d %s", code, data)
	}
	if m.hotelBookingCount != 0 || m.wisataBookingCount != 0 {
		t.Fatal("booking made despite failed preflight")
	}
	if _, err := os.Stat(filepath.Join(s.store.(*FileStore).path, id+".json")); err == nil {
		t.Fatal("wrong order persisted")
	}
}
