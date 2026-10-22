# CebSpot App Guide

## Repository audit and decisions

Audited the existing checkout of `bossexel/cebspotv2` before edits, including the root Stack/auth gate, discovery, spot details, Activity, Circle, Saved Spots, Profile, submission form/service, theme, shared UI, auth roles, account lifecycle, and AsyncStorage consumers. Existing unrelated working-tree changes are preserved.

Installed versions: Expo **52.0.49**, React Native **0.76.9**, React **18.3.1**, Expo Router **4.0.22**, AsyncStorage **1.23.1**, and react-native-svg **15.8.0**. `app.json` enables the new architecture and targets Android. Root layout already loads Montserrat. The guide reuses that font initialization, the existing logo, theme provider, palette, spacing/radius tokens, and safe-area insets.

The About page already contains help, FAQs, and static guidance; there was no interactive tour or onboarding completion state. Profile's Quick Actions now includes **App Guide**, without moving or restyling the bottom navigation.

[Copilot's upstream package manifest](https://github.com/mohebifar/react-native-copilot/blob/master/package.json) declares peer ranges that include this app's React, React Native, and SVG versions. Its [documentation](https://github.com/mohebifar/react-native-copilot#readme) requires mounted targets and explicit ScrollView handling. Those ranges alone do not verify this app's new-architecture Android layout. A small custom implementation was selected to handle this app's dynamic spot carousel, existing route lifecycle, and measured scroll targets directly. **No dependencies, lockfiles, or Expo versions were changed.**

## Flow and actual coverage

1. On an eligible plain visit to Explore, after auth, theme, fonts (or font-load failure), navigation, initial location attempt, and initial discovery request settle, show three branded full-screen introductions: Discover Cebu, Explore Local Favorites, Share With the Community. Skip is available throughout; Get Started leads into the tour.
2. Highlight Nearby Spots, the actual search/filter bar, the selected real spot card, its bookmark, Share, the existing bottom navigation for Circle/Activity, and Profile. If no real card is mounted, omit the card/bookmark steps; the count adjusts from seven to five. If an included target later disappears, offer a readable fallback with Next/Skip instead of waiting indefinitely.
3. Finish records completion and shows a welcome message with Start exploring. No spot is opened, bookmarked, submitted, voted on, or changed by the main tour.
4. Open any existing spot normally through its card or the existing `/spot/[id]` route. The optional **Spot guide** button starts a separate three-step contextual tour of the actual title/address, overview, and Community Reviews heading. It scrolls the existing screen to each section; Finish returns to the same details page without posting a review.
5. **Profile → Quick Actions → App Guide** returns to Explore through Expo Router and explicitly replays the introduction and tour. The one-use replay parameter is consumed without touching notification parameters.

The main tour introduces Saved Spots, submission, Activity, Circle, and Settings through their existing entry controls. It does **not** automatically enter those screens. There is no tour of reservation/payment flows. Spot details do not currently offer the discovery-card bookmark control, so saving is explained at the actual bookmark on Explore. Search copy reflects the implemented name/address/category matching and category/rating/distance filters; distance falls back to the existing central Cebu coordinate when location is unavailable.

The introduction uses three custom native/SVG scenes drawn from the map and pin forms in the existing logo: a warm Cebu street map, a search scene, and a Share/Circle scene. Montserrat Black headlines, the existing orange and navy palette, broad margins, and a progress rail give each screen a recognizable CebSpot rhythm. Scene cards float subtly, pages enter with a short fade and rise, and tour targets have a breathing outline. Android reduced-motion preferences disable those continuous and entrance animations. The tour's compact navy/dark panel keeps Back, Skip, and Next visible while its description can scroll at larger font sizes.

## Architecture and lifecycle

- `GuideProvider` surrounds the existing Stack content; no second navigator, route, authentication gate, or competing redirect was added. Root readiness includes theme/auth/role gating and font readiness.
- Native ref callbacks attach to existing Views/Pressables with `collapsable={false}`. Owner-scoped registrations clean up on unmount and restore older mounted registrations when a stacked screen goes away.
- A transparent native Modal blocks accidental actions on highlighted business controls. An SVG path draws the spotlight from `measureInWindow`, subtracting the modal's own window origin for Android status-bar alignment.
- Measurement repeats while a tour step is visible to track layout/scroll changes. Detail steps reveal their existing ScrollView sections first. Window/scale changes trigger remeasurement. Tooltip content scrolls within safe-area bounds, including small landscape windows and large text. On very short windows it can overlap the highlighted area so its controls remain reachable.
- A 2.5-second measurement deadline permits continuing past absent or unmeasurable targets. Timers and late measurement callbacks are canceled on step changes/unmount. A 400ms gate suppresses rapid progression taps.
- Android Back maps to the Modal's skip action. Navigation, account changes, logout, role changes, and backgrounding close the current tour. Incoming Explore notification parameters also dismiss an active home tour even when the pathname stays `/`.
- Deep-linked spot/reservation/activity/modal routes are not redirected into onboarding. Explore links carrying `focusSpotId` or `openSpot` are not intercepted. Automatic onboarding can wait for a later plain Explore visit.

## Persistence and roles

AsyncStorage key: `cebspot_onboarding:v1:<authenticated-user-id>`. This is **per account on this device**, following the existing local bookmark/draft conventions. It does not sync to other devices and requires no database migration.

- Absent or invalid state means `not_started`.
- An introduction that opens is conservatively persisted as `skipped` until Finish records `completed`. Thus process death, Android Back, navigation, backgrounding, or logout do not repeatedly force an interrupted introduction. Explicit Skip also records `skipped`.
- Finish records `completed` before the welcome page; closing that page preserves completion. The detail guide is optional and does not alter main onboarding state.
- Logout does not erase completion. A different account uses a different key. Replay intentionally starts a new attempt even after completion/skipping.
- Reads have a timeout and writes are serialized per account. Memory state prevents repeated prompting during storage failure in the same process. If durable storage is unavailable, persistence across process restarts cannot be guaranteed.
- Only a signed-in ordinary `user`, with matching user/profile IDs, is eligible. The existing gate has no guest discovery mode; no guest access was introduced. Owners remain in the owner dashboard and administrators remain in the admin console. Neither receives this customer tour. Route/permission definitions are unchanged.

## Validation

Focused tests in `tests/remediation/onboarding.test.cjs` cover first launch readiness, completed/skipped relaunch, explicit replay, account isolation, role eligibility, route/session invalidation, deep-link exclusions, progression, no-data steps, invalid/offscreen target geometry, safe-area placement, storage failure/timeout, late reads, and ordered writes. They run as part of the existing `npm test` script.

Executed checks:

- Focused onboarding tests: **15 passed**.
- `npm run lint` and `npm run typecheck`: **passed**. The repository's `lint` command is `tsc --noEmit`, not a separate ESLint pass.
- `npm test`: **293 passed, 5 skipped, 0 failed** in the original implementation pass. The skipped checks are existing multi-session database race tests. The visual revision was checked with the focused onboarding suite, TypeScript/lint, and Android export.
- `npm run build:android -- --output-dir .codex-tmp/onboarding-android`: **passed**, producing an Android Hermes bundle in the ignored local artifact directory. This is an export, not an installed APK/device test.
- Scoped `git diff --check`: **passed**.
- A headless Chrome preview of the three actual artwork components was inspected at `.codex-tmp/guide-artwork-preview.png`. It uses browser fallback fonts and confirms illustration composition only; it is not an Android screen capture.
- Read-only checks of the configured Supabase Auth health and settings endpoints returned **200**; signup is enabled, the email provider is enabled, and email confirmation is required. These checks do not exercise account registration or email delivery. A reported signup failure remains unresolved without the exact popup text.

No Android device or emulator was connected when checked with ADB. Automated model/storage tests and bundling do not prove native layout, accessibility, or interaction correctness. Before release, verify on Android:

| Scenario | Expected result |
| --- | --- |
| New ordinary account, fresh local state | Three intro pages, then five/seven real-control steps |
| Create account, verify email, sign in | Registration and verification complete before the automatic guide appears; report the exact popup detail on failure |
| Skip introduction; terminate/relaunch | No automatic repeat; discovery remains usable |
| Finish; terminate/relaunch | No automatic repeat; welcome closes normally |
| Profile App Guide after completion/skip | Intro replays once on Explore |
| Next/Previous and repeated fast taps | Ordered steps; no double advance or stuck overlay |
| Empty/offline discovery or disappearing card | Optional steps omitted or timed fallback; Skip always works |
| Logout and account switching | Overlay closes immediately; each account restores its own state |
| Admin/owner login and guest login screen | No customer onboarding; existing role protections apply |
| Incoming notification/deep link during tour | Tour releases navigation; original destination still opens |
| Android Back, background/resume | Tour dismisses; normal Back/navigation work afterward |
| Light/dark, portrait/landscape, large font | Accurate cutout, readable scrollable tooltip, reachable controls |
| TalkBack | Step heading receives focus; Next/Previous/Skip/Finish are readable |
| Open real spot and choose Spot guide | Real title/overview/reviews highlighted after scrolling |
| Normal map, search/filter, bookmark, submission, reservations | Existing behavior preserved; no tutorial writes |

GPS/network requests are existing screen prerequisites for the automatic introduction. If they remain pending, discovery stays usable and the automatic introduction waits. Explicit replay from Profile can still start once Explore is mounted and its filter modal is closed, using only available controls. No business-service timeout or permission flow was changed for onboarding.
