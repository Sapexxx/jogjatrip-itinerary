# Itinerary Jogja — kontrak DOM frontend

Baseline produksi: `f9643592b860163fa26b93225397d66e3d299edf` (`cloudflare-deploy`). Scope: `cloudflare/web/`; Go tetap arsip. Inventaris statis; selector dinamis harus ditinjau manual.

## ID HTML (83)
`allSmartPackages`, `bookBtn`, `cartCount`, `cartItems`, `cartTotal`, `catalog`, `catalogNotice`, `closeDialog`, `customerEmail`, `customerName`, `customerPhone`, `detailContent`, `detailDialog`, `explore`, `exploreRentCategory`, `exploreRentDriver`, `exploreRentEnd`, `exploreRentMoreButton`, `exploreRentSearch`, `exploreRentStart`, `exploreRentType`, `exploreRentalFilters`, `exploreRentalMore`, `exploreRentalNotice`, `findBtn`, `guests`, `heroPlan`, `integratedBuilder`, `itemCount`, `journey`, `lookupBtn`, `lookupId`, `lookupResult`, `lookupToken`, `nights`, `openTransportPlanner`, `orderList`, `orders`, `packageAddOns`, `packageBookBtn`, `packageCards`, `packageEmail`, `packageExplanation`, `packageGuests`, `packageHeading`, `packageName`, `packagePhone`, `packageQuoteBtn`, `packageQuoteResult`, `packageSchedule`, `packageStart`, `packageWorkspace`, `packages`, `planActivities`, `planAdd`, `planAnalyze`, `planCount`, `planEnd`, `planImport`, `planInfo`, `planNew`, `planSave`, `planStart`, `planTitle`, `planWarnings`, `planner`, `quoteBtn`, `region`, `summaryDesc`, `summaryItems`, `syncBtn`, `toast`, `tripDate`, `v4AllPackages`, `v4Budget`, `v4Duration`, `v4FeaturedCards`, `v4FeaturedDetail`, `v4TransportCard`, `v4TransportSummary`, `v4UseHotel`, `v4UseTransport`, `v4UseWisata`

## Referensi script per file

### app.js
- ID references: `#addItem`, `#bookBtn`, `#cartCount`, `#cartItems`, `#cartTotal`, `#catalog`, `#catalogNotice`, `#closeDialog`, `#customerEmail`, `#customerName`, `#customerPhone`, `#detailContent`, `#detailDialog`, `#exploreRentCategory`, `#exploreRentDriver`, `#exploreRentEnd`, `#exploreRentMoreButton`, `#exploreRentSearch`, `#exploreRentStart`, `#exploreRentType`, `#exploreRentalFilters`, `#exploreRentalMore`, `#exploreRentalNotice`, `#findBtn`, `#guests`, `#heroPlan`, `#itemCount`, `#lookupBtn`, `#lookupId`, `#lookupResult`, `#lookupToken`, `#mDate`, `#mEndTime`, `#mGuests`, `#mIn`, `#mOut`, `#mQty`, `#mRoom`, `#mStartTime`, `#mTier`, `#nights`, `#orderList`, `#quoteBtn`, `#region`, `#summaryDesc`, `#summaryItems`, `#toast`, `#tripDate`, `#v4UseTransport`
- Rendered IDs: `addItem`, `mDate`, `mEndTime`, `mGuests`, `mIn`, `mOut`, `mQty`, `mRoom`, `mStartTime`, `mTier`
- Data attributes: `data-edit-schedule`, `data-order`, `data-page`, `data-remove`, `data-tab`, `data-view`
- Selectors: `#addItem`, `#bookBtn`, `#cartCount`, `#cartItems`, `#cartTotal`, `#catalog`, `#catalogNotice`, `#closeDialog`, `#customerEmail`, `#customerName`, `#customerPhone`, `#detailContent`, `#detailDialog`, `#exploreRentCategory`, `#exploreRentDriver`, `#exploreRentEnd`, `#exploreRentMoreButton`, `#exploreRentSearch`, `#exploreRentStart`, `#exploreRentType`, `#exploreRentalFilters`, `#exploreRentalMore`, `#exploreRentalNotice`, `#findBtn`, `#guests`, `#heroPlan`, `#itemCount`, `#lookupBtn`, `#lookupId`, `#lookupResult`, `#lookupToken`, `#mDate`, `#mEndTime`, `#mGuests`, `#mIn`, `#mOut`, `#mQty`, `#mRoom`, `#mStartTime`, `#mTier`, `#nights`, `#orderList`, `#quoteBtn`, `#region`, `#summaryDesc`, `#summaryItems`, `#toast`, `#tripDate`, `#v4UseTransport`, `.navlink`, `.page`, `[data-edit-schedule]`, `[data-order]`, `[data-page]`, `[data-remove]`, `[data-tab]`, `[data-view]`

