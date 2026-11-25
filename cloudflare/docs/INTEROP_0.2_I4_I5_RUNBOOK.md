# I4/I5 Transaction Safety — Operator Runbook (draft, non-production)

This document describes **safe observations and stopping rules** for Contract 0.2. It does not grant permission to perform remote provider mutations. It applies to the isolated D1 journal / I4 saga / I5 frontend work in draft PRs #12–#16.

## Evidence levels

1. **Local CI:** Miniflare D1, synthetic provider, browser fixtures, Wrangler dry-run. Verifies local code paths only.
2. **Provider contract validation:** independently confirmed capabilities, credentials, idempotency semantics, stable resource/room/tier/driver identities, HOLD TTL, read-only status and cancellation behavior.
3. **Staging cross-provider validation:** controlled provider sandboxes with known inventory and trained operator. NOT attempted by this PR.
4. **Production:** separate approval; no booking enabled by this PR.

## Known incomplete dependencies

- No production server-injected trusted `verifySelection`. The preparation route correctly responds `TRUSTED_SELECTION_VERIFIER_REQUIRED` and does not create a plan checkout.
- The browser's draft key is not a persisted D1 checkout and does not secure or store the caller-generated 32-byte D1 token. End-to-end browser custody is not complete.
- I4 `hold()` and `confirm()` require explicit server-injected `authorizeHold`/`authorizeConfirm` policies; production injects neither. No server-authenticated payment/confirmation policy exists. Never treat a HOLD as a payment.
- No operator-authenticated recovery route. `reconcile()` requires an injected `authorizeRecovery` callback and independently established quiescence. It does not issue mutating POSTs.
- No unconditional recovery of unknown provider state and no automatic transaction retry.
- Cart/package integration remains distinct; saved-plan-only preparation is the currently tested source.
- No CSRF/rate controls, production retention policy, or provider-side remote fence has been validated. These require staging/operational review.

## Decision table

| D1 observation | Action | Forbidden |
|---|---|---|
| NOT_STARTED | Request trusted preflight only after source authorization and price consent | Treat as booked |
| IN_FLIGHT | Inspect journal and provider reconciliation evidence; do not start another executor | POST the same mutation blindly |
| UNKNOWN | Escalate for provider-side, authenticated reconciliation | Consider a timeout a failed reservation |
| AWAITING_CONFIRMATION | Verify holds, TTL, consent, and server-side payment/confirmation authorization | Claim payment or confirmed booking |
| PARTIAL | Human review of each provider's latest verified state | Claim atomic success or auto-refund |
| COMPENSATED | Confirm remote cancellations per provider, retain evidence | Assume reversal succeeded without proof |
| CONFIRMED | Expose provider confirmation separately from payment state | Infer successful payment |

## Recovery preconditions

A qualified operator must establish (a) D1 ownership and exact checkout access control, (b) no live executor can still issue provider calls, (c) no remote mutation or retry is running, (d) exact expected D1 fence and expired lease, (e) trusted server-side operator authorization, and (f) externally verified provider status via read-only APIs. **Never accept a browser-supplied Boolean as proof of quiescence or operator identity.** If provider status is unavailable or hold ID is unknown, retain UNKNOWN and escalate. All changes should be audited.

## Price and identity invariants

The authenticated saved plan, not the browser request, is the source of items. A trusted provider verifier must validate material choices. A new checkout may be created only when fresh verified offer total equals the user's explicitly approved total. Retried requests with the same key and token must have identical customer identity and approved total. Changed requests must fail, not silently reuse an existing checkout.

## Release gate (not yet met)

Before I6 live booking, independently validate provider contracts, design a browser credential handoff, agree payment/CONFIRM policy, build authenticated operator recovery, anti-double-submit and rate controls, run provider sandbox tests and capture artifacts. Keep `BOOKING_ENABLED=false` and PRs in Draft until then.

## Additional mutation guards

The saga now defaults to refusing `hold()` and `confirm()` unless trusted callbacks `authorizeHold(orderId)` and `authorizeConfirm(orderId)` are configured and return exactly true. Synthetic unit tests inject these callbacks; they do not represent production authorization. Reconciliation separately requires `authorizeRecovery`. No Worker production route currently injects any of these capabilities. Enabling a future policy requires verifiable owner/consent and provider capability evidence for HOLD, and explicit independent confirmation/payment authorization for CONFIRM.
