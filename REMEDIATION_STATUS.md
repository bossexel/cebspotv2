# CebSpot remediation status

October 28 Saved follow-up: error/empty separation, retry, retained cached cards and failed-removal recovery now pass the actual-screen fixture journey. Explore and storage operations bind bookmarks to the originating account, ignore old responses and preserve existing IDs on failed reads. Four service regressions and the delayed-account-switch Explore journey pass; TypeScript passes. See [resumed evidence](docs/remediation-resume-2026-10-28.md). No hosted changes or deployment occurred.

October 28 user-perspective follow-up: current local screens completed 25 fixture observation steps without final runtime errors; actual map browser suite passed 13 checks, and booking selection, Saved recovery, Circle settings, account details, email-change and Your Posts fixture journeys passed. No Android device was attached and no real-data/backend/payment mutation occurred. The inert Activity menu and misleading location/presence/photo-privacy wording remain review findings. Current local Saved recovery is verified separately from deployment. See [current user remarks, evidence and limits](docs/user-walkthrough-2026-10-28.md). This does not close native/deployed acceptance or change the release decision.

October 28 free-booking correction: the form now collects a valid contact snapshot required by the authoritative schema; unconfigured creation cannot fabricate a booking, and schema mismatch cannot trigger a reduced-field insert. Focused client/server tests: 10 passed. The actual screen/client-to-new-native-PostgreSQL workflow passes with one stored free booking and no payment provider. Evidence is linked in the [resumed audit](docs/remediation-resume-2026-10-28.md); hosted/native-device acceptance remains open.

Latest resumed audit: **2026-10-28**, entry HEAD `6f0cb72`. Baseline TypeScript and complete current tests pass (376 passed, 5 skipped). A newly reproduced LA-03 compatibility regression allowed unverified legacy venues to advertise bookings. The local correction restores the sole-client/verified-inventory gate and rejects guest availability/checkout before payment when verification is missing. Focused current-chain inventory/checkout/privacy replay: **26 passed**; failing-before-fix evidence retained. See [resumed audit and exact external next steps](docs/remediation-resume-2026-10-28.md). The recorded runtime 1.0.4 public-beta publication is acknowledged; it does not close the original undeployed reservation/payment/security acceptance. No hosted changes occurred in this resumed audit.

October 24 user-perspective review: actual screen components were exercised with synthetic adapters (22 observation steps, no final runtime errors); real map runtime 11 passed, focused client regressions 30 passed, and booking table selection/disabled walk-in UI passed. No device was connected and no hosted writes occurred. New reproducible UX findings include an inert Activity menu, Saved Spots treating load failure as empty, and misleading location/presence labels. No app fixes or UAT approval are claimed. See [user walkthrough and remarks](docs/user-walkthrough-2026-10-24.md).

Latest publication check: **2026-10-16**. Android preview update requested; not published yet. Current TypeScript passes and `npm test` has 278 passed / 0 failed / 5 skipped. EAS preview is reachable at runtime 1.0.3, but points to the same backend/face targets as the existing app, with no explicit staging identity. Publication is held at the previously approved no-production boundary pending target classification. See [preview publication record](docs/preview-update-2026-10-16.md) and `tests/remediation/evidence/preview-publish-gate-2026-10-16.json`. The older readiness results below remain historical; no new deployed acceptance is claimed.

Updated: 2026-10-13 (Asia/Manila). Branch: `audit-remediation-2026-10-12`.

Release decision: **NO-GO**. No audit finding is closed by a passing build alone.

Final handoff: [Android release candidate verification, staging steps, manual checklist and rollback](docs/android-release-candidate.md). Exact retained commands/outcomes, changed-file list, migration application order/checksums, source hashes and final artifact hashes are linked there. Local code acceptance passes; deployed/physical-device gates and remaining dependency/history review stay open.

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

Locally verified: map resume (11 runtime tests), server contacts/derived arrival slots and terms timestamp, no demo feed fallback, privacy route before signup, fail-closed missing Auth configuration, guarded account deletion and private circle stop/leave. Cache/retry and responsive missing-page UI are implemented and typechecked. Final exports pass. Open: real Auth/Storage/provider/device acceptance, matching database-engine verification and residual dependency/history review. Earlier progress entries below are historical; latest final verification supersedes their local pending status.

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

