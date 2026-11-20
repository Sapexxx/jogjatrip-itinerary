# Deployment Cloudflare Workers + D1

**Sasaran:** satu repository GitHub, satu deployment Cloudflare, dan URL tetap. Setelah setup akun satu kali, setiap push ke branch yang dipantau Cloudflare dapat memicu build/deploy tanpa upload ZIP ulang.

## 1. Kondisi yang telah diperiksa

- Source Cloudflare tersedia pada branch `cloudflare-deploy`, dalam folder `cloudflare/`.
- Konfigurasi `cloudflare/wrangler.jsonc` kini berisi **Database ID UUID**, bukan placeholder.
- Pengujian GitHub Actions untuk Go, Node/mock, dan `wrangler deploy --dry-run` telah berhasil pada commit yang diperiksa.
- **Belum ada bukti langsung dari akun Cloudflare** bahwa Worker telah berhasil deploy, D1 remote sudah dimigrasi, atau seluruh API provider bekerja melalui URL publik.
- `BOOKING_ENABLED=false` memang sengaja dipertahankan untuk mencegah booking produksi prematur.

> Jangan memakai label “online” hanya berdasarkan hadirnya Database ID dan hasil dry-run. URL publik harus berasal dari hasil deployment asli dan perlu diuji lewat browser.

## 2. Komponen

| Komponen | Lokasi |
|---|---|
| Worker name | `jogjatrip-itinerary` |
| Entry point | `cloudflare/src/index.js` |
| Static assets | `cloudflare/web/` |
| Configuration | `cloudflare/wrangler.jsonc` |
| D1 binding | `DB` |
| D1 database | `jogjatrip-db` |
| D1 schema | `cloudflare/migrations/0001_init.sql` |
| Development branch | `cloudflare-deploy` |
| Automated tests | `cloudflare/tests/` dan GitHub Actions |

## 3. Tahap satu kali: database dan migrasi

1. Buka [Cloudflare Dashboard](https://dash.cloudflare.com/) dengan akun yang memiliki hak pengelolaan Worker/D1.
2. Masuk **Storage & databases → D1**, cari `jogjatrip-db`. **Jika sudah dibuat, jangan membuat ulang**.
3. Bandingkan Database ID yang terlihat di D1 dengan `database_id` pada `cloudflare/wrangler.jsonc`. Nilainya harus sama.
4. Periksa apakah tabel `jt_orders`, `jt_plans` dan `jt_packages` sudah ada. Bila belum dan database masih baru/kosong, jalankan SQL dari [migrations/0001_init.sql](../cloudflare/migrations/0001_init.sql) lewat D1 Console/SQL Editor, atau gunakan migrasi Wrangler remote dengan autentikasi akun.
5. Jangan mengosongkan database/menjalankan seed pengganti jika sudah terdapat data. Migrasi harus aman dan non-destruktif.

**Jika menggunakan Wrangler CLI:**

```powershell
cd cloudflare
npm install
npx wrangler login
npx wrangler d1 migrations apply jogjatrip-db --remote
```

Perintah `--remote` menargetkan D1 Cloudflare; tanpa itu, database lokal berbeda. **Jangan ulang migrasi yang sudah dilakukan** tanpa memeriksa tabel/migration history.

## 4. Tahap satu kali: sambungkan GitHub

Dalam dashboard, buka **Workers & Pages** → buat proyek Workers dari GitHub repository (nama menu dapat berubah sesuai versi dashboard), lalu hubungkan:

| Isian | Pengaturan |
|---|---|
| GitHub repository | `Sapexxx/jogjatrip-itinerary` |
| Production branch | `cloudflare-deploy` |
| Root directory | `cloudflare` |
| Worker name | `jogjatrip-itinerary` |
| Build command | `npm test` |
| Deploy command | `npx wrangler deploy` |

Gunakan perintah instalasi `npm install` bila diminta. Pastikan izin integrasi GitHub mencakup repository yang benar. Jangan membuat Worker kedua jika sudah ada Worker JogjaTrip dengan nama dan URL yang sama—hubungkan deployment yang ada bila memungkinkan.

Dokumentasi resmi: [Cloudflare GitHub Integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/) dan [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

## 5. Variabel environment dan secret

| Nama | Lokasi | Keterangan |
|---|---|---|
| `HOTEL_API_URL` | `wrangler.jsonc` | Base Hotel HTTPS |
| `WISATA_API_URL` | `wrangler.jsonc` | Base Wisata HTTPS |
| `BOOKING_ENABLED` | `wrangler.jsonc` | **false** sampai validasi transaksi selesai |
| `HOTEL_PARTNER_TOKEN` | Workers Secrets | Hanya saat booking resmi diizinkan |
| `WISATA_PARTNER_TOKEN` | Workers Secrets | Hanya saat booking resmi diizinkan |
| `DB` | D1 binding | Harus merujuk database `jogjatrip-db` |

**Jangan** menambahkan token partner ke `wrangler.jsonc`, `.env.example` yang berisi nilai asli, atau ke `cloudflare/web/*.js`.

## 6. Verifikasi deployment nyata

Setelah Cloudflare menunjukkan deployment sukses, catat URL **yang benar-benar ditampilkan** (biasanya domain `*.workers.dev`). Periksa:

1. `GET /api/health` mengembalikan respons JSON dan `bookingEnabled=false`.
2. `GET /api/catalog/hotels` dan `GET /api/catalog/destinations` menampilkan data provider bila kedua API aktif.
3. Penyimpanan itinerary (buat lalu baca kembali dengan `X-Plan-Token`) benar-benar menggunakan **remote D1**, bukan hanya mock.
4. Halaman utama memuat, navigasi dan modal dapat dioperasikan, serta gambar tidak 404.
5. Pengguna diberi penanda “Mode Pratinjau” dan checkout **tidak** melakukan request reservasi.
6. Tidak ada error di Browser Console maupun Worker Logs untuk skenario tersebut.

**Verifikasi ulang setelah perubahan besar**, termasuk penambahan route, data storage, token, atau status provider. Jangan mengklaim live checkout lulus jika pengujian baru sebatas mock.

## 7. Pembaruan otomatis selanjutnya

Jika repository sudah tersambung ke Cloudflare, cukup commit dan push ke branch deployment.

```powershell
git status
git fetch origin
git switch cloudflare-deploy
git pull --ff-only origin cloudflare-deploy
cd cloudflare
npm test
cd ..
git add .
git commit -m "feat: improve JogjaTrip"
git push origin cloudflare-deploy
```

Jika lokal belum memiliki branch tersebut, gunakan `git switch --track origin/cloudflare-deploy` setelah `git fetch origin`. Periksa laporan build pada **Cloudflare Builds** dan **GitHub Actions**. Build gagal berarti versi baru belum otomatis berhasil dirilis.

## 8. Batasan sebelum produksi

- Test D1/mock tidak menggantikan pengujian database Cloudflare yang sebenarnya.
- Token partner dan alur booking harus diuji dengan izin dan skenario terbatas.
- Checkout langsung Workers belum dilengkapi idempotensi kuat untuk retry ambigu; biarkan `BOOKING_ENABLED=false`.
- Pengelolaan pembayaran riil dan Transport Service belum tersedia.
- Go lokal/Supabase dan Worker/D1 memiliki penyimpanan terpisah. Data tidak berpindah sendiri ketika deployment berubah.

[Project Status](PROJECT_STATUS.md) · [README utama](../README.md).
