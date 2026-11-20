# Referensi API JogjaTrip V5.3

Referensi ini disusun dari route yang tersedia dalam **Go V5.3** dan adaptasi **Cloudflare Workers**. API JogjaTrip bertindak sebagai agregator; struktur endpoint Hotel/Wisata asli tetap diatur masing-masing penyedia.

> **Status**: Dokumentasi endpoint bukan bukti seluruh endpoint telah diuji di Cloudflare produksi. Endpoint checkout Worker sengaja ditolak ketika `BOOKING_ENABLED=false`. URL provider dan status aktual harus diverifikasi saat pengujian.

## 1. Konvensi

- Prefix layanan: `/api`.
- Request JSON: `Content-Type: application/json`; response JSON kecuali file statis.
- Tanggal: `YYYY-MM-DD`.
- Jam preferensi pengguna: `HH:MM`, rentang selesai sesudah mulai pada tanggal yang sama.
- Harga: Rupiah (IDR), berdasarkan penyedia ketika *quote*, bukan harga permanen.
- Identitas provider: `hotelId`, `roomId`, `destinationId`, dan kode booking tetap terpisah dari ID order JogjaTrip.
- Akses order/itinerary milik pengguna: token khusus di header; **bukan token partner**.

## 2. Endpoint inti

| Method | Endpoint | Kegunaan | Autentikasi |
|---|---|---|---|
| GET | `/api/health` | Informasi kesehatan/konfigurasi JogjaTrip | Tidak |
| GET | `/api/catalog/hotels` | Katalog hotel | Tidak |
| GET | `/api/catalog/rooms` | Katalog tipe kamar | Tidak |
| GET | `/api/catalog/destinations` | Katalog destinasi | Tidak |
| GET | `/api/recommendations?hotelId=H01` | Wisata berdasarkan wilayah hotel | Tidak |
| POST | `/api/quote` | Perkiraan harga/ketersediaan satu/lebih layanan | Tidak |
| POST | `/api/book` | Checkout layanan mandiri | Checkout harus diaktifkan dan kredensial valid |
| GET | `/api/orders/{id}` | Detail pesanan, dengan status provider bila sinkronisasi tersedia | `X-Order-Token` |
| GET | `/api/orders/{id}/details` | Rincian layanan, nama/foto bila katalog tersedia | `X-Order-Token` |
| POST | `/api/orders/{id}/sync` | Periksa ulang status dari penyedia | `X-Order-Token` |
| POST | `/api/orders/{id}/itinerary` | Susun itinerary dari order paket yang memenuhi syarat | `X-Order-Token` |
| POST | `/api/itineraries` | Buat itinerary dan token akses | Tidak |
| GET | `/api/itineraries/{id}` | Baca itinerary | `X-Plan-Token` |
| PUT | `/api/itineraries/{id}` | Ubah itinerary yang boleh diedit | `X-Plan-Token` |
| POST | `/api/itineraries/{id}/analyze` | Peringatan jadwal lokal | `X-Plan-Token` |
| POST | `/api/itineraries/{id}/quote` | Quote item itinerary yang belum dibooking | `X-Plan-Token` |
| POST | `/api/itineraries/{id}/book` | Checkout itinerary | `X-Plan-Token` dan fitur aktif |
| POST | `/api/itineraries/{id}/sync` | Sinkronkan referensi booking itinerary | `X-Plan-Token` |
| GET | `/api/packages` | Daftar template paket curated | Tidak |
| GET | `/api/packages/{id}` | Detail template paket | Tidak |
| POST | `/api/packages/{id}/quote` | Harga paket sesuai tanggal, tamu, dan add-on | Tidak |
| POST | `/api/packages/{id}/book` | Booking paket | Fitur checkout harus aktif |

`/api/catalog/...` dapat menerima filter `?region=...` jika didukung oleh adapter; nilai wilayah harus cocok dengan normalisasi yang digunakan.

## 3. Contoh payload satu layanan

### Hotel

```json
{
  "type": "hotel",
  "hotelId": "H01",
  "roomId": "R0101",
  "checkIn": "2026-12-10",
  "checkOut": "2026-12-12",
  "guests": 2,
  "plannedStartTime": "16:00",
  "plannedEndTime": "17:00"
}
```

### Wisata

