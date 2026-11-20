# JogjaTrip V5.3 — Booking Management Dashboard

## Perubahan

- Halaman **Pesanan Saya** sekarang memperlihatkan nama hotel/destinasi, foto, wilayah, tipe kamar/tiket, tanggal, jumlah tamu/tiket, jam rencana, harga per komponen, dan kode reservasi penyedia jika data tersedia.
- Kode booking dari provider disertai tombol salin; tampilan rinci menyertakan status canonical, status mentah penyedia, `lastCheckedAt`, dan `syncError`.
- Ringkasan menunjukkan status agregat, jumlah komponen terkonfirmasi, total terkonfirmasi, dan waktu sinkronisasi terakhir.
- Halaman tetap bisa dibaca untuk **pesanan lama**. Identitas layanan dicocokkan memakai ID hotel/kamar/destinasi yang sudah disimpan dengan katalog live dari API Hotel/Wisata, tanpa mengubah harga asli order.
- Endpoint baru `GET /api/orders/{id}/details` membutuhkan `X-Order-Token`, melakukan refresh status dari provider dan enrichment katalog secara best-effort; tidak mengungkap token.
- Bila katalog/provider offline, nama tidak ditebak; detail tetap menampilkan tanggal, harga historis, referensi booking, status terakhir, serta peringatan.
- Tombol sinkronisasi dan riwayat browser menggunakan dashboard yang sama. Fitur dan rute V5.2 tetap tersedia.

## Source of truth

- Nama/foto: hasil katalog Hotel/Wisata yang berhasil dibaca saat melihat pesanan (bukan jaminan snapshot historis).
- Harga: nilai yang tersimpan pada transaksi; tidak diganti dengan harga katalog hari ini.
- Status: diperiksa melalui API booking masing-masing provider; jika offline, `syncError` muncul, tanpa membuat status baru yang palsu.
- Jam: preferensi itinerary dari pengguna, bukan slot yang dikonfirmasi provider.

## Yang belum tersedia

- Receipt atau bukti pembayaran komersial; pembayaran hanya simulasi akademik.
- Proses pembatalan/reschedule otomatis dan penerbitan tiket PDF asli.
- Foto/nama untuk booking lama ketika provider sedang offline, jika identitas tersebut tidak pernah disimpan pada saat booking.
- Pengujian end-to-end menggunakan token partner produksi; tes lokal memakai `httptest`.

## Pengujian

`gofmt`, `go vet ./...`, `go test -count=1 ./...`, sintaks JS melalui `node --check`, dan smoke test HTTP lokal.

## Menjalankan di Antigravity

```powershell
$env:HOTEL_API_URL="https://jogjastay-hotel-service.jogjawisata.workers.dev"
$env:WISATA_API_URL="https://wisata-jogja-ten.vercel.app"
go run .
```

Buka `http://localhost:8080` > **Pesanan**. Gunakan pesanan yang tersimpan pada browser atau masukkan ID dan token pesanan. Token partner (jika dipakai) hanya disimpan pada environment backend.