### v2.js
- ID references: `#lookupId`, `#lookupResult`, `#lookupToken`, `#orders`, `#planActivities`, `#planAdd`, `#planAnalyze`, `#planCount`, `#planEnd`, `#planImport`, `#planInfo`, `#planNew`, `#planSave`, `#planStart`, `#planTitle`, `#planWarnings`, `#region`, `#syncBtn`, `#tripDate`
- Rendered IDs: (none matched)
- Data attributes: `data-activity`, `data-field`, `data-plan-remove`
- Selectors: `#lookupId`, `#lookupResult`, `#lookupToken`, `#orders`, `#planActivities`, `#planAdd`, `#planAnalyze`, `#planCount`, `#planEnd`, `#planImport`, `#planInfo`, `#planNew`, `#planSave`, `#planStart`, `#planTitle`, `#planWarnings`, `#region`, `#syncBtn`, `#tripDate`, `[data-activity]`, `[data-field]`, `[data-plan-remove]`

### packages.js
- ID references: (none matched)
- Rendered IDs: `planFromPackage`
- Data attributes: `data-addon`, `data-pkg`, `data-pkg-end`, `data-pkg-start`
- Selectors: `[data-pkg]`, `input`, `input[data-addon]:checked`

### v4.js
- ID references: `allSmartPackages`, `guests`, `planEnd`, `planStart`, `planTitle`, `region`, `v4AllPackages`, `v4Budget`, `v4Duration`, `v4FeaturedCards`, `v4FeaturedDetail`, `v4ToCart`, `v4ToPlan`, `v4UseHotel`, `v4UseTransport`, `v4UseWisata`
- Rendered IDs: `v4ToCart`, `v4ToPlan`
- Data attributes: `data-v4-date`, `data-v4-end`, `data-v4-package`, `data-v4-service`, `data-v4-start`, `data-v4-theme`
- Selectors: `#explore .section-top`, `[data-v4-date]`, `[data-v4-end]`, `[data-v4-package]`, `[data-v4-service]`, `[data-v4-start]`, `[data-v4-theme]`

### integrated.js
- ID references: `#lookupId`, `#lookupToken`, `#planEnd`, `#planInfo`, `#planStart`, `#planTitle`, `#region`, `ibBook`, `ibBudget`, `ibCustomer`, `ibDate`, `ibDays`, `ibEmail`, `ibHint`, `ibHotelOptions`, `ibName`, `ibNights`, `ibPeople`, `ibPhone`, `ibQuote`, `ibQuoteResult`, `ibReloadVehicles`, `ibSave`, `ibSelected`, `ibSync`, `ibTitle`, `ibTransportOptions`, `ibWisataOptions`, `integratedBuilder`, `v4TransportSummary`, `v4UseTransport`
- Rendered IDs: `ibBook`, `ibBudget`, `ibCustomer`, `ibDate`, `ibDays`, `ibEmail`, `ibHint`, `ibHotelOptions`, `ibName`, `ibNights`, `ibPeople`, `ibPhone`, `ibQuote`, `ibQuoteResult`, `ibReloadVehicles`, `ibRentCategory`, `ibRentDriver`, `ibRentEnd`, `ibRentStart`, `ibRentType`, `ibSave`, `ibSelected`, `ibSync`, `ibTitle`, `ibTransportOptions`, `ibWisataOptions`
- Data attributes: `data-cancel`, `data-ib-edit`, `data-ib-hotel`, `data-ib-index`, `data-ib-remove`, `data-ib-room`, `data-ib-tab`, `data-ib-vehicle`, `data-ib-wisata`, `data-transport-change`, `data-transport-remove`
- Selectors: `#explore .section-top`, `#lookupId`, `#lookupToken`, `#planEnd`, `#planInfo`, `#planStart`, `#planTitle`, `#region`, `.jt-schedule-error`, `[data-cancel]`, `[data-ib-edit]`, `[data-ib-hotel]`, `[data-ib-index]`, `[data-ib-tab]`, `[data-ib-vehicle]`, `[data-ib-wisata]`, `[data-transport-change]`, `[data-transport-remove]`, `form`

