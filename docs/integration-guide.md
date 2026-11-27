# Panduan integrasi Contract 0.2

Dokumen ini menjelaskan cara empat sistem (JogjaStay, JogjaTrans, Wisata Jogja, JogjaTrip) saling memesan inventori. Kontrak mesin-bacanya ada di `interop-contract.yaml` dan `json-schema/`. Semua uang adalah simulasi: setiap harga bertanda `priceType: SIMULATED`.

## 1. Prinsip

1. **Pemilik data menyimpan reservasinya.** Hotel menyimpan kamar, Transport menyimpan rental, Wisata menyimpan tiket. Sistem lain hanya menahan, mengonfirmasi, atau melepas lewat kontrak.
2. **Satu lompatan.** Sistem yang menerima hold tidak boleh memanggil penyedia lain atas nama pemesan yang sama.
3. **Itinerary bukan perantara wajib.** Add-on (Hotel meminta kendaraan, Transport meminta hotel atau tiket) berjalan langsung antar penyedia. Itinerary hanya menyusun paket multi-hari dan menjalankan saga pesanan paketnya sendiri.
4. **Gagal tertutup.** Penyedia yang tidak lolos `capabilities` disembunyikan; sistem utama tetap bisa dipakai tanpanya.

## 2. Status kode (diperiksa 25 November 2026)

| Sistem | Sisi penyedia | Sisi klien |
| --- | --- | --- |
| JogjaTrans | Ada (`src/interop.rs`), dicocokkan dengan kontrak oleh `jogjatrans-0001` | Belum (Tahap 2) |
| JogjaStay | Belum (Tahap 2) | Ada untuk Transport (`src/interop.mjs`), disesuaikan oleh `jogjastay-0001` |
| Wisata Jogja | Ada, ditambahkan oleh `wisata-0001` (`interop.py`) | Belum (Tahap 2) |
| JogjaTrip | Tidak berlaku | `I1` dan `I2` di cabang `feat/interop-client-0.2`; saga `I3` belum |

## 3. Autentikasi dan rahasia

Token pembawa (bearer) per mitra dan per penyedia, minimal 24 karakter, disimpan sebagai rahasia lingkungan, tidak pernah di repositori atau di chat.

| Sistem | Variabel |
| --- | --- |
| JogjaTrans (penyedia) | `INTEROP_PARTNER_HOTEL_TOKEN`, `INTEROP_PARTNER_WISATA_TOKEN`, `INTEROP_PARTNER_ITINERARY_TOKEN`, `INTEROP_OFFER_SIGNING_KEY` (>= 32 karakter) |
| Wisata Jogja (penyedia) | `PARTNER_KEYS=hotel:<kunci>,transport:<kunci>,itinerary:<kunci>`, `INTEROP_OFFER_SIGNING_KEY`, `INTEROP_DURABLE_STORAGE` |
| JogjaStay (klien) | `TRANSPORT_INTEROP_ENABLED=true`, `TRANSPORT_PARTNER_TOKEN`, `TRANSPORT_ORIGIN` (opsional), binding `TRANSPORT_SERVICE` |

Hold hanya bisa dibaca oleh mitra yang membuatnya; mitra lain mendapat `404`.

## 4. Semantik bersama (CRS v0.1.1)

`crs-vocabulary.json` sudah berfungsi sebagai model data bersama, jadi tidak dibuat model kedua. Aturan yang dipakai kontrak:

| Hal | Aturan |
| --- | --- |
| Wilayah | `regionId` memakai conceptId (`diy:kabupaten-sleman`). Penyedia boleh menerima bentuk lokalnya (`kabupaten-sleman`). Kendaraan rental tidak terikat wilayah: `regionId` null |
| Tanggal | lodging: `endDate` eksklusif (tanggal check-out). vehicle_rental: `endDate` inklusif, maksimal 30 hari. tourist_attraction: hanya `startDate` |
| Status | `reservationState` hold: `awaiting_payment`, `reserved`, `cancelled`, `expired`. `paymentState` mengikuti `statusMappings` CRS |
| Satuan harga | `night`, `ticket`, `day`, `trip`, `person` |
| Hold bukan reservasi | Hold menahan stok 15 menit dan menghitung sebagai stok untuk semua pemesan; reservasi baru sah setelah `confirm` |

Ontologi OWL/RDF tidak dibuat: CRS sudah memetakan konsep ke schema.org dan mendaftar `nonEquivalences`, dan tidak ada penalaran yang membutuhkan ontologi.

## 5. Proses bisnis (saga)

