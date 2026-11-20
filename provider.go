package main

import (
	"context"
	"errors"
	"net/url"
)

// ProviderAdapter isolates the external contract. Cancellation is an optional capability.
type ProviderAdapter interface {
	Kind() string
	Availability(context.Context, Item) (int64, error)
	Book(context.Context, *Order, int) (string, string, error)
	GetBooking(context.Context, string) (string, error)
}
type CancelAdapter interface {
	Cancel(context.Context, string) (string, error)
}
type providerAdapter struct {
	s    *Server
	kind string
}

func (a providerAdapter) Kind() string { return a.kind }
func (a providerAdapter) Availability(ctx context.Context, it Item) (int64, error) {
	return a.s.check(ctx, it)
}
func (a providerAdapter) Book(ctx context.Context, o *Order, i int) (string, string, error) {
	return a.s.bookProvider(ctx, o, i)
}
func (a providerAdapter) GetBooking(ctx context.Context, id string) (string, error) {
	p := a.s.hotel
	path := "/api/v1/hotel-bookings/" + url.PathEscape(id)
	if a.kind == "wisata" {
		p = a.s.wisata
		path = "/api/v1/partner/bookings/" + url.PathEscape(id)
	}
	m, e := a.s.upstream(ctx, p, "GET", path, nil, "")
	if e != nil {
		return "", e
	}
	raw := str(asMap(m)["status"])
	if raw == "" {
		raw = str(asMap(asMap(m)["booking"])["status"])
	}
	if raw == "" {
		return "", errors.New("provider tidak mengembalikan status")
	}
	return raw, nil
}

// Hotel cancellation is documented in the original Hotel API. No other cancellation capability is assumed.
type hotelCancelAdapter struct{ providerAdapter }

func (a hotelCancelAdapter) Cancel(ctx context.Context, id string) (string, error) {
	m, e := a.s.upstream(ctx, a.s.hotel, "DELETE", "/api/v1/hotel-bookings/"+url.PathEscape(id), nil, "")
	if e != nil {
		return "", e
	}
	raw := str(asMap(m)["status"])
	if raw == "" {
		return "", errors.New("pembatalan tidak memiliki status yang dapat diverifikasi")
	}
	return raw, nil
}
func (s *Server) adapters() map[string]ProviderAdapter {
	return map[string]ProviderAdapter{
		"hotel":  hotelCancelAdapter{providerAdapter{s, "hotel"}},
		"wisata": providerAdapter{s, "wisata"},
	}
}
