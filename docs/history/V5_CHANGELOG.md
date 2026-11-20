# JogjaTrip V5 — Integrated Itinerary & Semantic Bundling

## Koreksi berdasarkan diskusi pengguna

1. **Itinerary bukan formulir agenda saja.** Menu Itinerary kini menampilkan pencarian Hotel (beserta tipe kamar), rekomendasi Wisata berdasarkan wilayah hotel, pemilihan tiket, kalender harian, penyimpanan rencana, quote harga aktual, dan checkout ke API penyedia. Editor manual tetap tersedia sebagai fitur lanjutan.
2. **Source of truth terpisah.** Hotel adalah pemilik stok, tarif dan booking kamar; Wisata pemilik kuota, tarif dan booking tiket; JogjaTrip pemilik itinerary, paket, referensi booking dan status agregat. Tidak ada akses langsung ke database provider.
3. **Paket lebih relevan.** Katalog unggulan berbasis durasi 3H2M/5H4M/7H6M, tema dan kombinasi lima wilayah DIY. Seluruh kandidat dibentuk dari katalog API. Ada filter budget dan detail itinerary sebelum booking. Katalog paket curated dari V3 tetap dipertahankan.
4. **Semantic mapping.** `integrated.go` melakukan pemetaan `Sleman` ↔ `kabupaten-sleman` dan empat wilayah lain. Folder `ontology/` memuat vocabulary Turtle dan JSON untuk menjelaskan hubungan Hotel–Wisata–Itinerary. Turtle adalah **artefak dokumentasi semantik**, bukan OWL reasoner yang berjalan otomatis.
5. **Status booking terhubung ke agenda.** Setiap aktivitas provider yang dipesan menyimpan `sourceItem`, `orderId`, `providerBookingId`, `bookingStatus`, `syncError`. Sinkronisasi dapat dilakukan melalui halaman Itinerary; perubahan provider tidak mengubah agenda menjadi booking baru.
6. **Booking aman.** Checkout itinerary mendukung hingga 12 layanan, memeriksa seluruh harga dan ketersediaan sebelum booking pertama, memakai idempotency key dari backend lama, serta menyimpan hasil setiap langkah. Provider timeout dinyatakan UNKNOWN; kompensasi Hotel hanya digunakan jika telah terdokumentasi. Tidak ada rollback atomik atau pembayaran nyata.
7. **Transportasi.** Hanya label UI 'Segera hadir'; tidak ada API, token atau reservasi Transportasi.

## Berkas yang berubah

- `v2.go`: model `PlanActivity` + validasi keamanan referensi provider dan pemutakhiran aktivitas yang telah dipesan.
- `main.go`: registrasi endpoint baru.
- `integrated.go` (**baru**): semantic recommendation, itinerary quote/book/sync.
- `integrated_test.go` (**baru**): rekomendasi, otorisasi, booking, sync dan preflight.
- `web/index.html`: halaman Itinerary yang berfokus pada layanan dan paket unggulan.
- `web/integrated.js` (**baru**): pemilihan kamar/tiket, rekomendasi, agenda, quote, checkout, sinkronisasi.
- `web/v2.js`: simpan field referensi booking ketika mengedit itinerary.
- `web/v4.js`: kandidat paket lintas wilayah, kategori, tampilan kartu, transfer ke itinerary yang dapat dipesan.
- `web/style.css`: kartu paket, halaman Integrated Trip Builder responsif.
- `ontology/*` (**baru**): metadata mapping dan model konseptual OWL/SKOS.
- `README.md`: panduan dan keterbatasan V5.

## Keputusan dan batasan

- **Tiket / reservasi provider** hanya dikonfirmasi oleh API aslinya. Tanggal/jam agenda buatan pengguna bukan reschedule tiket.
- **Rekomendasi di sekitar hotel** saat ini berarti *wilayah administratif yang sama*, bukan jarak/menit berkendara. Tidak ada klaim kedekatan geografis tanpa koordinat/rute.
- **Filter budget** pada katalog unggulan berdasarkan indikasi harga katalog; checkout selalu meminta harga aktual melalui API.
- **Curated packages V3** mendukung diskon syarat komponen wajib; **custom itinerary** menggunakan total dari provider tanpa diskon fiktif.
- **Sinkronisasi** berbasis API saat dipicu/dibuka, tidak otomatis ketika browser ditutup.
- **File storage lokal** tidak cocok untuk hosting stateless produksi. Untuk deployment gratis persisten, gunakan konfigurasi Supabase yang tersedia pada proyek dan SQL di `db/supabase.sql`.
- **Pengujian langsung API produksi** memerlukan kredensial partner sah; tidak dilakukan pada pengerjaan ini.
