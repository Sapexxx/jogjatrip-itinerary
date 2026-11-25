# Panduan Penggunaan Itinerary Jogja

Panduan ini menjelaskan **apa yang dilakukan pengguna** dan **apa arti status yang ditampilkan** pada aplikasi. Tangkapan layar dan data konkret bergantung pada katalog provider yang berhasil diakses saat aplikasi dijalankan.

## 1. Mulai perjalanan

Buka Itinerary Jogja melalui server lokal atau URL Cloudflare yang **telah terverifikasi aktif**. Pada halaman eksplorasi, pengguna dapat memilih wilayah DIY, lama perjalanan, tanggal, jumlah wisatawan, dan preferensi anggaran. Anggaran adalah batas perencanaan, bukan jaminan seluruh layanan sesuai dengan harga tersebut.

Pilihan yang didukung pada frontend Cloudflare: Hotel, Wisata, Transportasi (rental JogjaTrans), atau kombinasinya. Tarif dan stok rental adalah simulasi akademik. Checkout produksi tetap dinonaktifkan. Versi Go lama tidak memiliki dukungan rental.

## 2. Memilih penginapan

1. Buka katalog Hotel dan pilih properti dari data JogjaStay.
2. Periksa informasi hotel, pilihan tipe kamar, tanggal check-in/check-out, dan jumlah tamu.
3. Tentukan perkiraan **jam kedatangan** sendiri. Jangan menyamakan jam tersebut dengan persetujuan check-in dari hotel.
4. Masukkan ke **Pilihan Saya** atau Itinerary.
5. Gunakan cek harga dan ketersediaan sebelum melanjutkan pemesanan, jika fitur tersebut aktif.

Harga hotel umumnya dihitung untuk periode menginap, bukan jumlah tiket wisata.

## 3. Memilih destinasi wisata

1. Pilih destinasi dari data Wisata Jogja; dapat memulai dari rekomendasi wilayah hotel.
2. Pilih tanggal kunjungan, jumlah tiket, tier tiket apabila tersedia, serta jam mulai dan selesai pilihan sendiri.
3. Satu hari dapat berisi **lebih dari satu destinasi** apabila perencanaan dan kondisi kunjungan memungkinkan.
4. Simpan sebagai agenda atau komponen Pilihan Saya.
5. Lihat quote harga/kuota ketika tersedia.

**Catatan penting:** jam kunjungan yang dipilih di Itinerary Jogja adalah *rencana pengguna*. API Wisata yang digunakan belum memberikan jaminan slot jam tertentu dalam setiap respons booking. Jika informasi jam operasional tidak tersedia dari provider, sistem tidak boleh mengarang jam buka.

## 4. Menyusun itinerary mandiri

Melalui menu **Itinerary / Integrated Trip Builder**:

1. Pilih tanggal perjalanan serta durasinya.
2. Pilih hotel dan kamar jika diperlukan; sistem dapat menyarankan wisata berdasarkan wilayah administratif yang sama.
3. Tambahkan satu atau beberapa destinasi, masing-masing dengan tanggal dan rentang waktu.
4. Tambahkan aktivitas pribadi jika diperlukan. Aktivitas manual **tidak otomatis memesan layanan**.
5. Periksa agenda harian dan konflik waktu.
6. Klik **Simpan Itinerary**. Simpan kode dan token akses yang diberikan pada perangkat pribadi.
7. Gunakan **Quote / Periksa harga & stok** untuk komponen dari provider yang belum dipesan.

Mengubah agenda setelah memiliki booking provider bukan perubahan reservasi resmi. Sistem membatasi pengubahan/penghapusan referensi layanan yang sudah dibooking agar pengguna tidak disesatkan.

## 5. Memahami paket bundling

Itinerary Jogja menyediakan contoh paket *curated* berbasis template dan inspirasi perjalanan berdasarkan durasi/tema/wilayah. Template curated yang tersimpan pada repository adalah **Jelajah Kota & Warisan Jawa** dan **Jogja Heritage Plus**, masing-masing menggunakan referensi layanan provider.

Paket bukan kepastian bahwa setiap komponen tersedia pada tanggal tertentu. Nilai diskon adalah aturan Itinerary Jogja; harga dasar Hotel dan Wisata tetap harus diverifikasi dari API. Pengguna dapat meninjau komponen, waktu, dan add-on yang didukung sebelum quote.

Beberapa rekomendasi itinerary harian dapat berisi lebih dari satu kunjungan; **dua contoh template curated bukan representasi seluruh kemungkinan paket perjalanan**.

## 6. Pilihan Saya dan pemesanan

Di menu **Pilihan Saya**, periksa setiap hotel/tiket beserta tanggal, jam rencana, jumlah, dan subtotal. Gunakan **Atur Jadwal** sebelum checkout. Perubahan tanggal atau parameter pilihan membuat quote lama tidak berlaku dan memerlukan pemeriksaan ulang.

