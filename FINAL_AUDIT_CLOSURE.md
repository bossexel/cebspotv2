# CebSpot final audit closure — work in progress

Updated: 2026-10-13 (Asia/Manila).

**Recommendation: NO-GO.** Implementation is in progress; no P0/P1 finding is closed yet. See [REMEDIATION_STATUS.md](REMEDIATION_STATUS.md) for acceptance criteria and exact external next steps.

## Execution log

| Group | Work | Verification | Disposition |
|---|---|---|---|
| Phase 1 | Captured initial HEAD/status/staged and unstaged diffs without discarding edits; created approved local branch | Refreshed typecheck passed; backend/platform 146 passed, 5 skipped | Baseline complete; original map failure and external gates retained |
| Phase 2 / LA-01 | Explicit public allowlist; restrictive activity guard; authoritative owner relation; forged-event and profile identity protection | 11 isolated SQL tests passed across six roles, including overlapping permissive policy | Local implementation verified in isolated fixture; full-schema/API/staging gate remains open |
| Phase 3 / LA-02 | Added missing schema/feature foundations and complete replay harness; pinned local config; deprecated root deployment sequence | 16 tests passed: fresh native PostgreSQL replay, catalog-equivalent upgrade preserving fixture rows, six-role privacy | Full Supabase reset/API blocked by missing runtime; native SQL verification is complete for this group |
| Phase 4 / LA-03 | Sole-venue database gate; protected owner inventory confirmation; edits invalidate confirmation; live booking/owner flows use only stored tables | 17 focused SQL/client/settings tests passed; TypeScript passed | Actual venue inventory still requires owner confirmation in isolated staging; no venue data was edited remotely |
| Phase 5 / LA-04, LA-07 | Server-owned deadlines; protected manual proof RPC; private reservation-bound upload; direct customer updates denied; owner approval under venue lock | 23 SQL/handler/migration tests passed, including concurrency and injected transaction failure; TypeScript passed | Real Auth/Storage/API and Android tests remain pending; staging must schedule service-only expiry sweep |
| Phase 6 / LA-05, LA-06 | Durable attempts and exact requests, unique webhook inbox, atomic payment transitions, retirement/reconciliation worker, HTTPS Android return bridge, synthetic-only manual proof instructions | 14 native payment transaction tests; 21 actual-handler/native-SQL regressions; broader backend/platform/upgrade 132 passed, 5 skipped; TypeScript passed | Real provider test-mode integration, Auth/Edge delivery and maintenance scheduling remain required; no real provider calls performed |
| Phase 7 / LA-08, LA-09 | Retained existing Android/admin split, removed public web distribution and claims, documented static Android handoff | 11 platform tests; Android Hermes/admin exports pass; default customer/owner web export rejected; actual admin browser artifact passes route/auth-error/recovery/handoff checks | Both findings remain outside Android v1 scope, not fixed; Render was not deployed or disabled |
| Phase 8 / LA-10 | Authenticated owner drafts/protected submission; persistent upload quotas and scoped private documents; orphan maintenance; authenticated face upload/poll/download, bounded admission/queue/state, killable timed worker, cleanup | 20 SQL/manual checks; 12 final owner/maintenance checks; 16 upload/client checks; 9 Python ASGI/process/detector checks; replay/upgrade 5 passed; backend/platform 127 passed / 5 skipped; TypeScript passed | Actual Auth/Storage, Render memory/queue behavior and Android photo quality/interruption remain staging/device gates. Exactly one face worker and one replica required; no hosted changes |

## Command record

Read-only planning checks and their outcomes are recorded in REMEDIATION_STATUS.md. Execution-phase validation commands will be retained under `tests/remediation/evidence/commands/`; each report includes command, exit status, sanitized output, and limitations. Inspection commands are retained in the session transcript.

- `git switch -c audit-remediation-2026-10-12`: first attempt failed because `.git` is read-only in the sandbox; escalated retry passed.
- Initial status and baseline diff capture: passed; snapshot is ignored and contains no published private data.
- `node scripts/remediation-check.cjs phase-1-typecheck npm run typecheck`: passed.
- `node scripts/remediation-check.cjs phase-1-backend node --test tests/backend/*.test.cjs tests/platform/*.test.cjs`: passed, 146 passed / 5 skipped (not database concurrency acceptance).
- `node scripts/remediation-check.cjs phase-2-activity-privacy node --test tests/remediation/activity-privacy.test.cjs`: failed because the fixture admin function inherited an empty search path. Corrected fixture to use a qualified table and pinned search path; failed evidence retained.
- `node scripts/remediation-check.cjs phase-2-activity-privacy-verified node --test tests/remediation/activity-privacy.test.cjs`: 11 passed.
- Phase 3 initial replay failed on an embedded UTF-8 BOM in an archived SQL source; removed BOM from the newly captured foundation. Next run exposed a test assertion mistaking the existing `physical_venue_tables` function for a table; corrected the assertion without creating a duplicate structure. Full-role run then exposed a multi-statement prepared query in the new test helper; split session setup into separate calls. All failed command evidence is retained.
- `node scripts/remediation-check.cjs phase-3-replay-upgrade-and-roles node --test tests/remediation/migrations.test.cjs tests/remediation/activity-privacy.test.cjs`: 16 passed.

