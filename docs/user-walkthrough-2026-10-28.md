# CebSpot: remarks from a user's perspective

October 28, 2026. Tested the current local source on `audit-remediation-2026-10-12`, entry HEAD `dab9514`. Existing uncommitted Saved Spots changes were included in the test and preserved. This report describes the local source, not what is installed on testers' phones.

**My overall remark:** "I can understand how to find places, save them, and check a venue. I would want clearer location information and working menu buttons before relying on the app when planning a visit."

No Android device or emulator was connected. I exercised the actual screen components in phone-sized browser rendering with synthetic accounts and venues, and inspected screenshots. The walkthrough intercepts HTTP and WebSocket traffic. Its map is a labeled adapter; the actual map runtime was tested separately. No real account, review, post, upload, booking, payment, or deletion was submitted to the shared backend. Native permissions, keyboard, camera, GPS, notifications and deployed authentication remain untested here.

## What I would say while using it

| Feature | First-person remark | Observed result |
|---|---|---|
| Login and privacy | "It tells me when I leave login details blank. I can read the privacy policy before signing up." | Empty login validation and the pre-signup privacy link worked. Actual signup/email delivery was not tested. |
| Explore and search | "Finding a place and clearing a search feel straightforward." | An unmatched search showed No matches found; Clear filters restored the fixture venues. |
| Discovery without location | "Why does it say near me and 0.0 km when I haven't given my location?" | With location unavailable, Explore still said **spots found near you**, measuring from the default Cebu reference point. Clarify the fallback location and distance basis. |
| Connection failure | "The app tells me it couldn't load places, and Retry brings them back." | Injected discovery failure showed unavailable rather than zero results; Retry recovered. |
| Saved Spots | "I can bookmark a place and find it again. If loading fails, I want to know it wasn't deleted." | Bookmark-to-Saved worked. Current local code shows an error and Retry instead of a false empty list. The focused check also retained cached entries on failed refresh and rejected a late response from the previous account. This local behavior is not claimed deployed. |
| Venue details and reviews | "I can see the description, reviews, address, and reservation entry in one place." | Venue details rendered, a fixture review appeared, and an empty review was refused with **Review needed**. No review was published. |
| Booking selection | "Seeing Available online versus Walk-ins only helps. The selected table is clear." | Selecting the available fixture table updated the selected-table label, summary and selection timer. The walk-ins-only table was disabled. Booking was not confirmed; server hold/checkout/provider behavior was not accepted by this walkthrough. |
| Booking wording | "Reservation time is easier to understand than Experience Slot." | Both terms describe the time section. Use one familiar term consistently. |
| Activity | "Tapping the post text takes me to the place; Comments opens the discussion." | The linked venue opened from the fixture card, and Comments opened a thread with No comments yet. Empty comments could not be sent. |
| Activity three dots | "I tapped the three dots expecting options, but nothing happened." | The actual control produced no visible change; it has no press handler. Hide it until its options work, or implement appropriate actions. |
| Circles | "It says one friend is active, but I'm the only displayed member and my location is unavailable." | The current user was included in **friends active now**, with **Your current location** shown despite denied location. Recent coordinates and actual online presence should not be treated as the same thing. |
| Location-sharing controls | "I can find privacy settings and switch sharing off." | Synthetic sharing on/off, unavailable-status recovery, lost-response recovery, retained consent and leave confirmation passed. Actual device/server revocation remains untested. |
| Add a Spot | "The form asks for the basics and stops an incomplete submission." | After acknowledging the notice, an empty submission showed **Missing details** without posting. The form already contained default coordinates; label the default clearly and prompt for the actual place. A complete new-place submission was not exercised. |
| Photo privacy | "This notice makes me think every face is guaranteed to be hidden." | It says any image containing a visible face will have it automatically blurred. Explain that automated detection can miss faces and ask users to review images. No detector-accuracy claim is made by this test. |
| Navigation label | "Does Share mean sharing a link or adding a place?" | The plus/Share destination is the place-posting form. Consider Add a Spot or explain it during onboarding. This is a wording suggestion. |
| Profile and account | "My saved places, posts and account details are easy to find." | Profile layouts at 320/390 widths had no horizontal document overflow. Dedicated checks exercised names/picture saves, password validation and email-change recovery with synthetic services. Real email delivery and native photo selection remain open. |
| Your Posts | "I can open my posts and return without losing my place." | Synthetic pagination, 48-post scrolling, retained scroll position, error/empty states and light/dark layouts passed. |
| Account deletion | "I can see what deletion means before doing it." | The deletion explanation and navigation were checked. Deletion and reauthentication were not submitted. |

