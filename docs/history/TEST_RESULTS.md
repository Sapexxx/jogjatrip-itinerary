# Local verification — JogjaTrip V3 Bundling

Executed in Go 1.23.2 environment (19 November 2026):

- `gofmt -w *.go` — completed
- `go vet ./...` — passed
- `go test ./...` — passed
- `go test -race ./...` — passed before final source tests, repeatable locally
- `node --check web/app.js`, `web/v2.js`, `web/packages.js` — passed
- HTTP smoke: `/api/health`, `/api/packages`, `/api/packages/jogja-klasik` — 200 OK when running `go run .`

Automated httptest scenarios include: mock confirmed package booking, conditional percentage discount, initial decline with NOT_ATTEMPTED remainder, provider timeout UNKNOWN and no automatic retry, optional add-on failed without failing required package, invalid dependency, invalid service kind, temporal mismatch, stable idempotency keys, legacy order access, 403 without order token, itinerary creation, post-booking Hotel DECLINED sync and discount reversal.

**Not verified:** full production reservation using Hotel/Wisata partner tokens, actual Hotel cancel contract response, confirmed partner privileges, availability of the optional `plus` ticket tier, concurrent multiinstance Supabase consistency, background reconciliation with browser closed, payment settlement.

`data/packages` contains provider references from supplied Hotel seed and Wisata public catalog; no hardcoded prices. A public catalog reference does not guarantee bookability for a requested date.
