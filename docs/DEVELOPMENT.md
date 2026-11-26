# Panduan Pengembangan JogjaTrip

Panduan untuk anggota kelompok yang mengerjakan proyek di Windows PowerShell, VS Code, atau Google Antigravity.

## 1. Konvensi repository

- **Satu repository:** https://github.com/Sapexxx/jogjatrip-itinerary
- **Branch `main`:** baseline Go V5.3 yang tidak boleh hilang saat eksperimen Cloudflare.
- **Branch `cloudflare-deploy`:** menambahkan runtime Workers/D1 ke folder `cloudflare/` dan workflow GitHub Actions.
- **Pull Request:** digunakan untuk perubahan lintas runtime dan review, bukan membuat repository baru per revisi.

Jangan jalankan `git init` lagi pada folder repository yang sudah memiliki `.git`, jangan gunakan `git push --force`, dan jangan menyimpan secret di Git.

## 2. Prasyarat

| Untuk | Kebutuhan |
|---|---|
| Go baseline | Go 1.23 atau lebih baru |
| Cloudflare runtime | Node.js dan npm, Wrangler dari `cloudflare/package.json` |
| Git | Git for Windows atau Git CLI yang kompatibel |
| Browser | Browser untuk menguji halaman dan Network/Console |
| API partner | Akses HTTPS ke Hotel dan Wisata bila sedang online |

## 3. Clone atau sinkronisasi

Bila belum mempunyai source:

```powershell
git clone https://github.com/Sapexxx/jogjatrip-itinerary.git
cd jogjatrip-itinerary
git status
```

Bila **sudah** mempunyai folder proyek lokal, **jangan clone ulang**:

```powershell
git status
git branch -vv
git remote -v
```

Untuk menarik pembaruan tanpa merge otomatis:

```powershell
git fetch origin
git pull --ff-only
```

Jika working tree memiliki perubahan lokal, selesaikan atau commit terlebih dahulu; jangan menggunakan `reset --hard` sebagai jalan pintas.

## 4. Menjalankan backend Go

Di root:

```powershell
go version
$env:HOTEL_API_URL="https://jogjastay-hotel-service.jogjawisata.workers.dev"
$env:WISATA_API_URL="https://wisata-jogja-ten.vercel.app"
go run .
```

Frontend lokal: http://localhost:8080. Token partner hanya diperlukan untuk operasi yang diotorisasi oleh provider, tidak untuk melihat katalog publik. Penyimpanan order/plan Go menggunakan file lokal untuk pengembangan atau Supabase jika env yang terkait disetel.

Cek kode:

```powershell
go vet ./...
go test -count=1 ./...
node --check web/integrated.js
```

`gofmt -w *.go` dapat mengubah file; untuk inspeksi tanpa menulis, gunakan `gofmt -l *.go`.

## 5. Menjalankan backend Cloudflare

Simpan terlebih dahulu pekerjaan lokal yang belum commit, kemudian:

```powershell
git fetch origin
git switch --track origin/cloudflare-deploy
cd cloudflare
npm install
npm test
npx wrangler d1 migrations apply jogjatrip-db --local
npx wrangler dev
```

Jika branch Cloudflare sudah ada lokal, gunakan `git switch cloudflare-deploy` dan `git pull --ff-only origin cloudflare-deploy`. Perintah migrasi lokal menyiapkan database untuk Wrangler dev; ini **bukan** migrasi remote.

Jika mau menjalankan deployment Cloudflare, baca [panduan khusus](DEPLOYMENT_CLOUDFLARE.md) terlebih dahulu. Jangan aktifkan booking publik selama verifikasi provider dan idempotensi belum selesai.

## 6. Workflow perubahan dari Antigravity

1. Pastikan branch benar (`git branch --show-current`) dan source terbaru (`git pull --ff-only`) setelah memastikan working tree aman.
2. Ubah file terkait **pada folder proyek yang sama**, bukan membuat ZIP atau repository baru.
3. Jalankan tes sesuai runtime yang diubah.
4. Tinjau perubahan sebelum commit.

```powershell
git status
git diff --stat
git add .
git diff --cached --stat
git commit -m "docs: improve JogjaTrip documentation"
git push origin cloudflare-deploy
```

