# I4 — Hold-Based Saga (isolated, Contract 0.2.0)

Baseline: I3 commit `1f1f3f78b505b56684fad16682a436ad7223eb0a`, CI #117 succeeded (117/117); UI Evidence #22 succeeded. No production deployment, route change, migration, secret or provider mutation.

## Scope and safety
- Isolated `src/interop-saga.ts` coordinates an I3 D1 journal and injected I1 trusted provider clients. No public HTTP route is attached and `BOOKING_ENABLED=false` remains unchanged.
- HOLD: claim fenced lock, load immutable checkout, resolve all provider clients, persist operation intent before remote POST; use exactly the journal's idempotency key. On definitive rejection, release earlier successful holds in reverse order. On uncertain result, stop without retry and leave the order locked for explicit recovery.
- Persist *successful* holds before checking price and minimum remaining TTL; a price/TTL mismatch triggers reverse compensation. Compensation failure is UNKNOWN and never silently deemed safe.
- CONFIRM is an explicit separate call. It requires all holds to succeed, no release/unknown, matching price and adequate remaining TTL. CONFIRM successes are durable; partial confirmation is never portrayed as atomic. No payment inference, auto-release of confirmed bookings, or legacy fallback.
- RECONCILE is operator-only and requires explicit quiescence plus expired-fence recovery. Read-only provider GET can establish successful CONFIRM/RELEASE when hold ID is known. An unknown HOLD without hold ID remains unresolved for manual provider verification. Never silently replay remote mutations.
- Limitations: a remote provider is not fenced by D1. I4 does not prove remote availability, real-provider idempotency, payment, successful compensation at every provider, or distributed atomicity. A client cannot arbitrarily attest quiescence. Production readiness and independent provider contract freeze remain blocked.

## I4 acceptance gates
- Unit/integration tests with local Miniflare D1 and synthetic clients; test happy path, partial failure compensation, timeout unknown, price drift, short TTL, idempotent retry blocking, confirmation states, reconciliation, and isolated production boundary.
- Full project CI, TypeScript static checks, Wrangler dry-run, UI/Lighthouse regression must remain green.
- Keep PR draft, no production booking enablement, remote D1 migration or release. I5 frontend integration starts only after I4 passes.
