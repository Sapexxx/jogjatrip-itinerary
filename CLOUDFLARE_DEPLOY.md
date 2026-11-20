# JogjaTrip V5.3 — Persiapan deployment Cloudflare

**Status per 20 November 2026:** Source Cloudflare Workers + D1 tersedia pada branch **cloudflare-deploy**, dalam folder **cloudflare/**. Source Go V5.3 tetap dipertahankan pada root repository dan branch **main**.

**Sudah terverifikasi:** Go tests, 15 Node/mock tests, dan Wrangler bundling melalui dry-run GitHub Actions berhasil. Lihat tab **Actions** dan pull request draft yang terkait.

**Belum dilakukan:** pembuatan database D1 pada akun Cloudflare Anda, pengisian database UUID asli, penyiapan Workers GitHub Integration, autentikasi/Secrets Cloudflare, deployment publik, dan pengujian transaksi terhadap API provider asli.

## Lakukan setup satu kali

1. Cloudflare Dashboard → Storage & databases → D1 → buat **jogjatrip-db**.
2. Salin ID database lalu ganti placeholder **REPLACE_WITH_REAL_D1_DATABASE_ID** pada **cloudflare/wrangler.jsonc** di branch **cloudflare-deploy**. UUID database bukan rahasia.
3. Jalankan **cloudflare/migrations/0001_init.sql** di D1 Console untuk database baru.
4. Cloudflare Workers & Pages → Import Git repository → pilih **Sapexxx/jogjatrip-itinerary**, branch **cloudflare-deploy**, root **cloudflare**, Worker name **jogjatrip-itinerary**.
5. Build command: **npm test**, deploy command: **npx wrangler deploy**.
6. Biarkan **BOOKING_ENABLED=false**. Lakukan pengujian katalog, itinerary dan detail terlebih dahulu.
7. Hanya setelah muncul deployment sukses di Cloudflare, gunakan URL .workers.dev yang benar-benar diberikan dashboard.

Baca petunjuk lengkap di [cloudflare/README.md](cloudflare/README.md).

## Perubahan berikutnya

Setelah integrasi GitHub aktif, push pada branch **cloudflare-deploy** memicu build dan deployment otomatis tanpa ZIP atau hosting baru. Jangan mengaktifkan checkout provider sampai uji idempotensi, pembatalan/kompensasi, serta sinkronisasi D1 lulus.

## Penting

Akses GitHub tidak otomatis memberi akses Cloudflare. Jangan membagikan Cloudflare API token, password database atau partner token melalui chat/GitHub. Simpan kredensial sebagai Workers Secrets.

Transport tidak diintegrasikan sampai layanan dan kontrak API tim Transport tersedia.
