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


## Bukti pengukuran replay dua commit — 28 November 2026

[Sumber CI dan artefak lengkap](https://github.com/Sapexxx/jogjatrip-itinerary/actions/runs/46108439278) · Protokol `jogjatrip-ux-scenarios-v1`.

- Baseline: `main@994e649803fe995d2c724542955dfd8c9c5df176`.
- Kandidat: `feat/ux-controls-v4-safe@3593085819d9ddb71f598e69dafd00bfcab83250`.
- Metode: satu skrip browser `ui-interaction-audit.mjs` terhadap dua checkout berbeda dengan fixture sintetis Hotel H1/kamar R1/Wisata D1/kendaraan V1, tanpa request mutasi. Log berisi urutan tindakan, jumlah tindakan dan end-state tiap skenario.
- Setiap tindakan diskret `click` atau `field` dihitung satu; kondisi `wait` dan setup tidak dihitung. Operasi programatis pada DOM digunakan sebagai replay aksi sintetis, bukan pengukuran gestur fisik atau sesi pengguna sesungguhnya.

| Skenario | Aksi baseline (browser) | Aksi PR (browser) | Perubahan | Validitas |
| --- | ---: | ---: | ---: | --- |
| S-A Builder hotel + wisata + kendaraan sampai keadaan Tinjau | 14 | 14 | 0% | Kedua end-state valid |
| S-B Kandidat paket hingga itinerary | 8 | 8 | 0% | Kedua end-state valid |
| S-C Katalog hotel + wisata hingga Pilihan Saya | 11 | 11 | 0% | Kedua end-state valid |

**Hasil:** tidak ada pengurangan aksi pada tiga replay identik; target ≥30% S-A **belum terbukti tercapai**. Perbandingan ini terutama membuktikan *functional parity* alur lama. Karena langkah replay sama di kedua versi, tes ini bukan ukuran yang cukup terhadap kemungkinan pengurangan aksi pada kontrol baru. Untuk mengukur efektivitas redesign secara nyata, lakukan sesi tugas dengan pengguna atau uji klik fisik adaptif (memakai visual dan kendali UI terbaru) dan hitung setiap tap/keyboard block, termasuk kalender dan stepper. Angka estimasi awal (~17/~10/~12) bukan pembanding yang setara dengan 14/8/11 dan tidak boleh dicampur.

**Uji aksesibilitas:** skrip browser dan Lighthouse lulus, tetapi verifikasi manual NVDA/VoiceOver **BELUM DIJALANKAN**. Ikuti `docs/UX_V4_MANUAL_A11Y_CHECKLIST.md` dan lampirkan bukti sebelum mengubah status gate.

## Evaluasi optimasi jalur tindakan UX V4 — 28 November 2026

Perbaikan frontend yang diuji: tombol **Gunakan jam contoh dan simpan** pada dialog jadwal Builder, **Isi semua jam contoh** pada kandidat Paket, dan **Gunakan jam contoh & tambahkan** pada dialog Katalog. Semua tindakan merupakan keputusan eksplisit wisatawan atas agenda pribadi, bukan konfirmasi ketersediaan, jam operasional, tiket, kamar, atau booking; waktu dapat diedit ulang.

Bukti [paired browser CI #46109800704](https://github.com/Sapexxx/jogjatrip-itinerary/actions/runs/46109800704), baseline `994e649` versus branch UX commit `705cda0`, fixture H1/R1/D1/V1 read-only:

| Skenario | Aksi baseline | Aksi UX | Pengurangan | Hasil |
| --- | ---: | ---: | ---: | --- |
| S-A Builder hotel, wisata, kendaraan | 14 | 8 | **42,9%** | Valid, target 30% tercapai dalam replay |
| S-B Paket Bundling | 8 | 5 | **37,5%** | Valid |
| S-C Katalog → Pilihan Saya | 11 | 7 | **36,4%** | Valid |

**Pengendalian:** UI tetap mengharuskan pemilihan layanan secara eksplisit; kode backend, endpoint, consent dan checkout tidak berubah. Browser tidak membuat request mutasi provider. Script pengukuran mengadaptasi klik ketika tersedia tombol jalur cepat, sedangkan baseline menggunakan input waktu manual. Keluaran akhir diuji terhadap identitas layanan, jenis layanan dan jam agenda yang sama untuk kedua versi. Setelah perbaikan ini, comparator juga mengharuskan `observed.items` identik secara struktural agar hitungan dinyatakan sah.

**Batas interpretasi:** perhitungan adalah operasi DOM diskret otomatis, bukan klik/gesture fisik, waktu penyelesaian, atau uji pengguna manusia. Tiga skenario sintetis tidak menyatakan ketersediaan riil provider. Target antarmuka pada ketiga replay terpenuhi; verifikasi usability dan aksesibilitas manual tetap OPEN.
