package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"
)

func TestPlannedTimesValidationAndBackwardCompatibility(t *testing.T) {
	future := time.Now().AddDate(0, 0, 10).Format("2006-01-02")
	base := BookingInput{Customer: Customer{Name: "Demo", Email: "demo@example.com"}, Items: []Item{{Type: "wisata", DestinationID: 1, VisitDate: future, Quantity: 2, Tier: "base"}}}
	if err := validInput(base); err != nil {
		t.Fatalf("old booking must remain readable: %v", err)
	}
	for _, tc := range []struct {
		start, end string
		ok         bool
	}{
		{"10:30", "13:00", true}, {"16:00", "21:45", true}, {"", "", true},
		{"13:00", "12:59", false}, {"10:00", "", false}, {"26:00", "28:00", false},
	} {
		base.Items[0].PlannedStartTime = tc.start
		base.Items[0].PlannedEndTime = tc.end
		got := validInput(base) == nil
		if got != tc.ok {
			t.Errorf("times %s-%s valid=%v want %v", tc.start, tc.end, got, tc.ok)
		}
	}
}
func TestQuoteAndBookingPreserveChosenTimes(t *testing.T) {
	s, _ := testServer(t)
	date := time.Now().AddDate(0, 0, 10).Format("2006-01-02")
	in := BookingInput{Customer: Customer{Name: "Demo", Email: "demo@example.com"}, Items: []Item{{Type: "wisata", DestinationID: 1, VisitDate: date, Quantity: 2, Tier: "base", PlannedStartTime: "16:30", PlannedEndTime: "19:00"}}}
	body, _ := json.Marshal(in)
	w := httptest.NewRecorder()
	s.quote(w, httptest.NewRequest("POST", "/api/quote", bytes.NewReader(body)))
	if w.Code != 200 {
		t.Fatalf("quote %d %s", w.Code, w.Body.String())
	}
	w = httptest.NewRecorder()
	s.book(w, httptest.NewRequest("POST", "/api/book", bytes.NewReader(body)))
	if w.Code != 200 {
		t.Fatalf("book %d %s", w.Code, w.Body.String())
	}
	var result struct {
		Order Order `json:"order"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	got := result.Order.Items[0].Item
	if got.PlannedStartTime != "16:30" || got.PlannedEndTime != "19:00" {
		t.Fatalf("planned schedule lost: %+v", got)
	}
}
func TestCuratedPackageSchedulePreserved(t *testing.T) {
	s, p := packageHarness(t, &packageMock{})
	r := futurePackageRequest()
	schedules := map[string]PlannedSlot{}
	for _, component := range p.Components {
		schedules[component.ID] = PlannedSlot{StartTime: "17:00", EndTime: "20:00"}
	}
	r.Schedules = schedules
	q, err := s.expand(context.Background(), p, r)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range q.Items {
		if item.AddOnID != "" || item.Native {
			continue
		}
		if item.Item.PlannedStartTime != "17:00" || item.Item.PlannedEndTime != "20:00" {
			t.Fatalf("schedule missing: %+v", item)
		}
	}
}
