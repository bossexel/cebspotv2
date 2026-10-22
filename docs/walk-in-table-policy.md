# Table reservation lock/release

Tables & Pricing now has a direct **Online reservations** toggle for each table, beside its maximum guest controls. On means **Released · Reservations allowed**; off means **Locked · Walk-ins only**. The toggle saves immediately through the authorized policy API and changes its displayed state only after server confirmation. There is no separate policy dialog. Pending saves disable the toggle; errors preserve its saved value. Existing holds, bookings, visits, and cleaning prevent changes. Operational service availability remains separate.

Saving the toggle does not publish reservation pricing or capacity changes. Unsaved price, capacity, service availability, and newly added table edits survive the policy save and live inventory refresh. Settings publication and other policy changes wait while a toggle save is pending. The dedicated Walk-ins tab and seating controls have been removed; owners manage online access through Tables & Pricing. Guest table choices show **Walk-ins only** as unavailable, including during availability refreshes. This simpler UI uses the same migration and APIs; removing the section requires no additional backend migration.

Completing a checked-in reservation still moves its table to cleaning. **Mark ready after cleaning** now appears on that table in Tables & Pricing, with an inline confirmation identifying the table. Cancellation or a rejected request preserves the cleaning state. Readiness changes only after backend confirmation and does not release a walk-in-only policy for online bookings. Completion messages point to Tables & Pricing. The section also provides **Refresh live tables** with loading and error feedback, so owners can retry availability checks without a separate Walk-ins section.

The existing code had check-in/no-show support, but no walk-in visit records or cleaning lifecycle. The backend visit schema and RPCs from the earlier implementation remain for compatibility and data preservation; seating and completing walk-ins are no longer exposed in the owner dashboard. The lock/release toggle does not record visits or payments. Existing reservation arrival times and payment fees remain unchanged. Online reservations keep their existing date/slot contract. Checked-in visits and cleaning block the physical table across all slots and dates until completion and readiness.

## Persistence and migration

Apply `supabase/migrations/20261011000100_table_booking_policy_and_walk_ins.sql` after the existing schema, reservation locking, owner-access, payment, attendance, and authorization migrations. Release the database change before the app update. The app fails closed if the new availability API is missing.

- `spots.table_inventory[*].bookingPolicy`: `online_and_walk_ins` (default for existing entries) or `walk_in_only`. Copies of one physical table use one policy. Older clients that omit the field preserve its saved value. No pricing columns are added or changed.
- `walk_in_visits`: separate owner-authorized visits, immediately `checked_in`, then `completed`. A partial unique index allows one active walk-in per physical table.
- `venue_table_states`: physical `free`, `occupied`, or `cleaning` state. Availability combines this with reservation holds, due bookings, and the existing manual unavailable flag. Existing checked-in reservations are recognized without rewriting them.
- Reservation insert/update and inventory triggers enforce policy and occupancy even for direct REST requests. Active bookings, holds, checked-in visits, and cleaning prevent a policy change or table removal. Existing bookings are preserved.
- The existing insert-boundary trigger uses `SECURITY DEFINER` with a fixed search path so its venue row lock works under guest RLS; guests retain no venue UPDATE permission. Its existing authoritative fee/status rules remain intact.
- Pending PayMongo holds keep the existing five-minute expiry. Availability ignores only explicitly expired PayMongo holds, never a hold with a missing provider. Checkout availability and new inserts release expired reservations and expire their pending payment records.
- The migration adds table states to the existing `supabase_realtime` publication. Spot updates carry policy changes; table-state updates notify both owner and guest screens. Screens also refresh every 30 seconds; the owner refreshes on app resume. Server validation remains authoritative if realtime is delayed.

## APIs

| RPC | Input | Result / behavior |
| --- | --- | --- |
| `get_venue_table_availability` | `target_spot_id`, optional `target_reservation_date`, optional `target_slot_id` | Table ID, capacity, policy, operational state, online availability, policy lock. Owner responses also include active walk-in ID and party size. |
| `owner_set_table_booking_policy` | `target_spot_id`, `target_table_id`, `booking_policy_input` | Saved spot; refuses changes while the table is not clear. |
| `owner_seat_walk_in` | `target_spot_id`, `target_table_id`, `party_size_input` | Checked-in visit; atomically verifies current free state and capacity, then occupies the table. |
| `owner_complete_walk_in` | `target_visit_id` | Completed visit; table moves to cleaning. |
| `owner_complete_reservation_visit` | `target_reservation_id` | Completes a checked-in online reservation; table moves to cleaning. |
| `owner_mark_table_ready` | `target_spot_id`, `target_table_id` | Moves a cleaning table to free; refuses an active visit. Policy and outstanding bookings still apply. |

