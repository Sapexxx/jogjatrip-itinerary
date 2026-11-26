# Itinerary Jogja — design system

Product name: Itinerary Jogja. Editorial travel identity; use green/amber with warm neutrals. See `cloudflare/web/tokens.css` for source of truth. Normal text must have 4.5:1 contrast, large text 3:1. Amber surfaces use ink foreground. Use display serif for headings, body sans-serif for controls and text. Minimum body 14px, labels 12px, targets 44px. Phase 1 uses a compatibility stylesheet; CSS split, SVG icons and full computed contrast review remain Phase 2. Keep all provider data, disclaimers, DOM contracts and checkout safeguards.

## Phase 2

CSS is loaded from `style.css` using local imports for base, layout, components, explore/packages, itinerary, orders and accessibility. Colors use semantic design tokens; uncommon legacy gradients and surfaces use transitional `--compat-color-*` tokens to limit visual regressions, pending visual consolidation. Responsive rules use 600, 800 and 1100px. Local SVG sprite `icons.svg` provides 24x24 icons with 1.75 stroke; existing DOM and action labels remain. No external icon dependencies. Standard component aliases `.btn`, `.card`, `.field`, `.dialog`, `.toast` are available alongside legacy selectors. Full computed contrast and manual review remain outstanding.

### Phase 2 responsive correction

The first successful browser capture detected a 58px document overflow on the empty planner at 375px. The split stylesheet initially loaded layout media queries before component and page defaults. Layout now loads after those defaults; planner tracks use minmax(0, ...) and narrow cart actions wrap. Browser CI must fail on document overflow, missing local styles or SVG, runtime errors, or incorrect planner grid. It also captures a populated mock cart at all four viewports. These are automated fixture checks, not a manual WCAG or Lighthouse certification.

## Final audit rules

Use the semantic tokens for new components; transitional compatibility colors remain only for legacy surfaces. Contrast script covers declared pairs; Lighthouse evaluates visible rendered content on five mobile routes, with accessibility and best-practices >= 95 and CLS < 0.1. Automated checks do not certify full WCAG compliance. Static images declare dimensions and alt text; preload existing hero JPG, use fixed aspect ratios and lazy-loading for secondary images. Keep an honest disclaimer and status text alongside icons. No dark mode in this scope.

### CLS correction

The first Lighthouse audit passed accessibility/best-practices on every route but home CLS was 0.102 and packages CLS 0.389. Initial route bootstrap prevents wrong-page flash, font-display optional avoids late swaps, and package first-row space is reserved while API data loads. No audit thresholds are relaxed. Results must be verified on the corrected commit.

The next audit exposed a router selector regression and a 0.507 CLS on the itinerary route (manual editor displaced by injected builder). Fixed the collection selector, moved initial builder structure into static HTML, reserved space for loading hotel content, corrected heading levels, and made console errors an explicit Lighthouse failure. Browser and Lighthouse gates must pass on the new head.

### Empty-state CLS correction

Commit 26926568 passed 49 tests, 60 browser assertions, all 36 screenshots, and 21 token contrasts. Lighthouse accessibility and best practices reached 100 on all five routes; order lookup CLS was still 0.145 (cart 0.084). Initial history and cart now contain the exact final empty state in static HTML, reserve a minimum block size, and avoid replacing identical DOM content. No change to audit limits or fixture data. Verify on the new head before merge.
