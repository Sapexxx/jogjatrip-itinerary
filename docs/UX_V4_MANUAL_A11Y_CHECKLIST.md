# UX V4 — Protokol uji manual aksesibilitas, PR #23

**GATE: NOT RUN / NO-GO untuk merge.** Panduan ini menyiapkan uji manual; bukan bukti NVDA atau VoiceOver sudah dijalankan. Hanya penguji manusia pada perangkat nyata yang berhak menandai hasil sebagai PASS. Jangan mencatat pembacaan layar yang belum benar-benar terdengar.

## 1. Menyiapkan versi PR secara aman

Gunakan **commit PR yang akan di-merge**, bukan situs produksi. Pengujian lokal menggunakan fixture sintetis yang sama jenisnya dengan CI, **tanpa backend nyata**, dengan semua HTTP POST diblokir.

Pada Windows dengan Node.js 22+ dan Git, dari PowerShell:

```powershell
git clone --branch feat/ux-controls-v4-safe https://github.com/Sapexxx/jogjatrip-itinerary.git
cd jogjatrip-itinerary
git rev-parse HEAD
node cloudflare/tools/manual-a11y-preview.mjs
```

Buka `http://127.0.0.1:8765/#/beranda` di Chrome atau Firefox. Jangan membuka situs produksi untuk pengujian token.

Untuk menguji di **iPhone Safari**, hentikan server dengan Ctrl+C dan jalankan:

```powershell
node cloudflare/tools/manual-a11y-preview.mjs --lan
```

Hubungkan iPhone dan komputer ke **Wi-Fi pribadi yang sama**. Buka `http://IP-LOKAL-KOMPUTER:8765/#/beranda` di Safari. Mode LAN membuka port pada jaringan lokal saja; tutup setelah tes, jangan gunakan jaringan publik, dan jangan masukkan PII atau token sungguhan.

Di Windows, jalankan NVDA dan aktifkan **Speech Viewer** melalui menu NVDA > Tools untuk mencatat ucapan sebenarnya. Gunakan Tab/Shift+Tab, Enter/Space, panah, dan Escape. Di iPhone aktifkan Settings > Accessibility > VoiceOver, gunakan swipe kiri/kanan untuk berpindah elemen dan double-tap untuk mengaktifkan. Catat suara/label yang terdengar, bukan sekadar yang terlihat. Petunjuk resmi: https://www.nvaccess.org/get-help/accessibility-testing-with-nvda-free-sample/ dan https://support.apple.com/en-asia/guide/iphone/iph3e2e415f/27/ios/27

## 2. Informasi sesi yang wajib diisi

| Informasi | Windows + NVDA | iPhone + VoiceOver |
|---|---|---|
| Penguji / tanggal & waktu | BELUM DIISI | BELUM DIISI |
| SHA Git `git rev-parse HEAD` | BELUM DIISI | BELUM DIISI |
| Perangkat, OS & versi | BELUM DIISI | BELUM DIISI |
| Browser & versi | BELUM DIISI | BELUM DIISI |
| NVDA / VoiceOver versi & bahasa | BELUM DIISI | BELUM DIISI |
| Zoom / ukuran viewport | BELUM DIISI | BELUM DIISI |
| Link catatan/rekaman tanpa PII | BELUM DIISI | BELUM DIISI |

## 3. Kasus manual yang harus benar-benar dikerjakan

Gunakan `PASS`, `FAIL`, `BLOCKED`, atau `NOT RUN`. Jangan gunakan N/A tanpa alasan tertulis.

