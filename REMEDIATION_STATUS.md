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

Open: truthful demo/offline states, contact/time validation, pre-signup privacy, account deletion, location sharing/leave, narrow-screen recovery, map resume regression, dependency advisory triage, final artifact/device verification.

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