1. Panggil `capabilities`; bila gagal atau `holds != true`, sembunyikan panel.
2. Kumpulkan data pelanggan yang diminta `requiredCustomerFields`, dan **persetujuan** pengiriman data (`consent: true`) sebelum mengirim apa pun.
3. `GET offers`, pengguna memilih, `POST holds` dengan `Idempotency-Key` stabil dan `externalRef` yang sama untuk semua penyedia dalam satu pesanan (maks 64 karakter `[A-Za-z0-9_-]`).
4. Catat pesanan sendiri. Bila gagal, `release` semua hold. Bila berhasil, `confirm` setiap hold.
5. Respons hilang atau tidak pasti: `GET holds/{id}`, jangan membuat hold baru dan jangan membatalkan pesanan sendiri. Setelah `confirm` dimulai, hasil sebagian ditandai `PARTIAL` atau `UNKNOWN` dan direkonsiliasi, bukan dibatalkan otomatis.
6. Kunci idempotensi diturunkan dari kunci pesanan (`hold-<id>`, `confirm-<id>`, `release-<id>`) sehingga pengulangan permintaan yang sama aman.
7. Tidak ada pembatalan setelah `confirm` pada Tahap 1. `release` pada hold yang sudah dikonfirmasi adalah `409 ALREADY_CONFIRMED`.

Data pribadi: penyedia menghapus nama, email, dan telepon dari hold yang dilepas atau kedaluwarsa; hold yang dikonfirmasi menjadi catatan milik penyedia.

## 6. Kesalahan dan sikap pemanggil

| Kode | HTTP | Arti | Sikap pemanggil |
| --- | --- | --- | --- |
| `UNAUTHORIZED` | 401 | Token tidak ada atau salah | Hentikan, perbaiki konfigurasi |
| `CONSENT_REQUIRED` | 400 | `consent` bukan true | Minta persetujuan pengguna |
| `INVALID_HOLD`, `INVALID_CUSTOMER`, `INVALID_QUANTITY`, `BAD_JSON` | 400 | Isi tidak valid | Perbaiki permintaan, jangan diulang apa adanya |
| `IDEMPOTENCY_REQUIRED` | 400 | Kunci hilang atau bentuknya salah | Perbaiki |
| `INVALID_OFFER` | 422 | Penawaran tidak dikenal, kedaluwarsa, atau tidak cocok katalog | Ambil penawaran baru |
| `IDEMPOTENCY_CONFLICT` | 409 | Kunci atau `externalRef` dipakai untuk isi lain | Jangan diulang; selidiki |
| `NOT_AVAILABLE` | 409 | Stok habis | Pilih lain; lepas hold lain di pesanan yang sama |
| `HOLD_EXPIRED`, `HOLD_RELEASED`, `HOLD_NOT_ACTIVE` | 409 | Hold tidak lagi aktif | Mulai ulang dari penawaran |
| `ALREADY_CONFIRMED` | 409 | Release atas reservasi | Tidak ada tindakan; reservasi tetap sah |
| `NOT_FOUND` | 404 | Hold tidak ada atau milik mitra lain | Periksa `holdId` |
| `INTEROP_NOT_CONFIGURED` | 503 | Kunci tanda tangan atau skema belum siap | Anggap penyedia tidak tersedia |
| 5xx atau timeout | | Hasil tidak pasti | `GET holds/{id}`; jangan ulang dengan kunci baru |

## 7. Sinkronisasi

Tidak ada replikasi data antar sistem. Penawaran dibaca langsung dari penyedia dan tidak boleh disimpan lebih dari masa berlakunya (sekitar 5 menit). Status hold selalu dibaca dari penyedia lewat `GET`; kedaluwarsa dihitung saat dibaca, tanpa pekerjaan latar.

## 8. Tautan serah (handoff) ke JogjaTrip

Pola yang sudah dipakai ketiga sistem, dibakukan di `json-schema/handoff-context.schema.json`. Tidak membawa data pribadi, dan JogjaTrip memvalidasi ulang setiap nilai.

| Dari | Parameter |
| --- | --- |
| JogjaStay | `from=jogjastay`, `hotelId`, `checkIn`, `checkOut` |
| JogjaTrans | `from=jogjatrans`, `vehicleId`, `startDate`, `endDate`, `withDriver` |
| Wisata Jogja | `from=wisata`, `destinationId`, `visitDate` |

## 9. Yang belum ada dan tidak boleh dianggap ada

- Wisata di Vercel memakai SQLite di `/tmp`; `durableStorage` bernilai false sampai `DB_PATH` dipindah ke penyimpanan tetap (W2).
- JogjaStay sebagai penyedia kamar, JogjaTrans sebagai klien, dan saga `I3` Itinerary belum dibangun.
- Belum ada uji silang di staging; `tools/interop-contract-check.mjs` sudah lulus 26 pemeriksaan terhadap penyedia Wisata lokal, tetapi belum dijalankan terhadap Transport yang dideploy (tidak bisa dijalankan dari lingkungan ini).
- Kredensial bawaan Wisata (`ADMIN_TOKEN`, `ADMIN_PASSWORD`) masih nilai contoh; harus diganti lewat lingkungan sebelum deploy.
