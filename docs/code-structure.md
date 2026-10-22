# Code structure and regression checks

Routes stay in `app/` for the Android customer and owner app, and `admin-app/` for the hosted admin console. Keep route access checks, navigation, and screen orchestration there.

Dashboard code is organized by responsibility:

| Location | Responsibility |
| --- | --- |
| `src/features/admin-dashboard/components.tsx` | Admin tables, panels, badges, notices, and empty/loading states |
| `src/features/admin-dashboard/presentation.ts` | Admin search filters and display formatting |
| `src/features/admin-dashboard/styles.ts` | Admin palette, fonts, and styles |
| `src/features/owner-dashboard/model.ts` | Owner gallery composition, ratings, payment approval, and attendance eligibility |
| `src/features/owner-dashboard/styles.ts` | Owner dashboard palette and styles |
| `src/services/adminDashboardService.ts` | Supabase reads, mutations, fallback handling, and row normalization |
| `src/services/admin-dashboard/analytics.ts` | Pure dashboard aggregation and chart series calculations |
| `src/services/admin-dashboard/types.ts` | Admin data contracts, also exported by the existing service entry point |

Shared upload code lives in `src/utils/base64.ts` and `src/utils/mediaFile.ts`. Services retain their source validation, authentication, file limits, privacy processing, storage paths, and cleanup responsibilities. Verification documents deliberately allow fewer URI schemes than photos. `readMediaBody` reads bytes; callers enforce which sources are allowed.

The two PayMongo client methods share request and response handling in `paymongoCheckoutService.ts`. Each method still calls its own edge function with the original request body.

Daily analytics use a date-indexed map for event buckets, avoiding a bucket scan for each reservation, spot, and report. Existing date boundaries, chart scaling, and revenue rules are preserved.

Run the local checks with:

```sh
npm run typecheck
npm test
```

`npm test` includes the backend, remediation, platform, and refactoring suites. External PostgreSQL tests retain their existing conditional skips. The refactoring suite covers binary decoding, media routing and rollback, checkout error handling, approval and attendance rules, galleries, search, and analytics. The isolated client loader follows local source imports while requiring explicit mocks for external dependencies.

Check both platform exports after changes to shared modules:

```sh
npm run build:android
npm run build
```
