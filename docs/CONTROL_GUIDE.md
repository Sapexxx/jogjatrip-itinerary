# CONTROL GUIDE — Itinerary Jogja, UX V4

## Pemilihan kontrol

| Data | Kontrol | Aturan |
| --- | --- | --- |
| Jumlah wisatawan `ibPeople` | Stepper tombol ± | Sumber input 1–20, native value/event dipertahankan |
| Jumlah paket `packageGuests` | Stepper tombol ± | Batas diambil dari input yang ada, bukan stok provider |
| Durasi `ibNights`, `nights` | Chip radio | Opsi 1,2,4,6 malam; tidak menciptakan durasi baru |
| Pilihan ≤5 lain | Chip radio | Selalu pakai opsi native; keyboard panah didukung |
| Wilayah/kategori ≥6 | Select native | Tidak ditiru menjadi combobox tanpa kebutuhan |
| Tanggal wisata | Tanggal tunggal | `YYYY-MM-DD` |
| Hotel | Check-in + check-out | Malam eksklusif: `nightsBetween(start,end)` |
| Rental | Tanggal mulai & hari terakhir | Inklusif: `inclusiveDays` dan maksimum 30 |
| Kontak | Input tel, email | Browser native, tanpa penyimpanan PII baru |
| Konfirmasi tindakan | `<dialog>` | Cancel/escape = tidak menyetujui, fokus kembali |
| Checkout token | Password/Salin/Unduh | Token 256-bit yang sudah ada; UI tidak mengubah state |
| Status | Dua label | Reservasi dan pembayaran berbeda |
| Warna | Existing tokens | Tidak ada hex literal baru di komponen/halaman |

## Pengujian

Jalankan `node tools/check-source-manifest.mjs`, `cd cloudflare && npm ci && npm test && npm run typecheck && npm run check:ux-tokens`, `python3 scripts/check-contrast.py`, dan UI evidence/Lighthouse. Jangan menyatakan PASS sampai log benar-benar diperiksa.

## Batas keputusan

Tidak boleh mengaktifkan `BOOKING_ENABLED`, menulis migration, mengubah client/saga/D1, menyimpan token browser, ataupun menganggap status simulasi sebagai pembayaran riil. Bagian yang belum bisa dibuktikan harus tetap di `UI_BACKLOG.md`.
