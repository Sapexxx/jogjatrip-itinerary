# Cloudflare Workers Preview — isolated configuration

## Purpose

The existing `main` Workers Builds trigger used to fail at `npx wrangler preview` because its root was `/` and `wrangler.jsonc` lacked `previews`. The preview trigger is configured in Cloudflare to run from `cloudflare`, install pinned dependencies via `npm ci`, then execute `npx wrangler preview`. These settings are separate from the `cloudflare-deploy` production trigger. The Preview feature uses the current Cloudflare Worker Previews configuration guidance.

## Isolation and fail-closed policy

- Production `d1_databases[0].database_id`: `7fa5e947-232d-4cb1-b856-4b194fe16a5b` (`jogjatrip-db`), **unchanged**.
- Preview `previews.d1_databases[0].database_id`: `64c6f73b-af78-4ea7-b127-8bdfe3fab241` (`jogjatrip-preview-db`), created exclusively for nonproduction preview; basic `0001_init.sql` schema applied to preview DB only.
- Preview `BOOKING_ENABLED=false`, `INTEROP_HOLDS=false`, `INTEROP_PREPARE_ENABLED=false`. The three provider API URLs are `https://example.invalid` intentionally to **avoid contacting real providers**. Catalog calls may be unavailable; this preview is designed for safety/configuration and navigation checks, not full end-to-end provider transactions.
- No secret copied, no production D1 migration, and no production deployment from this task.
- All previews using this configuration share the single **preview** D1 database. They do **not** share production D1; branches are not isolated from one another. Use dedicated Preview DBs for tests that require per-branch isolation.
- Worker Previews can have public URLs; do not enter personal information or secrets, or share the URL publicly until access controls are configured.

## Validation without deployment

From `cloudflare/`, run `npm ci`, `npm test`, `npm run typecheck` and `npx wrangler deploy --dry-run`. Inspect `wrangler.jsonc` before requesting a remote build. A dry-run does not prove Preview deployment or D1 connectivity. To verify the actual Preview use the existing `main` trigger after this change reaches `main`, then inspect the resulting Cloudflare build logs. **Do not** run `npm run deploy` or `wrangler d1 migrations apply ... --remote` against production.

## Release policy

`cloudflare-deploy` is an automatic production branch with `npx wrangler deploy`. Never merge a synchronization PR to it without separately satisfying I6 provider E8/E9 and W2 gates and explicitly authorizing production deployment. This Preview fix alone does not permit I6 live booking.
