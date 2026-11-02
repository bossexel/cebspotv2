# Owner Tables & Pricing and analytics — November 3, 2026

## Scope and plan

Starting branch: `fix/reservation-schema-alignment`; starting HEAD: `7265fe0`.
The working tree was clean before this UI work.

1. Replace the compressed Tables & Pricing panel with one scrolling list and a separate publish footer.
2. Choose table columns from measured screen width and system text size; retain price/capacity drafts when rotating or changing online policies.
3. Add venue-scoped analytics using the reservation and live-table data already loaded by the owner dashboard.
4. Check synthetic phone/tablet interactions, existing owner guards, typecheck, local Android export and admin export.

The later payment rollout independently verified owner-confirmed hosted inventory,
replaced the test-mode financial handlers, and passed user-assisted Android payment
and owner check-in. See [the payment rollout record](reservation-payment-rollout-2026-11-03.md).
This owner UI/analytics change remains a local preview; no Android update was published.

## Changes

- `app/owner-dashboard.tsx`: one virtualized vertical list holds the price, search, wrapping filters and table cards. The publish button stays outside the list. Phone cards are full width; wider screens gain columns only when cards have sufficient space. Large text reduces the column count.
- `src/features/owner-dashboard/styles.ts`: natural-height price/header sections, larger touch targets, readable table labels, wrapping controls and a separated publish footer. The old layout combined competing flex regions, a nested horizontal filter scroller and a minimum two-column grid on narrow phones.
- `src/features/owner-dashboard/OwnerAnalytics.tsx` and `analytics.ts`: 7/30-day summary, bookings chart, attendance outcomes, popular tables and live table states, with refresh and unavailable/empty states. The previous Overview displayed hardcoded growth percentages; these were removed. Recent reservations are labelled as recent records rather than an unimplemented next-24-hours filter.

Existing account/access checks, owner-scoped service calls, pending-operation guards, confirmation dialogs, inventory publication and inventory-confirmation RPC remain in place. No SQL, configuration, payment handler, photo-processing code or hosted data was changed.

## Analytics definitions and limits

- The selected period ends today in Cebu time (UTC+8). Booking counts/chart use scheduled visit dates; future visits are outside that retrospective period. All booking outcomes appear in the breakdown, including cancelled/no-show records.
- Guests booked excludes cancelled/no-show bookings. Attendance is checked-in/completed divided by checked-in/completed/no-show; no recorded outcomes displays an em dash rather than a guessed percentage.
- Paid reservation fees use each booking's saved PHP fee and `paid_at` date. They exclude pending payments, refunds awaiting review/approved/completed, unresolved financial records and invalid amounts. Zero-fee paid records are retained. Paid records without a usable payment timestamp are explicitly excluded and disclosed.
- These figures summarize **loaded reservation records**, as stated in the UI. The existing service performs an ordered venue query; its results remain subject to the backend's row limit. This is not a complete financial ledger, payout report, provider reconciliation or total venue sales. Before relying on analytics for venues exceeding the Data API row limit, add separately tested pagination or a scoped server aggregate.
- Rows are scoped again to the current venue and deduplicated. Names, contact details and payment references are not displayed in the analytics. Live table counts come from existing availability data; failure/loading is not presented as zero occupancy.

## Validation

See command evidence under `tests/remediation/evidence/commands/owner-ui-2026-11-03-*.json` and screenshots/results under `tests/owner-dashboard/evidence/tables-pricing-2026-11-03/`.

The full Node suite runs one test file at a time on this Windows host. Its captured-schema tests use the existing local `.codex-tmp/reservation-catalog-20261102.json` metadata fixture, with synthetic records in isolated databases; no new hosted capture or hosted write was performed. Expo exports use `EXPO_NO_DOTENV=1` and stay under `.codex-tmp/`.

For the browser harness, use the temporary esbuild setup documented in [owner-dashboard-compatibility.md](owner-dashboard-compatibility.md), then run `node tests/owner-dashboard/tables-pricing.cjs`. The existing suite runs with `node tests/owner-dashboard/browser.cjs`; isolate its landscape case with `--device=vivo-y29-landscape`. Unit checks run with `node --test tests/refactoring/owner-analytics.test.cjs tests/refactoring/dashboard.test.cjs tests/backend/owner-reservation-settings.test.cjs`.

