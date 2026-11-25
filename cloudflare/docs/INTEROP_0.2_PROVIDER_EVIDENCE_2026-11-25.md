# Contract 0.2 provider verification — evidence and I6 gate
**As inspected:** 2026-11-25 (repository source only; not live API verification).
**Consumer baseline:** `Sapexxx/jogjatrip-itinerary` PR #16, `e59b6b6f4e88b4298726041c6d65bc23a89aee56`.
**Outcome:** BLOCKED for authenticated multi-provider HOLD/CONFIRM staging. Do not treat the table below as a live health or deployment result.

## Source inventory (exact branch/commit)
| Service | Repository | Branch SHA inspected | Supported evidence |
|---|---|---|---|
| Hotel | [FaridAzis/jogjastay-hotel-service](https://github.com/FaridAzis/jogjastay-hotel-service) | `main@06ce52af28b45e5b01d8e93e82e7861e91787ea1` | `src/interop.mjs`, `docs/INTEROP_0.2_DRAFT.md`: Hotel acts as **Transport consumer**; does not establish Contract 0.2 hotel HOLD provider readiness |
| Transport | [FaridAzis/jogjatrans-service](https://github.com/FaridAzis/jogjatrans-service) | `main@0bfeb8b519521b97628fac91d294fd8e6e94c4ac` | `src/interop.rs` around lines 62–95 (capabilities/offers), 97–102 (hold body), 111–122 (status), 124–189 (HOLD/CONFIRM/RELEASE). Implementation **draft**, not demonstrated through authenticated staging |
| Wisata | [ANDI-BACHDAR-DD/Jogja_wista](https://github.com/ANDI-BACHDAR-DD/Jogja_wista) | `main@ebb640fe0ba5e46a2af515fe128f4d8e3099a701` | `app.py` has no Contract 0.2 `/interop`, `/holds` or `/capabilities` routes on inspected main; legacy booking API and `test_interop.py` do not prove provider HOLD |

These are **source-level findings**, not claims about hidden/private branches, Worker deployments, secrets, provider staging health or other systems not inspected.

## Transport-specific wire gaps against JogjaTrip I1
I1 canonical client is `cloudflare/src/interop.ts`. Provider draft code is `FaridAzis/jogjatrans-service/src/interop.rs`.
| Contract requirement in consumer | Provider draft evidence | Effect |
|---|---|---|
| `GET /offers` response includes `generatedAt`, offers include `period, regionId, location, priceUnit, remaining, attributes` | Provider `interop_offers` returns `{provider,offers}` (line ~95) with noncanonical vehicle fields | I1 `parseOffers` rejects; no trusted offer can be persisted |
| `POST /holds`: `offerId, quantity, customer, externalRef, consent` | Provider `InteropHoldInput` `deny_unknown_fields` lists `offer_id, external_ref, consent, customer` (line ~102) | I1's `quantity` is rejected; email supplied by I1 would also be rejected by provider customer struct |
| `POST /holds` error for invalid offer: 422 `INVALID_OFFER` | Provider at line ~141 emits 409 `INVALID_OFFER` | Reconciliation/definitive-rejection policy differs; do **not** auto-remap without signed contract |
| CONFIRM voucher `{code,note}` | Transport `interop_value` voucher exposes `bookingId,vehicleId,...` (line ~119) | I1 `parseConfirmed` refuses a successful confirm; status becomes uncertain |
| Standard `quantity` offers query | Transport expects `units=1`, `type`, `withDriver` (lines ~75–77) | Driver selection not representable in canonical I1 offers query; trusted verifier missing |
| Shared externalRef, 1 hold/provider | Provider keyed to externalRef, idempotency key and partner (lines ~108–110) | Current I2 conservative unique-provider rule is necessary |

The Transport repository also has `ops/deploy-interop-02-staging` and `ops/release-interop-02-main` branches, but branch existence is **not** proof of deployment success, credential access, or a passing authenticated Contract 0.2 response.

## Provider action owners (not modified here)
- **JogjaTrans:** align canonical offer response, signed offer evidence, accepted `quantity`/customer fields, error status, voucher, rental driver's material option; run authenticated read-only `capabilities` and `offers` evidence; demonstrate restart D1 persistence and safe HOLD/CONFIRM/RELEASE in isolated staging, with prior approval.
- **JogjaStay:** implement hotel **provider** Contract 0.2 endpoints or formally revise the agreed three-provider scope. Its Hotel-to-Transport consumer work is distinct.
- **Wisata Jogja:** implement an authenticated, durable provider HOLD state machine or explicitly remove Wisata from initial staging scope by cross-team agreement. Do not mislabel existing partner booking idempotency as 0.2 HOLD.
- **Cross-team:** freeze actual master `01_KONTRAK_INTEROP_0.2.md` including exact quantities/filters/IDs/TTL/voucher/payment semantics; provide approved per-provider repository refs and staging credentials to authorized owners only, never in PR text or chat.

## Reproducible evidence gates
1. **Source check:** examine exact provider branch/commit, route definitions, request/response schemas and persistence migration for six endpoints. Record a dated SHA. A draft branch is not a passing test.
2. **Read-only authenticated check:** in an isolated staging account (not production), use server-side secrets to GET capabilities and offers. Validate through I1's strict parser and record sanitized HTTP statuses, generatedAt, offer identity, quantity, period and option mapping; do not log raw tokens.
3. **Mutation rehearsal (only after explicit provider approval):** generate synthetic caller details and inventory; create one HOLD with a stable Idempotency-Key, verify D1 restart durability, confirm and release only in permitted states, verify GET status, timeout reconciliation, price/TTL drift and no duplicate stock.
4. **I5 source/auth:** server-owned saved-plan selection, approved total and token credentials are distinct from a browser draft. No HOLD/CONFIRM route until the trusted verifier, authenticated submission, explicit payment/confirm policy and operator recovery are reviewed.
5. **I6 readiness:** 3/3 required provider contracts (or cross-team approved reduced scope), authenticated read-only staging evidence, valid source selection, durable idempotency and authorized operator recovery. Any unknown ⇒ BLOCKED.

## Current application guards
- `BOOKING_ENABLED=false`, remote migrations unchanged. I4 `authorizeHold`, `authorizeConfirm`, `authorizeRecovery` all default deny.
- Production has **no trusted `verifySelection`**; authenticated plan preparation route returns `TRUSTED_SELECTION_VERIFIER_REQUIRED`, and frontend browser does not execute provider mutation.
- I1 parser intentionally remains strict. Do not downgrade it to accept provider-specific draft shapes until all teams approve a versioned adapter mapping.
- Local synthetic tests cannot establish real provider readiness; the decision file below is designed to prevent treating them as such.

**Decision:** I6 live transaction **NO-GO**. I6 planning, sandbox accounts, mock compatibility analysis and provider-owner handoff **GO**.

## Read-only staging verifier (explicit approval, no booking)

After each provider owner grants access to an **isolated sandbox**, use:
```bash
cd cloudflare
# Set these as private environment variables in an approved staging runner,
# not in .env committed to Git, PR comments or console history:
export INTEROP_STAGING_READONLY_ACK=APPROVED_SANDBOX_ONLY
export INTEROP_STAGING_PROVIDERS=transport
export INTEROP_STAGING_ALLOW_ORIGINS=https://transport.example.invalid
export INTEROP_STAGING_TRANSPORT_URL=https://transport.example.invalid/
export INTEROP_STAGING_TRANSPORT_TOKEN="<obtain securely from provider owner>"
export INTEROP_STAGING_START_DATE=2026-12-12
export INTEROP_STAGING_END_DATE=2026-12-14
npm run check:interop-readonly-staging
```
Replace the placeholder host with **the provider-approved sandbox origin** and use only provider-authorized test credentials. The CLI checks one or more explicitly allowlisted HTTPS origins and permits only `GET /api/v1/interop/capabilities` and `GET /api/v1/interop/offers`. It does not invoke HOLD/CONFIRM/RELEASE, write D1, reveal the token or treat URL configuration as health evidence. A failed parser remains a failed contract check, not a reason to weaken I1.

Never run this verifier using production partner credentials/origins. Do not run without explicit provider-owner staging permission. The commands above are instructions only; no live request was executed in this audit.

The synthetic, source-derived compatibility tests in `tests/interop-provider-evidence.test.mjs` reproduce the observed transport draft gaps and prove the strict I1 client rejects them safely. Those tests cannot verify current deployment state; retain the exact provider source SHA in any future evidence record.
