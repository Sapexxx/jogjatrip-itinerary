package main

import (
	"context"
	"crypto/subtle"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ServiceDetail is an optional, best-effort catalog projection. It never changes
// provider booking status, price, or the persisted source-of-truth references.
type ServiceDetail struct {
	Index       int    `json:"index"`
	Provider    string `json:"provider"`
	Name        string `json:"name,omitempty"`
	ProductName string `json:"productName,omitempty"`
	Region      string `json:"region,omitempty"`
	Address     string `json:"address,omitempty"`
	ImageURL    string `json:"imageUrl,omitempty"`
	Source      string `json:"source"`
	Warning     string `json:"warning,omitempty"`
}

type catalogSnapshot struct {
	hotels, rooms, destinations []map[string]any
}

func mapsOf(raw any) []map[string]any {
	if arr, ok := raw.([]any); ok {
		out := make([]map[string]any, 0, len(arr))
		for _, v := range arr {
			if m, ok := v.(map[string]any); ok {
				out = append(out, m)
			}
		}
		return out
	}
	if m, ok := raw.(map[string]any); ok {
		for _, key := range []string{"data", "items", "hotels", "rooms", "destinations"} {
			if a, ok := m[key].([]any); ok {
				return mapsOf(a)
			}
		}
	}
	return nil
}
func firstString(m map[string]any, keys ...string) string {
	for _, key := range keys {
		if v, ok := m[key]; ok && v != nil {
			if t := strings.TrimSpace(str(v)); t != "" && t != "<nil>" {
				return t
			}
		}
	}
	return ""
}
func validRemoteImage(raw string, base string) string {
	if raw == "" {
		return ""
	}
	u, e := url.Parse(raw)
	if e != nil {
		return ""
	}
	if !u.IsAbs() {
		origin, e := url.Parse(base)
		if e != nil {
			return ""
		}
		u = origin.ResolveReference(u)
	}
	if (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil {
		return ""
	}
	return u.String()
}
func (s *Server) detailCatalog(ctx context.Context) catalogSnapshot {
	cat := catalogSnapshot{}
	var wg sync.WaitGroup
	for _, part := range []struct {
		key    string
		p      Provider
		path   string
		target *[]map[string]any
	}{
		{"hotels", s.hotel, "/api/v1/hotels", &cat.hotels},
		{"rooms", s.hotel, "/api/v1/rooms", &cat.rooms},
		{"destinations", s.wisata, "/api/v1/destinations", &cat.destinations},
	} {
		wg.Add(1)
		go func(key string, p Provider, path string, target *[]map[string]any) {
			defer wg.Done()
			raw, err := s.upstream(ctx, p, "GET", path, nil, "")
			if err != nil {
				return
			}
			*target = mapsOf(raw)
		}(part.key, part.p, part.path, part.target)
	}
	wg.Wait()
	return cat
}
func (s *Server) enrichOrder(ctx context.Context, o *Order) []ServiceDetail {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	cat := s.detailCatalog(ctx)
	result := make([]ServiceDetail, 0, len(o.Items))
	for ix, oi := range o.Items {
		it := oi.Item
		d := ServiceDetail{Index: ix, Provider: it.Type, Source: "provider_catalog"}
		if it.Type == "hotel" {
			for _, m := range cat.hotels {
				if firstString(m, "hotelId", "id") == it.HotelID {
					d.Name = firstString(m, "name", "hotelName")
					d.Region = firstString(m, "city", "region", "area")
					d.Address = firstString(m, "address", "location")
					d.ImageURL = validRemoteImage(firstString(m, "imageUrl", "image_url", "photoUrl"), s.hotel.Base)
					break
				}
			}
			for _, m := range cat.rooms {
				if firstString(m, "roomId", "id") == it.RoomID && (firstString(m, "hotelId", "hotel_id") == it.HotelID || firstString(m, "hotelId", "hotel_id") == "") {
					d.ProductName = firstString(m, "roomType", "type", "name")
					break
				}
			}
			if d.Name == "" {
				d.Warning = "Nama hotel belum bisa diverifikasi dari katalog JogjaStay"
			}
		} else if it.Type == "wisata" {
			for _, m := range cat.destinations {
				if firstString(m, "id", "destination_id") == strconv.Itoa(it.DestinationID) {
					d.Name = firstString(m, "name", "title")
					d.Region = firstString(m, "region", "city")
					d.Address = firstString(m, "address", "location")
					d.ImageURL = validRemoteImage(firstString(m, "imageUrl", "image_url"), s.wisata.Base)
					if d.ImageURL == "" {
						if photos, ok := m["photos"].([]any); ok && len(photos) > 0 {
							d.ImageURL = validRemoteImage(str(photos[0]), s.wisata.Base)
						}
					}
					break
				}
			}
			d.ProductName = it.Tier
			if d.Name == "" {
				d.Warning = "Nama destinasi belum bisa diverifikasi dari katalog Wisata"
			}
		} else {
			d.Source = "order"
			d.Warning = "Komponen non-provider"
		}
		result = append(result, d)
	}
	return result
}

func (s *Server) orderDetails(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	o, err := s.store.Load(id)
	if err != nil {
		fail(w, 404, "Pesanan tidak ditemukan")
		return
	}
	secret := r.Header.Get("X-Order-Token")
	if secret == "" || subtle.ConstantTimeCompare([]byte(o.SecretHash), []byte(hash(secret))) != 1 {
		fail(w, 403, "Token akses pesanan tidak valid")
		return
	}
	s.refreshOrder(r.Context(), o)
	if err := s.store.Save(o); err != nil {
		fail(w, 503, "Gagal menyimpan status terkini")
		return
	}
	details := s.enrichOrder(r.Context(), o)
	send(w, 200, map[string]any{"order": o, "details": details, "note": "Detail nama dan foto berasal dari katalog live bila tersedia; status dan nilai transaksi mengikuti sumber reservasi dan catatan order."})
}
