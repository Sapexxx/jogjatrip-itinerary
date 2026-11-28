# I6 and PR #25: evidence-first release decision (28 November 2026)

**Decision: NO-GO for PR #25 merge and production deployment.** PR #25 is a review-only Draft. Merging into `cloudflare-deploy` triggers production `npx wrangler deploy`; do not merge as a method of staging validation.

## Phase 1 — Preview smoke test (PASS, read-only)

- Target: `https://main-jogjatrip-itinerary.azzahraghania110.workers.dev`; build from PR #24's merge `main@b269f1b2e53d032ab3bb4b97796aa2bccb157fe5`.
- The Cloudflare browser-run Playwright remote script performed **GET** only: `/api/health` returned HTTP **200**, `Content-Type: application/json`, `service=JogjaTrip`, `status=ok`, `storage=cloudflare-d1`, `bookingEnabled=false`, `interopPreparationEnabled=false`. Also `GET /api/semantic` and `GET /` returned 200.
- `providers.hotel/wisata/transport=true` denotes configured provider URL strings, **not verified provider connectivity**. Preview URLs use intentionally invalid `example.invalid`; no real provider access, HOLD, CONFIRM, RELEASE, payment or credentials tested.
- The preview D1 binding is isolated from production. The smoke test is runtime/read-only evidence, **not I6 staging acceptance**.

## Phase 2 — PR #25 review (candidate reconciled, kept Draft)

- Head refreshed to `main@b269f1b2e53d032ab3bb4b97796aa2bccb157fe5`; target branch `cloudflare-deploy` is unchanged.
- GitHub validation Worker/Go, visual and Lighthouse, and local read-only interop workflow: PASS for candidate. Local fixture results cannot satisfy official Contract 0.2 provider staging.
- Release includes the entire I1–I6 implementation, UX V4, additive D1 migration and preview fix, not only a frontend patch.
- `.github/workflows/i6-release-gate.yml` validates canonical source hash and release evidence. The I6 evidence step **deliberately fails** until verified provider evidence is present. A nonzero gate is the correct result while BLOCKED. This workflow does not remotely mutate providers or production.

## Phase 3 — Production schema read-only audit

Cloudflare D1 API `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'jt_%' ORDER BY name` was executed against both approved JogjaTrip D1 databases (SELECT only).

| Database | Existing application tables | `0002_interop_holds.sql` tables |
| --- | --- | --- |
| `jogjatrip-db` (production) | `jt_orders`, `jt_packages`, `jt_plans` | `jt_checkout_requests`, `jt_order_locks`, `jt_interop_operations` **ABSENT** |
| `jogjatrip-preview-db` (preview) | `jt_orders`, `jt_packages`, `jt_plans` | **ABSENT** |

Do not apply production D1 migrations until a separately approved backup, dry-run migration plan, retention/rollback strategy, and release window are recorded. The migration is additive but its safety cannot be inferred from source alone.

## Phase 4 — I6 provider source reconnaissance (not staging authorization)

Public GitHub `main` SHAs inspected on 28 November 2026:

| Provider | Public repository | Newest observed `main` | Required next proof |
| --- | --- | --- | --- |
| Hotel | `FaridAzis/jogjastay-hotel-service` | `82b8a2e459943c5bb7ffaf56c2fcafa9c6eef71f` | Approved sandbox URL, exact deployed SHA, authenticated Contract 0.2 checker, durable HOLD and E8/E9 |
| Transport | `FaridAzis/jogjatrans-service` | `ac4db8a87631ccd2af8a2d7c8c91710645ddc98a` | Approved sandbox, official checker, signed offers, authenticated read-only proof, durable HOLD and E8/E9 |
| Wisata | `ANDI-BACHDAR-DD/Jogja_wista` | `8d53f74743c2c714a36c788f28f72edbe7ae46ac` | Remote W2 atomicity, no fallback, two-instance/cold-start persistence and authenticated Contract 0.2 checker |

**Unresolved W2, confirmed at source level:** `db_turso.py` still defines `LibsqlConnection.commit(): pass` (per-call autocommit), lacks a proven rollback mechanism, and in `connect()` logs a fallback to local SQLite on Turso connection errors. This does **not** establish atomic remote quota checking + hold insertion across serverless instances. It cannot be dismissed because local unit tests pass. Do not use live Wisata inventory.

The checked-in `cloudflare/docs/i6-release-evidence.json` has `status=BLOCKED` and required booleans false. Its provider references are a **historical 26 Nov snapshot**, not the observed live deployed SHAs.

## Phase 5 — Release unblock checklist

1. Obtain written provider-owner authorization and **isolated staging origins/credentials via a secret store**. Do not put secrets in GitHub issues/PRs. Never run official checker on production.
2. Check exact canonical Contract 0.2 and producer handoff examples; run per-provider **authenticated read-only** capabilities and offers parser against the approved sandbox (see `I6_STAGING_HANDOFF_2026-11-26.md`).
3. Fix Wisata remote W2 transaction semantics with no local fallback during remote failure, then prove simultaneous last-unit HOLD, persisted idempotency, cold restart and cross-instance GET in staging.
4. Only after authorization, run provider-owned official checker (it **mutates test HOLDs**), then cross-provider E8 safe pre-confirm failure/reverse RELEASE and E9 partial CONFIRM/UNKNOWN reconciliation with redacted evidence.
5. Verify consent, operator authorization, payment policy and material selection. Capture signed-off evidence and update the manifest only when independently corroborated.
6. Plan and approve production D1 schema migration and backup/rollback, then separately approve release deployment. **Do not enable BOOKING_ENABLED as part of merely deploying UX.**

**Holding policy:** Until all gates above are proven, PR #25 remains Draft. The Workflow's failed I6 gate is an intentional safety signal, not an invitation to disable it. GitHub branch protection must require this check for fail-safe merge enforcement; if that setting is unavailable to automation, maintainers must enforce it manually.
