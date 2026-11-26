# JogjaTrip — final ZIP itinerary alignment and acceptance status
Source: user-supplied `PR FINAL YANG HARUS KALIAN KERJAKAN (1).zip`, `PR/PR_ITINERARY.md`, `PR/00_URUTAN_DAN_ATURAN.md` and `patches/jogjatrip-0001-definite-error-codes.patch`.

## Required work / status
1. **Exact patch (I1)**: imported new eight documented provider error codes, with status-code pair checks and conservative unknown/503 handling. Regression verifies 400, 409, 415, 503 and unknown codes.
2. **I3/I4 saga**: journal is D1-backed with durable operation intents and per-operation idempotency keys. I4 holds all before confirming any, reverse RELEASE on definitive HOLD rejection, no blind POST retry on UNKNOWN, no auto RELEASE once confirmation has started, read-only GET reconciliation. All remote mutating methods require injected trusted server authorization; production does not inject one.
3. **Shared externalRef + consent**: journal uses canonical order ID `JT-<32 lowercase hex>` as the sole `externalRef` for all providers, ≤64 characters. Source-authenticated preparation and journal require explicit `consent:true`. Browser cannot promote a draft into a provider booking.
4. **Reservation vs payment**: `core.ts` now exposes separate `contractReservationStatus`, `contractPaymentStatus`, `contractState` pure mappers. Existing legacy status/recompute remain unchanged to avoid breaking the older API. I3 journal / I4 confirm store provider reservation and payment independently; neither implies payment from confirmation.
5. **Provider handoffs**: existing `from=wisata&destinationId=...&visitDate=...` remains. New `from=jogjastay&hotelId=...&roomId=...&checkIn=...&checkOut=...` and `from=jogjatrans&vehicleId=...&startDate=...&endDate=...` (also `vehicle` alias) validate IDs and dates, remove source parameters, use server-loaded catalogs, and never auto-book. **Caution:** the ZIP references `docs/integration-guide.md` §8 but that file is not part of the ZIP and was not found in the current JogjaTrip branch. These new handoff patterns are conservative implementation assumptions; owner confirmation of exact producer URLs remains pending.
6. **Routing and E8/E9**: NO I4 mutation route is connected to `orders.ts`, intentionally. `BOOKING_ENABLED=false` stays in the Worker until all three providers pass staging acceptance with true `durableStorage` and explicit operator permission. ZIP-referenced `docs/test-scenarios.md` E8/E9 was not available in the source tree; cannot truthfully claim those tests passed.
7. **Readiness**: existing opt-in GET capabilities/offers checker is GET-only, with sandbox allowlisting and no real credentials committed. Hotel/Transport official staging checker 26/26 each was evidenced in their GitHub Action; Wisata's W2 Turso adapter remains unverified for transaction atomicity and remote failover. Live I6 three-provider booking remains NO-GO.

## Security guardrails
- No secrets, real provider POST, production D1 migration, booking flag changes, or PR merge.
- A provider's malformed success is UNKNOWN; an unrecognized status/code is UNKNOWN. A documented `503 INTEROP_NOT_CONFIGURED` is classified as a definite rejection only when the provider explicitly emits that contract code; an unknown 503 remains UNKNOWN.
- Provider HOLD rejection triggers reverse compensation of known successful holds; uncertain HOLD cannot safely trigger blind compensation or retries.
- Existing direct/legacy bookings remain a separate compatibility path; do not equate `PAID` or `CONFIRMED` without explicit independent provider/payment evidence.

## Final exit gate (pending)
- Run unit/regression, TypeScript, Wrangler dry-run, UI/Lighthouse on this branch.
- Verify exact three inbound handoff producer URL patterns against provider-owned guide.
- Run contract E8/E9 and official checker for all three staging providers, with Wisata W2 durability, transaction rollback, and crash recovery proven. Only then consider gated I4 server execution integration and staging transaction.
