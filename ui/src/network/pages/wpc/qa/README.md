# WP-C verification

Verified on 2026-10-04 against the generic fixtures and the repository's recorded
live CC Space fixtures. No paid upstream calls, new dependencies, or contract
changes were needed.

## Automated checks

From `ui/`:

```sh
node --test
npx tsc --noEmit
npm run build
```

The suite passes 38 tests, including eight WP-C cases covering chronological
metrics, genuine zero versus missing values, zero denominators, overflow,
null-last sorting without mutation, partial valuation, validation, hash encoding,
and recent-history storage failures. No `.node` files exist in `ui/node_modules`.

## Browser checks

- Both fixture pages render without console errors or warnings. Source badges
  identify samples, and computed price change, market cap, average volume and
  turnover disclose their calculation.
- Desktop viewport: 1440 × 1000. Narrow viewport: 375 × 812. Both color schemes
  were inspected; document width stays within the viewport. Tables scroll inside
  their own focusable regions, including with ArrowRight. Sort buttons work with
  Enter and update `aria-sort`.
- Invalid IDs, including invalid shared URLs, make no party request. Filling the
  example makes no request. Enter submits a valid ID. Hash encoding, browser back,
  recent-chip lookup, five unique recent IDs, and reload persistence were checked.
- Copy produces the full party ID. A simulated clipboard rejection reveals a
  labeled read-only field whose entire value is selectable with the keyboard.
- Repeating the same ID makes one fresh request. Stopping the local sample server
  displays each page's error state; restarting it and submitting the unchanged ID
  restores results. Delayed local responses display the shared loading state.
- Synthetic empty fixtures, explicitly labeled as samples, exercise empty pool,
  holdings and activity states. Pool source notes remain visible.
- Recorded live fixtures show missing price/supply histories, TVL and USD values
  as unavailable. The portfolio displays 0 of 1 holdings valued and no estimated
  allocation. Activity expands from 20 to 40 of 100 events. Long IDs fit at 375px.

Visual QA used local-only proxies to select the existing light/dark CSS media
branches and to delay or empty responses. Clipboard failure was simulated in the
local test page because the in-app browser's clipboard bridge accepts writes even
under a restrictive Permissions-Policy. These harnesses are outside the repository;
they do not change the app, contracts, fixtures or browser/OS settings. Expected
network errors from the stopped-server exercise are separate from the clean
fixture console checks.

## Screenshots

| Page | Desktop light | 375px light | Desktop dark | 375px dark |
| --- | --- | --- | --- | --- |
| Liquidity | [View](liquidity-desktop-light.jpg) | [View](liquidity-375-light.jpg) | [View](liquidity-desktop-dark.jpg) | [View](liquidity-375-dark.jpg) |
| Portfolio | [View](portfolio-desktop-light.jpg) | [View](portfolio-375-light.jpg) | [View](portfolio-desktop-dark.jpg) | [View](portfolio-375-dark.jpg) |

Additional evidence: [live Liquidity](liquidity-recorded-live.jpg),
[live Portfolio](portfolio-recorded-live.jpg), [Liquidity loading](liquidity-loading.jpg),
[Portfolio loading](portfolio-loading.jpg), [Liquidity error](liquidity-error.jpg),
[Portfolio error](portfolio-error.jpg), [Liquidity empty](liquidity-empty.jpg),
[Portfolio empty](portfolio-empty.jpg), [copy fallback](portfolio-copy-fallback.jpg).
