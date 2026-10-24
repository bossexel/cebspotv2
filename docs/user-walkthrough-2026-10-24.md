# CebSpot: a user's walkthrough and remarks

Date: October 24, 2026, Asia/Manila. This reviews the current working-tree Android screen components, not a newly published APK. Existing user changes were preserved. No application code was changed by this walkthrough.

## What was actually tested

No Android phone or emulator was attached (`adb devices -l` returned no devices). I rendered the actual React Native screen components at phone-sized browser viewports with synthetic service adapters. All HTTP and WebSocket traffic was intercepted. The screen harness uses React Native Web; its map is an explicitly labeled adapter. The actual Leaflet map has a separate intercepted browser test suite.

This is useful interaction and usability evidence. It is **not** physical Android, native permission, GPS, keyboard, file picker, native notifications, deployed authentication/database, payment-provider or multiuser capacity acceptance. The shared backend contains real/mixed data, so no real account, post, upload, booking, payment or deletion was created or changed.

## My remarks as a user

| Area | First-person remark | What I observed | Suggested change |
|---|---|---|---|
| Activity menu | “I tapped the three dots expecting options, but nothing happened. Is the app stuck?” | Clicking the actual 28×36 three-dot control produced no visible change. The component has no `onPress`, role or accessible name. | Hide the unfinished control or implement appropriate authorized options. Give an implemented control a clear label and larger touch area. |
| Saved Spots when offline | “I saved a place. Why does the app now say I have no saved spots?” | With an existing synthetic saved ID and an injected venue-load failure, the screen said **No saved spots yet**, offered Explore Spots, and offered no retry. Restoring the adapter showed the saved cafe again. | Distinguish failed loading from a genuinely empty list. Keep cached entries if available and offer Retry. Do not imply bookmarks were deleted. |
| Discovery without GPS | “It says ‘near you’ and 0.0 km, but I didn't give the app my location.” | With location unavailable, Explore still displayed **spots found near you** and distances measured from the default Cebu reference point. | State that distances are based on central Cebu until the user enables location. Keep manual browsing available. |
| Circle presence | “It says one friend is active, but I can only see myself and my location is unavailable.” | The screen included the current user in **friends active now** even with no location; the self card still said **Your current location**. Source confirms the current user is counted regardless of recent coordinates. | Separate membership, app presence and recent location. Exclude self from a friend count or label the count accurately; show Location unavailable when GPS is unavailable. |
| Photo privacy notice | “I would assume this guarantees every face will be hidden.” | Share a Spot says **any image containing a visible face will have the face automatically blurred**. This walkthrough did not upload an image or assess detector accuracy. | Explain that automated processing can miss faces, ask users to review photos, and avoid wording that guarantees perfect detection. |
| Reservation vocabulary | “I understand ‘reservation time’ faster than ‘experience slot’.” | Booking uses both **Experience Slot** and **Reservation time** for the same selection area. | Use one familiar term such as Arrival time. This is a wording suggestion, not a booking correctness failure. |
| Share navigation | “Does ‘Share’ mean sharing a link or adding a place?” | The prominent plus tab is labeled **Share**; the destination is a place-submission form. | Consider **Add a Spot** or clarify this in onboarding. This is a discoverability suggestion, not a broken navigation finding. |
| Clear filters accessibility | “I can tap Clear filters, but assistive navigation should identify it as a button.” | The text action clears the unmatched search successfully; the rendered control has no button role, matching the missing `accessibilityRole` in source. | Expose the action as a named accessible button. Native TalkBack verification remains required. |

Source references: [Activity menu](../app/activity.tsx), [Saved Spots](../app/saved.tsx), [Explore](../app/index.tsx), [Circle](../app/circle.tsx), [Share a Spot](../app/submit-spot.tsx), [Booking](../app/reservation/%5Bid%5D.tsx).

## What felt useful