Jika checkout aktif pada runtime yang telah diuji, pengiriman booking terjadi ke API Hotel/Wisata. Bila checkout Cloudflare masih dalam mode pratinjau (`BOOKING_ENABLED=false`), pembuatan reservasi akan ditolak secara sengaja; pengguna tetap dapat mengeksplorasi katalog dan menyimpan itinerary.

**Jangan menyamakan quote, CONFIRMED, dan pembayaran nyata.** Demonstrasi pembayaran dari provider bukan bukti dana sungguhan diterima.

## 7. Halaman Pesanan

Halaman **Pesanan Saya** digunakan untuk melihat:

| Informasi | Keterangan |
|---|---|
| Kode pesanan Itinerary Jogja | Identitas gabungan di sistem Itinerary Jogja |
| Nama hotel / destinasi | Hasil katalog jika dapat diverifikasi; jangan diisi fiktif |
| Produk / jumlah | Kamar, tamu, tier tiket, atau jumlah tiket |
| Tanggal | Check-in/out atau tanggal kunjungan |
| Jam | Preferensi perjalanan pengguna |
| Harga | Nilai historis yang tersimpan pada transaksi, bukan otomatis harga katalog hari ini |
| Kode booking provider | Referensi dari layanan Hotel atau Wisata |
| Status dan sinkronisasi | Status mentah provider, normalisasi Itinerary Jogja, waktu verifikasi, error jika tidak berhasil |

Bila provider tidak dapat diakses, jangan langsung menganggap pesanan dibatalkan ataupun berhasil. Status terakhir dan pesan kegagalan sinkronisasi perlu dibaca bersama-sama.

## 8. Arti beberapa status

| Status | Makna untuk pengguna |
|---|---|
| Draft | Baru rencana; belum ada booking provider |
| PROCESSING | Proses reservasi sedang berlangsung / status belum final |
| CONFIRMED | Reservasi provider terkonfirmasi menurut status yang dikembalikan; bukan bukti transfer dana |
| PARTIAL | Sebagian layanan terkonfirmasi, sebagian bermasalah |
| DECLINED / FAILED | Reservasi tertentu ditolak atau gagal |
| UNKNOWN | Hasil booking tidak pasti; jangan mencoba ulang tanpa pengecekan |
| CANCELLED | Pembatalan terverifikasi bila dilaporkan oleh provider |

**Apabila ada status UNKNOWN/PARTIAL, jangan menekan checkout berkali-kali**. Periksa ID booking dan status di masing-masing provider atau hubungi pengelola demonstrasi.

## 9. Perbedaan rencana dan reservasi

```text
Pilih layanan → Simpan itinerary (draft)
                         ↓
             Periksa harga & stok (quote)
                         ↓
      Booking provider (hanya bila fitur aktif dan diuji)
                         ↓
             Sinkronisasi status reservasi
```

Alur ini menunjukkan bahwa interoperabilitas bukan sekadar berpindah halaman: Itinerary Jogja berkomunikasi dengan API partner untuk membaca data dan, pada kondisi terotorisasi, membuat referensi reservasi.

[Kembali ke halaman utama](../README.md) · [Status & batasan](PROJECT_STATUS.md).

## Alur baru (feature branch redesign)

Gunakan Beranda untuk mencari tiga layanan, Paket untuk inspirasi berbasis katalog, Pilihan Saya untuk keranjang, Itinerary untuk agenda harian, dan Pesanan untuk riwayat. Pilih hari atau Semua hari; tautan `#/itinerary/hari-2` membuka tampilan lokal dan tidak membagikan isi rencana. Back/Forward browser berfungsi. Pada mobile, tekan Menu. Dalam Itinerary, isi jam sendiri, pindahkan hari atau gunakan Naik/Turun tanpa drag, dan isi waktu tempuh hanya jika diketahui. Check-out dan pengembalian adalah penanda, bukan reservasi tambahan. Estimasi per hari berasal dari katalog; harga yang tidak diketahui diberi keterangan dan booking lama tidak dihitung ulang. Periksa konflik, simpan, lalu cek harga/stok. Tiket perjalanan dapat dicetak melalui dialog browser, bukan tiket konfirmasi provider. Token akses tidak boleh dibagikan. Perubahan tampilan ini masih menunggu review/deployment.

## Handoff dari Wisata Jogja (prasyarat PR-I5)

Tautan `/?from=wisata&destinationId=101&visitDate=2026-12-10` membuka detail destinasi setelah katalog sukses. ID harus 1–15 digit positif; tanggal kalender dari hari ini sampai 365 hari berikutnya, atau tanggal bawaan bila tidak valid. Pengguna masih harus memilih jam dan menekan Tambahkan ke itinerary. Tidak menambah cart secara otomatis atau melakukan reservasi. Parameter handoff dibersihkan, parameter lainnya dipertahankan. Jika destinasi tidak ditemukan atau katalog gagal, tampilkan pesan. Tautan dari provider lain belum didukung.
