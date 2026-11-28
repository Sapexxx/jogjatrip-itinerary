# Pemetaan BPMN V4 ↔ UX JogjaTrip ↔ Contract 0.2

Referensi proses: `ITINERARY_BPI_V4(2).bpmn`; referensi kontrak: sumber kanonik yang disimpan byte-identik dalam manifest. Diagram V4 menjelaskan proses bisnis; kode aktual menjadi bukti implementasi. Tabel ini **tidak** mengklaim aktivasi live.

| Proses BPMN V4 | UX V4-safe | Kode | Status |
| --- | --- | --- | --- |
| U1 pilihan Bundling/Builder/Satu layanan | Tiga pilihan cara | `journey-ux.js`, `index.html` | Implementasi navigasi; direct provider tetap katalog |
| U1 tanggal/jumlah/durasi | Input native, stepper, chip | `controls.js`, `date-utils.js` | Sebagian: kontrol tanggal berpasangan belum menyatu di semua halaman |
| U2 tinjau rencana dan harga | Ringkasan simulasi | `ux-summary.js` | Read-only, data dari I5 Cart/Plan |
| U2 ubah pilihan | Quote dinyatakan tidak terverifikasi setelah perubahan | `integrated.js`, `app.js` | Perilaku asli tetap |
| U3 persetujuan | Kotak centang data dan total | `interop-checkout.js` | I5 tetap fail-closed; hanya bahasa/unduh token |
| Itinerary D1 prepare | Kunci checkout dari browser | `interop-checkout.js` | Tahap I5 lokal; belum booking |
| HOLD/CONFIRM/RELEASE | Tidak diekspos di UI umum | `cloudflare/src/interop-saga.ts` (tidak diubah) | E8/E9 fixture lokal; I6 live NO-GO |
| PARTIAL/UNKNOWN | Label status hati-hati | `ux-status.js` | Hanya respons journal verified |
| Reservasi vs pembayaran | Label terpisah | `ux-status.js` | Unknown tidak disulap menjadi paid |
| Handoff provider | Prefill-only setelah validasi | `app.js` (tetap) | Tautan harus diverifikasi |
| I6 provider readiness | Kesiapan checkout global | `cloudflare-status.js` | Gagal tertutup; belum live |

## Persyaratan yang belum ditutup UX V4-safe

- Kemampuan capabilities per-provider, batas `maxQuantity`, stok `remaining`, dan `requiredCustomerFields` langsung ke browser: **belum tersedia**; tidak membuat endpoint baru.
- DateRangeLodging dan DateRangeRental lintas semua modal, timeslot, ContactFields satu komponen, filter per-field, compare 3, prefill dan target interaksi 30%: **belum tervalidasi end-to-end**.
- Status `expiresAt`, voucher, riwayat komponen penuh, handoff explicit accept/ignore: **belum dapat diluncurkan** tanpa kontrak data dan pengujian yang memadai.
- Browser keyboard/screen reader manual, Lighthouse terbaru, CI setelah perubahan: **menunggu verifikasi**.
