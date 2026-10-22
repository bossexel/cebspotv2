# Owner dashboard navigation and device layout

The tab delay came from rendering complete reservation, payment, review, and table histories inside one vertical `ScrollView`. Selecting Reservations mounted every expanded card, including its contact details, payment fields, and action icons. Tab selection uses local state; it does not need another backend request.

`app/owner-dashboard.tsx` now uses the phone header and horizontal tabs at every screen width. The header and tabs sit above the scrolling content. The tablet sidebar and its layout branch have been removed. Wide screens use the same component tree, centered with a maximum content width of 1040 logical pixels.

The four growing sections use `FlatList`, with small initial batches and a limited render window. Overview and Spot Profile retain their normal scrolling content. Review drafts stay outside individual virtualized cells. Reservation actions, payment verification, table settings, and exact guest arrival times retain their existing behavior.

Tabs and table capacity controls have 48-pixel touch targets. The selected tab scrolls into view when selected or resized. Insets apply on every edge, the header allows a two-line greeting, and detail/table layouts wrap on narrow screens. Native and web accessibility expose the selected tab.

Repeated refresh taps share one in-flight load. Pending loads are invalidated when the owner session changes or the screen unmounts. A refresh error preserves the last loaded venue and records, shows a retry message, and leaves navigation available. Initial-load errors offer Retry. A confirmed missing venue assignment still clears the dashboard.

## Validation

`tests/owner-dashboard/browser.cjs` bundles the actual screen with isolated service fixtures: 300 reservations, 300 reviews, and 100 physical tables. All browser requests are intercepted; these checks do not access accounts, create payments, or change a database.

The matrix uses representative logical viewport sizes, rather than physical panel pixel counts. Android display-size settings can change the available logical width.

| Reference | Logical viewport | Text scale |
| --- | --- | --- |
| vivo Y29 portrait | 360 × 804 | 1.0 |
| vivo Y29 landscape | 804 × 360 | 1.0 |
| Xiaomi Pad 5 portrait | 800 × 1280 | 1.0 |
| Xiaomi Pad 5 landscape | 1280 × 800 | 1.0 |
| Narrow window | 320 × 700 | 1.0 |
| vivo Y29 enlarged text | 360 × 804 | 1.4 |
| Xiaomi Pad 5 enlarged text | 800 × 1280 | 1.4 |

Assertions cover all six tabs, bounded mounting of history cards, content staying within horizontal bounds, touch-target height, editing capacity, navigation without extra requests, duplicate-refresh prevention, refresh failure/recovery, cancellation across owner sessions, visible navigation while scrolling, and selection surviving rotation of the same mounted screen. Screenshots and timing reports are written under `.codex-tmp/owner-dashboard-compatibility/`.

All seven browser cases passed. TypeScript and 33 focused reservation, checkout, owner settings, and branding checks passed. Comparative runs at the phone portrait size measured the following; variation reflects host load:

| Tab | Previous screen | Updated screen |
| --- | ---: | ---: |
| Reservations | 7262 ms | 303–420 ms |
| Payments | 3599 ms | 155–735 ms |
| Reviews | 3232 ms | 169–285 ms |
| Tables & Pricing | 1609 ms | 77–293 ms |

Run with a temporary esbuild installation and the existing Playwright dependency:

```powershell
npm.cmd install --prefix .codex-tmp/owner-dashboard-validation --no-audit --no-fund esbuild@0.28.2
$env:ESBUILD_TEST_PATH = Join-Path (Get-Location) '.codex-tmp/owner-dashboard-validation/node_modules/esbuild'
node --max-old-space-size=1024 tests/owner-dashboard/browser.cjs
```

Chrome defaults to `C:/Program Files/Google/Chrome/Application/chrome.exe`; `CHROME_PATH` can override it. The optional `--baseline` comparison requires the local, pre-change snapshot `.codex-tmp/owner-dashboard-before-navbar.tsx`.

Browser CPU throttling is set to 4× slowdown. Timings measure click dispatch through two animation frames and are diagnostic measurements, not native-device performance guarantees. No Android devices were connected during validation. Native keyboard behavior, system font rendering, gesture navigation, and actual device frame timing still require an installed build on the vivo Y29 and Xiaomi Pad 5.

The rendering approach follows React Native's [FlatList documentation](https://reactnative.dev/docs/flatlist) and [list configuration guidance](https://reactnative.dev/docs/optimizing-flatlist-configuration). This is an application UI change and requires an app release or compatible update; no Supabase function deployment or database migration is required for this patch.