```json
{
  "type": "wisata",
  "destinationId": 1,
  "visitDate": "2026-12-11",
  "quantity": 2,
  "tier": "base",
  "plannedStartTime": "10:00",
  "plannedEndTime": "12:00"
}
```

Nilai ID dan tanggal di atas adalah **contoh struktur input**, bukan konfirmasi kamar/tiket tersedia. `plannedStartTime` dan `plannedEndTime` disimpan untuk jadwal pengguna; provider dapat hanya menerima tanggal, bukan jam.

### Quote layanan

```http
POST /api/quote
Content-Type: application/json
```

```json
{
  "customer": {
    "name": "Contoh Pengguna",
    "email": "contoh@example.com"
  },
  "items": [
    {
      "type": "wisata",
      "destinationId": 1,
      "visitDate": "2026-12-11",
      "quantity": 2,
      "tier": "base",
      "plannedStartTime": "10:00",
      "plannedEndTime": "12:00"
    }
  ]
}
```

Periksa kembali nilai respons live; quote **tidak** menahan stok dan **tidak** membuat booking.

## 4. Contoh alur itinerary

```text
POST /api/itineraries
  → response: itinerary.id + accessToken

GET /api/itineraries/{id}
  Header X-Plan-Token: <accessToken>

POST /api/itineraries/{id}/quote
  Header X-Plan-Token: <accessToken>

POST /api/itineraries/{id}/book
  Header X-Plan-Token: <accessToken>
  Body customer (jika checkout telah diaktifkan)

POST /api/itineraries/{id}/sync
  Header X-Plan-Token: <accessToken>
```

Aktivitas manual (*custom*) hanya masuk rencana. Aktivitas terkait provider menyimpan `sourceItem` sesuai format layanan, tanpa mengarang reservasi. Pada implementasi yang diuji dengan mock, checkout itinerary dibatasi sampai 12 layanan baru.

## 5. Sumber data provider

| Provider | Base URL | Contoh API yang digunakan |
|---|---|---|
| JogjaStay Hotel | https://jogjastay-hotel-service.jogjawisata.workers.dev | `GET /api/v1/hotels`, `GET /api/v1/rooms`, pengecekan availability, `POST /api/v1/hotel-bookings` |
| Wisata Jogja | https://wisata-jogja-ten.vercel.app | `GET /api/v1/destinations`, pengecekan availability, `POST /api/v1/partner/bookings` jika benar-benar didukung dan diotorisasi |
| Transportasi | Belum tersedia | Belum ada endpoint yang boleh diklaim |

Detail payload, metode, tier, status mentah, dan autentikasi mengikuti API provider aktual; **jangan** menyimpulkan kesiapan pembayaran dari adanya endpoint booking.

## 6. Status dan error

| Contoh HTTP/status | Arti |
|---|---|
| 400 | Validasi input gagal |
| 403 | Token akses order atau itinerary tidak cocok |
| 404 | Endpoint, entitas, atau ID tidak ditemukan |
| 409 | Konflik ketersediaan/jadwal/checkout yang perlu rekonsiliasi |
| 502 | Kegagalan komunikasi/respons upstream |
| 503 | Binding, konfigurasi, atau checkout tidak siap |
| `CONFIRMED` | Reservasi provider dinyatakan terkonfirmasi, bukan bukti dana diterima |
| `DECLINED` / `FAILED` | Provider menolak/gagal |
| `PARTIAL` | Ada bagian berhasil dan gagal/belum pasti |
| `UNKNOWN` | Respons tidak pasti; **hindari retry checkout tanpa audit** |

Pengayaan nama/foto di `GET /api/orders/{id}/details` bergantung katalog live; tidak boleh mengganti harga historis dengan harga katalog terbaru.

## 7. Keamanan dan batasan

- Jangan menempelkan `X-Order-Token`, `X-Plan-Token`, atau token partner di GitHub Issue/README.
- Kredensial partner harus disimpan pada backend/Workers Secrets, bukan di file `web/*.js`.
- Ketika Worker `BOOKING_ENABLED=false`, endpoint `/book` memang mengembalikan error dan **tidak** mengirim permintaan booking ke provider.
- Contoh ini menggambarkan kontrak yang diimplementasikan, bukan jaminan kompatibilitas produksi dengan revisi API provider di masa mendatang.

[Kembali ke README utama](../README.md) · [Arsitektur](ARCHITECTURE.md).
