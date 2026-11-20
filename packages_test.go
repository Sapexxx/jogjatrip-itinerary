package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

type packageMock struct {
	mu                        sync.Mutex
	hotelStatus, wisataStatus string
	wisataTimeout             bool
	failSecondWisata          bool
	hotelBookingKeys          []string
	wisataBookingKeys         []string
	hotelBookingCount         int
	wisataBookingCount        int
	hotelCancelCount          int
	wisataAvailable           bool
	hotelAvailable            bool
}

func packageHarness(t *testing.T, m *packageMock) (*Server, PackageTemplate) {
	t.Helper()
	m.wisataAvailable = true
	m.hotelAvailable = true
	prov := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/availability") && strings.Contains(r.URL.Path, "/hotels/"):
			if !m.hotelAvailable {
				fail(w, 409, "Kamar tidak tersedia")
				return
			}
			send(w, 200, map[string]any{"rooms": []any{map[string]any{"roomId": "r1", "capacity": 4, "unitsAvailable": 3, "totalPrice": 200000}}})
		case strings.HasSuffix(r.URL.Path, "/availability") && strings.Contains(r.URL.Path, "/destinations/"):
			if !m.wisataAvailable {
				send(w, 200, map[string]any{"available": false})
				return
			}
			send(w, 200, map[string]any{"available": true, "total": 60000})
		case r.URL.Path == "/api/v1/hotel-bookings" && r.Method == "POST":
			m.mu.Lock()
			m.hotelBookingCount++
			m.hotelBookingKeys = append(m.hotelBookingKeys, r.Header.Get("Idempotency-Key"))
			m.mu.Unlock()
			st := m.hotelStatus
			if st == "" {
				st = "confirmed"
			}
			send(w, 201, map[string]any{"bookingId": "HB1", "status": st})
		case r.URL.Path == "/api/v1/partner/bookings" && r.Method == "POST":
			m.mu.Lock()
			m.wisataBookingCount++
			count := m.wisataBookingCount
			m.wisataBookingKeys = append(m.wisataBookingKeys, r.Header.Get("Idempotency-Key"))
			m.mu.Unlock()
			if m.wisataTimeout {
				time.Sleep(400 * time.Millisecond)
				return
			}
			st := m.wisataStatus
			if m.failSecondWisata && count == 2 {
				st = "DECLINED"
			}
			if st == "" {
				st = "PAID"
			}
			send(w, 201, map[string]any{"code": "WT1", "status": st})
		case r.URL.Path == "/api/v1/hotel-bookings/HB1" && r.Method == "DELETE":
			m.mu.Lock()
			m.hotelCancelCount++
			m.mu.Unlock()
			send(w, 200, map[string]any{"status": "cancelled"})
		case r.URL.Path == "/api/v1/hotel-bookings/HB1" && r.Method == "GET":
			send(w, 200, map[string]any{"bookingId": "HB1", "status": m.hotelStatus})
		case r.URL.Path == "/api/v1/partner/bookings/WT1" && r.Method == "GET":
			send(w, 200, map[string]any{"code": "WT1", "status": m.wisataStatus})
		default:
			fail(w, 404, "not found")
		}
	}))
	t.Cleanup(prov.Close)
	dir := t.TempDir()
	t.Setenv("PACKAGE_DATA_DIR", filepath.Join(dir, "packages"))
	_ = os.MkdirAll(packageDir(), 0700)
	p := PackageTemplate{ID: "test-package", Name: "Test", Region: "Sleman", Nights: 2, Active: true, Components: []PackageComponent{
		{ID: "hotel", Kind: "hotel", Required: true, HotelID: "h1", RoomID: "r1", Nights: 2},
		{ID: "wisata", Kind: "wisata", Required: true, DayOffset: 1, DestinationID: 1, Tier: "base"},
	}, BundleDiscount: Discount{Type: "percent", Value: 10}}
	b, _ := json.Marshal(p)
	if e := os.WriteFile(filepath.Join(packageDir(), "test.json"), b, 0600); e != nil {
		t.Fatal(e)
	}
	s := &Server{hotel: Provider{"hotel", prov.URL, "token"}, wisata: Provider{"wisata", prov.URL, "token"}, client: &http.Client{Timeout: 100 * time.Millisecond}, store: &FileStore{path: filepath.Join(dir, "orders")}}
	return s, p
}
func packageRequest(t *testing.T, s *Server, method, path string, payload any, secret string) (int, []byte) {
	t.Helper()
	b, _ := json.Marshal(payload)
	r := httptest.NewRequest(method, path, bytes.NewReader(b))
	if secret != "" {
		r.Header.Set("X-Order-Token", secret)
	}
	r.SetPathValue("id", "test-package")
	w := httptest.NewRecorder()
	if strings.HasSuffix(path, "/quote") {
		s.packageQuote(w, r)
	} else {
		s.packageBook(w, r)
	}
	return w.Code, w.Body.Bytes()
}
func futurePackageRequest() PackageRequest {
	return PackageRequest{StartDate: time.Now().AddDate(0, 0, 10).Format("2006-01-02"), Guests: 2, Customer: Customer{Name: "Test", Email: "test@example.com"}}
}
func decodePackageOrder(t *testing.T, b []byte) (Order, string) {
	t.Helper()
	var result struct {
		Order Order  `json:"order"`
		Token string `json:"accessToken"`
	}
	if e := json.Unmarshal(b, &result); e != nil {
		t.Fatal(e)
	}
	return result.Order, result.Token
}
func TestPackageCompleteConfirmedAndDiscount(t *testing.T) {
	m := &packageMock{}
	s, _ := packageHarness(t, m)
	r := futurePackageRequest()
	status, b := packageRequest(t, s, "POST", "/api/packages/test-package/quote", r, "")
	if status != 200 {
		t.Fatalf("quote: %d %s", status, b)
	}
	var q PackageQuote
	_ = json.Unmarshal(b, &q)
	if q.Pricing.ComponentsSubtotal != 260000 || q.Pricing.BundleDiscount != 26000 || q.Pricing.Total != 234000 {
		t.Fatalf("bad quote: %+v", q.Pricing)
	}
	status, b = packageRequest(t, s, "POST", "/api/packages/test-package/book", r, "")
	if status != 200 {
		t.Fatalf("book %d %s", status, b)
	}
	o, token := decodePackageOrder(t, b)
	if o.Status != "CONFIRMED" || o.Pricing.AppliedDiscount != 26000 || o.Total != 234000 || len(o.Items) != 2 {
		t.Fatalf("order %+v", o)
	}
	if m.hotelBookingCount != 1 || m.wisataBookingCount != 1 || m.hotelBookingKeys[0] != o.ID+"-0" || m.wisataBookingKeys[0] != o.ID+"-1" {
		t.Fatalf("bad idempotency %+v %+v", m.hotelBookingKeys, m.wisataBookingKeys)
	}
	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/orders/"+o.ID, nil)
	req.SetPathValue("id", o.ID)
	s.getOrder(w, req)
	if w.Code != 403 {
		t.Fatalf("no token must get 403, got %d", w.Code)
	}
	req.Header.Set("X-Order-Token", token)
	w = httptest.NewRecorder()
	s.getOrder(w, req)
	if w.Code != 200 {
		t.Fatalf("auth failed %s", w.Body.String())
	}
}
func TestPackageDeclinedAndNotAttempted(t *testing.T) {
	m := &packageMock{hotelStatus: "declined"}
	s, _ := packageHarness(t, m)
	status, b := packageRequest(t, s, "POST", "/api/packages/test-package/book", futurePackageRequest(), "")
	if status != 200 {
		t.Fatalf("book %d %s", status, b)
	}
	o, _ := decodePackageOrder(t, b)
	if o.Status != "FAILED" || o.Pricing.AppliedDiscount != 0 || o.Items[1].Status != "NOT_ATTEMPTED" || m.wisataBookingCount != 0 {
		t.Fatalf("unexpected %+v", o)
	}
}
func TestPackageWisataTimeoutUnknownNoCompensation(t *testing.T) {
	m := &packageMock{wisataTimeout: true}
	s, _ := packageHarness(t, m)
	status, b := packageRequest(t, s, "POST", "/api/packages/test-package/book", futurePackageRequest(), "")
	if status != 200 {
		t.Fatalf("book %d %s", status, b)
	}
	o, _ := decodePackageOrder(t, b)
	if o.Status != "UNKNOWN" || !o.RequiresManualAction || m.hotelCancelCount != 0 {
		t.Fatalf("uncertain status must not compensate: %+v", o)
	}
}
func TestPackageOptionalAddOnFailure(t *testing.T) {
	m := &packageMock{}
	s, p := packageHarness(t, m)
	m.failSecondWisata = true
	p.AddOns = []AddOn{{ID: "extra", Name: "Extra", Kind: "extra_component", DependsOn: "wisata", MaxQty: 1, PriceSource: "provider_live", Component: &PackageComponent{ID: "extra", Kind: "wisata", DayOffset: 1, DestinationID: 2, Tier: "base"}}}
	b, _ := json.Marshal(p)
	_ = os.WriteFile(filepath.Join(packageDir(), "test.json"), b, 0600)
	request := futurePackageRequest()
	request.SelectedAddOns = []SelectedAddOn{{ID: "extra", Qty: 1}}
	code, body := packageRequest(t, s, "POST", "/api/packages/test-package/book", request, "")
	if code != 200 {
		t.Fatalf("booking failed %d %s", code, body)
	}
	o, _ := decodePackageOrder(t, body)
	if o.Status != "CONFIRMED" || o.Items[2].Status != "DECLINED" || o.Pricing.AppliedDiscount != 26000 || o.Total != 234000 {
		t.Fatalf("optional failure should not fail required package: %+v", o)
	}
	if m.wisataBookingCount != 2 {
		t.Fatalf("expected both wisata requests: %d", m.wisataBookingCount)
	}

}
func TestPackageValidationKindsDatesAndDependency(t *testing.T) {
	m := &packageMock{}
	s, p := packageHarness(t, m)
	p.Components[1].DayOffset = 3
	r := futurePackageRequest()
	q, e := s.expand(httptest.NewRequest("GET", "/", nil).Context(), p, r)
	if e != nil || q.Available || !strings.Contains(strings.Join(q.Warnings, " "), "luar masa menginap") {
		t.Fatalf("date mismatch %+v %v", q, e)
	}
	p.Components[1].Kind = "unsupported"
	if e = safeValidate(s, p); e == nil {
		t.Fatal("unknown provider must fail")
	}
	p.Components[1].Kind = "wisata"
	p.AddOns = []AddOn{{ID: "bad", Name: "Bad", Kind: "native", DependsOn: "missing", MaxQty: 1, PriceSource: "fixed_idr"}}
	if e = safeValidate(s, p); e == nil {
		t.Fatal("bad dependency accepted")
	}
}
func safeValidate(s *Server, p PackageTemplate) error { return validateTemplate(&p, s.adapters()) }
func TestLegacyOrderReadable(t *testing.T) {
	m := &packageMock{hotelStatus: "confirmed"}
	s, _ := packageHarness(t, m)
	o := &Order{ID: "JT-11111111111111111111111111111111", SecretHash: hash("secret"), Customer: Customer{Name: "Old"}, Items: []OrderItem{{Item: Item{Type: "hotel"}, Status: "CONFIRMED", BookingID: "HB1", Amount: 100000}}}
	if e := s.store.Save(o); e != nil {
		t.Fatal(e)
	}
	got, e := s.store.Load(o.ID)
	if e != nil || got.Items[0].BookingID != "HB1" {
		t.Fatalf("old order broken: %v %+v", e, got)
	}
}
func TestPackageListingAndItinerary(t *testing.T) {
	m := &packageMock{}
	s, _ := packageHarness(t, m)
	ps, e := s.packageList()
	if e != nil || len(ps) != 1 {
		t.Fatal(fmt.Sprint(e, ps))
	}
	_, b := packageRequest(t, s, "POST", "/api/packages/test-package/book", futurePackageRequest(), "")
	o, secret := decodePackageOrder(t, b)
	t.Setenv("PLAN_DATA_DIR", filepath.Join(t.TempDir(), "plans"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/orders/"+o.ID+"/itinerary", nil)
	req.SetPathValue("id", o.ID)
	s.itineraryFromPackage(w, req)
	if w.Code != 403 {
		t.Fatal("itinerary missing access token not 403")
	}
	req.Header.Set("X-Order-Token", secret)
	w = httptest.NewRecorder()
	s.itineraryFromPackage(w, req)
	if w.Code != 201 {
		t.Fatalf("itinerary create %d %s", w.Code, w.Body.String())
	}
}

func TestPackageHotelDeclinedDuringSyncRevokesDiscount(t *testing.T) {
	m := &packageMock{}
	s, _ := packageHarness(t, m)
	code, b := packageRequest(t, s, "POST", "/api/packages/test-package/book", futurePackageRequest(), "")
	if code != 200 {
		t.Fatalf("booking response: %d %s", code, b)
	}
	o, secret := decodePackageOrder(t, b)
	if o.Status != "CONFIRMED" {
		t.Fatalf("precondition failed: %+v", o)
	}
	m.hotelStatus = "declined"
	m.wisataStatus = "PAID"
	req := httptest.NewRequest("GET", "/api/orders/"+o.ID, nil)
	req.SetPathValue("id", o.ID)
	req.Header.Set("X-Order-Token", secret)
	w := httptest.NewRecorder()
	s.getOrder(w, req)
	if w.Code != 200 {
		t.Fatalf("reconciliation %d: %s", w.Code, w.Body.String())
	}
	var refreshed Order
	if err := json.Unmarshal(w.Body.Bytes(), &refreshed); err != nil {
		t.Fatal(err)
	}
	if refreshed.Status != "PARTIAL" || refreshed.Pricing.AppliedDiscount != 0 || refreshed.Total != 60000 || !refreshed.RequiresManualAction {
		t.Fatalf("bad status after provider decline: %+v", refreshed)
	}
}
