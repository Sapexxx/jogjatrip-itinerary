# Rencana deployment Cloudflare untuk JogjaTrip V5.3

Status: **belum ter-deploy**. Source Go pada branch `main` tidak bisa dijalankan langsung pada Cloudflare Workers. Backend perlu versi Workers yang kompatibel, dan database D1 perlu disiapkan.

## Audit repository 20 November 2026
- Backend: Go 1.23, `net/http`; frontend: `web/` HTML/CSS/JavaScript.
- API Hotel/Wisata diakses melalui backend agar partner token tidak bocor ke browser.
- Paket JSON sebelumnya tidak tampil pada GitHub karena `.gitignore` mengabaikan keseluruhan `data/`. Dua template asli kini dipulihkan dalam perubahan ini.
- Transport belum terhubung; jangan membuat data booking transport tiruan.
- **Belum ada akses Cloudflare terautentikasi dari koneksi GitHub saja**; izin GitHub tidak otomatis memberi akses ke Cloudflare Dashboard.
- Jangan mengaku layanan Workers aktif tanpa verifikasi URL `.workers.dev`, D1, dan API.

## Jalur target: GitHub → Cloudflare Workers Builds → Workers + D1
1. Pertahankan versi Go pada branch `main`. Letakkan adaptasi JavaScript Workers dan seluruh file `wrangler.jsonc`, `src/`, `web/`, `migrations/` di subfolder `cloudflare/`.
2. Audit dan uji `npm test`; kemudian `npx wrangler dev`. Jangan deploy jika sumber Workers atau D1 binding belum siap.
3. Buat database baru `jogjatrip-db` di Cloudflare D1; jalankan migrasi di `cloudflare/migrations/`. Simpan ID database pada konfigurasi Wrangler; ID ini bukan token.
4. Simpan `HOTEL_PARTNER_TOKEN` dan `WISATA_PARTNER_TOKEN` sebagai **Workers Secrets** di dashboard, bukan di GitHub.
5. Tetapkan `BOOKING_ENABLED=false` sebelum pengujian produksi agar POST booking partner tidak berjalan tanpa izin.
6. Dalam Cloudflare Dashboard, gunakan Workers & Pages → Connect to Git Repository, pilih `Sapexxx/jogjatrip-itinerary`, branch yang berisi kode Workers, root directory `cloudflare`, build/test command `npm test`, dan deploy command `npx wrangler deploy` (sesuaikan UI aktual).
7. Setelah deployment berhasil, ambil URL publik yang **benar-benar muncul** di Cloudflare. Periksa `/api/health`, katalog Hotel/Wisata, penyimpanan itinerary D1, dan UI browser sebelum mengaktifkan checkout.
8. Uji integrasi booking ke provider asli hanya dengan izin dan skenario aman. Sinkronisasi status harus mengikuti provider sebagai sumber kebenaran.

## Perubahan berikutnya
Setelah GitHub integration aktif, `git push` ke branch yang dimonitor akan memicu deployment Cloudflare. Tidak perlu membuat Worker dan URL baru tiap revisi.

> Koneksi GitHub saja **tidak** menyediakan kemampuan membuat database D1, mengelola Workers Secrets, atau men-deploy ke akun Cloudflare. Tahap tersebut harus diselesaikan di Cloudflare Dashboard atau lewat akses Cloudflare terautentikasi.
