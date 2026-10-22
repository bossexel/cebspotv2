# Manual reservation arrival time

Experience Slot has one adjustable arrival-time picker with hour/minute arrows and AM/PM. A guest can choose a time such as 9:10 PM. That exact time is saved in `reservation_time` and `reservation_time_start`, passed through paid checkout, and shown explicitly in the owner's reservation details as Arrival time.

There is no booking duration, departure-time control, calculated end time, or timed-stay policy. New reservations leave `reservation_time_end` null. Existing reservation records are not modified.

The owner Tables & Pricing screen keeps a unified physical-table list, capacity and availability controls, and a single reservation price. Its Experience Slot section explains that guests choose their preferred arrival time; it does not set their length of stay. Price and table changes publish in one database update.

Existing `get_reserved_table_ids` and `check_reservation_slot_available` RPCs and database locks are retained. Manual arrival times map to existing internal inventory keys using their previous start-time boundaries, without rounding or restricting the guest's chosen minute. This preserves existing slot-based table-availability rules and introduces no occupancy duration. The fixed club layout uses its original 8 PM, 11 PM, and 2 AM boundaries; other inventories use 5 PM, 8 PM, and 11 PM boundaries.

The unshipped duration and time-range migrations have been removed. This corrected feature does not require those migrations or the missing range RPC that caused PGRST202. Reload or release the app to pick up the corrected code. The existing reservation schema, table inventory, and availability RPCs must already be installed. No production deployment was performed for this code correction.

## Verification

`node --max-old-space-size=1024 node_modules/typescript/bin/tsc --noEmit`

`node --test --test-concurrency=1 tests/backend/adjustable-reservation-times.test.cjs tests/backend/reservation-checkout-details.test.cjs tests/backend/owner-reservation-settings.test.cjs tests/backend/owner-branding.test.cjs`

Tests cover time controls, minute rollover, AM/PM, 9:10 PM display, legacy inventory-key selection, existing availability RPCs, reschedule exclusions, missing-RPC failures, owner table edits, atomic saves, and arrival-time persistence without a generated departure time.
