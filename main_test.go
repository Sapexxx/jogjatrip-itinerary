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

func testServer(t *testing.T) (*Server, *httptest.Server) {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/v1/hotels":
			send(w, 200, []map[string]any{{"hotelId": "h1", "name": "Hotel Demo", "city": "Sleman"}})
		case r.URL.Path == "/api/v1/rooms":
			send(w, 200, []map[string]any{{"hotelId": "h1", "roomId": "r1", "pricePerNight": 100000}})
		case r.URL.Path == "/api/v1/destinations":
			send(w, 200, []map[string]any{{"id": 1, "name": "Prambanan", "region": "kabupaten-sleman"}})
		case strings.HasSuffix(r.URL.Path, "/availability") && strings.Contains(r.URL.Path, "hotels"):
			send(w, 200, map[string]any{"rooms": []any{map[string]any{"roomId": "r1", "capacity": 2, "unitsAvailable": 3, "totalPrice": 200000}}})
		case strings.HasSuffix(r.URL.Path, "/availability") && strings.Contains(r.URL.Path, "destinations"):
			send(w, 200, map[string]any{"available": true, "total": 50000})
		case r.URL.Path == "/api/v1/hotel-bookings" && r.Method == "POST":
			if r.Header.Get("Idempotency-Key") == "" {
				t.Error("missing hotel idempotency")
			}
			send(w, 201, map[string]any{"bookingId": "HB-001", "status": "confirmed"})
		case r.URL.Path == "/api/v1/partner/bookings" && r.Method == "POST":
			if r.Header.Get("Authorization") != "Bearer testtoken" {
				t.Error("bad partner token")
			}
			send(w, 201, map[string]any{"code": "WT-001", "status": "PAID"})
		default:
			fail(w, 404, "mock endpoint tidak ada")
		}
	}))
	t.Cleanup(srv.Close)
	s := &Server{hotel: Provider{"hotel", srv.URL, "testtoken"}, wisata: Provider{"wisata", srv.URL, "testtoken"}, client: &http.Client{Timeout: 2 * time.Second}, store: &FileStore{path: filepath.Join(t.TempDir(), "orders")}}
	return s, srv
}
func TestRegionNormalization(t *testing.T) {
	for input, want := range map[string]string{"kabupaten-sleman": "Sleman", "KOTA YOGYAKARTA": "Kota Yogyakarta", "kabupaten-bantul": "Bantul"} {
		if x := regionName(input); x != want {
			t.Fatalf("%s => %s, want %s", input, x, want)
		}
	}
}
func TestQuoteBookingAndOrderProtection(t *testing.T) {
	s, _ := testServer(t)
	next := time.Now().AddDate(0, 0, 10).Format("2006-01-02")
	end := time.Now().AddDate(0, 0, 12).Format("2006-01-02")
	in := BookingInput{Customer: Customer{Name: "Demo", Email: "demo@example.com"}, Items: []Item{{Type: "hotel", HotelID: "h1", RoomID: "r1", CheckIn: next, CheckOut: end, Guests: 2}, {Type: "wisata", DestinationID: 1, VisitDate: next, Quantity: 2, Tier: "base"}}}
	b, _ := json.Marshal(in)
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/quote", bytes.NewReader(b))
	s.quote(w, r)
	if w.Code != 200 {
		t.Fatalf("quote %d %s", w.Code, w.Body.String())
	}
	var quote map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &quote)
	if quote["total"] != float64(250000) {
		t.Fatal("wrong quote")
	}
	w = httptest.NewRecorder()
	r = httptest.NewRequest("POST", "/api/book", bytes.NewReader(b))
	s.book(w, r)
	if w.Code != 200 {
		t.Fatalf("book %d %s", w.Code, w.Body.String())
	}
	var result struct {
		Order Order  `json:"order"`
		Token string `json:"accessToken"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	if result.Order.Status != "CONFIRMED" || len(result.Order.Items) != 2 || result.Token == "" {
		t.Fatalf("unexpected booking: %+v", result)
	}
	for _, tc := range []struct {
		token string
		want  int
	}{{"wrong", 403}, {result.Token, 200}} {
		w = httptest.NewRecorder()
		r = httptest.NewRequest("GET", "/api/orders/"+result.Order.ID, nil)
		r.SetPathValue("id", result.Order.ID)
		r.Header.Set("X-Order-Token", tc.token)
		s.getOrder(w, r)
		if w.Code != tc.want {
			t.Fatalf("access code %d expected %d", w.Code, tc.want)
		}
	}
	if _, err := os.Stat(filepath.Join(s.store.(*FileStore).path, result.Order.ID+".json")); err != nil {
		t.Fatal("persist failed", err)
	}
}
func TestCatalog(t *testing.T) {
	s, _ := testServer(t)
	for _, kind := range []string{"hotels", "rooms", "destinations"} {
		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/api/catalog/"+kind+"?region=Sleman", nil)
		r.SetPathValue("which", kind)
		s.catalog(w, r)
		if w.Code != 200 {
			t.Errorf("catalog %s = %d", kind, w.Code)
		}
	}
}
func TestRejectBadInput(t *testing.T) {
	s, _ := testServer(t)
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/book", strings.NewReader(`{"customer":{"name":"a","email":"x@y"},"items":[{"type":"unknown_service"}]}`))
	s.book(w, r)
	if w.Code != 400 {
		t.Fatalf("want 400, got %d", w.Code)
	}
}