- **Login:** submitting an empty form gives a clear missing-details message. The form exposes a Privacy Policy link before signup. Authentication and Google sign-in themselves were not exercised against a real service.
- **Discovery:** the search box and venue cards are easy to identify. An unmatched search shows **No matches found**; tapping **Clear filters** restores results. Bookmarking the synthetic cafe from Explore makes it appear in Saved Spots. An injected discovery failure shows an unavailable state rather than an empty-search claim; Retry restores synthetic results.
- **Venue details:** overview, reviews, address and booking entry are available on the spot page. The fixture intentionally has no real venue images, so image quality and production image loading were not evaluated.
- **Booking selection:** date, adjustable time, party size, table choices, booking summary and cancellation conditions are visible. The separate interaction check selects the available synthetic table and updates the selected-table label, summary and five-minute selection timer. The walk-ins-only table is disabled. The timer explicitly says availability is checked again before booking; it is not proof of a server hold. No booking was confirmed and no checkout was completed.
- **Activity:** opening a post displays its full text and an empty-comments explanation. The three-dot issue is separate from the functioning post-open action.
- **Circles:** explicit sharing controls start off, switch to Stop location sharing, and return to off in the adapter. The final synthetic state is `{ enabled: false, generation: null }`. This does not prove actual server revocation, device GPS or multi-device refresh.
- **Profile:** points, reservation count, saved spots, account information and quick actions are easy to locate. Profile was inspected at widths 320 and 390 with no horizontal document overflow. A dark profile was also rendered; this does not certify every screen or native font scale.
- **Account deletion:** the explanation describes permanent removal, financial-history retention and outstanding-obligation blockers. Only the explanation was opened; deletion and reauthentication were not submitted.

## Retained verification

| Check | Result | Meaning |
|---|---|---|
| Actual map runtime browser suite | **11 passed** | Camera resume, drag/pinch, pin callbacks, provider fallback, reduced motion, resizing and untrusted marker text; all map-provider requests intercepted. |
| Focused client regressions | **30 passed** | Inventory behavior, proof access/source validation, onboarding rules, truthful feed errors and native-link guard; isolated adapters, not hosted service acceptance. |
| Phone-sized screen walkthrough | **22 observations completed; 0 runtime errors or blocked steps** | Actual screen interactions with synthetic data. “Observed” means the screen/action was inspected, not that an end-to-end production feature passed. Includes separate 320/390 profile checks. |
| Booking selection interaction | **Passed** | Available synthetic table updates selection/summary/timer; walk-ins-only table disabled; no booking or payment submitted. |

Command reports:

- `tests/remediation/evidence/commands/user-walkthrough-map-2026-10-24.json`
- `tests/remediation/evidence/commands/user-walkthrough-core-2026-10-24.json`
- `tests/remediation/evidence/commands/user-walkthrough-screens-final-2026-10-24.json`
- `tests/remediation/evidence/commands/user-walkthrough-booking-selection-final-2026-10-24.json`

Final [screen observations](../tests/user-walkthrough/evidence/observations.json), [booking evidence](../tests/user-walkthrough/evidence/booking-selection.json) and [source hashes](../tests/user-walkthrough/evidence/source-manifest.json) are retained with this review. Example screenshots: [Activity menu](../.codex-tmp/user-walkthrough-2026-10-24/16-activity-three-dots.png), [saved-load failure](../.codex-tmp/user-walkthrough-2026-10-24/11-saved-network-error.png), [Circle without GPS](../.codex-tmp/user-walkthrough-2026-10-24/08-circles.png).

The repeatable harness is `tests/user-walkthrough/browser.cjs`. It requires an isolated `esbuild` install under `.codex-tmp/user-walkthrough-tools` and uses the installed Playwright/Chrome. It does not enable customer web distribution or change Metro configuration.

Screenshots and raw fixture observations are in `.codex-tmp/user-walkthrough-2026-10-24/`. Initial harness attempts omitted Auth subscription and subscription cleanup contracts; those caused test-render errors and were corrected in the adapters. They are **not** reported as application defects. Earlier attempts are retained there. A missing fixture vote count and a synthetic pending-deletion value were also corrected before the final run; neither is a reported product defect.

An initial booking assertion expected `aria-selected` on a web-rendered button. The visible selection and summary were correct; the final interaction assertion checks those actual user-visible outputs instead. The earlier failing command reports are retained. The first Clear filters locator required a button role, revealing its missing semantics; clicking the visible text succeeds in the final run. Neither earlier failure is silently counted as a successful run.

## User perspective and remaining acceptance

“I can understand the main idea and find places, read venue information and open the main sections. I would hesitate when an unfinished menu does nothing, saved places appear to disappear, or location labels claim more than the app currently knows. I would want these made clear before being asked to trust the app for a booking.”

Next: fix the reproducible UI issues, then run the same journey on the intended Android APK against a verified isolated test backend. Real signup/login, photo selection and cancellation, face results, GPS consent and revocation, real account switching, booking conflict/expiry, PayMongo test-mode callback, notifications and resumable deletion still require that acceptance. No new UAT approval or 100-user capacity claim is made by this report.
