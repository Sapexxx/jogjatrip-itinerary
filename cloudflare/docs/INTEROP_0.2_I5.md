# I4/I5 Hardening — Verified Boundaries and Pending Gates

## Verified baseline
- I3: CI #117, 117/117 local tests; UI #22 passed.
- I4: draft PR #13, CI #1, 129/129 local D1 + mock-provider tests passed.
- I5 frontend: draft PR #14, CI #4, 131/131 tests and UI/Lighthouse #24 passed.
- Do not equate those checks with real-provider booking, payment, migration, or production readiness.

## Implemented in draft PR #15
1. `src/interop-gateway.ts`: read-only projection of the I3 D1 journal with no customer, secret, raw offer, pricing, voucher, operation idempotency key or hold ID in output. Projection preserves UNKNOWN/PARTIAL; `paymentVerified:false`, `bookingsAtomic:false`.
2. `GET /api/interop/checkouts/:id`: exact 32-hex JT ID and 64-hex `X-Interop-Token` authorization through the D1 journal. Requires `INTEROP_HOLDS=true`. `Cache-Control:no-store`, no provider calls, no mutation.
3. I5 manual browser read-only lookup, one-use token entered explicitly and cleared from input; never stored, put in URL, or accepted as proof of payment.
4. `src/interop-plan-preparation.ts`: injectable, PLAN-only preparation service. Requires authorized saved plan token, atomic plan mutex, immutable source selection, unique providers, I2 capabilities/offer preflight and *trusted server-injected material selection verification*. It obtains expected totals from verified offers, not the request body. Only then creates the I3 D1 checkout with a caller-generated 32-byte token and idempotency key. Repeat key/token can recover the original checkout ID after a lost response. It does NOT perform provider HOLD, CONFIRM, RELEASE or payment.
5. `POST /api/interop/itineraries/:id/prepare`: explicitly gated by `INTEROP_HOLDS=true`. The production Worker supplies **no trusted selection verifier**; therefore this route fails closed (`TRUSTED_SELECTION_VERIFIER_REQUIRED`) and does not create a checkout. Test-only dependency injection demonstrates authorized preparation using a synthetic provider.
6. Full local Miniflare tests verify wrong/missing tokens, absent feature flag, no mutation, D1 outcomes, source owner authentication, safe lock release, protected replay and refusal without selection verifier.

## Rules before any real mutation
- Do NOT enable `BOOKING_ENABLED`, install a production D1 migration, or connect the HTTP route to I4 saga until external providers explicitly establish accepted room/tier/rental identity, durable holds, TTL, idempotency, status lookup and auth.
- Cart and package direct sources remain unintegrated for Contract 0.2; they must become server-authorized sources or explicitly convert into saved, authenticated plans. Do not trust browser-origin IDs, quoted totals or display-only attributes.
- The browser draft does not yet generate/securely deliver the caller-owned 32-byte access token for real reservation submission. Until this custody and response-loss recovery is designed, no live checkout button may be enabled.
- I4 CONFIRM must be gated by explicit server-trusted payment/confirmation policy. The existing isolated saga does not prove payment and must not be exposed as a public route.
- Quiescence, recovery, provider reconciliation, partial confirmations, stuck plan locks, and administrator access require an authenticated operational runbook and independent testing; provider-side remote calls are not fenced by D1.
- Set retention, logging/redaction, CSRF/rate limits and anti-double-submit policies before launch. Keep legacy routes untouched and production `BOOKING_ENABLED=false`.

## Stage decisions
I3: local verified. I4: local mock verified, operational and live-provider verification pending. I5: local frontend and authenticated read/preparation boundary verified, complete trusted transaction execution pending. I6: staging environment preparation may proceed, but DO NOT execute cross-provider booking or call I4/I5 production-ready until upstream contracts/verifiers and safety policies are validated.
