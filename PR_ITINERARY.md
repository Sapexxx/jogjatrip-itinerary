# PR JogjaTrip: selaraskan klien dengan kode kesalahan penyedia

**Repositori:** `Sapexxx/jogjatrip-itinerary`, cabang `feat/interop-client-0.2` (dasar `687770c`). **Patch:** `patches/jogjatrip-0001-definite-error-codes.patch`.

## Masalah
`cloudflare/src/interop.ts` hanya menganggap sekumpulan kode tertentu sebagai penolakan pasti. Penyedia yang dibangun sesuai kontrak menjawab `INVALID_HOLD`, `INVALID_CUSTOMER`, `INVALID_QUANTITY`, `BAD_JSON`, `IDEMPOTENCY_REQUIRED`, `HOLD_NOT_ACTIVE`, `UNSUPPORTED_MEDIA_TYPE`, dan `503 INTEROP_NOT_CONFIGURED`. Kode itu jatuh ke `UPSTREAM_HTTP_ERROR` dengan `outcomeUnknown=true`, sehingga satu penolakan bersih mendorong saga ke jalur rekonsiliasi.

## Perubahan (sudah ada di patch)
`src/interop.ts`: tambah kode di atas ke `stableCodes` dan ke daftar penolakan pasti. Kode yang tidak dikenal tetap dianggap tidak pasti (sikap konservatif Anda dipertahankan). `tests/interop-client.test.mjs`: satu uji untuk delapan kode baru dan dua kode asing.

Hasil: 97 dari 98 tes lulus; satu gagal sejak awal karena `miniflare` belum dipasang (`tests/interop-journal.test.mjs`, jalankan `npm install` dulu). Pengecekan tipe `tsc --noEmit` bersih.

## Yang masih perlu Anda kerjakan
1. Selesaikan saga I3: tahan semua hold lebih dulu, lepas semua bila satu gagal, `confirm` berurutan, sesudah `confirm` dimulai tandai `PARTIAL` atau `UNKNOWN` dan rekonsiliasi dengan `GET`, jangan membatalkan otomatis.
2. Gunakan satu `externalRef` (maksimal 64 karakter) untuk semua penyedia dalam satu pesanan, dan kirim `consent: true` hanya setelah pengguna menyetujui.
3. Pisahkan status pemesanan dan status bayar di `core.ts` (sekarang tercampur).
4. Hubungkan klien ke `orders.ts` di balik `BOOKING_ENABLED` hanya setelah uji silang staging lulus; selama itu label tetap menyatakan pemesanan belum aktif.
5. Pastikan parser handoff menerima tiga pola di `docs/integration-guide.md` bagian 8 (`from=jogjastay`, `from=jogjatrans`, `from=wisata`); pola Wisata sudah ada di I0, dua lainnya belum saya periksa.

## Kriteria berhasil
- E8 dan E9 di `docs/test-scenarios.md` lulus terhadap tiga penyedia staging.
- `tools/interop-contract-check.mjs` lulus terhadap ketiga penyedia, dan `check-interop.mjs` melaporkan `transactionReadiness` yang bukan `BLOCKED` setelah tiga penyedia melapor `durableStorage: true`.
