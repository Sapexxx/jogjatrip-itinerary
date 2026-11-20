# JogjaTrip V5 — Integrated Itinerary, Semantic Recommendations & Bundling

## Konsep

Aplikasi akademik Go 1.23 **stdlib-only** + HTML/CSS/JavaScript tanpa npm. JogjaTrip bukan website yang sekadar menyalin daftar destinasi. Itinerary dan paket perjalanan adalah data asli JogjaTrip, sedangkan Hotel (Cloudflare Workers) dan Wisata (Flask/Vercel) tetap menjadi **source of truth** untuk harga, kuota/kamar, booking, dan status komponen masing-masing.

**Fitur prioritas V5:**

- Cari Hotel dan kamar dari API JogjaStay; tambahkan sebagai reservasi yang *belum dibooking* dalam itinerary.
- Dari hotel terpilih, rekomendasikan Wisata dari API Wisata berdasarkan **wilayah administratif yang sama** (bukan klaim jarak terdekat).
- Pilih satu atau beberapa destinasi, letakkan pada agenda harian, dan simpan itinerary **secara independen**.
- Klik **Periksa harga & stok** untuk quote langsung dari setiap penyedia.
- Checkout itinerary dengan **POST ke API provider** menggunakan kredensial partner **hanya dari server Go**; maksimal 12 komponen baru dalam satu checkout. Hasil memuat ID booking dan status asli dari provider.
- Sinkronisasi status booking agenda (misalnya `DECLINED` dari Hotel). Perubahan jadwal agenda **tidak otomatis** melakukan reschedule booking provider.
- Katalog paket unggulan 3H2M, 5H4M, 7H6M serta beberapa variasi tema/wilayah. Paket berisi rekomendasi berdasar katalog real, bukan stok/harga yang dibuat sendiri.
- Paket curated berbasis JSON dan aturan diskon dari V3 tetap tersedia dengan jalur checkout paket tersendiri.
- Kosakata OWL/SKOS (dokumentasi) dan pemetaan eksplisit wilayah di backend Go; tidak menginstal reasoner RDF.
- Transportasi: **❌ Ditunda atas keputusan tim**. UI boleh mencantumkan 'Segera hadir', tetapi tidak ada kontrak maupun pemesanan transportasi.

## Menjalankan lewat Google Antigravity / Windows PowerShell

1. Ekstrak ZIP. Buka folder **`JogjaTrip_V5`** (yang memiliki `go.mod` dan `main.go`) pada Google Antigravity.
2. Pastikan Go 1.23+ terpasang (`go version`).
3. Jalankan (alamat **base**, jangan tambahkan `/api/v1/hotels` ataupun `/api/v1/destinations`):

```powershell
$env:HOTEL_API_URL="https://jogjastay-hotel-service.jogjawisata.workers.dev"
$env:WISATA_API_URL="https://wisata-jogja-ten.vercel.app"
# Token ini harus didapat secara sah dari tim provider, jangan ditempel di chat/repository:
$env:HOTEL_PARTNER_TOKEN="ISI_TOKEN_RAHASIA_ANDA"
$env:WISATA_PARTNER_TOKEN="ISI_TOKEN_RAHASIA_ANDA"
go run .
```

4. Buka **http://localhost:8080**. Pilih **Itinerary** → pilih kamar hotel → pilih wisata rekomendasi → simpan → quote → checkout.
5. Tanpa token partner, katalog dapat dibuka tetapi booking akan ditolak oleh backend. **Jangan memakai token contoh untuk transaksi nyata**.
6. Untuk perintah validasi:

```bash
gofmt -w *.go
go vet ./...
go test ./...
node --check web/integrated.js
```

> File `.env.example` tidak otomatis diproses oleh Go; gunakan environment variables OS atau pengaturan host.

## API V5

| Method | Endpoint | Persyaratan |
|---|---|---|
| GET | `/api/recommendations?hotelId=H01` | Publik; rekomendasi satu wilayah dari katalog Hotel dan Wisata |
| POST | `/api/itineraries` | Buat itinerary dan terima token akses |
| GET / PUT | `/api/itineraries/{id}` | `X-Plan-Token`; menyimpan aktivitas, termasuk `sourceItem` |
| POST | `/api/itineraries/{id}/quote` | `X-Plan-Token`; cek harga dan stok komponen belum dipesan |
| POST | `/api/itineraries/{id}/book` | `X-Plan-Token`; body `{"customer":{"name":"...","email":"...","phone":"..."}}` |
| POST | `/api/itineraries/{id}/sync` | `X-Plan-Token`; refresh status reservasi melalui provider |
| POST | `/api/itineraries/{id}/analyze` | `X-Plan-Token`; analisis konflik waktu lokal |
| GET / POST | `/api/packages[/{id}...]` | API paket curated V3, tetap tersedia |
| GET / POST | `/api/orders/{id}[ /sync]` | `X-Order-Token`; sumber status asli provider |