| ID | Route / tindakan manual | Kriteria yang harus diamati dan dicatat | Status |
|---|---|---|---|
| A11Y-01 | Lima route `#/beranda`, `#/paket`, `#/pilihan`, `#/itinerary`, `#/pesanan`; Tab dan Shift+Tab / swipe VoiceOver | Fokus terlihat, urutan logis; skip link menempatkan fokus dengan benar; tidak ada perangkap | NOT RUN |
| A11Y-02 | Builder `#/itinerary`; fokus ChipGroup durasi, tekan panah kiri/kanan, Space/Enter atau gesture aktivasi | Nama, role radio, nilai terpilih dan perubahan state diucapkan; pilihan aktual sama dengan yang dipilih | NOT RUN |
| A11Y-03 | Builder dan Beranda; fokus Stepper jumlah wisatawan, tambah/kurangi, masukkan min/max di input angka | Label bermakna, nilai terbaca, batas dicegah, tombol disabled di ujung rentang dapat dipahami | NOT RUN |
| A11Y-04 | Builder; pilih Hotel/Wisata, buka dialog jam, coba Batal/Escape, buka lagi dan gunakan jam contoh | Judul dialog terdengar; fokus tidak keluar dari modal; kembali ke pemicu saat batal; jam contoh dijelaskan sebagai rencana saja | NOT RUN |
| A11Y-05 | Dialog katalog Hotel/Wisata dan form telepon; isi waktu salah/field wajib kosong | Galat dijelaskan, dikaitkan dengan isian yang salah, tidak ada booking atau keberhasilan palsu | NOT RUN |
| A11Y-06 | Panel persiapan I5 **hanya pada fixture/staging berizin**; telusuri token dan checkbox consent | Checkbox tidak prechecked; rahasia tidak terbaca secara terbuka; aksi unduh tidak tanpa persetujuan eksplisit | BLOCKED: preview read-only tidak mengaktifkan persiapan |
| A11Y-07 | Status `#/pesanan` dengan fixture PARTIAL/UNKNOWN yang disetujui | Reservasi dan pembayaran terpisah; UNKNOWN tidak dinarasikan sebagai sukses; tidak ada retry otomatis | BLOCKED: fixture status perlu disiapkan |
| A11Y-08 | Semua route, booking disabled; ulangi saat fixture health gagal/timeout | Kontrol checkout disabled dan alasan terbaca sebelum memasukkan PII; tetap gagal-tertutup | NOT RUN |
| A11Y-09 | Browser zoom 200% dan 400%; iPhone potret dan lanskap | Informasi, fokus, dan tombol tidak hilang/tertutup; tidak perlu scroll dua arah untuk konten utama | NOT RUN |
| A11Y-10 | Semua alur utama dengan Bahasa Indonesia, termasuk tombol jam contoh dan kesalahan | Label, tanggal, jumlah orang, waktu, status, dan instruksi mudah dimengerti saat dibacakan | NOT RUN |

**Perhatian:** halaman preview hanya memiliki API read-only; jika sebuah fitur memerlukan backend/quote yang benar, tandai `BLOCKED` dan rancang fixture aman yang memadai. Jangan mengaktifkan BOOKING_ENABLED atau I6 staging demi menyelesaikan checklist.

## 4. Format bukti tiap kasus

```text
ID:
SHA dan route:
Perangkat / OS / browser / screen reader / bahasa:
Langkah yang benar-benar dilakukan:
Ucapan screen reader (ditulis verbatim bila mungkin):
Fokus dan perubahan state aktual:
Hasil: PASS / FAIL / BLOCKED
Severity: blocker / major / minor / none
Bukti (rekaman tanpa identitas, kontak, atau token):
Perbaikan yang diperlukan:
```

Klasifikasi: `blocker` bila tugas inti tidak dapat diselesaikan, informasi rahasia terbuka, atau booking bisa terjadi tanpa persetujuan; `major` bila navigasi/label/form sangat menghambat; `minor` untuk kesalahan pengumuman yang tidak menggagalkan tugas. Gagal pada blocker/major menahan merge hingga diperbaiki dan diuji ulang.

## 5. Gate akhir

- **Otomatis:** tes Worker/Go/TypeScript, UI Evidence, Lighthouse, dan paired S-A/B/C harus PASS pada **SHA yang sama**.
- **Manual:** hasil NVDA Windows dan VoiceOver iPhone beserta bukti harus dicatat. Kasus `BLOCKED` membutuhkan keputusan pemilik proyek dan alasan yang terdokumentasi, bukan PASS buatan.
- **Keamanan:** I1–I6, kontrak kanonik, dan `BOOKING_ENABLED=false` dipertahankan. Review owner harus eksplisit sebelum merge; deployment merupakan keputusan terpisah.
- **Status saat dokumen ini dibuat:** *NOT RUN*, tidak ada otorisasi merge/deploy.
