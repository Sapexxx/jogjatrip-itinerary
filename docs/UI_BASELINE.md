# Itinerary Jogja — Phase 0 baseline

Production source: `f9643592b860163fa26b93225397d66e3d299edf` (Cloudflare). The requested product name is Itinerary Jogja. Technical repository/Worker names remain unchanged.

| Static measurement | Baseline |
|---|---:|
| CSS bytes | 34715 |
| Hex occurrences | 302 |
| Unique literal hex | 257 |
| Pixel font sizes | 145 |
| Pixel font sizes below 12px | 50 |
| CSS var() calls | 15 |
| Unassociated search labels | 4 |
| Hash router | absent |

Baseline contrast checker: `python3 scripts/check-contrast.py --baseline` (expected failure). Browser evidence: automated screenshots at widths 375/768/1024/1440 using deterministic synthetic API fixtures; inspect artifacts for actual layout. Not a manual accessibility evaluation or Lighthouse score. Direct repository clone unavailable in assistant runtime (DNS/network); CI captures visual baseline. No production writes, booking or API calls.


## UX V4-safe, Tahap A (28 November 2026)

Sumber: `main@994e649803fe995d2c724542955dfd8c9c5df176`. Cabang kerja `feat/ux-controls-v4-safe`. UI di `cloudflare/web/` memakai JavaScript klasik (script `defer`), sehingga `import` ESM tidak boleh ditempelkan ke `integrated.js` tanpa perubahan strategi pemuatan.

**Bukti yang tersedia**: run CI baseline [45982756259](https://github.com/Sapexxx/jogjatrip-itinerary/actions/runs/45982756259) berstatus SUCCESS pada SHA tersebut. Run itu mencakup validasi Go dan Worker. Keberhasilan run lama **tidak** membuktikan perubahan UX baru. Pengukuran browser Tahap A belum dijalankan pada sesi ini.

| Skenario | Perkiraan manual pra-UX | Bukti browser | Sesudah | Target |
| --- | ---: | --- | --- | --- |
| S-A Builder hotel + wisata + kendaraan sampai tinjau | ~17 | BELUM DIUKUR | BELUM DIUKUR | <=12 |
| S-B Paket bundling sampai tinjau | ~10 | BELUM DIUKUR | BELUM DIUKUR | <=7 |
| S-C Katalog sampai Pilihan Saya / tinjau | ~12 | BELUM DIUKUR | BELUM DIUKUR | <=8 |

Angka manual adalah estimasi berdasarkan urutan klik, bukan pengukuran objektif. Bila pengujian browser end-to-end dilakukan kemudian, pertahankan langkah, tanggal, dan pilihan yang sama. Hitung aksi pengguna yang nyata; jangan menyetarakan semua `keydown` dengan satu aksi bila durasi input tidak setara.

**Temuan konkret:** `ibNights` select memakai nilai `1,2,4,6`, jadi tidak boleh memakai Stepper kenaikan +1; `ibPeople` min 1 maks 20; `guests` select 1–4; tiga form kontak terpisah; antarmuka belum mengonsumsi `requiredCustomerFields` atau `maxQuantity` dari provider langsung. `interop-checkout.js` mengelola consent dan token, tidak boleh diganti mekanismenya.

**Inventaris kontrol statis di index.html:** 34 ID input/select/textarea (tidak mencakup yang dirender JavaScript):
- `region (select)`
- `tripDate (input)`
- `nights (select)`
- `guests (select)`
- `v4UseHotel (input)`
- `v4UseWisata (input)`
- `v4UseTransport (input)`
- `v4Budget (select)`
- `v4Duration (select)`
- `exploreRentStart (input)`
- `exploreRentEnd (input)`
- `exploreRentType (select)`
- `exploreRentDriver (select)`
- `exploreRentCategory (select)`
- `packageStart (input)`
- `packageGuests (input)`
- `packageName (input)`
- `packageEmail (input)`
- `packagePhone (input)`
- `customerName (input)`
- `customerEmail (input)`
- `customerPhone (input)`
- `ibDate (input)`
- `ibNights (select)`
- `ibPeople (input)`
- `ibBudget (input)`
- `ibName (input)`
- `ibEmail (input)`
- `ibPhone (input)`
- `planTitle (input)`
- `planStart (input)`
- `planEnd (input)`
- `lookupId (input)`
- `lookupToken (input)`

**Aturan keselamatan:** `BOOKING_ENABLED=false` tetap. Tidak ada panggilan HOLD/CONFIRM, tidak ada token/PII di URL atau storage baru. Source kanonik dan file backend tetap tidak disentuh.


## Pelaksanaan UX V4 safe — sebelum/sesudah

Sumber tahap A: estimasi manual **S-A ~17**, **S-B ~10**, **S-C ~12**; sumber ini bukan rekaman browser. **Pengukuran interaksi setelah perubahan belum dijalankan**, sehingga target pengurangan 30% **belum dapat dinyatakan tercapai**.

| Metrik | Sebelum | Sesudah (pengukuran sah) |
| --- | --- | --- |
| S-A | ~17 (estimasi manual) | BELUM DIUKUR |
| S-B | ~10 (estimasi manual) | BELUM DIUKUR |
| S-C | ~12 (estimasi manual) | BELUM DIUKUR |
| Kontrol nilai durasi kecil | Select 4 opsi | ChipGroup dari opsi identik |
| Jumlah wisatawan builder | Native number 1–20 | Stepper 1–20 + sumber number identik |
| Jumlah wisatawan beranda | Select 1–4 | Stepper 1–4 + sumber select identik |
| Formulir pelanggan | Tiga konteks berbeda | Perbaikan atribut kontak; penyatuan data masih backlog |
| Warna | Palet semantik `tokens.css` | Palet tidak diubah |
| Kontras / Lighthouse setelah perubahan | Bukti lama hanya baseline | MENUNGGU bukti CI pada Draft PR |
| Satu kontrol per jenis data di semua halaman | Belum | PARSIAL; perlu tinjauan browser |

Pengukuran browser yang konsisten wajib memakai tanggal dan layanan sintetis yang sama; dokumentasikan setiap click/tap/keyboard block. Jangan menyamakan dua estimasi manual dengan dua hasil browser.

## Review gate tambahan — 28 November 2026

Pengulangan Lighthouse pada [UI Evidence run 46106992977](https://github.com/Sapexxx/jogjatrip-itinerary/actions/runs/46106992977) **SUCCESS** di commit `b76a5983`, setelah kegagalan transient Chrome DevTools startup pada percobaan pertama. Pada rerun, kelima rute beranda/paket/pilihan/itinerary/pesanan meraih Accessibility dan Best Practices **100/100**, Performance **84–88**, CLS sekitar **0,004–0,0054**.

Tes CDP tambahan di `ui-evidence.mjs` memeriksa navigasi panah ChipGroup, perpindahan fokus, label ARIA, `type=tel`, dan tombol checkout yang benar-benar disabled pada fixture `bookingEnabled=false`. **Belum berarti pengujian pembaca layar manusia selesai.**

Untuk S-A/S-B/S-C, angka baseline 17/10/12 tetap estimasi manual tanpa jejak aksi dari browser baseline. Tes CDP yang ada menggunakan fixture, tetapi belum menjalankan tiga skenario lengkap secara sepadan pada kedua commit. Karena itu target ≥30% **tetap belum terverifikasi**, meskipun komponen UX baru sudah diuji dalam browser.
