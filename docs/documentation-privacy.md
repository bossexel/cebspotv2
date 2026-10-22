# CebSpot native documentation and privacy

**Latest revision:** At the user's explicit request, `/privacy` now renders the supplied CebSpot reference policy with eleven cards. The earlier CebSpot draft is preserved in `src/constants/privacy.ts` but is no longer displayed by this route. See `docs/privacy-reference.md` for the current screen, editable reference content, and validation. The implementation notes below describe the preceding CebSpot policy version.

## Feature files

- `app/about.tsx`: both entry rows are inside the first logo/introduction card.
- `app/_layout.tsx`: existing native stack registration for About, documentation, and privacy.
- `app/documentation.tsx`: documentation hero, segmented navigation, responsive technology grid, numbered architecture layers, and integration flows.
- `app/privacy.tsx`: searchable policy, phone contents panel, tablet sidebar, scroll targeting, and independently expandable section cards.
- `src/components/InformationScreen.tsx`: shared safe-area layout, wrapping page title, and native stack back action.
- `src/components/InformationContent.tsx`: shared icon containers, rich content blocks, cards, lists, dividers, contextual panels, and wrapping chips.
- `src/constants/informationContent.ts`: plain content interfaces and supported icon names.
- `src/constants/documentation.ts` and `src/constants/privacy.ts`: editable, locally bundled content.
- `src/utils/externalLinks.ts`: existing validated link opener with failure handling, reused for optional content links.
- `tests/about/about.cjs`: fixture-based browser interaction and responsive checks.
- This report.

The latest expansion changes both screens, the shared layout, both content modules, and the browser checks; it adds the rich-content component and content interfaces. About entry points, stack registration, and link handling already existed from the preceding implementation and remain intact. No dependencies, permission flows, authentication, reservation behavior, payment behavior, or owner features were changed.

## Editing content manually

Edit **`src/constants/documentation.ts`** for the documentation hero and labels, platform summary, technology cards, feature cards, architecture layers, and integration flows. Edit **`src/constants/privacy.ts`** for the draft status, configured revision date, introductory summary, search/contents labels, policy sections, and approved contact links.

Each card has a stable `id`, `icon`, `category`, `title`, and `paragraphs`. Optional `details` contain blocks with their own stable IDs, headings, paragraphs, bullet or numbered `items`, contextual-panel flags, and optional links. Architecture cards also accept `chips`. Rewrite complete paragraphs, add list items, or reorder entries in these modules without changing screen components. Keep IDs stable to preserve navigation targets and UI identity. Supported icon names and block shapes are defined in `src/constants/informationContent.ts`.

The policy search automatically includes section titles, categories, paragraphs, supporting headings, list items, and link labels. Contents derives its titles and targets from the same section entries. The optional `contactLinks` accepts verified HTTPS or mailto destinations through the shared validator; unsupported or blank links are omitted, and opening failures show the existing alert.

`updatedOn` is intentionally `null`. Supply an approved fixed date to show “Last updated”; do not generate it from the clock. Approve the content, identity, contacts, and outstanding organizational decisions together before removing the draft status. Configured provider names and conditional photo-processing text reflect build configuration without displaying keys or service endpoints.

## Implemented interactions and layout

Both hero rows push dedicated native Expo Router screens. The shared visible back control pops the current screen, with About as the fallback when there is no stack history. About's existing mounted instance retains its scroll position. Android hardware back is left to the existing stack conventions; no intercepting back handler was added.

Documentation places the CebSpot logo, documentation label, heading, and explanatory text above a rounded segmented control. Its three scroll views stay mounted independently so Overview, Features, and Architecture retain their reading positions. The control sticks while scrolling. Overview has a single-column phone layout and two-column technology grid from 900px when normal text scaling leaves sufficient room. Features use full-width detailed cards. Architecture uses numbered vertical component cards, connecting strokes, wrapping technology chips, and explanatory integration flows.

Privacy starts with a visible draft summary and configured-date placeholder. The search matches titles and body content without network requests, expands matching sections, and shows a clear empty state. Clearing restores the complete policy. Each section card can independently expand or collapse and exposes its expanded state to accessibility tools. A collapsed contents panel is used on phones; at 1000px and suitable text scale, an independently scrollable sidebar presents all targets.

Selecting a contents item clears any active filter, opens the target card, and measures its actual position after layout before scrolling. The page header is outside the content scroll, with a small inset above the target heading. Contents remains available even when a search has no matches. Light/dark theme colors, safe areas, wrapping titles, readable 16px paragraphs, flexible card heights, and minimum-size touch controls are used throughout. Large native font scales fall back to one-column/panel layouts.

Core content is bundled locally. These screens do not use a WebView, fetch policy text, request permissions, or record acceptance. Existing root application services retain their behavior; offline reading does not imply that unrelated live map or booking features work offline.

## Evidence inspected

