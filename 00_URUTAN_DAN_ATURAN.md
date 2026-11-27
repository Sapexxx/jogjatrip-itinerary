# Urutan dan aturan PR interoperabilitas

Kontrak acuan: `interop-contract.yaml` di paket ini. Aturan: bila kode berbeda dari kontrak, kode yang diubah. Usulan perubahan kontrak disampaikan ke pemilik paket sebelum kontrak dibekukan, bukan diputuskan sendiri di satu repositori.

| Urutan | PR | Repositori | Dasar patch |
| --- | --- | --- | --- |
| 1 | PR_TRANSPORTASI | `FaridAzis/jogjatrans-service` | `main` di `0bfeb8b` |
| 1 | PR_HOTEL | `FaridAzis/jogjastay-hotel-service` | `main` di `06ce52a` |
| 2 | PR_WISATA | `ANDI-BACHDAR-DD/Jogja_wista` | `main` di `ebb640f` |
| 2 | PR_ITINERARY | `Sapexxx/jogjatrip-itinerary` | cabang `feat/interop-client-0.2` di `687770c` |
| 3 | Uji silang di staging | semua | `tools/interop-contract-check.mjs` |

Kedua PR urutan 1 bisa dikerjakan bersamaan, begitu juga kedua PR urutan 2. Uji silang hanya dimulai setelah keempatnya dideploy ke staging.

Cara memakai patch: `git checkout -b interop-0.2 <dasar>` lalu `git am patches/<berkas>.patch`. Patch sudah dicoba pada commit dasar di atas dan terpasang bersih.

Yang berlaku untuk semua PR: tidak ada rahasia di repositori atau chat; semua uang simulasi; jangan mengubah fitur yang sudah berjalan; jangan menambah endpoint di luar kontrak; satu `externalRef` per pesanan lintas sistem, maksimal 64 karakter.