# Final local validation and source retention

Final native remediation suite: **127 passed, 0 failed** (`final-remediation`). Existing backend/platform suite: **127 passed, 5 skipped** (`final-backend-and-platform`). Existing isolated performance helpers: 10 passed. The patched face stack passes 12 tests; its installed Windows environment advisory scan reports no known vulnerabilities. Android Hermes (8.3 MB) and isolated admin (4.01 MB) exports pass; the final admin browser artifact passes intercepted-traffic checks. The Android export is explicitly **offline verification only**, with backend configuration removed, not an installable/staging-approved release candidate.

The source-retention commit includes pre-existing Android source changes and required table/time/dev-route dependencies used by these exports. It preserves those changes rather than recreating a different source state. Initial diffs remain in the ignored baseline snapshot. Generated browser/scratch files and Expo device settings were removed from tracking in a separate hygiene commit; local files and Git history were not rewritten. Remaining unrelated user documents, tools and obsolete payment fixture changes are retained outside focused commits.

## Account deletion assignment race follow-up

Migration `20261013000900_block_deleting_owner_assignments.sql` follows 008. A retained failing regression demonstrated new venue responsibilities being attached to an account after deletion began. The guard now locks venue then profile, checks account activity after concurrent deletion commits, and rejects both direct venue assignment and delegated owner access. `deletion-assignment-concurrency`: **13 passed**, covering eight account checks plus complete migration replay/upgrade and role isolation. Matching-engine/Supabase/device gates remain open.

## Final acceptance record

Final remediation suite after migration 009: **130 passed, 0 failed, 0 skipped** (`final-remediation-after-owner-guard`). Final patched Python face environment: **12 passed** (`final-face-patched-environment`). Backend/platform: 127 passed / 5 optional legacy concurrency skips; new native policy/concurrency tests pass separately. TypeScript and repository lint pass (both invoke TypeScript, not a separate ESLint engine). Android Hermes, retained Render admin export/browser, map source/runtime and public-web denial pass. These are local results; the release decision remains **NO-GO** until the external gates in the handoff pass.

Dependency triage patched the two critical npm findings and vulnerable Python upload packages without a forced SDK upgrade. Npm still reports **65 affected packages: 36 high, 29 moderate**; their Android/build reachability review remains open. The final Windows Python environment reports no known advisories; Linux container scanning is pending. The actual Expo archive extraction helpers pass against patched tar after an idempotent compatibility patch. Clean online `npm ci` passes; the earlier offline install failed for an uncached package and was superseded, with both reports retained. Release export/EAS hooks require explicit staging configuration; offline verification clears public backend values. No production or provider operation occurred.

The [remaining root-package triage](docs/dependency-release-triage.md) records nine advisory roots and final lockfile parents. Android external links now pass a native intent guard before Router's legacy decoder; three regressions verify malformed/oversized rejection, valid return/OAuth/Unicode preservation and installed Router cold/warm hook integration. This mitigation does not clear the dependency advisory; the rebuilt Hermes and physical-device gate are recorded separately.

Final native-link TypeScript and rebuilt Android Hermes export both pass. The final Android bundle is `index-0cb0408e5312afce9edd14865e91c231.hbc` (8.3 MB), built from 3407 modules with public backend variables cleared. Artifact hashes are refreshed; this remains offline verification, not an installed APK. No source change occurred after the relevant regression/build checks.

## Final handoff boundary

Runtime source commit `ae9b024`; final source manifest contains 193 hashes and all 15 ordered migration checksums. `final-closure-secret-scan` passes with 551 current files and 106 exported files, zero matches/oversized omissions and zero HEAD-tracked browser/scratch artifacts. Five historical sensitive filenames still require private investigation; no historical-clearance claim, rotation or rewrite was made. The final evidence/documentation commit changes no runtime source. Original unrelated user changes remain preserved. Exact external next steps and Android acceptance/rollback are in the linked handoff; **NO-GO** remains in effect.

