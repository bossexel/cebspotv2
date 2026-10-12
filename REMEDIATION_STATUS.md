# CebSpot remediation status

Updated: 2026-10-13 (Asia/Manila). Branch: `audit-remediation-2026-10-12`.

Release decision: **NO-GO**. No audit finding is closed by a passing build alone.

## Release contract

- Customer/owner: Android only. Render admin remains supported.
- Sole permitted reservation venue: `66666666-6666-4666-8666-666666666666`; actual active inventory must be verified before enabling bookings.
- PayMongo test mode only; no real wallet transfers, charges, or refunds.
- Checkout deadline: 5 minutes; first accepted manual proof: 30-minute review deadline, never extended by retries.
- Self-service account deletion removes personal data and preserves de-identified financial records.
- Production changes, existing-database destruction, credential rotation, and history rewriting are outside this execution.

## Findings

| Finding | Current status | Files / planned changes | Acceptance tests / evidence |
|---|---|---|---|
| LA-01 activity privacy | Isolated and complete-schema SQL tests pass; API/staging verification pending, deployed P0 not closed | `20261013000100_activity_privacy.sql`; activity and migration tests | Six roles, secondary owner, overlapping policy, forged events/profile escalation; evidence `phase-3-replay-upgrade-and-roles.json` |
| LA-02 schema history | Complete native PostgreSQL replay and isolated upgrade equivalence pass; full Supabase reset/API/staging pending | Two `20260901` foundation migrations; `supabase/MIGRATIONS.md`; complete replay harness | 16 SQL checks pass across migration/privacy suites; required surfaces and no business seeds; manifest retained |
| LA-03 inventory | 17 local inventory/client/settings regressions pass; actual client inventory confirmation and staging remain pending | `20261013000200_android_reservation_scope.sql`; stored-inventory normalization, spot service, booking/owner screens | Sole venue, protected owner confirmation, stale confirmation, invalidated inventory edits, no fabricated tables, discovery-only other venues, competing booking rejection |
| LA-04 manual proof | Local SQL/handler workflows pass; real Auth/Storage and Android verification pending | `20261013000300_manual_proof_and_bounded_holds.sql`; `private-upload`; checkout/proof services | Protected submission; six-role private access even with overlapping policies; denied trusted-field edits; approval rollback and concurrent duplicate approval |
| LA-05 checkout retries | Native SQL and actual-handler/SQL adapter tests pass; test-provider/staging scheduler gates open | `20261013000400_durable_checkout_and_payment_events.sql`; shared durable checkout handler; maintenance worker | Stable key and exact persisted request; active reuse; replacement waits for provider retirement; provider success/local failure recovery; no automatic replay beyond 23 hours |
| LA-06 payment consistency | 14 native transaction tests and 21 handler regressions pass; real provider/Auth/Edge delivery pending | Unique event inbox; atomic payment snapshot RPC; test-only signatures/provider API; maintenance reconciliation | PHP/amount/mode/reference; duplicates; cancellation race; late payment resolution; injected database failure rollback; original paid_at preserved; no return-URL authorization |
| LA-07 indefinite holds | Local expiry/interruption/review tests pass; staging scheduler and device verification pending | Server timestamps/deadlines; availability/expiry/approval locking; service-only sweep RPC | Five-minute unattached hold expiry; interrupted upload; fixed 30-minute review; late approval rejection; inventory released before next claim |
| LA-08 customer/owner web alerts | Outside Android v1 scope, not fixed; local distribution boundary verified | Separate Android/admin targets; unsupported native platforms denied; public owner portal/Vercel removed | 11 platform tests; default customer/owner web export rejected; actual exported admin route/login/recovery/alert checks pass; hosted deployment pending |
| LA-09 customer/owner web uploads | Outside Android v1 scope, not fixed; local distribution boundary verified | Customer/owner web routes absent; retained admin document viewing and static Android payment handoff | Android Hermes/admin exports pass; removed URLs rejected in actual admin artifact; Auth/Storage/device verification remains open |
| LA-10 upload abuse | Local implementation verified; actual Auth/Storage/Render/device acceptance pending | `20261013000500_request_bound_private_uploads.sql`; protected owner drafts/submission; persistent private upload quotas; orphan cleanup; authenticated bounded face jobs and Android client | 20 SQL/manual workflows; 12 final owner/cleanup checks; 16 upload/client checks; 9 Python ASGI/process/detector checks; fresh replay and TypeScript pass. Counts overlap across runs. Staging limits and real Auth/Storage still require verification |

## Additional release checks

Locally verified: map resume (11 runtime tests), server contacts/derived arrival slots and terms timestamp, no demo feed fallback, privacy route before signup, fail-closed missing Auth configuration. Cache/retry and responsive missing-page UI are implemented and typechecked; device verification pending. Open: account deletion, location sharing/leave, dependency advisory triage, final artifact/device verification.

## Baseline (read-only planning run, retained in chat)