Existing `get_reserved_table_ids` and `check_reservation_slot_available` signatures remain intact and now exclude walk-in-only and occupied/cleaning tables. Reservation creation remains the existing authenticated INSERT service. Rejections refresh guest availability before another attempt; provider checkout starts only after a reservation is successfully created.

Owner RPCs require the authenticated profile to have role `owner` and either own the spot or have `owner_spot_access`. Direct client writes to visits and runtime states are denied. All seating, policy edits, and online booking writes acquire the same venue row lock. The second simultaneous request rechecks committed state after waiting; no optimistic UI transition precedes server success.

## Validation and reproduction

Validation completed on October 11, 2026:

- `npm run typecheck`: passed.
- After removing the Walk-ins section, the focused owner settings and table-policy/backend suites passed: 34 passed, 5 multi-session cases skipped, no failures (39 total). No SQL or service API changes were needed for this removal.
- Earlier full backend validation: `node --test tests/backend/*.test.cjs` had 137 passed, 5 multi-session cases skipped, no failures (142 total), including draft-preservation checks for the simpler toggle.
- Earlier real PostgreSQL integration run: all 24 passed, including those five multi-session races. This database run was not repeated for the UI-only section removal.
- Owner/guest browser harness after the section removal: all nine viewport/theme cases passed with 4x CPU slowdown, covering six-tab navigation, lock/release saves, guest exclusion, readiness in Tables & Pricing, and live-table refresh error/recovery.
- `git diff --check` on changed tracked files: passed.

`npm run typecheck` and the backend tests check policy persistence, old-client writes, guest INSERT rejection, stale availability, owner authorization, fitting parties, both policies, held/due/occupied/cleaning exclusions, completion/readiness, fees, payment expiry, and response validation. Payment handler tests continue using isolated provider fixtures.

```powershell
npm.cmd run typecheck
npm.cmd run test:walk-ins
node --test tests/backend/*.test.cjs
```

The default SQL integration tests use PGlite. Five multi-session tests require real PostgreSQL; PGlite alone cannot prove concurrent row locking. The optional Windows harness starts a fresh local cluster bound to `127.0.0.1`, uses separate connections, verifies the losing request is waiting on a PostgreSQL lock, commits the winner, and verifies rejection of the loser. It stops the cluster afterward. No production data or PayMongo requests are involved.

```powershell
npm.cmd install --prefix .codex-tmp/walk-in-validation --no-audit --no-fund @embedded-postgres/windows-x64 pg
$env:WALK_IN_NATIVE_PG = '1'
node --test tests/backend/walk-ins-database.test.cjs
Remove-Item Env:WALK_IN_NATIVE_PG
```

`WALK_IN_PG_PACKAGES` can override the optional packages directory. `PGLITE_TEST_PATH` can override the PGlite module location.

The actual owner dashboard and guest table component are exercised by `tests/owner-dashboard/browser.cjs` using isolated services. Checks cover the absence of the Walk-ins tab and seating controls, six-tab navigation, delayed and rejected policy saves, draft preservation, readiness cancellation/failure/success within Tables & Pricing, guest exclusion, and a live-availability error. Nine viewport cases cover representative vivo Y29 and Xiaomi Pad 5 phone/tablet portrait/landscape sizes, a 320-pixel window, large text, and light/dark themes. See `docs/owner-dashboard-compatibility.md` for the browser harness setup. Screenshots and local logs remain under `.codex-tmp/`.

Production migration, production realtime delivery, and installed Android builds are not exercised by these local checks. Device keyboard, gestures, native rendering, and hardware timing still require testing on the vivo Y29 and Xiaomi Pad 5. This patch has not been deployed by this implementation task.

## Changed files

- `app/owner-dashboard.tsx`, `app/reservation/[id].tsx`, `app/checkout/[id].tsx`: owner integration, guest availability, checkout rejection and refresh.
- `src/components/OwnerTableBookingPolicy.tsx`, `GuestTableChoices.tsx`: policy, readiness, confirmation and status/error labels. The unused `OwnerWalkInsView.tsx` component has been removed.
- `src/services/venueTableService.ts`, `src/services/spotService.ts`: authoritative RPCs, validated responses, live subscriptions.
- `src/utils/tableInventory.ts`, `src/constants/clubFloorPlan.ts`, `src/types/index.ts`: policy types and preservation through inventory normalization.
- The migration above; `tests/backend/walk-ins-database.test.cjs`, `walk-ins-postgres.cjs`, `walk-ins-policy.test.cjs`; `tests/backend/club-floor-plan.test.cjs`; `tests/owner-dashboard/browser.cjs`; test dependency/scripts in `package.json` and `package-lock.json`; this document.
