# JogjaTrip V4 — UI/UX Unified Travel Search

## Apa yang berubah
- Beranda travel yang mengikuti preferensi desain: hero foto, filter wilayah/tanggal/durasi/jumlah tamu, kemudian **tiga kartu layanan dalam satu baris** pada desktop.
- Hotel dan Wisata dapat dipilih sendiri-sendiri atau bersamaan. Transport hanya **segera hadir**; tidak ada API, booking, mock, atau data transport.
- **Paket Unggulan** berbasis blueprint durasi + wilayah (3H2M Kota Yogyakarta–Sleman; 5H4M Kota Yogyakarta–Sleman–Bantul; 7H6M kelima wilayah DIY).
- Filter budget maksimum dan durasi; kandidat disusun dari **katalog live** Hotel, kamar, dan Wisata via backend Go yang sudah ada.
- Rincian paket berisi jadwal harian yang dapat dipratinjau *sebelum* melakukan booking. Tombol mengirim pilihan ke keranjang V3 untuk quote live; alternatifnya mengirim ke editor Itinerary, tempat pengguna dapat mengedit dan menyimpan rencana mandiri.
- Navbar menyederhanakan istilah menjadi Beranda, Paket Bundling, Pilihan Saya, Itinerary, Pesanan.

## Kepemilikan data
- Data hotel, kamar, harga, ketersediaan dan reservasi tetap milik Hotel API.
- Data destinasi, tiket, kuota, harga dan reservasi tetap milik Wisata API.
- JogjaTrip adalah pemilik itinerary, definisi curated package V3, dan status gabungan order.
- Angka pada kartu rekomendasi adalah *estimasi dari katalog*, bukan quote terjamin. Quote dan booking tetap dicek melalui API backend V3 sebelum checkout.

## Batasan jujur
- V4 menambahkan **lapisan discovery + UI** di atas mekanisme backend V3; V4 tidak mengganti saga, status sync, dan endpoint partner yang sudah ada.
- Kandidat lintas wilayah baru ditampilkan jika katalog menyediakan minimal satu destinasi untuk masing-masing wilayah dalam blueprint. Tidak ada ID provider atau harga buatan.
- Katalog bisa tidak mencantumkan harga wisata; dalam kasus itu kartu menampilkan "Cek harga live", bukan angka karangan.
- Filter budget diterapkan pada **estimasi katalog** saat tersedia, bukan biaya perjalanan lengkap (transport, konsumsi, dan pengeluaran pribadi tidak termasuk).
- Keranjang bebas V3 masih maksimal **5 item**. Untuk paket 7H6M lima wilayah yang melampaui 5 item, editor itinerary tersedia, tetapi tombol checkout gabungan dinonaktifkan. Implementasi booking penuh untuk >5 item perlu perluasan engine paket secara terpisah.
- Jam itinerary adalah rencana ilustratif; bukan jam resmi slot penyedia.
- Transport belum tersedia dan tidak masuk quote/booking.
- Foto paket unggulan menggunakan aset lokal V3; identitas hotel/wisata dan biaya dari API provider.
- Token partner hanya berada di backend; frontend tidak menyimpan kredensial provider.

## Cara menjalankan (PowerShell di Antigravity)
```powershell
$env:HOTEL_API_URL="https://jogjastay-hotel-service.jogjawisata.workers.dev"
$env:WISATA_API_URL="https://wisata-jogja-ten.vercel.app"
go run .
```
Buka http://localhost:8080. Untuk booking sungguhan, server tetap membutuhkan token partner dari tim terkait (jangan masukkan ke frontend atau commit ke repo).

## Pengujian
`gofmt -w *.go`, `go vet ./...`, `go test ./...`, serta `node --check web/{app,v2,packages,v4}.js`. Smoke test HTTP halaman dan health API telah dilakukan. Uji visual browser serta booking ke provider produksi masih diperlukan pada mesin pengguna.
