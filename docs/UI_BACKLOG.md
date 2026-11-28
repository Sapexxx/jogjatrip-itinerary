# Itinerary Jogja — UI backlog

- Phase 0: manual review of screenshot artifacts and actual browser layout, baseline Lighthouse and keyboard walkthrough still needed.
- Phase 1: contrast, typography minimums, label associations, focus, ARIA and intrinsic image dimensions.
- Phase 2: consolidate tokens, CSS responsibilities, SVG icons and breakpoints.
- Phase 3: hash navigation; retain separate Pilihan Saya entry until user explicitly wants to remove it.
- Phase 4: daily timeline, conflicts, hotel/rental boundaries, agenda, cost breakdown, print. Public links must not contain tokens or private data.
- Phase 5: editorial home, packages, catalogue, orders and footer. Preserve provider-sourced images; no new internet photo downloads.
- Phase 6: browser verification, Lighthouse, documentation and regression checks.
- Assets required: hero-landscape.webp and fallback hero-landscape.jpg (16:9, >=1600x900, ideally Prambanan/Yogyakarta landscape); six distinct package landscape photos (3:2, >=1200x800, themes culture/nature/coast/city; owner-provided licensed files).
- Interoperability: last independently observed 15/16 tests, S6 Wisata capabilities outstanding; redesign cannot alter that result or enable booking.

- Phase 3 decision: retain Pilihan Saya as a separate entry so existing cart/quote flow remains intact. Mobile uses an accessible disclosure (five native links), not a duplicate bottom bar. Phase 4 will refine the existing day selection into the new timeline; public hash links navigate local itinerary views only.

- Phase 5: JogjaTrans is available in the live catalog (not 'Belum tersedia' as in the original prompt); checkout remains gated. Existing three repository photos retained with editorial crops; six unique licensed landscape photos and a high-resolution hero remain asset requests. No new image sources or fake catalog content introduced.

## Remaining manual / external work

- Dark mode is optional and deferred; no incomplete dark palette is shipped.
- Existing repository JPGs remain because high-resolution licensed landscape assets are not supplied. Do not upscale, invent or download photos. Replace with owner-provided WebP/AVIF and JPG fallback once available; hero >=1600x900, six package photos >=1200x800. Preload current hero and keep intrinsic dimensions; image conversion/quality verification remains pending.
- Manual visual review, full keyboard/WCAG walkthrough, and real provider quote/booking/sync remain distinct from fixture CI. Production checkout disabled. S6 Wisata capabilities remains outside this frontend scope.

## Audit UX V4-safe — Tahap A (28 November 2026)

- [KODE] Provider `requiredCustomerFields`, `maxQuantity`, `durableStorage`, dan `capabilities` saat ini tidak langsung tersedia di UI; jangan memalsukan kapasitas, readiness, atau schema respons. Perubahan endpoint di luar scope UX.
- [KODE] `ibNights` hanya memiliki opsi 1, 2, 4, 6. Gunakan ChipGroup dari pilihan terpasang, bukan Stepper +1.
- [KODE] `ibPeople` min 1 maks 20; `guests` pilihan 1–4. Setiap perubahan kontrol harus mempertahankan value, `input`/`change`, serta invalidasi quote dan consent.
- [KONTRAK] `quantity` adalah unit/tiket penyedia. Jumlah wisatawan UI tidak otomatis sama dengan jumlah unit kamar atau kendaraan; perlu validasi sumber pilihan per penyedia.
- [REKOMENDASI] Jalur checkout satu layanan, pemilihan add-on, dan status per-provider hanya ditampilkan bila ada data kanonik yang mendukung.
- [BELUM TERVERIFIKASI] URL handoff ke aplikasi provider, pengukuran interaksi browser S-A/S-B/S-C, verifikasi manual keyboard/screen reader, serta staging/lighthouse terbaru.
- [KEAMANAN] I5 token, consent reset, draft-lock dan guard `BOOKING_ENABLED` adalah invariant; UX hanya boleh memperbaiki presentasi.


## Tahap D — kendala yang membutuhkan data provider atau tes browser