The phase 3 commit includes the two pre-existing untracked October migrations unchanged because fresh-checkout migration replay depends on them. Other pre-existing changes remain outside these commits.

- `node scripts/remediation-check.cjs phase-4-inventory node --test tests/remediation/inventory.test.cjs tests/remediation/migrations.test.cjs tests/backend/owner-reservation-settings.test.cjs`: 17 passed / 3 failed because new rejection assertions did not include existing guard messages. Full migration/upgrade checks passed.
- `node scripts/remediation-check.cjs phase-4-inventory-verified node --test tests/remediation/inventory.test.cjs tests/remediation/inventory-client.test.cjs tests/backend/owner-reservation-settings.test.cjs`: 16 passed / 1 failed on another pre-existing rejection message. No authorization was relaxed.
- `node scripts/remediation-check.cjs phase-4-inventory-final node --test tests/remediation/inventory.test.cjs tests/remediation/inventory-client.test.cjs tests/backend/owner-reservation-settings.test.cjs`: 17 passed.
- `node scripts/remediation-check.cjs phase-4-typecheck npm run typecheck`: passed.

Phase 4 touches previously modified reservation/owner screens and inventory/spot/type modules. Their existing changes are preserved; focused path commits necessarily retain those in-scope dependencies. The initial snapshot remains available to distinguish pre-existing work.

## Deliverables pending

LA-by-LA verified fixes, changed-file/commit manifest, migration order and checksums, regression outcomes, Android manual checklist, isolated staging instructions, rollback instructions, final artifact hashes, and final release recommendation.

## Unverified claims and boundaries

No production deployment/data changes, real payment, refund, credential rotation, history rewrite, or existing database reset has been performed. Full-stack local, staging, test-provider and device verification remain blocked as documented in REMEDIATION_STATUS.md. LA-08/LA-09 are outside customer/owner Android v1 scope, not repaired web features.

- Phase 4 broad backend initially failed an obsolete generated-inventory source assertion. Updated it to require stored inventory and protected confirmation; an initial correction used the wrong call signature and was corrected after inspecting the call. Failed evidence retained.
- `node scripts/remediation-check.cjs phase-4-backend-final node --test tests/backend/*.test.cjs tests/platform/*.test.cjs`: 146 passed, 5 skipped.


- `node scripts/remediation-check.cjs phase-5-typecheck npm run typecheck`: passed.
- `node scripts/remediation-check.cjs phase-5-manual-proof node --test tests/remediation/manual-proof.test.cjs`: 10 passed (initial workflow set).
- `node scripts/remediation-check.cjs phase-5-workflows node --test tests/remediation/manual-proof.test.cjs tests/remediation/private-upload.test.cjs tests/remediation/migrations.test.cjs`: 23 passed. Tests use fresh loopback PostgreSQL and isolated handler adapters; they do not prove deployed Auth/Storage behavior.


- `node scripts/remediation-check.cjs phase-5-proof-client node --test tests/remediation/proof-client.test.cjs`: 4 passed.
- `node scripts/remediation-check.cjs phase-5-existing-backend node --test tests/backend/*.test.cjs tests/platform/*.test.cjs`: 146 passed, 5 skipped.
- Phase 5 requires deploying the new authenticated private-upload function with the migration; old publicly addressed proof paths require resubmission. Schedule `expire_incomplete_reservation_holds()` with a server-only staging scheduler at least once per minute. Expired holds stop blocking inventory immediately even before the sweep persists cancellation. Provider session retirement is the next audit group.


- Phase 6 migration replay/upgrade initial compile: 5 passed. Payment transaction suite initially had 24 passed / 1 failed because renaming the archived void function invalidated its self-qualified parameter; replaced that internal function body explicitly. Verified payment transaction suite: 14 passed. Manual proof suite had 11 passed in the combined run.
- Phase 6 initial HTTP/SQL handler suite had 7 passed / 12 failed because fake provider/event IDs collided across fixtures. Each fixture now has unique IDs and a shared synthetic provider account. Failed evidence retained; rerun is in progress.


