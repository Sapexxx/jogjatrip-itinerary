# Itinerary Jogja — design system

Product name: Itinerary Jogja. Editorial travel identity; use green/amber with warm neutrals. See `cloudflare/web/tokens.css` for source of truth. Normal text must have 4.5:1 contrast, large text 3:1. Amber surfaces use ink foreground. Use display serif for headings, body sans-serif for controls and text. Minimum body 14px, labels 12px, targets 44px. Phase 1 uses a compatibility stylesheet; CSS split, SVG icons and full computed contrast review remain Phase 2. Keep all provider data, disclaimers, DOM contracts and checkout safeguards.

## Phase 2

CSS is loaded from `style.css` using local imports for base, layout, components, explore/packages, itinerary, orders and accessibility. Colors use semantic design tokens; uncommon legacy gradients and surfaces use transitional `--compat-color-*` tokens to limit visual regressions, pending visual consolidation. Responsive rules use 600, 800 and 1100px. Local SVG sprite `icons.svg` provides 24x24 icons with 1.75 stroke; existing DOM and action labels remain. No external icon dependencies. Standard component aliases `.btn`, `.card`, `.field`, `.dialog`, `.toast` are available alongside legacy selectors. Full computed contrast and manual review remain outstanding.