**Contoh `sourceItem` hotel** pada `PlanActivity`: `{"type":"hotel","hotelId":"H01","roomId":"R0101","checkIn":"2026-12-10","checkOut":"2026-12-12","guests":2}`.
**Contoh `sourceItem` wisata**: `{"type":"wisata","destinationId":1,"visitDate":"2026-12-11","quantity":2,"tier":"base"}`. Ini hanya bentuk kontrak, bukan ketersediaan/harga untuk tanggal tersebut.

## Pipeline booking itinerary

```text
Pilih kamar Hotel + tiket Wisata dari API katalog
       ↓
Simpan itinerary dengan referensi SourceItem
       ↓
Quote live setiap layanan (tidak menjamin stok)
       ↓
Checkout: preflight ulang semua layanan
       ↓
Persist order + kaitkan aktivitas ke ID order
       ↓
Setiap provider: simpan IN_FLIGHT → POST Idempotency-Key → simpan respons
       ↓
Jika required gagal pasti: kompensasi terverifikasi bila tersedia
Jika timeout/ID tak ada: UNKNOWN, tidak retry secara buta
       ↓
Status paket dan aktivitas diperbarui; dapat disinkronkan kemudian
```

## Status implementasi yang dapat dipertanggungjawabkan

| Fitur | Kode/UI | Tes lokal/mock | API produksi |
|---|---|---|---|
| Katalog Hotel dan Wisata | ✅ | ✅ existing | Perlu cek sesuai deployment |
| Rekomendasi satu wilayah | ✅ | ✅ | Perlu cek real data pada saat demo |
| Editor itinerary linked ke layanan | ✅ | ✅ validasi backend | N/A |
| Quote dan booking itinerary hingga 12 layanan | ✅ | ✅ tes mock | ❌ belum dites dengan token partner |
| Sinkronisasi Hotel DECLINED ke aktivitas | ✅ | ✅ tes mock | ❌ perlu demo provider aktual |
| Pencegahan checkout ulang untuk aktivitas terhubung | ✅ | ✅ tes mock | N/A |
| Paket curated + quote + saga | ✅ V3 | ✅ tes lama | ❌ belum diuji produksi |
| Katalog unggulan wilayah & budget | ✅ | ⚠️ baru tes JS syntax, belum UI E2E | ⚠️ perlu data real |
| Semantic mapping 5 wilayah | ✅ | ✅ | N/A |
| OWL reasoner / SPARQL | ❌ | — | — |
| Transportasi | ❌ Ditunda | — | — |
| Sinkronisasi background tanpa browser | ❌ | — | — |
| Pembayaran nyata / rollback atomik | ❌ | — | — |

## Keterbatasan dan keamanan

- Setiap penyedia tetap independen. Saat API Hotel mati, JogjaTrip tidak bisa memvalidasi atau membuat booking Hotel; rencana tersimpan tetap dapat dibuka.
- **Pemesanan yang sudah dibuat tidak boleh diubah/dihapus dari editor** untuk mencegah perubahan rencana diklaim mengubah reservasi asli. Perubahan layanan harus melalui prosedur provider.
- Quote harga bersifat sesaat. Harga dan stok diverifikasi ulang sebelum POST booking. Jam aktivitas default hanyalah saran, bukan slot kunjungan resmi.
- Reschedule dan cancel antarprovider yang tidak terdokumentasi **tidak** dikarang. Kompensasi hanya dilakukan pada Hotel jika operasi pembatalan terverifikasi tersedia, dan tidak menjamin rollback atomik.
- Timeout provider dapat menghasilkan status `UNKNOWN`; jangan mengulangi checkout sebelum rekonsiliasi. Proses booking menggunakan penyimpanan order sebelum/sesudah setiap langkah dan kunci idempotensi stabil.
- Token akses itinerary dan order disimpan di browser untuk keperluan prototipe (gunakan perangkat pribadi); secret hash disimpan oleh backend. Token provider tidak dikirim ke frontend.
- `ontology/jogjatrip-core.ttl` dan `ontology/region-mappings.json` adalah artefak semantik. Pemetaan Go eksplisit dan tidak mengeksekusi OWL reasoning.
- Penyimpanan file lokal dapat hilang pada hosting serverless/stateless. Untuk kebutuhan hosting persisten, gunakan konfigurasi Supabase Free yang sudah tersedia dan migrasi pada `db/supabase.sql`.

