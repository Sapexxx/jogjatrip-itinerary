# PR-0: CRS alignment (JogjaTrip Cloudflare Worker)

This branch adopts the **unchanged** `crs-vocabulary.json` version `0.1.0` from [FaridAzis/jogjatrans-service](https://github.com/FaridAzis/jogjatrans-service/blob/main/crs-vocabulary.json). Source blob SHA: `def1557e9651943202d35778216a90101357f4c0`.

## Scope
- `GET /api/semantic` returns the shared vocabulary.
- `regionName`, `regionSlug` and `regionConcept` resolve exact aliases; plain `Jogja` and `DIY` are *not* mapped to Kota Yogyakarta.
- `regionFromFields` rejects conflicting recognized administrative regions in hotel/destination data.
- Transport `recorded` / `contacted` now maps to aggregator `PENDING`; this step does not add booking or transport adapters.
- `node --test tests/*.test.mjs` tests endpoint, aliases, status mappings and conflict behavior.

## Known limitations / team decision
- The imported vocabulary is still a draft and its JSON-LD namespace uses `example.org`. The team should agree on the final namespace before submission, then apply the *same* version in all four services.
- Unknown area strings are ignored when a recognized city/region field exists; this may need stricter source-field validation once real provider payloads are reviewed.
- Existing aggregator status `COMPLETED` remains `CONFIRMED`; `EXPIRED` is currently `UNKNOWN`, pending a separate business-rule decision.
- No production deployment, partner booking, or change to JogjaTrans is included.
