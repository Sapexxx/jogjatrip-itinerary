# JogjaTrip Contract 0.2 — local acceptance and release handoff

## Scope and decision

Local implementation steps 01–06 only. No authorization for actual provider mutations or deployment. Canonical source: 20-file archive jogjatrip-interop-itinerary.zip, manifest docs/interop-source-manifest.json; contract blob 69459891fbc8dce073bc804f982a20149e857094. Keep canonical bytes unchanged.

## Traceability

| Step | Implementation and evidence |
| --- | --- |
| 01 Source | tools/check-source-manifest.mjs; all 20 canonical files |
| 02 Client | interop.ts; tools/check-consumer-schemas.test.mjs; seven official schemas |
| 03 Adapter and handoff | interop-adapter.ts, interop-selection.ts; inbound-handoff and selection tests |
| 04 Saga | interop-journal.ts, interop-saga.ts; E8_E9_LOCAL_ACCEPTANCE.md; four HTTP+D1 acceptance cases |
| 05 Consent | interop-checkout.js, interop-plan-preparation.ts, index.ts; I5_FRONTEND_CONSENT.md |
| 05 Token and bridge | interop-checkout-bridge.ts; I5_TOKEN_AND_SAGA_BRIDGE.md |
| 06 Integrated acceptance | interop-final-acceptance.test.mjs; browser logic, actual Worker handler, independent provider availability, local D1, internal saga, redacted status |

Verified baseline d620707b8cd7bc9bd709ae8494896e10a134bf50: 194/194 Worker and 4/4 schema groups; Go, TypeScript, dry-run, visual and Lighthouse success (runs 45978543898 and 45978543912). Integrated acceptance introduced at 9708dcea912a99f5e507218e1b3b8770011ab4d7. Final CI must be checked at the current commit, not inferred from baseline.

## Local reproduction

From repository root with Node 22 and Go matching go.mod:

```sh
node tools/check-source-manifest.mjs
(cd tools && npm ci && node --experimental-strip-types --test check-consumer-schemas.test.mjs)
(cd cloudflare && npm ci && npm test && npm run typecheck)
go vet ./...
go test -count=1 ./...
(cd cloudflare && npx wrangler deploy --dry-run --outdir /tmp/jogjatrip-local-build)
```

Targeted acceptance from cloudflare: node --experimental-strip-types --test tests/interop-final-acceptance.test.mjs tests/interop-saga.test.mjs

All provider calls in acceptance are fixtures; Miniflare D1 is disposable local storage. Browser logic runs in Node, not an actual browser click-through. UI evidence workflow separately covers visual regression and Lighthouse. No remote migrations, real credentials, real inventory or deployment.

## Architecture and safety boundary

Saved plan + quote → explicit consent and approved total → original checkout key and separately saved 256-bit token → Worker authenticated prepare → independent material selection GET → immutable D1 snapshot and source lock → internal saga (HOLD all, then separately authorized CONFIRM) → redacted journal status. Lost response → original key/token GET recovery; uncertain mutations → UNKNOWN and operator-authorized reconciliation, not blind retry.

| Mode | INTEROP_HOLDS | INTEROP_PREPARE_ENABLED | BOOKING_ENABLED |
| --- | --- | --- | --- |
| Checked-in production | absent | absent | false |
| Future approved prepare-only sandbox | true | true | false |
| Private fixture saga bridge | true | not required | true only in injected fixture environment |

Never set the public Worker booking flag true just to test the bridge: legacy routes also use it. Bridge is intentionally not imported by public routes. Plan-only preparation; cart remains draft-only. Wisata plus tier is blocked pending provider support. Lost token cannot be reconstructed; operator intervention required for lost credentials or unresolved locks. No real payment or atomic multi-provider commit claimed.

## Stage 07–08 handoff

See I6_STAGING_HANDOFF_2026-11-26.md and i6-release-evidence.json. Historical provider reports are not current deployed evidence. Obtain owner-approved isolated origins, exact canonical SHA approval, authenticated capabilities/offers, durable transactional storage (Wisata W2), official checker and actual E8/E9 staging evidence. Official checker creates/releases HOLDs even without --confirm; never run on production. Use only dummy inventory and authorized ephemeral credentials. Record provider revision, CI run, redacted journal and stock evidence. Keep transactionReadiness BLOCKED until independently corroborated. Do not change evidence flags merely to pass tests.

Consolidate a single review PR into main only after local acceptance and final CI. Existing release PR #19 remains draft and does not contain latest work. No merge/deploy from this acceptance step.
