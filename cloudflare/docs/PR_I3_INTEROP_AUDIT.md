# PR-I3: audit interoperabilitas baca-saja (PR-5)

Synced with production base `a4596678b0f8d149f73ab5211d7d0df8a42fd43b` (redesign phases 0–6). No runtime, D1, CRS or production setting changes.

Run `node cloudflare/tools/check-interop.mjs` from repository root (Node.js 22+) or GitHub Actions workflow PR-5 read-only interoperability audit. JSON and Markdown evidence retained for 30 days.

## Interpretation

- PASS: actual live GET and validated response. FAIL: required probe failed; workflow exits nonzero. SKIP: explicitly excluded, never PASS.
- All eight primary routes must be attempted; #2 uses the implemented rentals integration and #6 the implemented Wisata transport integration. #8 compares full CRS v0.1.1 vocabulary of all four services.
- S6 is an obsolete legacy requirement, not a Contract 0.2 capability test. Previous audit (24 Nov 2026, run 45397045812) returned HTTP 404. The upstream PR_ITINERARY (2).md explicitly requests SKIP or revised expectations because legacy PAID simulation and W2 persistence do not meet its PENDING/durableStorage=true expectation. This exclusion does not assert Wisata is ready. Keep S6 in report with reason and no request. Do not substitute a fabricated capability response or count it as PASS.
- S8 still verifies bookingEnabled=false. All other required live probes remain strict. Separate `transactionReadiness.status=BLOCKED` records the unverified master Contract 0.2, authenticated provider capability/hold and staging requirements. The read-only audit can pass its scoped gates without authorizing transaction checkout.
- Provider dependency: W2 durable storage and Contract 0.2 provider endpoints; obtain exact master contract approval, consent, shared externalRef behavior, staging tokens and hold/confirm/release tests before claiming transaction interoperability. No POST requests or provider mutations in this audit.

## I0 prerequisite status (25 November 2026)

Master contract from intero.rar is draft for freeze 26 Nov; six endpoint definitions are authoritative proposal, not final team approval. JogjaTrans draft differs in quantity/period/remaining/location/generatedAt/voucher.code/error codes, and one externalRef per partner; Hotel is consumer in Stage 1 (provider Stage 2), Wisata requires W2. Do not stack runtime Contract 0.2 changes on unmerged PR #6 or missing I5. The original I5 handoff patch has not been found; PR_ITINERARY (2).md documents precise behavior and tests. Reconstruct only in separate prerequisite PR after audit; no booking or automatic addition. Cloudflare production remains BOOKING_ENABLED=false. No production secrets, database, provider repositories modified.