## Pengujian

Jalankan `go vet ./...` dan `go test ./...` dari root proyek. Tes baru pada `integrated_test.go` mencakup rekomendasi semantik, token wajib, quote, booking dua provider, anti-duplicate checkout, status `DECLINED`, perubahan referensi booking yang ditolak, dan preflight gagal tanpa POST apa pun.

Lihat `V5_CHANGELOG.md` untuk daftar perubahan. Tidak ada library eksternal baru.


## Perbaikan jadwal pengguna (V5.1)

- Saat memilih Hotel/kamar atau Wisata dari Itinerary Builder, pengguna menentukan tanggal, jam mulai, dan jam selesai lewat dialog. Tidak lagi otomatis ditetapkan menjadi 09.00–11.00 atau 14.00–15.00.
- Pratinjau paket rekomendasi menampilkan pengaturan tanggal dan waktu untuk setiap komponen. Beberapa kunjungan boleh ditempatkan pada hari yang sama, termasuk hari pertama; hari terakhir bukan otomatis tempat menumpuk semua wisata.
- Jam agenda bukan slot tiket/hotel yang dikonfirmasi. Jam operasional hanya ditampilkan sebagai informasi jika katalog mengandung data tersebut; ketika tidak tersedia, tidak dibuat jam buka/tutup fiktif.
- Perubahan jam sebelum booking tidak mengubah booking provider. Sesudah memiliki orderId, perubahan layanan harus melalui prosedur provider. Transportasi tetap belum bisa dibooking.
- Durasi sesi aktivitas masih dibatasi untuk satu tanggal (jam selesai harus sesudah jam mulai) sesuai validasi yang ada di backend. Jika ingin aktivitas melewati tengah malam diperlukan model yang berbeda.


## V5.2 — Jam perjalanan dipilih wisatawan (Hotel & Wisata)

- Pemesanan satu layanan, dua layanan di Pilihan Saya, dan paket rekomendasi kini menyimpan `plannedStartTime` serta `plannedEndTime` (HH:MM) secara konsisten.
- Dialog pemilihan Hotel/Wisata meminta tanggal serta perkiraan jam; daftar **Pilihan Saya** menampilkan jadwal dan tombol **Atur jadwal** sebelum quote/checkout. Mengubah tanggal/jam membatalkan quote lama dan mewajibkan pemeriksaan harga/stok lagi.
- Pemilihan waktu juga tersedia di Itinerary Builder; saat disimpan, waktu agenda disalin ke `sourceItem` jika berhubungan dengan layanan. Aktivitas dengan booking yang sudah terhubung tidak boleh diedit dari agenda.
- Format waktu pada `Item` merupakan **preferensi rencana JogjaTrip**, bukan reservasi slot dari provider. Backend tetap hanya mengirim field resmi ke Hotel/Wisata, misalnya tanggal menginap / `visit_date`. API Wisata yang diperiksa tidak mendukung pemilihan jam tiket. Jangan menampilkan status `jam terkonfirmasi` tanpa bukti dari provider.
- Order lama tanpa field waktu tetap dapat dibaca, sementara checkout baru dari Pilihan Saya mewajibkan jam pilihan pengguna. Transportasi belum tersedia dan tidak diimplementasikan.

## V5.3 — Dashboard Pesanan Informatif

Lihat [V5_3_CHANGELOG.md](V5_3_CHANGELOG.md). Fitur baru `GET /api/orders/{id}/details` (header `X-Order-Token`) mengambil status dari source of truth dan menggabungkan nama, foto, lokasi, serta tipe kamar dari katalog provider bila tersedia. Tampilan **Pesanan** kini memperlihatkan rincian setiap komponen, jadwal pilihan pengguna, harga historis, kode booking penyedia, kesalahan sinkronisasi dan status paket. Semua booking lama tetap dapat dibaca.

Sistem tidak menampilkan nama/foto fiktif ketika katalog provider gagal; harga yang disimpan tidak ditimpa harga katalog terkini. Booking dan pembayaran nyata belum diuji dengan token produksi.