- Typecheck and lint passed (both currently `tsc --noEmit`; no independent ESLint configured).
- `node --test tests/backend/*.test.cjs tests/platform/*.test.cjs`: 151 total, 146 passed, 5 skipped.
- Native PostgreSQL walk-in suite: 24 passed, including the five skipped concurrency cases above. Counts overlap; do not sum as unique tests.
- Android/Hermes export passed. Bounded source/Android bundle secret scan found no matches; history is not cleared.
- Map suite: 10 passed, hidden-screen camera restoration failed. Focused rerun failed too.
- Existing test expecting an unattached hold to remain after five minutes documents LA-07; passing it is not acceptance.

## Environment blockers

1. Supabase CLI/Docker are unavailable; configured loopback performance backend is unreachable. Next: provide a Docker-compatible runtime and pinned CLI, create a new disposable local stack, then replay/reset and run real Auth/PostgREST/Storage tests. Never reset an existing dataset.
2. No verified isolated hosted staging project. Next: supply its project identity/configuration through ignored environment files, provision six scoped test accounts, and run explicit target checks before staging writes.
3. No Android device attached. Next: attach an authorized phone, build/install the internal candidate, and execute the manual checklist.
4. PayMongo test credentials exist, but test-mode hosted integration/webhook delivery is unverified. Next: configure only the isolated staging webhook and verify test-mode sessions/events.

## Preservation and evidence

Initial HEAD, status, and staged/unstaged binary diffs are retained privately in `.codex-tmp/remediation-baseline/`. Existing changes remain in place. New phase checks and acceptance evidence will be linked here and in `FINAL_AUDIT_CLOSURE.md`.

## Phase 8 retained verification

See `FINAL_AUDIT_CLOSURE.md` and the `phase-8-*` command reports for both failed and successful runs. Local six-role documents, concurrent quota admission, same-email submission races, protected proof workflows, private orphan cleanup and Android bearer transport pass. Nine Python tests use the actual ASGI boundary, terminate a hanging process, and run real MediaPipe on a generated blank image; they do not establish human-face blur quality or deployed capacity. Actual staging/Auth/Storage/device tests remain required. Apply migrations in lexical order through `20261013000500_request_bound_private_uploads.sql`; schedule cleanup and deploy the matching authenticated face service/client together in staging. No production actions occurred.

## Phase 9 in progress

Map hidden-screen resume is corrected by resetting Leaflet's measured pixel origin after visibility returns; all 11 map runtime regressions pass. New migration `20261013000600_server_reservation_details.sql` derives inventory slot keys from exact arrival minutes before booking guards, validates contacts and future arrivals, and owns the terms timestamp. Thirty-one SQL/payment/manual/feed checks pass. Demo feed fallback on backend error is removed, retries preserve useful cached rows, missing service configuration cannot create a demo sign-in, and Privacy Policy is linked before signup. The new recovery route uses a scrollable narrow-screen layout. TypeScript passed after correcting the surface color and removing leftover test-payment flags. Account deletion, location sharing/leave, dependency/security scan and final artifact validation remain open.

Phase 9 circle implementation: `20261013000700_circle_location_controls.sql`, both circle screens, `CirclePrivacyControls` and the circle service. Local SQL/replay 11 pass; TypeScript passes. Coordinate sharing defaults off and requires explicit consent; delayed updates cannot reactivate a stopped generation. Direct profile coordinate writes are denied. Leave handles member removal, ownership transfer, expired invitations and empty-circle deletion. Staging/device/realtime tests remain required.
# Account deletion — local implementation in verification (phase 9)

Migration `20261013000800_account_erasure.sql` adds a resumable service-only cleanup job with two-minute quiescence, guards outstanding JWT access in restrictive policies and existing definer RPCs, transfers circle ownership, removes personal contributions/files, and retains de-identified reservation/payment rows. The authenticated `delete-account` function requires recent verified authentication and matching face-service cleanup credentials; Android exposes deletion from Profile. Active bookings, unresolved payments/session retirement, assigned venue owners and administrators return actionable blockers. Native Auth/Storage tables in tests are synthetic contract fixtures. Deployed Auth deletion, Storage cleanup, face-worker connectivity and Android interruption acceptance are **not yet verified**. No real account has been deleted.

# Account deletion local evidence

`phase-9-account-and-uploads`: 34 passed, including retained paid ledger data and existing actual payment handlers. `phase-9-deletion-handlers-verified`: 6 passed against native SQL with synthetic Auth/Storage and mocked face HTTP. `phase-9-account-replay-and-policies`: 41 passed including complete replay/upgrade, circle/privacy, manual proof, owner documents and late-upload removal. `phase-9-account-typecheck`: passed. Later race/verifier checks are retained separately. Exact staging configuration, interruption checklist and rollback boundary: `docs/account-deletion-verification.md`. Distributed Storage timeout/late-write safety and actual Auth deletion remain release gates.

# Account deletion group verified locally

`phase-9-account-race-verified`: 6 passed, including booking queued behind the deletion transaction and retained paid-ledger fields. `phase-9-face-deletion-final`: 12 passed, including authoritative active-profile verification, server-only cleanup, running-job cancellation and real detector smoke. Earlier race fixture retained an already-deleted JWT claim after `RESET ROLE`; fixed the fixture to explicitly reset claims before creating its new synthetic customer. No deployed acceptance is claimed.

