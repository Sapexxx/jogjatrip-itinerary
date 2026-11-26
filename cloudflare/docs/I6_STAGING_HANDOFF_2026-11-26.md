# I6 staging handoff — evidence gates (26 November 2026)

**Canonical source:** user-supplied `PR FINAL YANG HARUS KALIAN KERJAKAN (1).zip`, `PR/PR_ITINERARY.md`. The requirement is **not** 26 passing local tests by itself: E8/E9 must pass against all three *actual approved staging providers*, and official Contract 0.2 checker plus read-only `check-interop.mjs` must show readiness with true durable storage. Existing `check-interop.mjs` currently reports BLOCKED intentionally; do not alter it merely to say PASS.

## Current snapshot, not an authorization
`docs/i6-release-evidence.json` records source refs and missing evidence. `npm run check:i6-release-evidence` currently **exits nonzero by design**. This is correct until all required gates are corroborated. Never change flags to true solely to satisfy CI. The validator is a *review checklist*, not cryptographic verification of URLs or an authenticated deployment.

| Provider | Latest checked main SHA | Evidence | Missing |
|---|---|---|---|
| Hotel | `9b5cd38db1010265225abf63ca19da46fc89835d` | Transport-owned staging checker https://github.com/FaridAzis/jogjatrans-service/actions/runs/45810713955 reports 26/26 for hotel | Independent I6 authorized read-only GET, durable evidence current deployed revision, full staging E8/E9 |
| Transport | `6018ac4e092bb16cd91363bf3a19b6a43a5efff9` | Same checker reports 26/26 for transport | Independent I6 GET and full E8/E9 |
| Wisata | `8ce4d8d83a2f7d31b8d8b7987607610e9a073315` | Unit/API+browser https://github.com/ANDI-BACHDAR-DD/Jogja_wista/actions/runs/45840584409 (104+29) | Remote transaction atomicity, fail-closed failed Turso, cross-instance HOLD replay, authorized 26/26 staging checker |

**W2 critical finding**: in the inspected `db_turso.py`, remote `LibsqlConnection.commit()` is a no-op, `rollback()` is missing, and connection errors can fall back to local SQLite. This does **not** establish that `BEGIN IMMEDIATE` / quota check / INSERT / commit is atomic across serverless instances. Probe `SELECT 1` is not a transaction test. Do not activate booking for this provider until W2 implements and demonstrates these semantics in a remote staging DB.

## Next cross-team staging evidence collection
1. Obtain *documented approval* to use isolated nonproduction sandboxes and ephemeral test inventory/identities. Each provider owner supplies sandbox URL plus secrets via authorized secret store, never PR comments or Git.
2. Freeze canonical `interop-contract.yaml` with its Git SHA; obtain exact Hotel/Transport/Wisata producer handoff examples and recover `docs/integration-guide.md` §8 and `docs/test-scenarios.md` E8/E9. The final ZIP refers to these but does not contain them. Never invent URL patterns or test expectations.
3. Use `npm run check:interop-readonly-staging` with explicit `INTEROP_STAGING_READONLY_ACK=APPROVED_SANDBOX_ONLY`, allowlisted **HTTPS sandbox origins**, per-provider tokens and synthetic future dates. It only sends GET capabilities/offers and deliberately fails on missing credentials or `holds:false` / `durableStorage:false`.
4. Run each provider owner's **official** `tools/interop-contract-check.mjs` in its approved sandbox under appropriate authorization. **Warning:** despite its default not confirming, the official checker still creates and releases HOLDs. It is not read-only. Only run after owner authorization and W2 durability is proven, never on production.
5. E8: three-provider HOLD-all with one shared externalRef, consent, verified offers and bounded TTL; sequential CONFIRM only under approved server policy. E9: one definitive failure during HOLD → reverse RELEASE (with proof), plus separate ambiguous failure → UNKNOWN/reconcile via read-only GET and **no blind repeat**. Record provider call order and redacted evidence, ensure payment is not inferred from reservation.
6. Verify 2 independent instances and cold-start replay of Wisata remote storage; simultaneous HOLD near last quota; failed DB backend cannot write local booking; valid idempotency conflict and rollback semantics. Record exact deployed SHA, timings, outcomes and safe redacted journal evidence.
7. Only then review server-owned material option verifier, user consent and total acceptance, token custody, operator recovery authority and payment/CONFIRM policy. Current Worker still fails closed and `BOOKING_ENABLED=false`. No automatic enablement from evidence manifest.

## Developer tests vs actual staging
`tests/interop-saga.test.mjs` contains synthetic three-provider rehearsals for happy HOLD/CONFIRM, definitive reverse compensation, UNKNOWN third HOLD and PARTIAL third CONFIRM. These prove algorithmic invariants in Miniflare D1 with fake providers only. **They do not count as E8/E9 passing against real staging.**

## Release
Keep PR #19 Draft (deploy branch). This PR is a documentation, test and readiness-gate hardening change only. Do not merge to `cloudflare-deploy` or run `wrangler deploy` from this work before the signed-off cross-team staging evidence is available.
