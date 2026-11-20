# JogjaTrip V5.2 — Jadwal personal di setiap jalur booking

## Apa yang diperbaiki
- Dialog katalog Hotel/Wisata meminta **tanggal** dan **jam mulai–selesai** pilihan traveler, termasuk untuk satu item saja.
- Halaman **Pilihan Saya** menampilkan jam, menyediakan **Atur jadwal** setiap item, dan membatalkan quote lama setiap kali tanggal/jam diubah.
- Data `Item` mendapat `plannedStartTime`/`plannedEndTime` (HH:MM). Keduanya dikirim ke backend JogjaTrip, disimpan pada order, ditampilkan kembali, tetapi **tidak** dikirim ke Hotel/Wisata karena kontrak partner tidak mendukung slot waktu tiket.
- Pilihan itinerary mandiri dan pratinjau paket rekomendasi mempertahankan jam ketika ditransfer ke `sourceItem`, order, dan itinerary.
- Paket terkurasi memiliki input waktu per komponen/add-on eksternal sebelum quote, kemudian diteruskan melalui `PackageRequest.schedules` ke order dan aktivitas yang dihasilkan.
- Form itinerary lama menyelaraskan perubahan tanggal/jam dengan `sourceItem` apabila belum dipesan. Aktivitas terkait booking tidak boleh diubah dari editor.

## Batasan yang harus diketahui
- Waktu adalah **preferensi agenda perjalanan**, bukan slot yang terjamin dalam sistem tiket Wisata. Provider memvalidasi tanggal/kuota dan harga. Periksa jam buka/tutup pada provider jika tersedia.
- Tidak ada pemesanan jam tiket, reschedule jam pada provider, atau transportasi palsu.
- Checkout dan penyimpanan telah diuji terhadap `httptest`/mock. Token partner dan transaksi pada deployment produksi belum diuji.
- Order dan paket lama tanpa field jam tetap dapat dibaca untuk kompatibilitas.

## Perintah validasi
```bash
gofmt -w *.go
go vet ./...
go test -count=1 ./...
node --check web/app.js
node --check web/v2.js
node --check web/packages.js
node --check web/v4.js
node --check web/integrated.js
go run .
```
