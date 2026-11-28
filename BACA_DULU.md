# Paket untuk JogjaTrip (Itinerary)

Repo: `Sapexxx/jogjatrip-itinerary`. Klien Contract 0.2 (I1–I3) ada di cabang `feat/interop-client-0.2`; cabang `cloudflare-deploy` baru memuat I0 (pemeriksaan baca-saja).

## Hasil uji (26 Nov)
Klien Itinerary yang asli saya jalankan ke Hotel dan Wisata yang hidup: capabilities, offers, hold, ulang hold dengan kunci sama, getHold, confirm, release setelah confirm (409 ALREADY_CONFIRMED), release, confirm setelah release (HOLD_RELEASED), consent ditolak lokal. Semua berjalan, dan penolakan pasti tidak ditandai "hasil tidak pasti".
Klien menolak seluruh respons offers bila `description`/`imageUrl` hilang atau `imageUrl` relatif. Skema kontrak sudah diperketat agar sama dengan klienmu, dan Hotel serta Wisata sudah diberi patch.

## Yang perlu kamu lakukan
1. Terapkan patch ke cabang klien:
   `git checkout feat/interop-client-0.2 && git checkout -b interop-code-alignment && git am patches/jogjatrip-0001-definite-error-codes.patch`
   (patch ini mendaftarkan kode kesalahan pasti dari kontrak: INVALID_HOLD, INVALID_CUSTOMER, INVALID_QUANTITY, BAD_JSON, IDEMPOTENCY_REQUIRED, HOLD_NOT_ACTIVE, UNSUPPORTED_MEDIA_TYPE, INTEROP_NOT_CONFIGURED).
2. `cd cloudflare && npm install && npm test` (satu tes `interop-journal` gagal bila `miniflare` belum terpasang).
3. Salin `interop-contract.yaml`, `json-schema/`, `docs/`, dan `tools/interop-contract-check.mjs` ke repo.
4. Buka PR memakai `PR_ITINERARY.md`.

## Yang belum ada (butuh pekerjaanmu)
Checkout masih jalur lama (`orders.ts`): memesan satu per satu lalu membatalkan hotel yang sudah CONFIRMED bila ada yang gagal. BPI V4 meminta: tahan semua komponen, lepas semua bila satu gagal, confirm berurutan, sesudah confirm jangan batalkan otomatis, tandai PARTIAL/UNKNOWN lalu rekonsiliasi dengan GET hold. Daftar langkahnya ada di `PR_ITINERARY.md`.
