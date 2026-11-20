# Petunjuk Deployment Cloudflare

Panduan deployment JogjaTrip telah dipusatkan agar tidak ada dua versi instruksi yang bertentangan.

**Mulai dari:** [docs/DEPLOYMENT_CLOUDFLARE.md](docs/DEPLOYMENT_CLOUDFLARE.md)

**Panduan khusus runtime Worker:** [cloudflare/README.md](cloudflare/README.md)

**Status verifikasi:** [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md)

Ringkasan: kode Worker ada pada branch `cloudflare-deploy`, binding D1 bernama `DB`, database `jogjatrip-db`, dan ID database sudah diisi di `cloudflare/wrangler.jsonc`. GitHub Actions berhasil untuk uji Go/Node/mock serta Wrangler dry-run. Keberhasilan **deployment publik**, kesiapan D1 remote, dan transaksi booking **belum dapat dikonfirmasi** dari akses GitHub saja.

Pertahankan `BOOKING_ENABLED=false` sampai verifikasi provider, idempotensi, dan alur kegagalan selesai. Jangan membuat Worker baru atau reset D1 jika deployment sudah dibuat pada akun Cloudflare.
