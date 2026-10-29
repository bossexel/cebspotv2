# CebSpot audit closure — local verification and external gates

Fresh audit rerun: [October 28–29 source and hosted checks](LAUNCH_AUDIT_2026-10-29.md) retain 391 passing checks / five skips, passing exports and confirmed live activity exposure plus unavailable booking/upload/deletion/payment-maintenance contracts. General-launch recommendation remains **NO-GO**. The refreshed `--omit=dev` advisory count is 29; the broader dependency handoff uses a different scan scope.

Current consolidated handoff: [October 29 review](docs/android-release-candidate-2026-10-29.md), application/dependency source `023f5a0`. It maps every LA finding to local evidence and remaining external acceptance, links changed files/migrations/commands, and supplies staging, rollback and Android manual steps. Local changes are committed; native/deployed gates keep the recommendation **NO-GO**.

Latest local verification, **October 29**: 391 JavaScript/SQL/handler checks pass (5 optional legacy skips), 22 face checks pass, TypeScript/lint and final Android/admin exports pass, admin browser/web denial pass, and the current source/export secret scan has no matches. Python audit/consistency pass; npm retains 30 affected packages including 3 high. **NO-GO remains for unrestricted UAT/production** until isolated staging, Auth/Storage/provider/email, Linux-image and native-device gates pass. The exports are local verification artifacts. The original findings are not declared broadly closed by these builds. See [current resumed evidence](docs/remediation-resume-2026-10-28.md).

October 29 Python security refresh: current audit reports no known findings after targeted updates to four packages; all 22 face regressions and dependency consistency pass. The initially nonzero audit is retained and historical clean results are not substituted for the new scan. Service dependency pins and Docker setuptools pin reflect the tested versions; Linux image/native/hosted acceptance remains open.

October 28 face-test follow-up: all **22 tests pass** after measuring API cold start in a fresh process. The prior combined-discovery failure is explained and retained; no service behavior was weakened. Native images, Linux container/hosted memory and distributed cleanup are not accepted by these synthetic checks.

October 28 UX group verified locally: removed inactive menu, truthful location/presence wording, shared coordinate validation, accessible filter recovery and corrected photo notice. Full current JavaScript/SQL/handler suite passes **391 tests with 5 optional legacy skips**; 26 updated fixture-screen observations, eight location/privacy checks, TypeScript and actual free-booking workflow pass. These results do not establish native or hosted acceptance. Face-service combined discovery exposed a cold-start test isolation failure; it is being investigated separately and is not declared passed here.

October 28 Saved recovery group: local error/retry/cache/removal/account-switch behavior passes its actual-screen journey, four bound-storage service checks and the actual Explore/service delayed-response journey. Failed initial loads cannot overwrite bookmarks, and previous-account responses cannot refill the new account. TypeScript passes; native/deployed verification remains open.

October 28 user-perspective review: [current remarks and evidence](docs/user-walkthrough-2026-10-28.md) record 25 completed local fixture-screen observations, 13 actual-map runtime checks and passing booking-selection/Saved/Circle/account/email/Your Posts journeys. No device was connected or real backend changed. Menu/location/privacy wording findings remain open. The current local Saved error/retry/cache behavior passes its focused UI check; this is not proof of deployment or full Android acceptance. TypeScript passes.

October 28 free-booking follow-up: normalized name/email/mobile now accompanies free reservations, invalid contact prevents confirmation, and unavailable/schema-incompatible backends cannot generate fake or stripped-field bookings. Ten focused client/server checks and the actual screen/client-to-isolated-PostgreSQL workflow pass. Earlier helper failures and pre-fix service failures are retained separately. No hosted booking or provider request occurred.

October 28 resumed audit: current TypeScript and baseline tests pass (376 passed / 5 skipped). Three newly retained failing tests reproduced unverified legacy reservation eligibility. The correction restores the approved sole-client/verified-inventory boundary; 26 inventory/checkout/full-migration/role checks pass. [Current evidence and deployment boundary](docs/remediation-resume-2026-10-28.md) distinguish the later public-beta publication from acceptance of the full original schema/payment/privacy scope. No external mutations were performed. Additional local release review continues; no GO recommendation is made from this focused group.

October 24 user walkthrough: [notes and evidence](docs/user-walkthrough-2026-10-24.md) record 22 completed fixture UI observations, 11 actual map browser checks, 30 isolated client regressions and a booking-selection UI check. No Android device was attached; no production interaction, booking/payment submission or app-code change occurred. The review identifies unfinished menu behavior, misleading saved-load failure and location labels, and wording/accessibility improvements. These remain review findings, not resolved issues or new UAT acceptance.

