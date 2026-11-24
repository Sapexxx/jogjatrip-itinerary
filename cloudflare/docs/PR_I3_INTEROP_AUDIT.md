# PR-I3: audit interoperabilitas baca-saja (PR-5)

Run `node cloudflare/tools/check-interop.mjs` from the repository root (Node.js 22+), or run the GitHub Actions workflow `PR-5 read-only interoperability audit`. The workflow produces `result.json` and `summary.md` as evidence retained for 30 days.

## Interpretation

- PASS: a live GET returned a successful, validated response.
- FAIL: a required endpoint/contract did not pass. The audit exits nonzero; a failed live audit is evidence, not a successful integration. The independent report integrity step and artifact upload must succeed even when an upstream provider fails.
- SKIP: the route is intentionally not tested. #2 Stay → Transport uses a context handoff design, not the old nonexistent transport-options endpoint; #6 Wisata → Transport awaits W4. Revisit these exclusions after the provider changes and validate UI links separately. Neither is a PASS.
- #8 requires all four complete vocabularies to equal the committed CRS v0.1.1, not merely have matching version labels. S7 separately verifies the JogjaTrip–JogjaTrans pair.
- S1–S8 are supplemental contracts, reported separately from the eight main routes. S6 is a capabilities probe, not a booking attempt.
- The audit never sends mutations, includes no credentials, and preserves the production booking flag. Results do not prove booking, persistence across restarts, UI handoff, or full interoperability.

The old branch is brought forward onto the TypeScript + CRS v0.1.1 production base; no runtime or D1 schema change.
