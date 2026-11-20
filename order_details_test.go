package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestOrderDetailsAccessAndEnrichment(t *testing.T) {
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/hotels":
			send(w, 200, []any{map[string]any{"hotelId": "h1", "name": "Hotel Asli", "city": "Sleman", "imageUrl": "https://example.org/hotel.jpg"}})
		case "/api/v1/rooms":
			send(w, 200, []any{map[string]any{"hotelId": "h1", "roomId": "r1", "roomType": "Deluxe"}})
		case "/api/v1/destinations":
			send(w, 200, []any{map[string]any{"id": float64(7), "name": "Wisata Asli", "region": "kabupaten-sleman", "photos": []any{"/static/7.jpg"}}})
		case "/api/v1/hotel-bookings/HB-01":
			send(w, 200, map[string]any{"bookingId": "HB-01", "status": "confirmed"})
		case "/api/v1/partner/bookings/WI-01":
			send(w, 200, map[string]any{"code": "WI-01", "status": "PAID"})
		default:
			fail(w, 404, "missing")
		}
	}))
	defer provider.Close()
	s := &Server{hotel: Provider{"hotel", provider.URL, ""}, wisata: Provider{"wisata", provider.URL, ""}, client: &http.Client{Timeout: time.Second}, store: &FileStore{path: filepath.Join(t.TempDir(), "orders")}}
	access := "demo-secret"
	o := &Order{ID: "JT-ABCDEFGHJKLM", SecretHash: hash(access), Status: "CONFIRMED", Customer: Customer{Name: "Demo"}, Items: []OrderItem{{Item: Item{Type: "hotel", HotelID: "h1", RoomID: "r1", Guests: 2, CheckIn: "2026-12-01", CheckOut: "2026-12-03"}, BookingID: "HB-01", Amount: 500000, Status: "CONFIRMED"}, {Item: Item{Type: "wisata", DestinationID: 7, VisitDate: "2026-12-02", Quantity: 2, Tier: "base"}, BookingID: "WI-01", Amount: 100000, Status: "CONFIRMED"}}}
	if err := s.store.Save(o); err != nil {
		t.Fatal(err)
	}
	call := func(secret string) *httptest.ResponseRecorder {
		t.Helper()
		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/api/orders/"+o.ID+"/details", nil)
		r.SetPathValue("id", o.ID)
		r.Header.Set("X-Order-Token", secret)
		s.orderDetails(w, r)
		return w
	}
	if w := call(""); w.Code != 403 {
		t.Fatalf("missing token code %d", w.Code)
	}
	if w := call("wrong"); w.Code != 403 {
		t.Fatalf("wrong token code %d", w.Code)
	}
	w := call(access)
	if w.Code != 200 {
		t.Fatalf("valid token code %d: %s", w.Code, w.Body.String())
	}
	var out struct {
		Order   Order           `json:"order"`
		Details []ServiceDetail `json:"details"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if len(out.Details) != 2 || out.Details[0].Name != "Hotel Asli" || out.Details[0].ProductName != "Deluxe" || out.Details[1].Name != "Wisata Asli" {
		t.Fatalf("enrichment unexpected: %+v", out.Details)
	}
	if out.Details[1].ImageURL != provider.URL+"/static/7.jpg" {
		t.Fatalf("image not resolved: %+v", out.Details[1])
	}
	if out.Order.Total != 600000 || out.Order.Status != "CONFIRMED" {
		t.Fatalf("order status/value changed: %+v", out.Order)
	}
	if strings.Contains(w.Body.String(), access) || strings.Contains(w.Body.String(), hash(access)) {
		t.Fatal("access token/hash exposed")
	}
}

func TestOrderDetailsProviderUnavailableNoFabricatedIdentity(t *testing.T) {
	s := &Server{hotel: Provider{"hotel", "", ""}, wisata: Provider{"wisata", "", ""}, client: &http.Client{Timeout: time.Second}, store: &FileStore{path: filepath.Join(t.TempDir(), "orders")}}
	o := &Order{ID: "JT-ABCDEFGHJKLM", SecretHash: hash("t"), Items: []OrderItem{{Item: Item{Type: "hotel", HotelID: "missing", RoomID: "r1"}, BookingID: "HB-OLD", Status: "CONFIRMED", Amount: 200000}}}
	if err := s.store.Save(o); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/orders/"+o.ID+"/details", nil)
	r.SetPathValue("id", o.ID)
	r.Header.Set("X-Order-Token", "t")
	s.orderDetails(w, r)
	if w.Code != 200 {
		t.Fatalf("unavailable provider should not block details: %d", w.Code)
	}
	var out struct {
		Order   Order           `json:"order"`
		Details []ServiceDetail `json:"details"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if out.Details[0].Name != "" || out.Details[0].Warning == "" || out.Order.Items[0].SyncError == "" || out.Order.Items[0].BookingID != "HB-OLD" {
		t.Fatalf("must preserve order/declare unavailable: %+v", out)
	}
}