| Subject | Repository sources |
| --- | --- |
| Framework, fonts, libraries, build configuration | `package.json`, `app.json`, `app.config.js`, `app/_layout.tsx` |
| Navigation and roles | `app/_layout.tsx`, `src/constants/authRoles.ts` |
| Discovery, filters, map fallback, suggestions | `app/index.tsx`, `app/spot/[id].tsx`, `src/hooks/useLocation.ts`, `src/utils/similarSpots.ts`, `src/constants/mapTiles.ts`, map surface implementations |
| Account, recovery, sessions, preferences | `src/hooks/useAuth.ts`, `src/hooks/useTheme.ts`, `src/lib/supabase.ts`, profile services |
| Local bookmarks and drafts | `src/services/savedSpotService.ts`, submission draft/queue services |
| Public contributions, corrections, reviews, rewards | Submission, spot-edit, review, review-media, and gamification services and their screens |
| Stored and shared circle locations | `app/circle/[id].tsx`, `src/services/circleService.ts`, `supabase-circles.sql` |
| Assigned owner interface and returned reservation data | Android `app/owner-dashboard.tsx`, owner access service, reservation service, payment-proof service. The browser owner portal was removed on October 13, 2026. |
| Manual approval authorization | `supabase/migrations/20261006000100_audit_authorization_hardening.sql` |
| Provider checkout ownership, billing fields, events | `supabase/functions/_shared/paymongo.ts`, checkout functions, payment webhook |
| Availability, payment versus booking states, booking conditions | Reservation, checkout, confirmed, and reservations screens; reservation utilities; `ReservationTermsCard` |
| Device alerts and in-app activity | Notification services and root subscriptions |
| Image processing and unsupported media paths | Image-anonymization, submission, review-media, owner-gallery, and profile-photo services; `face-blur-service` implementation and requirements |

Descriptions reflect repository behavior rather than a deployed security audit. No live cross-account probes, provider-contract review, real payment, or live-data submission was performed. Both TaraKape reference URLs were inaccessible through the browsing tool; the user-supplied organization and interaction requirements were followed with original CebSpot text. No reference source, branding, contact details, or policy wording was copied.

No approved full CebSpot privacy policy was found. Existing submission notices and reservation terms remain unchanged. Previously edited introductory acceptance language and unverified retention promises were replaced with verified draft descriptions, consistent with the request to avoid invented commitments and automatic acceptance.

## Missing policy information

- Responsible organization/data controller identity and a verified privacy-request channel.
- Approved effective/revision date and material-change notification procedure.
- Retention, deletion, backup, temporary processing, and diagnostic/logging rules for each data category; exceptions and responsibilities.
- Access, correction, export, erasure, and account-deletion procedures, identity verification, and response handling. No verified in-app account-deletion action exists.
- Children's privacy, intended account audience/age rules, and any parental-consent process.
- Organizational disclosures, legal-request handling, approved provider policy links/agreements, processing locations, and transfer details.
- Security and incident-response commitments and responsible personnel.

The screen remains explicitly a draft. It makes no invented retention period, minimum age, support email, encryption/compliance guarantee, automatic deletion promise, or refund commitment. Photo processing limitations and circle location storage/sharing are explicit.

## Validation

PowerShell commands:

```powershell
npm.cmd run typecheck
npm.cmd run lint
$env:EXPO_OFFLINE='1'
$env:CI='1'
node node_modules/expo/bin/cli export --platform all --max-workers 1 --output-dir .codex-tmp/information-final-export
$env:ABOUT_EXPORT_DIR='.codex-tmp/information-final-export'
$env:PLAYWRIGHT_CHROMIUM_CHANNEL='chrome'
node tests/about/about.cjs
```

The repository's lint script is also `tsc --noEmit`. The configured export platforms are Android and web; export produces Android/Hermes and web bundles, not an installed APK or production release. The browser fixture uses a synthetic signed-in account and intercepted backend responses, avoiding dependence on live records. Screenshots stay in `.codex-tmp`.

Coverage includes both themes at 320×640 and 1024×900, first-card entry placement, routes, documentation tab selection and independent scroll retention, all 15 contents targets and card expansion/collapse, title/body search, empty results, clearing, navigation outside filtered results, returning to About with its scroll retained, offline interaction with network requests blocked, simulated 1.5× rendered text, tablet technology columns/sidebar, and existing About/Profile actions. Browser runtime errors are checked in the phone suite.

Physical Android hardware back, TalkBack, OS font scaling, system safe-area behavior, and actual tablet/device interaction were not device-tested. The responsive checks use the exported React Native web application in Chrome. No production publish was performed.

### Completed checks — October 8, 2026

- `npm.cmd run typecheck` and `npm.cmd run lint` passed during implementation.
- Final configured-platform export passed: web (3,090 modules) and Android/Hermes (3,396 modules), in `.codex-tmp/information-final-export`.
- The expanded browser suite passed against that final export in light/dark themes at both phone and tablet sizes. All 15 contents targets, independent expansion/collapse, search states and filter-clearing navigation, scroll retention, offline interaction, larger rendered text, and existing About/Profile checks passed.
- Phone enlarged-text and tablet technology/policy screenshots were visually reviewed. The logo and main heading were separated after review to keep the CebSpot name readable at larger text sizes.
- Browser-script syntax and scoped whitespace checks passed. No live personal records or payment transactions were used.