October 16 preview update attempt: user authorized Android preview/test publication. TypeScript and 278 current tests pass (5 skips). Read-only EAS checks confirm preview/runtime 1.0.3, but preview still uses the existing application's backend and face targets without explicit staging identification. Nothing published; backend classification requested to honor the existing no-production boundary. See [publication record](docs/preview-update-2026-10-16.md). This does not change the UAT NO-GO recommendation.

Updated: 2026-10-13 (Asia/Manila).

**Recommendation: NO-GO for user testing/production.** Local implementations and retained tests pass as recorded below; deployed P0/P1 acceptance is still blocked by isolated staging/Auth/Storage/provider/device verification. LA-08/09 are outside Android scope, not repaired web features. The final Android export is backend-disabled verification bytecode, not an installable or staging-approved release candidate. See [handoff, staging, manual tests and rollback](docs/android-release-candidate.md) and [REMEDIATION_STATUS.md](REMEDIATION_STATUS.md).

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
| Phase 8 / LA-10 | Authenticated owner drafts/protected submission; persistent upload quotas and scoped private documents; orphan maintenance; authenticated face upload/poll/download, bounded admission/queue/state, killable timed worker, cleanup | Focused SQL/client checks pass; final patched face environment 12 passed; backend/platform 127 passed / 5 skipped; TypeScript passed | Actual Auth/Storage, Render memory/queue behavior and Android photo quality/interruption remain staging/device gates. Exactly one face worker and one replica required; no hosted changes |
| Phase 9 / Android release defects | Map resume, truthful feeds/cache/retry, server contacts/slots, pre-signup privacy, narrow recovery, private circle consent/stop/leave, guarded resumable account deletion, dependency patches and staging build guard | Final remediation suite 130 passed; face 12 passed; existing backend/platform 127 passed / 5 skipped; isolated helpers 10 passed; typecheck/lint, Android Hermes, admin export/browser, web-denial checks pass | Offline export is not an APK. Real Auth/Storage/provider/device, matching PostgreSQL 17 and residual advisory/history review remain release gates |

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

## Release deliverables

The [Android release handoff](docs/android-release-candidate.md) links the LA-by-LA findings, changed-file/source manifests, ordered migration checksums, retained command outcomes and final artifact hashes. It includes exact staging/Render redeployment steps, the Android manual checklist, rollback boundaries and the NO-GO recommendation. External acceptance gates remain open.

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
# Phase 9 account deletion — verification in progress

Added the protected resumable deletion path and Android entry point; initial fresh/upgrade replay passed 5 checks and initial account database suite passed 5 checks after correcting test setup to use the existing refund enum and protected circle joining. Failed runs are retained. Additional payment-ledger, handler interruption, private-upload race and face cleanup checks are underway. Do not claim deployed deletion acceptance or a release GO from these local fixtures.

# Account deletion evidence update

Account/payment/upload regressions: 34 passed. Handler interruption/retry suite: 6 passed. Full migration/circle/manual/owner-upload replay group: 41 passed. TypeScript passed. Face-service deletion tests passed 11 checks before adding a separate locked-profile verifier test. Latest reports remain authoritative; counts overlap and must not be added as unique tests. `docs/account-deletion-verification.md` records exact configuration and remaining distributed/device gates. The Profile change retains the user's pre-existing in-scope changes.

# Account deletion group completion

Latest focused SQL race suite passed 6 checks and face service passed 12 checks; handler suite passed 6. These implement and verify the local account deletion group. Native Auth/Storage contracts and mocked HTTP do not close actual deployed deletion, timeout/late-write, reauthentication or device acceptance. All failed runs remain in evidence. Migration 008 follows circle migration 007 and keeps financial identifiers while erasing direct personal fields.

# Final local verification update

`final-remediation`: 127 passed. `final-backend-and-platform`: 127 passed, 5 skipped. `final-existing-isolated-tests`: 10 passed. TypeScript/lint passed. Final Android Hermes and separate admin exports passed, and final admin browser routing/auth feedback/recovery/return-bridge checks passed with all external traffic intercepted. Customer/owner web export is still denied. New release environment validation refuses the existing hosted targets and public private credentials; no isolated staging configuration has been supplied, so the Android export is offline verification only.

