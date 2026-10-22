# CebSpot Technical Documentation screen

## Changes and editable content

- `app/documentation.tsx`: requested TECHNICAL DOCS / CebSpot header and subtitle, uppercase segmented controls with contrasting raised selection, beige overview/technology/feature cards, four numbered architecture layers, and a separate Integration Specifications card. Mounted tab scroll views preserve reading positions. Phones use one column; sufficiently wide screens can use two technology columns. Larger native font scales use full-width tabs and single-column technology cards.
- **`src/constants/documentation.ts`**: the exact content file to rewrite manually. It contains the hero text, control/section labels, platform summary, technologies, detailed features, four architecture layers with technology chips, and five integration flows including failure handling. Entries use stable IDs, category labels, titles, paragraphs, supporting blocks/lists, chip arrays, and icon identifiers. Core text is locally bundled.
- `src/components/InformationContent.tsx`: optional documentation appearance and supporting-bullet rendering, colored icon tints, and identifiable chip containers. Defaults remain unchanged for existing non-documentation consumers, including Privacy Policy.
- `tests/about/documentation.cjs`: complete-content, tab/selection, chip, safe-area-wrapper, and bottom-space browser checks.
- `tests/about/documentation-screen.cjs`: isolated fixture-based documentation suite, including entry placement, routes, scroll retention, header and browser-history back, offline reading, themes, larger rendered text, and runtime error checks.
- `tests/about/about.cjs`: integrates documentation checks into the existing combined suite and updates architecture heading expectations.
- This report.

The existing About entry remains inside the first logo/slogan/introduction card, with its icon and chevron. Its route, native stack registration, shared back action, and safe-area wrapper are reused. No permission, authentication, reservation, payment, owner, or policy behavior was changed. No dependencies were added.

`src/constants/informationContent.ts` defines the established content shapes and supported icon IDs; it did not need changes. Keep content IDs stable when rewriting titles or ordering sections. Feature supporting paragraphs/lists are displayed as implementation bullets; contextual blocks remain panels. Integration entries in `flows` become supporting subsections inside the single Integration Specifications card.

## Verified statements and sources

| Topic | Verification and repository sources |
| --- | --- |
| Mobile framework/navigation/state | `package.json`, `app/_layout.tsx`, `useAuth`, `useTheme`, React hooks/context, AsyncStorage. Expo Router is present; no Zustand claim is made. |
| Build/distribution | `eas.json` defines development-client/internal development, internal preview, production profiles, and preview/production channels. Expo update configuration and installed-build behavior are separate from Supabase backend responsibilities. No store release is asserted. |
| Public discovery/loading | `spotService.getSpots` queries public records with a discovery limit, creation ordering, and live subscriptions. `app/index.tsx` shows loading, empty, and connection/error states; configured-backend failures do not silently become sample results. |
| Search/filtering | `app/index.tsx` matches trimmed lowercase substrings in name, address, and categories; category, stored rating, and distance filters operate on loaded data. Default radius is 10 km, with 1/5/10/25/50 km choices. |
| Distance and recommendations | `src/utils/distance.ts` uses Haversine distance. `similarSpots.ts` requires category relevance, defaults to six matches, has no separate fixed radius, and ranks by category score, venue-to-venue distance, rating, review count, recency, and name. The score gives 8 for a primary match, 4 per exact category-label match, plus shared words. No road-distance, travel-time, or AI claim is made. |
| Maps | `MapSurface` and `src/components/map/runtime.js` use Leaflet, individual category-styled markers, selected state, a native WebView bridge, and the web iframe implementation. Runtime zoom limits are 11–18; Explore starts at 14. Tile fallback/retry behavior is present. `mapTiles.ts` verifies configured provider selection and static imagery behavior. |
| Permission behavior | `useLocation.ts` requests foreground location and can try last-known location after errors. Discovery uses the Cebu reference point without a device coordinate. Circle code separately stores/shares member coordinates; no claim that location is never stored is made. |
| Venue/review behavior | Venue details, `reviewService`, and `reviewMediaService` verify galleries, contact/opening fields, direct review insertion, newest-first reads, replies, reports, helpful votes, and supported photo uploads. The detail screen averages loaded ratings above zero; discovery uses the spot record's rating. No user-facing review-edit action was found. |
| Contributions | `app/submit-spot.tsx` supplies name, optional description, address, categories, coordinates, media, and reservation-capability input. Submission/draft/queue services and administrator workflows define storage, failed states, review, and publication. |
| Media and access policies | `supabase-schema.sql` defines public gallery buckets and supported account-folder upload policies, with related-booking payment-proof access. Media services use public gallery/review URLs and time-limited proof links. Pending-listing visibility does not imply private uploaded media. |
| Face processing | The configured image-anonymization client, submission/review/owner-gallery services, Python requirements, and `services/face_blur.py` verify FastAPI, MediaPipe, OpenCV, Pillow, NumPy, job polling, retries, and supported failure handling. Profile pictures/videos have different paths; local draft originals can remain. |
| Rewards | `supabase-gamification.sql` defines positive rating +1, non-empty review +10, detailed review +5 at 150 characters, media event distinctions, reference-based awards, helpful voting restrictions, and levels based on 100 XP. `gamificationService` reads backend summaries/achievements. Definitions are not promised as identical in every deployment. |
| Availability/conflicts | Reservation screens/utilities call availability and reserved-table functions. `supabase-schema.sql` and `supabase-reservation-locking.sql` define an active-table/slot/date/venue unique index, excluding cancelled/completed/no-show records and requiring non-null table/slot. The service maps conflicts to a clear choose-another-slot message. This protection is described as repository-defined, not deployment-guaranteed. |
| Payments and states | Checkout creates pending-payment records; Supabase payment functions check booking ownership, and webhook processing verifies provider signatures/status. Manual approval checks venue ownership/assignment and eligible proof/reference data in the authorization-hardening migration. Booking and payment states are distinct; browser/GCash return alone is not verification. Pending confirmation polling is four seconds. |
| Authorization/owner architecture | Repository SQL enables RLS and defines account/public/owner access policies, with later hardening migration changes. The role-based owner dashboard runs inside the Android app and shares backend services. The browser owner portal was removed on October 13, 2026. |
| Notifications | Existing activity, submission, and reservation-reminder services use live updates plus eligible local Android Notify Kit alerts. Native-module availability and permission matter; no unverified always-delivered remote push service is claimed. |

