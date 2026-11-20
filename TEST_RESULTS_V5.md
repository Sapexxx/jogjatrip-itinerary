# Bukti Uji JogjaTrip V5 — 20 November 2026

Perintah dieksekusi dari folder proyek:

```text
gofmt -w *.go
go vet ./...
go test -count=1 ./...
node --check web/app.js
node --check web/v2.js
node --check web/v4.js
node --check web/packages.js
node --check web/integrated.js
```

Hasil: `go vet` tidak mengembalikan error, seluruh `go test` lulus, dan seluruh pemeriksaan sintaks JavaScript berhasil. Sebanyak **19 fungsi Test** terdaftar dalam Go test runner, termasuk integrasi yang baru ditambahkan. Pengujian menggunakan `httptest`, bukan booking ke endpoint provider produksi.

Tes baru:
- `TestIntegratedRecommendationsSemantic`: pemetaan Sleman dan wilayah lain serta rekomendasi dari katalog dua provider.
- `TestIntegratedBookSyncAndProtection`: token itinerary salah ditolak; quote dua provider; checkout dua komponen; cegah checkout ulang; Hotel `declined` tersinkron; referensi booking yang telah terhubung tidak bisa dipalsukan dari editor.
- `TestIntegratedQuoteFailsBeforeBooking`: ketika kuota Wisata tidak tersedia, tidak ada permintaan booking terkirim, termasuk ke Hotel.

Smoke check server lokal di port 8097 dilakukan terhadap root (`HTTP 200`), `/api/health` (`HTTP 200`), dan `/integrated.js` (`HTTP 200`). GET rekomendasi tanpa `hotelId` mengembalikan `HTTP 400` sebagaimana kontraknya.

**Belum diuji:** UI interaktif otomatis di browser (pembatasan akses browser pengujian ke `localhost`/`file://`), booking dengan token partner asli, sinkronisasi `DECLINED` pada deployment publik, ketahanan saat server restart yang tepat di tengah request. Tidak ada klaim pembayaran nyata.