The new UI harness renders the actual React Native components through React Native Web using synthetic services. Every URL is intercepted or aborted. It is a local Android-layout simulation, not a customer/owner browser release or real-device validation. It covers 320/360/430 phone widths, phone landscape, 800/1280 tablet orientations and 1.4x system text on phone/tablet. Tests cover price focus/editing, non-overlapping headers, safe footer geometry, card/control widths, capacity editing, search/empty filters, draft retention across rotation, cancel versus publish, protected owner confirmation and venue-scoped analytics.

Initial fixture failures and the existing browser-suite timing failure are preserved in command evidence; they are not omitted from the validation record. The existing `tests/owner-dashboard/browser.cjs` assertions were retained. Its fixed 500 ms failure response could finish before a pending-state assertion on a slow run: the full run failed once and the same landscape case passed in isolation unchanged. The fixture now explicitly holds its response until after the pending-state assertions, then releases the same failure. This strengthens the pending guard check without relaxing assertions. The readiness check uses the same controlled response. The harness also exports its bundler, supports selecting an existing device for isolation, exposes simulated font scale to the real layout hook and models settings publication/confirmation in memory.

The new publish fixture initially lacked the schema-capability property `reservation_inventory_verified_at`, so the app correctly skipped the protected confirmation RPC and the test timed out. The fixture now includes that property and selects the existing club fixture before editing. Assertions still require exactly one publish, exactly one protected confirmation and the persisted synthetic fee/capacity.

### Executed results

| Check | Result | Command evidence |
| --- | --- | --- |
| TypeScript | Passed | [typecheck](../tests/remediation/evidence/commands/owner-ui-2026-11-03-typecheck.json) |
| Focused analytics/model/owner settings tests | 20 passed, 0 failed | [focused](../tests/remediation/evidence/commands/owner-ui-2026-11-03-focused.json) |
| Full Node suite, sequential | **532 passed, 0 failed, 5 skipped; 537 total** (previous baseline: 527/0/5) | [full](../tests/remediation/evidence/commands/owner-ui-2026-11-03-full.json) |
| New Tables & Pricing/analytics UI matrix | 8/8 passed, including analytics refresh and live-status failure/recovery | [visual](../tests/remediation/evidence/commands/owner-ui-2026-11-03-visual.json) |
| Existing owner/guest UI matrix | 9/9 passed after deterministic mock-response correction | [existing matrix](../tests/remediation/evidence/commands/owner-ui-2026-11-03-existing-browser-controlled-full.json) |
| Local Android export | Passed | [Android](../tests/remediation/evidence/commands/owner-ui-2026-11-03-android.json) |
| Local admin-only web export | Passed | [admin](../tests/remediation/evidence/commands/owner-ui-2026-11-03-admin.json) |
| Patch/evidence/local export secret-pattern scan | 152 files scanned, 0 matches; 106 export artifact hashes recorded | [scan](../tests/remediation/evidence/commands/owner-ui-2026-11-03-artifact-scan.json) |

The five additional full-suite passes are the five tests in `tests/refactoring/owner-analytics.test.cjs`. No migration, manifest-count assertion, existing product assertion or skip condition was modified. This patch's only modified existing test file is `tests/owner-dashboard/browser.cjs`, for the fixture/bundler/isolation changes described above.

Preview synthetic [phone pricing](../tests/owner-dashboard/evidence/tables-pricing-2026-11-03/phone-pricing.png), [phone table controls](../tests/owner-dashboard/evidence/tables-pricing-2026-11-03/phone-table.png), [tablet layout](../tests/owner-dashboard/evidence/tables-pricing-2026-11-03/tablet-table.png) and [tablet analytics](../tests/owner-dashboard/evidence/tables-pricing-2026-11-03/tablet-analytics.png). These contain synthetic records, not a customer's venue data.

## Release and next acceptance

This work is local and is not published to Expo or deployed. No dependency or native module changed. Before publishing a matching Android update, test an actual owner account on a phone and tablet: system keyboard/decimal entry, rotation, large text, scrolling all configured tables, failed refresh/retry, cancel/publish confirmation and reload persistence. Verify reported owner inventory confirmation independently in the authorized booking rollout.

Keep payment mode test-only. Complete the separately reviewed financial-handler rollout and then a real Android customer booking → test checkout → webhook/confirmation → owner attendance flow, including cancellation and failed-payment recovery. A passing local export or synthetic UI test does not establish those hosted flows.