## Priorities before inviting testers

1. Fix or hide the inert Activity menu.
2. Correct discovery and Circle labels when location is unavailable; exclude self from a friend count.
3. Replace the promise of perfect face blurring with accurate wording.
4. Clarify the default Add a Spot coordinates, reservation-time terminology and Share label.
5. Give Clear filters a button role. It works when tapped, but the current source lacks that accessibility role; native TalkBack testing is still needed.

Keep the verified local Saved Spots recovery behavior when preparing the test build. Do not tell testers these changes are already installed based on this review.

## Retained checks

| Command (through `scripts/remediation-check.cjs`) | Outcome |
|---|---|
| `USER_WALKTHROUGH_RUN=user-walkthrough-2026-10-28-final-review node tests/user-walkthrough/browser.cjs` | 25 completed observation steps; zero final runtime errors. These are UI observations, not 25 production feature certifications. |
| Same run variable, `node tests/user-walkthrough/booking.cjs` | Available-table selection/summary/timer and disabled walk-ins-only control passed; no booking/payment submitted. |
| `npm run test:map` | 13 passed; actual map runtime with intercepted providers. |
| `node tests/user-walkthrough/saved-recovery.cjs` | Error/empty distinction, retry, cached refresh and account-switch/stale-response isolation passed. |
| `node tests/user-walkthrough/circle-settings.cjs` | Settings/consent/status recovery/lost response/leave confirmation passed with fixtures. |
| `node tests/user-walkthrough/account-details.cjs` | Profile edits, validation, picture permission/error recovery, password flow and layout passed with fixtures. |
| `node tests/user-walkthrough/email-change.cjs` | Validation, pending/partial/final confirmation, cooldown, network/account-switch recovery and link handling passed with fixtures. |
| `node tests/user-walkthrough/your-posts.cjs` | Cards, pagination, virtualized list, cached return/scroll position and error/empty states passed with fixtures. |
| `npm run typecheck` | Passed. |
| `adb devices -l` (installed Android SDK executable) | No device attached. |

Command reports use the `user-perspective-*-2026-10-28.json` names in [retained command evidence](../tests/remediation/evidence/commands). Earlier failed walkthrough attempts are retained: the adapter initially omitted the paginated `getPostsForSpot` response contract, which crashed its synthetic render. Another attempt expected a location alert while the default coordinates caused the correct missing-details alert. Correcting those fixtures/assertions produced the final clean run; those earlier failures are not counted as product defects or passing runs.

Final [observations](../tests/user-walkthrough/evidence/2026-10-28/observations.json), [booking result](../tests/user-walkthrough/evidence/2026-10-28/booking-selection.json), [source hashes](../tests/user-walkthrough/evidence/2026-10-28/source-manifest.json), and screenshots are retained. Examples: [Activity menu](../.codex-tmp/user-walkthrough-2026-10-28-final-review/16-activity-three-dots.png), [Circle without GPS](../.codex-tmp/user-walkthrough-2026-10-28-final-review/08-circles.png), [Saved error and Retry](../.codex-tmp/user-walkthrough-2026-10-28-final-review/11-saved-network-error.png).

## What still needs an Android user test

Use the intended APK and a verified isolated test backend. Test signup/confirmation/login/recovery email delivery; denied/allowed GPS and stop sharing across devices; camera/gallery cancellation and uploads; review/post moderation; booking confirmation, expiry and table conflicts; PayMongo test-mode returns; app interruption/reopening; notifications; and deletion with retained de-identified financial records. Use synthetic data and no live payment. The shared mixed-data backend was not used for those actions in this review. This report supplies usability notes, not a release GO or a multiuser capacity claim.
