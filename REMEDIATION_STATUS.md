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
| LA-03 inventory | Open P1 | Reservation eligibility migration and client inventory guards | Sole allowed venue + real inventory; discovery-only elsewhere; stale availability/races |
| LA-04 manual proof | Open P1 | Authenticated upload endpoint, protected submission RPC, checkout/proof services | Upload/submission/review/approval; six-role private access; forged trusted fields |
| LA-05 checkout retries | Open P1 | Durable attempts in reservation_payments; checkout handlers | Retry/race/session reuse/retirement/provider-success-local-failure |
| LA-06 payment consistency | Open P1 | Webhook inbox, atomic payment RPC, reconciliation | Signature/amount/PHP/reference/mode; duplicates/out-of-order/cancellation/database failure |
| LA-07 indefinite holds | Open P1 | Server timestamps/deadlines; availability/expiry/approval locking | Unattached hold expiry; interrupted checkout; review timeout; competing callers |
| LA-08 customer/owner web alerts | Outside Android v1 scope, not fixed | Retained Android/admin boundary | Platform and admin artifact checks; deployed route verification pending |
| LA-09 customer/owner web uploads | Outside Android v1 scope, not fixed | Retained Android/admin boundary | Android durable uploads/private reviewer access; public web routes absent |
| LA-10 upload abuse | Open P1 | Private request-bound upload; face worker authentication/admission | MIME/size/ownership; per-user/queue/concurrency/timeout/cleanup/429 |

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