### orders.js
- ID references: (none matched)
- Rendered IDs: `jdCreatePlan`, `jdJourney`, `jdRefresh`
- Data attributes: `data-jd-copy`, `data-jd-order`
- Selectors: `[data-jd-copy]`, `[data-jd-order]`

### cloudflare-status.js
- ID references: (none matched)
- Rendered IDs: (none matched)
- Data attributes: (none matched)
- Selectors: (none matched)

## Guardrails
Preserve existing IDs, data attributes, selectors, API paths, storage keys, escaping and event behavior. Preserve three providers and disabled production checkout. Do not copy Cloudflare frontend blindly to Go; rental is unsupported on Go.

## Phase 3 navigation contract

`page(name, day=null)` remains the public JS entry point. `data-page` stays on the five native nav anchors and existing CTAs. `jtRouteHash`, `jtParseRoute` and `jtActiveRoute` contain only public page/day navigation. `#mainNav` and `#mobileNavToggle` implement mobile disclosure. `#ibDayNav`, `#ibDayNotice`, `data-ib-day`, `data-ib-day-link` and `#ibDayHeadingN` select a local day without changing activity data. `#/itinerary/hari-N` supports 1–16; unavailable days display a notice and all currently available days. The route is not a public share of saved plan contents; no token, ID or personal data is placed in the URL. Existing cart, package and order side effects remain.

## Phase 4 timeline

Existing `#ibDays`, day navigation, `data-ib-edit`, `#ibSelected`, booking and quote IDs are preserved. `#ibTripMeta`, `#ibEstimate`, `#ibTicket`, `#ibManual`, `#ibAnalyze`, `#ibCopy`, `#ibPrint`, `data-ib-move`, `data-ib-order`, `data-ib-travel` and `data-ib-add-day` are frontend-only. Return/check-out cards are projections, never additional booking items. Reordering preserves clock values; move-day changes provider dates only for unbooked items. Optional travel minutes use the existing notes field; no new API schema or secret storage. Estimates use available catalog prices only, and exclude already-booked services; final quote remains provider-owned. Public hash is navigation only.


## Lampiran UX V4-safe, Tahap A
Elemen di `index.html` tetap menjadi sumber nilai asli bagi script lama. Komponen enhanced tidak boleh menghapus/merename `id`, `name`, atau `data-*` yang telah dipakai. `integrated.js` dimuat sebagai classic `defer` script. Untuk durasi `ibNights` dan `nights`, hanya gunakan nilai opsi sebenarnya (1, 2, 4, 6). Untuk jumlah wisatawan `ibPeople`, batas lokal 1–20 bukan `maxQuantity` provider.


## UX Controls V4 safe (di atas struktur DOM lama)

Semua `id` asli tetap ada di DOM; JavaScript klasik tetap dimuat dalam urutan:
`date-utils.js`, `controls.js`, `journey-ux.js`, `ux-summary.js`, `ux-dialog.js`, `ux-status.js`, lalu `app.js` dan script lainnya.

Kontrol progresif:
- `ibPeople`/`packageGuests`: `Stepper` dengan sumber `input[type=number]`.
- `ibNights`/`nights`: `ChipGroup` yang mempertahankan nilai option 1, 2, 4, 6.
- `guests` dan dropdown kecil lain: `ChipGroup` tanpa memanipulasi nilai provider.
- `customerPhone`/`packagePhone`/`ibPhone`: `type=tel`, `inputmode=tel`, `autocomplete=tel`.

Event: user memilih nilai baru pada komponen -> elemen lama menerima `input` dan `change`. Sinkronisasi nilai prefill dari kode lama memakai `window.JTUXControls.sync(id)` tanpa membuat event `change` palsu. Hook ditambahkan pada `integratedOpenTransport` dan `jtApplyPartnerHandoff`; penambahan handoff baru tetap tidak dilakukan.
