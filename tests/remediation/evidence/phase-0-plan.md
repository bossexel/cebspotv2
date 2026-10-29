# Phase 0 plan and discovery summary

Branch: `remediation/audit-2026-10-29`  
Starting HEAD for this work: `6c2f598b40b07281f6cf0ff992426389fb3695cb`  
Working tree was clean at the start of this resumed local pass. Node `v22.18.0`; npm `11.19.1`.

## Baseline

- TypeScript typecheck passed.
- Full Node suite passed 397, failed 0, skipped 5 (402 total).
- Android export passed; this is a local Metro bundle/assets export, not an APK or device acceptance test.
- Administrator web export passed.
- Face service tests passed 22, failed 0, with one dependency deprecation warning after installing pytest 9.2.0 into the existing local virtual environment. Dotenv loading was disabled.
- The first local performance replay run failed because the test adapter could not model webhook provider GET requests and lacked VM globals and RPC fixture fields. A focused regression test reproduced this. After correcting only the synthetic adapter, local source/mocked-handler evidence passed 134/134 backend regression checks (5 skipped), 10/10 suite self-tests, all client algorithm checks, and payment replay bursts through 50 concurrent synthetic handlers with zero duplicate-row, state, or paid-timestamp violations. No HTTP requests were made; real backend load remains untested because Docker/Supabase CLI/local stack are unavailable and no local performance credentials were provided. The initial failure and corrected rerun remain separately recorded.

## Repository inventory

The current timestamped migration directory contains 24 migrations, not the earlier expected 23. The list is derived directly from `supabase/migrations`; the migration manifest/count test should therefore be inspected before adding any migration. Existing activity table protections and behavior are defined across `20260901000000_schema_foundation.sql`, `20260901000100_feature_foundation.sql`, `20261006000100_audit_authorization_hardening.sql`, and `20261013000100_activity_privacy.sql`. The activity privacy migration enables RLS, installs permissive and restrictive predicates, revokes client update/delete, validates inserts, and requests PostgREST schema reload. The table is in the existing Realtime publication through the schema foundation; subscriptions are filtered client-side for a user but effective row privacy depends on RLS.

Client/admin activity reads found: `src/services/activityService.ts` (recipient listing, creation and reminder path; Realtime subscription), `app/activity.tsx` (recipient activity screen), `src/services/adminDashboardService.ts` (admin dashboard query), and `app/admin.tsx` (admin Realtime refresh). Relevant privacy coverage exists in `tests/remediation/activity-legacy-upgrade.test.cjs` and `tests/backend/*activity*` / `tests/remediation/*activity*`; check exact positive/negative cases before changing policy definitions. Edge Functions present: `delete-account`, `payment-maintenance`, `paymongo-create-gcash-checkout`, `paymongo-create-qrph-checkout`, `paymongo-webhook`, `private-upload`, `private-upload-maintenance`, and `provision-owner-account`. Services: `src/services/reservationTableService.ts`, `src/services/venueTableService.ts`, `src/utils/tableInventory.ts`.

## Work plan by finding

| Finding / gate | Planned inspection or change | Validation/evidence |
|---|---|---|
| R-01 reservation event privacy | Reuse and verify the existing canonical activity privacy policy and six-role tests first; only add an independent additive migration if legacy-only applicability is required and does not duplicate or weaken canonical behavior. Write a mocked-only read-only probe script. | Existing activity legacy-upgrade/role tests; mocked probe unit tests; fresh-chain and legacy fixture SQL checks. No hosted probe. |
| R-02/R-03/R-04 schema alignment | Compare the complete migration chain with the tracked legacy fixture or clearly labeled historical approximation; derive an ordered idempotent upgrade from actual migrations and preserve seeded rows. | Local isolated PostgreSQL fixture tests; schema diff plus role/race/payment suites. |
| Edge deployments | Inspect the four named functions, auth/CORS/config and deployment refs in docs; add guarded staging-only tooling and runbook/secret-name schedule docs. | Mocked dry-run/refusal tests only; no deploy. |
| Client capability gating | Add side-effect-free bounded probes and cached fail-closed states for named backend contracts, then gate dependent Android UI. | Missing, inconclusive, and all-present capability tests. |
| R-05 inventory/reservability | Trace approval scope, inventory verification and booking entry; add read-only report plus manual-only conservative SQL if needed. | Inventory/release-scope regressions for unverified, zero-table and out-of-scope cases. |
| Dependencies | Trace runtime/build dependency parents and inspect current advisory state; make only compatible changes, document residual issues. | npm dependency tree/advisory report, typecheck, exports and suite after changes. |
| History/secret exposure | Add `.private/` to ignore rules first; inspect only path/commit/date metadata and count-only scan results for the five candidate historical paths. | Private ignored report; no blob contents or secret values in tracked output. |
| Face cold start | Inspect current client retry, health and job idempotency behavior; implement bounded safe recovery if absent. | Cold-timeout recovery, permanent failure and no-duplicate-job tests; document runtime assumptions. |
| Release verification | Extend test-mode payment/upload verification and guards; add operational acceptance/capacity/restore/on-call checklists and update audit status. | Mock-only test-key guard tests and full final verification suite. |

## Scope boundary

All actions in this branch are local. No hosted service, live payment provider, remote database, deployment command, or credential file was accessed. Passing local handler tests and local exports do not establish hosted deployment parity or production readiness.