Dependency updates reduce npm findings from 77 (2 critical) to 65 (0 critical). A real Expo Windows extraction test caught tar 7's removed default export; a narrow idempotent postinstall patch supports both affected Expo archive paths, verified against each actual helper. The Python upload stack and local installer tools were patched; final installed-environment audit reports no known vulnerabilities. Container/Linux and native APK dependency acceptance remain unverified. No forced SDK upgrade was used.

Generated browser/scratch tracking was removed in `a8f7d1d` without removing local files or rewriting history. The original staging deletions were committed separately after checking that the index contained only the intended generated directories. Required existing Android source/test dependencies are retained as their own reviewable group; unrelated user work remains untouched.

## Final deletion concurrency correction

The retained `deletion-assignment-race-red` test reproduced an owner assignment after deletion began. Migration `20261013000900_block_deleting_owner_assignments.sql` rejects assignments to inactive/deleting accounts and serializes assignments with deletion using venue-then-profile locks. `deletion-assignment-concurrency` passes all 13 account/replay checks, including a grant that started before the deletion transaction committed. This is a local PostgreSQL result, not deployed Auth acceptance. No existing account or hosted data was changed.

## Final source verification

`final-remediation-after-owner-guard`: **130 passed, 0 failed, 0 skipped**, including the complete final migration chain, transaction/policy/concurrency regressions, actual payment handlers with mocks, deletion races, upload clients, release configuration and archive compatibility. `final-face-patched-environment`: **12 passed** on the final installed Python dependency versions. The clean lockfile install, its postinstall compatibility patch, 14 focused tooling/platform checks and TypeScript pass. Npm audit still exits 1 with 65 affected packages (36 high, 29 moderate); Python installed-environment audit exits 0 with no known findings. Those are distinct security results, not a clean npm audit.

Final dependency root-path review identified Expo Router's legacy decoder on Android external links. The native intent guard now rejects malformed/oversized/control-character input before parsing; `final-native-link-guard` passes three tests including installed Router initial/subsequent hook integration and unchanged valid provider/OAuth/Unicode links. This is a bounded-input mitigation, not removal of the advisory. [Dependency triage](docs/dependency-release-triage.md) records all nine remaining root packages and exact next verification. Native APK confirmation remains blocked.

`final-native-link-typecheck` and `final-android-hermes-link-guard` pass. The final rebuild contains 3407 modules and an 8.3 MB Hermes bundle; `final-artifacts.json` is refreshed against that output. This supersedes the earlier Android bundle hash while retaining its original command evidence. Backend configuration remains deliberately absent.

## Handoff state

Verified runtime source commit: `ae9b024` (193 retained source hashes; 15 ordered migrations). Final `final-closure-secret-scan` passes: 551 current files and 106 exported files scanned, zero matches, zero oversized omissions, zero generated browser/scratch files tracked in HEAD. Five historical sensitive filenames remain inventoried; this does not clear historical credential/session exposure. No rotation or history rewrite was performed.

All safe local groups are committed with regressions. The evidence/handoff commit follows the source commit without changing runtime sources. Remaining original user modifications and unrelated untracked work are intentionally preserved. Release recommendation remains **NO-GO**: missing isolated staging/matching PostgreSQL/Auth/Storage, provider test delivery, real inventory confirmation, APK/device/container acceptance and residual security review are listed with exact next steps in the handoff. No production deployment, existing database reset, real payment, account erasure, credential rotation or history rewrite occurred.

## October 29 focused LA-01 upgrade packet

Reviewed newer read-only audit evidence confirms hosted private reservation-event visibility for anonymous and unrelated users. LA-01 remains failing live. The [focused packet](docs/activity-privacy-focused-upgrade.md) reuses the unchanged timestamped privacy migration and supplies a catalog-only preflight; no hosted policy or data was changed.

The representative older-schema rehearsal retains booking/payment columns, all activity/reservation rows and the complete paid-ledger snapshot while enforcing six-role privacy under a permissive overlap. Its combined group passes 22 checks. The complete suite now passes **397 tests, zero failures, five optional legacy skips (402 total)**. Initial fixture mistakes are retained separately. Application/native source is unchanged; previous compilation/device limits still apply.

Actual catalog review, isolated Supabase/test-provider configuration, separately authorized hosted remediation and direct-API/native acceptance remain external boundaries. No management/database capability or isolated staging identity was found in the task's environment configuration; no device is attached in the latest retained check. A public staging project reference has been requested without asking for secrets. This packet is reviewable local preparation, not production authorization or a release GO.

