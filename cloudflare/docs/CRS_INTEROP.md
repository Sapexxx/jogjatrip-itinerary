# PR-0: CRS alignment (JogjaTrip Cloudflare Worker)

This branch adopts the **unchanged** `crs-vocabulary.json` version `0.1.1` from [FaridAzis/jogjatrans-service](https://github.com/FaridAzis/jogjatrans-service/blob/main/crs-vocabulary.json). Source blob SHA: `14eee633a6641d373b53e48b8dc7586cd6f24f5d`.

## What changed in 0.1.1
- Payment state is scoped by entity type: `statusMappings.paymentState.vehicleRental` (`unpaid`/`paid`, a manual staff verification at pickup, not a payment gateway) and `transportTrip` (`not_applicable`). The legacy `transport["*"]` key is kept only as an alias for trips; do not apply it to vehicle rentals.
- Two new `nonEquivalences`: rental `paid` is not an online-gateway payment, and a saved Hotel/Wisata add-on in JogjaTrans is an interest, not a booking.
- Itinerary does not read the rental `paymentState`; order status still comes from the provider `status` (see `status()` in `src/core.ts`). No runtime code change is needed.

## Scope
- `GET /api/semantic` returns the shared vocabulary.
- `regionName`, `regionSlug` and `regionConcept` resolve exact aliases; plain `Jogja` and `DIY` are *not* mapped to Kota Yogyakarta.
- `regionFromFields` rejects conflicting recognized administrative regions in hotel/destination data.
- Transport `recorded` / `contacted` now maps to aggregator `PENDING`; this step does not add booking or transport adapters.
- `npm test` tests endpoint, aliases, status mappings and conflict behavior.

## Known limitations / team decision
- The imported vocabulary is still a draft and its JSON-LD namespace uses `example.org`. The team should agree on the final namespace before submission, then apply the *same* version in all four services.
- Unknown area strings are ignored when a recognized city/region field exists; this may need stricter source-field validation once real provider payloads are reviewed.
- Existing aggregator status `COMPLETED` remains `CONFIRMED`; `EXPIRED` is currently `UNKNOWN`, pending a separate business-rule decision.
- No production deployment, partner booking, or change to JogjaTrans is included.

## PR-I1 verification
Run `node tools/check-transport-live.mjs --provider-only` before merge to verify JogjaTrans live v0.1.1 and exact vocabulary equality; after deployment use `npm run check:transport-live` for both vocabularies and all three catalogs. Tests assert entity-scoped payment mappings independently of reservation states. No production booking is created. D1 schema and runtime code remain unchanged in PR-I1.
