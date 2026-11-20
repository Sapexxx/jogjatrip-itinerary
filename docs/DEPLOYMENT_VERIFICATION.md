# Checklist Verifikasi Deployment JogjaTrip

Panduan ini digunakan untuk memeriksa bahwa deployment Cloudflare benar-benar menjalankan **frontend, Worker, database D1, dan komunikasi API penyedia**. Bukti log berhasil bukan bukti seluruh fungsi aplikasi bebas masalah.

**URL publik sesuai log deployment awal:**
https://jogjatrip-itinerary.azzahraghania110.workers.dev/

## 1. Pemeriksaan Website dan Worker

- [ ] Website dapat diakses melalui URL publik tanpa error.
- [ ] Gambar, CSS, JavaScript, navigasi dan modal berfungsi.
- [ ] Versi terbaru dari branch `cloudflare-deploy` sudah tampil, termasuk perbaikan banner.
- [ ] `GET /api/health` menghasilkan JSON dengan `service: JogjaTrip` dan `storage: cloudflare-d1`.
- [ ] `bookingEnabled` masih `false` selama checkout belum diverifikasi.

## 2. Integrasi Hotel dan Wisata

- [ ] `GET /api/catalog/hotels` mengembalikan katalog Hotel yang sesuai provider.
- [ ] `GET /api/catalog/destinations` mengembalikan katalog Wisata yang sesuai provider.
- [ ] `GET /api/packages` mengembalikan daftar template paket.
- [ ] Harga dan ketersediaan tidak disimpulkan hanya dari keberhasilan mengambil katalog.
- [ ] Jika terjadi error upstream, catat status HTTP dan periksa log Worker.

## 3. Pemeriksaan Database D1

Jalankan dari folder `cloudflare`:

```powershell
npx.cmd wrangler d1 execute jogjatrip-db --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('jt_orders','jt_plans','jt_packages') ORDER BY name;"
```

Ketiga tabel `jt_orders`, `jt_plans` dan `jt_packages` harus ditemukan. Selanjutnya gunakan data fiktif untuk membuat dan membaca ulang itinerary:

```powershell
$base = "https://jogjatrip-itinerary.azzahraghania110.workers.dev"
$body = @{ title = "Uji D1"; startDate = "2026-12-10"; endDate = "2026-12-11"; activities = @() } | ConvertTo-Json -Depth 8
$res = Invoke-RestMethod -Uri "$base/api/itineraries" -Method Post -ContentType "application/json" -Body $body
$id = $res.itinerary.id
$token = $res.accessToken
Invoke-RestMethod -Uri "$base/api/itineraries/$id" -Headers @{ "X-Plan-Token" = $token }
```

- [ ] Itinerary tersimpan dan terbaca menggunakan ID yang sama.
- [ ] ID ditemukan di database D1 remote.
- [ ] Tidak ada data sensitif atau token yang dibagikan saat pelaporan.

## 4. Pengujian Pembaruan GitHub

- [ ] Commit baru pada branch `cloudflare-deploy` lulus GitHub Actions.
- [ ] Cloudflare Builds / Deployments menunjukkan build dan deploy berhasil.
- [ ] Perubahan terlihat melalui URL website yang sama.
- [ ] Worker dan D1 sebelumnya tidak dibuat ulang.

## 5. Hasil yang Dicatat Tim

Rekam tanggal pengujian, URL, commit, Worker Version ID, hasil HTTP API, hasil D1, tangkapan layar, dan temuan error. Nyatakan **belum terverifikasi** jika bukti tidak tersedia.

**Jangan mengaktifkan booking produksi** hanya berdasarkan pengujian frontend atau unit test mock. Perlu pengujian token partner, kontrak API, anti-duplikasi, dan sinkronisasi status.

[Status Proyek](PROJECT_STATUS.md) · [Deployment](DEPLOYMENT_CLOUDFLARE.md) · [README](../README.md).
