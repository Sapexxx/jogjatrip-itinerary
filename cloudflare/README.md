# JogjaTrip V5.3 — Cloudflare Workers + D1

The original Go V5.3 remains in the repository root. Cloudflare target lives under cloudflare/.

**Deployment status:** GitHub source and CI prepared; no Cloudflare production deployment is claimed. Booking is disabled by default.

## One-time Cloudflare setup

1. Open https://dash.cloudflare.com/ → Storage & databases → D1. Create a database named **jogjatrip-db**.
2. Copy the D1 database UUID. Edit **cloudflare/wrangler.jsonc** on branch **cloudflare-deploy** and replace the string **REPLACE_WITH_REAL_D1_DATABASE_ID** with your real UUID. Keep database binding **DB** and name **jogjatrip-db**.
3. In D1 Console/SQL Editor for the new database, run **cloudflare/migrations/0001_init.sql**. Confirm three tables exist: **jt_orders**, **jt_plans**, **jt_packages**. Only use this on a fresh empty database, not an existing production database.
4. Open Workers & Pages → Create application → Import a repository. Connect **Sapexxx/jogjatrip-itinerary**, production branch **cloudflare-deploy**, root directory **cloudflare**.
5. Set Worker name **jogjatrip-itinerary** (same as wrangler.jsonc), build command **npm test**, deploy command **npx wrangler deploy**. Use **npm install** if an install command is requested.
6. Confirm D1 binding **DB** to **jogjatrip-db**. Hotel/Wisata URLs are configured in wrangler.jsonc and must not include /api/v1 suffixes.
7. Keep **BOOKING_ENABLED=false**. Do not add partner tokens for initial catalog/draft checks. Never put secret tokens in GitHub source or the browser.
8. Only after Cloudflare shows successful deployment, use the actual .workers.dev URL displayed in the dashboard. Check **/api/health**, **/api/catalog/hotels**, **/api/catalog/destinations**, and itinerary create/load with D1.
9. Test the UI on desktop/mobile and check images, buttons, filters and modal dialogs.
10. Booking must stay disabled until provider APIs, durable idempotency and recovery paths have been verified and valid tokens are stored in Worker Secrets. Demo payment is not real payment.

## Repeat deployments from Antigravity

Once Cloudflare GitHub integration is configured, every push to cloudflare-deploy automatically builds and deploys without new ZIP uploads or new URLs.

From the repository folder:

    git status
    git fetch origin
    git switch cloudflare-deploy
    git pull --ff-only origin cloudflare-deploy
    cd cloudflare
    npm install
    npm test
    cd ..
    git add .
    git commit -m "Update JogjaTrip Cloudflare"
    git push origin cloudflare-deploy

Check and resolve any local changes before pull; never use force push. If the branch is not yet local, use **git switch --track origin/cloudflare-deploy** after git fetch.

## Verification and limitations

- The CI workflow checks Go unit tests and Node mock tests. Wrangler dry-run only verifies bundling, not a public deployment.
- Catalog data comes from partner APIs if reachable; availability and booking are not implied by catalog results.
- User-selected activity hours are itinerary preferences, NOT confirmed provider time slots.
- Data previously stored in local Go or Supabase is NOT automatically migrated to D1.
- Transport stays unavailable until its actual API is ready.
- Direct checkout currently lacks robust retry idempotency. Do not enable production booking.
- 502 catalog errors may indicate an upstream API issue, not necessarily a Cloudflare failure.
- D1 errors require checking the **DB** binding and remote schema.

Official docs:
https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/
https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
https://developers.cloudflare.com/d1/get-started/
