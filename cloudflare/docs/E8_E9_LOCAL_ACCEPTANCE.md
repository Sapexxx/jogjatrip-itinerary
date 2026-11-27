# E8/E9 final local acceptance

Canonical source: `docs/test-scenarios.md`, E8/E9. Tests are in `cloudflare/tests/interop-saga.test.mjs` under "E8 acceptance HTTP+D1" and "E9 acceptance HTTP+D1". They exercise the actual consumer HTTP client, in-memory provider fixtures and Miniflare D1. No network or real inventory is used.

| Scenario | Expected evidence |
| --- | --- |
| E8 definitive rejection before third HOLD creation | Reverse RELEASE of the two known holds; two GET cancelled; rejected provider has no hold ID; all three fixture stocks restored; no CONFIRM; redacted D1 status COMPENSATED |
| E8 all three HOLDs created, final amount mismatch | Reverse RELEASE of all three, three cancelled GET snapshots, all stock restored, no CONFIRM |
| E9 lost CONFIRM reply after remote success | Client timeout, UNKNOWN in D1, no third CONFIRM, no RELEASE; operator-authorized GET only after expired lock; verified second confirmation, PARTIAL; reservations unpaid |
| E9 mismatched identity in GET | Remain UNKNOWN; no extra POST |

The canonical E8 text requests three cancelled GETs. A definite rejection before creation yields no third hold ID. The separate price-drift case provides exactly three cancelled GETs without fabricating a hold for a rejected request. The fixture price drift is a fault-injection scenario, not a claim about provider production behavior. These acceptance tests do not replace the official cross-provider staging run.

Run: `cd cloudflare && npm test`. Results must be tied to CI commit. No provider mutation route or production configuration was enabled.