Gunakan `origin main` hanya ketika memang bermaksud memperbarui main. Jika tidak ada perubahan, pesan `nothing to commit, working tree clean` berarti tidak ada commit baru yang perlu dibuat, bukan error.

## 7. Workflow jika ChatGPT mengedit GitHub langsung

Ketika perubahan sudah tersimpan di repository melalui GitHub, lokal Anda **belum otomatis berubah**.

```powershell
git status
git fetch origin
git switch cloudflare-deploy
git pull --ff-only origin cloudflare-deploy
```

Tidak perlu `git add` atau `git push` untuk menerima revisi yang sudah di-commit oleh ChatGPT. Uji lokal untuk memastikan kesesuaian konfigurasi komputer.

## 8. Environment dan secret

| Variabel | Kegunaan |
|---|---|
| `HOTEL_API_URL` | Base URL HTTPS Hotel Service |
| `WISATA_API_URL` | Base URL HTTPS Wisata Service |
| `HOTEL_PARTNER_TOKEN` | Kredensial server untuk operasi Hotel terotorisasi |
| `WISATA_PARTNER_TOKEN` | Kredensial server untuk operasi Wisata terotorisasi |
| `SUPABASE_URL` | Go: backend penyimpanan Supabase jika dipakai |
| `SUPABASE_SERVICE_ROLE_KEY` | Go: kredensial server untuk Supabase |
| `PORT` | Go: port HTTP (default 8080) |
| `BOOKING_ENABLED` | Workers: gerbang keamanan booking, default false |
| `DB` | Workers: binding D1, bukan string token |

Penyimpanan rahasia: env lokal yang tidak masuk Git dan **Workers Secrets** untuk Cloudflare. Jangan membagikan password/token lewat issue atau chat.

## 9. Diagnosis singkat

| Gejala | Pemeriksaan |
|---|---|
| `not a git repository` | Terminal belum di root Git yang benar |
| `remote origin...` | `git remote -v`, alamat repository dan autentikasi |
| `nothing to commit` | Tidak ada perubahan baru; periksa `git log -1` |
| Web muncul tapi katalog kosong | Cek tab Network dan API provider |
| Quote tidak tersedia | Cek tanggal, quantity, API availability |
| Worker status 503 | Binding D1, konfigurasi, atau checkout yang sengaja dinonaktifkan |
| Booking UNKNOWN | Jangan kirim ulang; cek provider dan status tersimpan |
| UI bermasalah setelah deploy | Cek Console, cache, script loader dan asset static |

## 10. Disiplin perubahan

Jangan menghapus referensi ID booking provider; jangan mengubah status `DECLINED` menjadi berhasil; jangan membuat jam provider palsu; jangan mencampur pembayaran simulasi dengan pembayaran riil. Lakukan perubahan kecil dan mudah diaudit, lalu catat perbedaan kode, tes, commit, deploy, dan validasi browser.

[Kembali ke README utama](../README.md) · [Status proyek](PROJECT_STATUS.md).

## Redesign Itinerary Jogja (Cloudflare)

Target `cloudflare/web/`, branch `feat/itinerary-jogja-ui`. `style.css` mengimpor `base.css`, `components.css`, `pages/explore.css`, `pages/itinerary.css`, `pages/orders.css`, `layout.css`, dan `accessibility.css`; `tokens.css` dimuat sebelum semuanya. Sprite `icons.svg` lokal. Tidak ada bundler atau framework runtime. Pertahankan `data-page`, ID dan API pada `docs/ui-contract.md`. Jalankan `cd cloudflare && npm test`, `npm run typecheck`, `npx wrangler deploy --dry-run`, `python3 ../scripts/check-contrast.py` (atau dari root `python3 scripts/check-contrast.py`), serta `node tools/ui-evidence.mjs` dari direktori kerja dengan Chrome tersedia. Workflow UI memiliki job Lighthouse mobile pada lima route, menginstal CLI versi 12.8.2 hanya di runner, menyimpan JSON dan gagal bila accessibility/best practices <95 atau CLS >=0.1. Fixture server tidak mengakses provider produksi. Jangan merge/deploy tanpa seluruh check sukses dan persetujuan pemilik.