- [BELUM TERVERIFIKASI] Filter chip katalog, pembanding tiga penawaran, dan tombol tambah satu ketukan perlu data lapangan dan uji end-to-end agar tidak mengubah hasil/quote. Tidak diaktifkan dalam revisi aman ini.
- [KODE] Ringkasan baru `ux-summary.js` hanya membaca `JTInteropI5Plan` / `JTInteropI5Cart` dan tidak menyimpulkan status stok, pembayaran, atau reservasi.
- [METRIK] Penurunan 30% S-A/S-B/S-C belum terbukti karena pengukuran browser interaksi yang setara belum dilakukan. Jangan mengklaim pencapaian metrik ini.


## Tahap F — status/handoff yang belum tersedia melalui API UI

- [KODE] Penampilan status per-provider sekarang hanya memakai item D1 yang sudah lolos pemeriksaan `verifiedBy: D1_JOURNAL`; status reservasi dan pembayaran dipisah. Bila respons tidak memuat field, tampilkan `belum diketahui`.
- [BELUM TERVERIFIKASI] Masa tahanan `expiresAt`, voucher, serta sinkronisasi `GET hold` per provider belum tersedia langsung pada UI. Jangan tampilkan countdown atau tombol mutasi palsu.
- [KODE] Handoff yang ada masih prefill-only setelah sanitasi query dan pemeriksaan katalog; jangan membuat tautan handoff baru atau menganggapnya booking. Banner aksi terpisah ditunda karena penghapusan prefill yang aman belum didukung.

## Gate code review PR #23 (2026-11-28)

- [TERVERIFIKASI] Lighthouse rerun `46106992977`: lima rute Accessibility/Best Practices 100/100; Lighthouse failed awal karena browser startup, bukan kegagalan audit aksesibilitas.
- [TERVERIFIKASI] Guard checkout bekerja dengan atribut `disabled` ketika fixture health `bookingEnabled=false` (browser CI); server tetap otoritas terakhir.
- [WAJIB MANUAL] Jalankan walkthrough keyboard penuh dan pembaca layar pada Safari/iOS VoiceOver serta Chromium/Windows NVDA, termasuk ChipGroup, Stepper, dialog, date picker, dan penyimpanan token.
- [WAJIB METRIK] Rekam S-A/S-B/S-C pada baseline `994e649` dan PR terbaru dengan fixture identik, definisi aksi sama, dan langkah lengkap sampai halaman Tinjau. Jangan menurunkan target atau mengekstrapolasi dari tes komponen.


## Pengukuran aktual S-A/S-B/S-C (paired replay CI)

- [TERUJI] `46108439278` menjalankan kedua snapshot `main@994e649` dan PR dengan protokol fixture identik, semuanya mencapai end-state; baseline/PR S-A=14/14, S-B=8/8, S-C=11/11. Tidak ada mutasi provider.
- [TARGET BELUM TERPENUHI DALAM REPLAY] Reduksi S-A adalah **0%**, bukan 30%. Karena skrip memutar ulang aksi yang sama pada dua snapshot, tes bersifat *functional parity*, bukan uji optimasi interaksi yang memperhitungkan jalur UI baru. Masih diperlukan evaluasi interaksi natural pengguna.
- [WAJIB MANUAL] NVDA/VoiceOver serta review tampilan dan fokus di perangkat manusia mengikuti `docs/UX_V4_MANUAL_A11Y_CHECKLIST.md`. Status NOT RUN harus tetap sampai bukti tersedia.

## Hasil jalur cepat dan pembatasannya — 28 November 2026

- [TERUKUR, REPLAY] Baseline vs PR dengan output identik: S-A 14→8 (42,9%), S-B 8→5 (37,5%), S-C 11→7 (36,4%). Referensi CI `46109800704`, fixture H1/R1/D1/V1 read-only.
- [REKOMENDASI] Validasi perilaku jalan cepat pada sesi manusia: tombol saran jam mungkin mempercepat pembuatan rencana tetapi pengguna tetap harus memeriksa jam buka penyedia dan durasi perjalanan yang realistis sebelum memesan.
- [MANUAL TERBUKA] NVDA/VoiceOver pada tombol cepat, waktu agenda, dialog, fokus setelah memilih; lakukan pemeriksaan pada kondisi jam contoh tidak sesuai kebutuhan pengguna.
- [TIDAK DIKLAIM] Penghematan waktu manusia, ketersediaan slot provider, atau pengurangan beban kerja booking; hanya pengurangan jumlah operasi replay tertentu.