- `phase-6-typecheck` and `phase-6-typecheck-final`: passed; commands retained in their JSON reports.
- `phase-6-payment-handlers-verified`: 15 passed / 4 failed because fake intent IDs still collided; made intent IDs unique too. `phase-6-payment-handlers-final`: 19 passed.
- `phase-6-handler-recovery-boundaries`: 3 passed (targeted scheduler recovery, full database outage, and stale-key boundary).
- `node scripts/remediation-check.cjs phase-6-backend-and-upgrade node --test tests/backend/*.test.cjs tests/platform/*.test.cjs tests/remediation/migrations.test.cjs`: 132 passed / 5 skipped, including all 21 current payment handler tests and fresh/upgrade schema checks. Counts overlap targeted runs and must not be summed as unique tests.
- Payment staging configuration, test journeys, exact reconciliation steps for stale unknown outcomes, provider references and rollback boundary: `docs/payment-release-verification.md`. No provider or production call occurred. The existing payment test command now executes actual handlers against native SQL rather than the obsolete split-write fixture.


- `node scripts/remediation-check.cjs phase-7-platform node --test tests/platform/android-only.test.cjs`: 11 passed.
- `node scripts/remediation-check.cjs phase-7-android-export npm run build:android -- --output-dir .codex-tmp/remediation-android-phase7 --max-workers 1`: passed, Android Hermes bytecode retained locally.
- `node scripts/remediation-check.cjs phase-7-admin-export npm run build -- --output-dir .codex-tmp/remediation-admin-phase7 --max-workers 1`: passed.
- `node scripts/remediation-check.cjs phase-7-denied-customer-web node tests/platform/deny-customer-web.cjs`: passed; child default web export was rejected as required.
- With `ADMIN_WEB_EXPORT_DIR=.codex-tmp/remediation-admin-phase7`, `node scripts/remediation-check.cjs phase-7-admin-artifact npm run test:admin-web`: passed; all backend and external traffic intercepted.
- `node scripts/remediation-artifact-manifest.cjs phase-7 .codex-tmp/remediation-android-phase7 .codex-tmp/remediation-admin-phase7`: artifact hashes retained in `tests/remediation/evidence/phase-7-artifacts.json`. These exports precede the remaining upload/account/privacy fixes and are not the final candidate.
- Phase 7 commits retained pre-existing platform-boundary work and its in-scope docs/configuration, including the required package lock. Original browser/scratch deletions remain staged separately.


Phase 8 command evidence: `phase-8-private-upload-migration`, `phase-8-owner-private-database-verified`, `phase-8-upload-acceptance-verified`, `phase-8-upload-client-coverage`, `phase-8-face-complete`, `phase-8-typecheck-verified`, `phase-8-backend-regression` under `tests/remediation/evidence/commands/` all passed. Earlier failures are retained: concurrent PostgreSQL clients exceeded the test harness's 500 ms connection deadline (raised only independent client connect timeout to 5 seconds; SQL query limits unchanged), an incorrect TypeScript import path was fixed, and the duplicate-email rejection assertion was aligned with the existing guard's exact message while adding a database count check. Python could not launch within the sandbox; the installed runtime and native detector suite passed when run outside it. No remote network is used by these Python tests.

Phase 8 staging and rollback instructions: `docs/upload-release-verification.md` and `face-blur-service/README.md`. The hourly private-upload cleanup uses Storage API removal; client object deletion remains denied. Partial uploads are retained privately until that bounded orphan cleanup. Original in-scope image-client changes were preserved while adding authentication and stopping automatic 429 upload retries.

Phase 9 (in progress): `phase-9-map-build` and `phase-9-map-regression` pass (11 map checks); `phase-9-details-and-feed` passes 31 checks against full native SQL and actual service modules. `phase-9-route-regression` passes 3 route/feed checks. `phase-9-details-typecheck` initially found a nonexistent theme color and leftover removed demo-payment flags; corrected, and `phase-9-details-typecheck-verified` passes. UI cache/retry and narrow-device behavior still require Android manual acceptance. New server-detail migration is appended after phase 8; arrival minutes and existing schedule semantics are preserved.

The phase 9 broader backend/platform/replay run initially passed 130 and failed 2: an obsolete source assertion expected the removed demo-discovery fallback, and the full-schema privacy fixture omitted the newly required contact details. Updated that assertion to require no sample fallback and retry, and supplied valid synthetic contacts/arrival in the unchanged six-role authorization test. `phase-9-details-replay-regression` then passed all 9 checks. `phase-9-ui-typecheck-complete` passed. This group retains the pre-existing privacy/information pages and their dependencies so the new pre-signup link is reproducible from Git; it does not invent an organizational policy approval.

Circle controls implemented locally: coordinates now use a private consent-bound table instead of generally readable profiles; stop rotates the publication generation, clears coordinates, and defeats delayed updates; leave transfers ownership, invalidates invites and deletes empty circles. Both Android circle surfaces expose controls and refresh member data on realtime events with a 15-second fallback (offline caches cannot be erased remotely). `phase-9-circle-privacy` passed 11 native SQL/replay/upgrade checks, including concurrent stop/publish, six roles, stale coordinates, owner transfer and invite revocation. `phase-9-circle-typecheck` passed. Device and deployed realtime acceptance remain open. The migration clears legacy profile coordinates when eventually applied; review that change on a backup/isolated staging copy before any existing database application. No remote data was changed.
