# JogjaTrip — Cloudflare Workers + D1

Backend alternatif **JogjaTrip V5.3** untuk Cloudflare. Proyek Go aslinya tetap tersedia pada root repository dan branch `main`; folder ini adalah target deployment pada branch `cloudflare-deploy`.

> **Status:** bundling Wrangler dan tes otomatis GitHub lulus. Database ID D1 sudah terisi pada `wrangler.jsonc`, tetapi **keberhasilan migrasi D1 remote, deployment publik, dan uji booking live belum diverifikasi**. Checkout tetap `BOOKING_ENABLED=false`. Integrasi rental JogjaTrans menggunakan harga dan booking simulasi, tanpa pembayaran nyata.

## Jalur cepat

Lihat panduan utama [Deployment Cloudflare](../docs/DEPLOYMENT_CLOUDFLARE.md) untuk setup D1 yang benar, integrasi GitHub, dan pengujian URL live.

```powershell
cd cloudflare
npm install
npm test
npx wrangler d1 migrations apply jogjatrip-db --local
npx wrangler dev
```

Perintah di atas menyiapkan **pengembangan lokal**, bukan D1 produksi. Jangan menyalin data pelanggan ke database uji atau mengaktifkan checkout hanya karena semua unit test lulus.

## Struktur

| Path | Tanggung jawab |
|---|---|
| `src/index.js` | Router API/handler Worker dan Static Assets |
| `src/core.js` | Validasi, pemetaan status/wilayah, fungsi domain |
| `src/provider.js` | Adapter REST Hotel/Wisata/JogjaTrans |
| `src/db.js` | Penyimpanan dan akses D1 |
| `src/plans.js` | Penyusunan itinerary dan jadwal |
| `src/orders.js` | Quote, order, sinkronisasi dan rincian |
| `src/packages.js` | Paket curated serta itinerary paket |
| `web/` | Frontend statis dengan penanda mode pratinjau |
| `templates/` | Dua template curated |
| `migrations/` | Skema D1 |
| `tests/` | Unit dan mock API tests |
| `wrangler.jsonc` | Worker, Static Assets, binding D1, URL provider dan pengaman checkout |

## Variabel

`HOTEL_API_URL`, `WISATA_API_URL`, dan `TRANSPORT_API_URL` berisi base URL HTTPS layanan terkait. Binding D1 bernama `DB` menunjuk ke `jogjatrip-db`. `HOTEL_PARTNER_TOKEN` dan `WISATA_PARTNER_TOKEN` harus memakai **Cloudflare Workers Secrets** ketika integrasi booking telah aman; jangan pernah disimpan di repository.

**Pengujian PR-4:** katalog publik `/api/catalog/vehicles?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` hanya memanggil API JogjaTrans melalui server. Booking demo menyimpan token akses provider secara privat di D1; API JogjaTrip tidak mengembalikan token provider. URL transport menggunakan layanan Workers/D1 yang sudah tersedia tanpa menambah produk Cloudflare berbayar.

**Mode pratinjau:** checkout tidak aktif, tetapi katalog, itinerary draft, dan quote dapat diuji bila provider dan D1 berjalan. Contoh harga, kode booking, dan status yang dihasilkan mock tests bukan bukti reservasi produksi.

## Dokumentasi terpusat

- [README utama](../README.md)
- [Panduan pengguna](../docs/USER_GUIDE.md)
- [Arsitektur interoperabilitas](../docs/ARCHITECTURE.md)
- [Referensi API](../docs/API_REFERENCE.md)
- [Panduan pengembangan](../docs/DEVELOPMENT.md)
- [Deployment Cloudflare](../docs/DEPLOYMENT_CLOUDFLARE.md)
- [Status dan keterbatasan](../docs/PROJECT_STATUS.md)

**Keamanan:** jangan mengubah pembayaran simulasi menjadi klaim dana nyata; jangan menganggap jam itinerary adalah slot provider; jangan mengulang checkout dengan status `UNKNOWN` atau `PARTIAL` tanpa rekonsiliasi.
