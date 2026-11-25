# I5 — Contract 0.2 Frontend Preparation

Baseline I4 PR #13, CI 129/129 PASS. I5 adds browser-only checkout reference preview to the cart and integrated itinerary.

- Draft manager hashes a canonical selection/quote, generates a random idempotency key once, reuses it on refresh, and regenerates it on draft changes. Only key, hash, scope and local state are stored; never customer details, provider credentials or raw selections.
- Panels block unavailable quote, duplicate provider, more than three external services, and missing saved-plan identifier. Draft is never a booking.
- No new backend booking route, no I4 invocation, no production D1 migration, no payment assumptions, no provider API POST.
- BOOKING_ENABLED remains false. Real server-authorized source, trusted I2 preflight, D1 token persistence, state polling, saga endpoints and cross-provider staging remain prerequisites before any production checkout.
- Frontend local status is not evidence of provider confirmation. UNKNOWN/PARTIAL requires server verification.
- I5 checks: unit/UI regressions, TypeScript, Wrangler dry-run, visual/Lighthouse evidence.
