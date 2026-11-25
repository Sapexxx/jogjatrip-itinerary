# Itinerary Jogja — UI backlog

- Phase 0: manual review of screenshot artifacts and actual browser layout, baseline Lighthouse and keyboard walkthrough still needed.
- Phase 1: contrast, typography minimums, label associations, focus, ARIA and intrinsic image dimensions.
- Phase 2: consolidate tokens, CSS responsibilities, SVG icons and breakpoints.
- Phase 3: hash navigation; retain separate Pilihan Saya entry until user explicitly wants to remove it.
- Phase 4: daily timeline, conflicts, hotel/rental boundaries, agenda, cost breakdown, print. Public links must not contain tokens or private data.
- Phase 5: editorial home, packages, catalogue, orders and footer. Preserve provider-sourced images; no new internet photo downloads.
- Phase 6: browser verification, Lighthouse, documentation and regression checks.
- Assets required: hero-landscape.webp and fallback hero-landscape.jpg (16:9, >=1600x900, ideally Prambanan/Yogyakarta landscape); six distinct package landscape photos (3:2, >=1200x800, themes culture/nature/coast/city; owner-provided licensed files).
- Interoperability: last independently observed 15/16 tests, S6 Wisata capabilities outstanding; redesign cannot alter that result or enable booking.

- Phase 3 decision: retain Pilihan Saya as a separate entry so existing cart/quote flow remains intact. Mobile uses an accessible disclosure (five native links), not a duplicate bottom bar. Phase 4 will refine the existing day selection into the new timeline; public hash links navigate local itinerary views only.
