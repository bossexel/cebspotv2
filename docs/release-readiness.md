# CebSpot Release Readiness

Assessment date: September 13, 2026 (Asia/Manila)

## Current score

| Milestone | Readiness | Meaning |
| --- | ---: | --- |
| Final user testing | **84%** | The implemented flows are ready for structured device testing, with a few external and reliability checks still open. |
| Capstone presentation | **90%** | The primary user and owner journeys can be demonstrated; a real paid QRPh callback should still be rehearsed before presentation day. |
| Public production launch | **74%** | Core functionality is present, but payment proof, device coverage, and release operations remain launch gates. |

These percentages are a weighted engineering estimate, not the automated-test pass rate.

## Privileged portal status

| Portal | Final-testing readiness | Verified | Still open |
| --- | ---: | --- | --- |
| Owner dashboard | **82%** | Access guard, branding protection, club inventory, reservation details, payment review rules, arrival/no-show handling, notification wiring, and gallery/settings implementation | Real owner login, live settings write, owner photo upload, payment-proof review, attendance action on a real reservation, realtime sync, and physical-device layout |
| Admin console | **74%** | All five deployed admin RPCs exist and reject a normal user; live-data, approval, moderation, edit-suggestion, and owner-request handlers are wired | Real admin login and permitted RPC actions, document opening, realtime refresh, physical-device layout, and the visible CSV/add/edit/remove placeholder controls |

The owner and admin percentages reflect functional readiness. They do not claim successful end-to-end privileged sessions because owner and admin test credentials are not configured locally.

## Evidence collected

- **78/78 automated checks passed:** 67 backend, reservation, owner, and admin checks plus 11 map interaction regressions.
- TypeScript validation passed.
- Web and Android Expo exports passed in the current development cycle.
- Authenticated Supabase profile read, write, verification, restore, and sign-out passed.
- Test Cebspot Club is reachable as a Club and exposes 62 bookable table records in each tested seating period.
- The deployed table-availability and owner attendance RPCs are installed and safely reject invalid reservation IDs.
- The active CARTO map tiles and the OpenStreetMap fallback returned valid tiles; installed Expo map dependencies are compatible.
- The Cebu OSRM route probe returned a valid route at assessment time.
- Route loading now has an eight-second timeout, cancellation on screen changes, a second provider, and a small cache to prevent repeated requests for the same coordinates.
- The live PayMongo webhook is enabled, subscribed to `checkout_session.payment.paid`, and its configured secret matches the deployed function.
- PayMongo reports live QRPh capability as active. Direct GCash is disabled in the app because the live account does not currently expose that capability.
- The signed webhook probe returned HTTP 200, and live checkout endpoints were reachable and safely rejected an invalid reservation.

## Remaining gates

1. Complete one small real QRPh payment and verify all three results: PayMongo event delivery is successful, the reservation becomes confirmed automatically, and the payment reference is stored.
2. Run a structured physical-device pass for the map drag and carousel tap, similar-place navigation, route-provider fallback, table selection, checkout, cancellation policy, owner arrival/no-show, photo upload, and push notifications.
3. Test poor-network, app-background, duplicate-tap, concurrent table-booking, and service cold-start behavior. The face service passed after a retry but timed out on its first cold request.
4. Produce and install the signed release build, verify production environment variables, and rehearse the presentation from that exact build.
5. Commit or otherwise snapshot the intended release changes and remove obsolete local configuration before creating the final build.

GCash activation is outside the current QRPh launch scope. It can be enabled later by setting `EXPO_PUBLIC_PAYMONGO_GCASH_ENABLED=true` only after PayMongo reports the live GCash capability as active.