## Verification limits

The three screenshots were not attached to the visible request, so layout follows its detailed visual specification; no pixel comparison with those images is claimed. The current hosting provider of the image service was not independently verified. Render deployment configuration/documentation exists, but that alone is not proof of active hosting, so displayed content does not assert it.

Repository policies, unique indexes, and scoring functions were inspected. This is not a deployed-rule audit, live detection benchmark, payment transaction test, provider contract review, release/distribution verification, or legal/security certification. Credentials, private endpoints, personal records, and configuration values are not included in the displayed documentation. No unsupported performance numbers, heatmaps, OCR, transit/weather features, or invented integrations were added.

Android hardware back remains handled by the existing Expo Router stack. The root custom handler targets other top-level routes rather than documentation. Browser-history back and header back are tested, but physical Android hardware back, TalkBack, OS text scaling, and device/system safe areas were not device-tested. Larger-text tests enlarge rendered web text; native font-scale layout fallback is implemented but not claimed as device-tested.

## Reproduce checks

```powershell
npm.cmd run typecheck
npm.cmd run lint
$env:EXPO_OFFLINE='1'
$env:CI='1'
node node_modules/expo/bin/cli export --platform all --max-workers 1 --output-dir .codex-tmp/technical-docs-final-export
$env:ABOUT_EXPORT_DIR='.codex-tmp/technical-docs-final-export'
$env:PLAYWRIGHT_CHROMIUM_CHANNEL='chrome'
node tests/about/documentation-screen.cjs
```

Configured export targets are web and Android/Hermes. The isolated browser suite uses synthetic auth/profile fixtures and intercepted requests, then blocks network requests to test local reading. It does not depend on or modify live records. Screenshots are saved under `.codex-tmp/technical-*`.

The combined `tests/about/about.cjs` was attempted but stopped at its pre-existing reference-policy comparison: current user-edited privacy content differs from `privacy-reference.txt`. Those unrelated content/fixture differences were preserved. The isolated documentation suite tests this feature independently; the full combined suite is not reported as passing.

## Completed checks — October 8, 2026

- Repository typecheck and lint passed; typecheck passed again after the final content and large-font layout adjustment.
- Final web and Android/Hermes exports passed in `.codex-tmp/technical-docs-final-export` (3,090 and 3,396 modules respectively).
- The isolated documentation browser suite passed against that final export in both themes at 320×640 and 1024×900. Every configured technology card, feature paragraph/bullet, layer/chip, and integration subsection was checked. Selected states, phone/tablet technology columns, chip bounds/wrapping, bottom spacing, About entry/navigation, independent scroll positions, header/history back, offline reading, larger rendered text, and runtime-error checks passed.
- Normal phone overview and dark enlarged-text architecture/chip screenshots were visually reviewed. Script syntax and scoped whitespace checks passed.
- The combined About/privacy suite remains blocked by unrelated edited-policy/fixture differences described above. No physical-device test, real payment, live-record change, or production deployment occurred.
