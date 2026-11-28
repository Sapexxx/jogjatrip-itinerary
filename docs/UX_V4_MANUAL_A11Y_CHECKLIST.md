# UX V4 — Checklist aksesibilitas manual PR #23

**Status: BELUM DIUJI OLEH PENGUJI MANUSIA.** Hasil Lighthouse dan Chrome CDP tidak menggantikan pembacaan NVDA/VoiceOver. Isi identitas penguji, perangkat, versi, waktu, ucapan yang diamati, dan bukti sebelum menyatakan PASS.

## Metadata
- SHA commit PR:
- Penguji / tanggal:
- Windows + Chrome/Firefox + NVDA versi:
- iOS + Safari + VoiceOver versi:
- Zoom 200–400%, viewport dan orientasi:
- Bukti tanpa token atau data pribadi:

## Prosedur penerimaan
| ID | Langkah | Harapan | Hasil | Bukti |
|---|---|---|---|---|
| A11Y-01 | Tab dan Shift+Tab pada lima halaman | Fokus jelas dan urutan logis, skip link berfungsi | NOT RUN | |
| A11Y-02 | Panah, Space dan Enter di ChipGroup | Label, role dan checked state dibaca dengan benar | NOT RUN | |
| A11Y-03 | Tombol +/- dan input numerik Stepper | Batas terbaca, perubahan dan disabled state jelas | NOT RUN | |
| A11Y-04 | Buka/cancel dialog dengan Enter/Escape | Fokus tidak lolos dari modal, kembali ke pemicu | NOT RUN | |
| A11Y-05 | Masukkan tanggal/telepon/jam tidak sah | Galat terhubung ke field, tidak memesan | NOT RUN | |
| A11Y-06 | Telusuri kode rahasia dan persetujuan | Token tidak diucapkan terbuka; tidak prechecked | NOT RUN | |
| A11Y-07 | Tampilkan status PARTIAL/UNKNOWN | Status reservasi dan pembayaran terpisah | NOT RUN | |
| A11Y-08 | Uji timeout health dan booking disabled | Tombol tidak aktif dan alasan jelas | NOT RUN | |
| A11Y-09 | Zoom 200–400%, mobile portrait/landscape | Konten tidak hilang atau menimpa | NOT RUN | |
| A11Y-10 | Gunakan pembaca layar bahasa Indonesia | Nama, satuan, waktu dan galat dimengerti | NOT RUN | |

Catat per kasus route, langkah, ucapan aktual, urutan fokus, severity, screenshot tanpa PII, dan rekomendasi. Bila perlu backend, tambahkan docs/UI_BACKLOG.md dan jangan sentuh I1–I6.

**Manual acceptance NO-GO** sebelum hasil manusia didokumentasikan atau pengecualian diterima eksplisit oleh pemilik proyek. Tidak ada izin merge/deploy.
