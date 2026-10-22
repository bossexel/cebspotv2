# About CebSpot

Profile → Quick Actions → About opens `/about` on the existing Expo Router stack. The screen uses `ScreenContainer`, theme colors, spacing, typography, rounded cards, and the bundled logo. Its header pops the stack, falling back to Profile when there is no history. Android back uses the existing stack handler; About is not one of the root routes intercepted by the app's custom exit handler.

The introduction, story, coverage, feature guide, credits, acknowledgments, FAQs, optional links, and optional release notes live in `src/constants/about.ts`. Static content needs no fetch. FAQ expansion is exclusive; acknowledgments expands independently. Rows expose button roles and expanded states, use at least 48-point touch targets, and allow text wrapping. No new dependency or bottom tab was added.

## Content evidence

| Content | Existing source |
| --- | --- |
| Introduction, purpose, capstone attribution | Supplied feature brief |
| Team names and adviser; acknowledgments | Title page and ACKNOWLEDGEMENT of `CebSpot_Manuscript_Aligned_READY_TO_PASS_20260601-202043.docx` |
| Search, category/distance/rating filters, map, denied-location reference point | `app/index.tsx`, `src/hooks/useLocation.ts`, `src/constants/design.ts` |
| Venue details, public reviews, review photos, corrections | `app/spot/[id].tsx`, review and spot-edit services |
| Submission approval and photo anonymization | `app/submit-spot.tsx`, spot-submission and review-media services |
| Circle member location publishing | `app/circle/[id].tsx`, `src/services/circleService.ts` |
| Reservation availability, payment processing, owner review | `app/reservation/[id].tsx`, `app/checkout/[id].tsx`, `app/confirmed/[id].tsx` |
| Different change/cancellation rules for free and paid bookings | `app/reservations.tsx`, `src/utils/reservations.ts`, `src/components/ReservationTermsCard.tsx` |
| XP, badges, history, leaderboard | `app/gamification.tsx`, `src/services/gamificationService.ts` |
| Version | Optional installed ExpoApplication module; Expo config; bundled `app.json` fallback (not package.json) |

No team portraits, social profiles, or individual development roles are supplied. Generic capstone roles are used. No verified public support email, bug/feedback destination, standalone tutorial, privacy policy, Terms of Use, or account/data deletion destination was found. Those actions are hidden; About guides users to existing contribution and venue correction flows. Booking terms remain in the booking flow. Add verified HTTPS or plain `mailto:` links to the optional configuration; invalid links are hidden and opening failures show an alert. No personal information or logs are attached.

Existing `docs/test-release-1.0.3.md` describes an earlier tester release. It is not presented as a changelog for this change. Optional release notes are empty until release-specific copy is approved.

The requested TaraKape reference page was inaccessible through the browsing tool. The supplied information order was followed using original CebSpot content.

## Validation commands

```text
npm run typecheck
npm run lint
node node_modules/expo/bin/cli export --platform all --max-workers 1 --output-dir .codex-tmp/about-export
node tests/about/about.cjs
```

The browser test uses local fixtures and checks both themes at 320×640, Profile → About → back, existing quick actions, contribution navigation, exclusive FAQ expansion/collapse, acknowledgments, missing-link hiding, version, offline interaction, and layout with simulated larger text. Screenshots are written to `.codex-tmp/about-light.png` and `.codex-tmp/about-dark.png`.

## Results (October 8, 2026, Asia/Manila)

- Typecheck and lint passed (both use the repository's TypeScript checker). Final typecheck passed after the accessibility fix.
- Final Expo web export passed: 3,079 modules. Android/Hermes export passed: 3,385 modules. These are bundle/build checks, not an APK installation or production release.
- Browser interaction checks passed in light and dark themes using installed Chrome (`PLAYWRIGHT_CHROMIUM_CHANNEL=chrome`); the default Playwright browser download was unavailable. All four existing Profile quick actions navigated successfully. About contribution and correction actions reached their existing screens; no real submission was made.
- The browser check caught missing expanded-state attributes in the web renderer. Explicit `aria-expanded` now complements native `accessibilityState`; expansion/collapse checks passed after rebuilding.
- Optional link validation, unique FAQ IDs, configured-photo-FAQ gating, test script syntax, and changed tracked-file whitespace checks passed.
- Intro screenshots in both themes and the dark larger-text screenshot were visually inspected. No horizontal page overflow was detected at 320 pixels with simulated 1.5× text. Native accessibility and safe-area checks remain outstanding below.

Physical-device checks remain necessary for Android hardware back, system safe-area insets, TalkBack, and OS font scaling. Exporting the Android bundle does not produce or install an APK. No production deployment is part of this change.
