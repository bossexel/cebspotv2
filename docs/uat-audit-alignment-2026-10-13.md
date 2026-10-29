# CebSpot UAT and audit alignment

Current engineering evidence: the [October 28–29 audit rerun](../LAUNCH_AUDIT_2026-10-29.md) refreshes all 20 UAT mappings, local verification and confirmed hosted failures. Participant acceptance remains separate.

Updated: October 13, 2026 (Asia/Manila). Compared the October 6 [UAT plan review](uat-plan-review.md), the older [engineering audit](../AUDIT.md), the October 11–12 [launch audit](../LAUNCH_AUDIT_2026-10-12.md), retained test evidence, and the current working-tree source.

**Subsequent platform decision: customers/owners are Android-only; admin stays on Render.** Their web routes were removed locally; retained admin alerts were repaired for LA-08; LA-09 browser uploads are outside customer/owner scope. See [platform changes and deployment boundary](android-only.md). The remaining eight launch findings are unchanged. Historical customer/owner browser observations describe the earlier audit, not supported browser UAT targets.

**Original alignment result: meaningful fixes and passing subcases exist, but none of the ten launch blockers could be closed from the evidence then available.** The UAT document available locally is a review of the supplied plan, not completed participant execution sheets. This alignment does not invent participant results, claim deployment of local changes, or assign an overall UAT pass percentage.

No application fixes or remote changes were made during this alignment. A focused local regression run passed **59/59 checks**, with no failures or skips. It includes actual handler/service execution with adapters and source assertions; it is not 59 participant UAT executions. See [regression output](../tests/launch-audit/evidence/uat-alignment-regression.log).

## How to read the status

- **Fix verified locally:** the identified defect has a matching source change and supporting local regression evidence. Deployment and participant retesting may still be required.
- **Partial fix / passing subcase:** a limited behavior passes; related failures or missing checks keep the larger finding/scenario open.
- **Implemented; retest needed:** the code contains a relevant change, but the required behavioral/device/deployed test is not established.
- **Open:** an observed failure or unresolved source risk remains in the latest applicable evidence.
- **Not verified:** evidence is insufficient to judge the complete requirement.

These are engineering alignment statuses. Leave participant result fields unfilled until the participant execution occurs. A source assertion proves that a code pattern exists, not that a full workflow succeeds.

## Fixes found relative to the older audit

| Ref | Earlier concern → current evidence | UAT link | Status and remaining boundary |
| --- | --- | --- | --- |
| F-01 | **AUD-12: hosted payment returns.** Both checkout handlers now accept a configured HTTPS origin only for the reservation confirmation route, alongside native/development routes. Current payment tests exercise allowed and disallowed returns. | UAT-09, UAT-20 | **Fix verified locally.** Configure the actual release origin and test provider return in the deployed browser/native build before sign-off. Evidence: regression output; `supabase/functions/paymongo-create-{gcash,qrph}-checkout/index.ts`. |
| F-02 | **AUD-09: concurrent GCash checkout.** Current handler uses the same provider idempotency key for competing requests. The audit's ten-call mock produced one distinct provider key and one payment row; the focused regression passed again. | UAT-09, UAT-20 | **Partial fix.** Applies to GCash handler behavior, not QRPh, durable recovery, or live settlement. LA-05 and LA-06 remain open. Evidence: [payment probes](../tests/launch-audit/evidence/payment-probes.json). |
| F-03 | **AUD-01: reservation boundary checks.** Actual isolated PostgreSQL rejected unknown tables, invalid slots, negative/over-capacity parties, and missing paid contact details; manipulated fee/paid-state input was normalized. Fifty competing users produced one stored booking. | UAT-08, UAT-19 | **Partial fix / passing database subcases.** Malformed contact, slot/time mismatch, and forged creation time were still accepted. Manual-proof clearing is LA-04. These checks do not establish deployed schema correctness. Evidence: [database probes](../tests/launch-audit/evidence/database-probes.json). |
| F-04 | **AUD-13: simulated live availability.** Current availability logic fails closed on API errors/malformed rows and excludes occupied/walk-in-only inventory; current service tests pass. | UAT-08, UAT-10, UAT-11 | **Partial fix.** The live API is missing required surfaces and 34 reservable venues lack inventory (LA-02/03); a complete live booking cannot be marked fixed. Evidence: regression output, [live probes](../tests/launch-audit/evidence/live-readonly.json). |
| F-05 | **AUD-20: discovery substitutes sample listings; failed reviews appear saved.** Current source assertions pass for keeping failed/empty live discovery separate from demo listings and not inserting a failed review as session-only success. Offline browser evidence shows an actual load error. | UAT-04, UAT-05, UAT-07 | **Partial fix.** Activity still substitutes demo posts, offline discovery recovery is weak, and `Alert.alert` feedback is invisible on web (LA-08). Evidence: regression output, [browser errors](../tests/launch-audit/evidence/browser-errors.json). |
| F-06 | **AUD-23: destructive portal loading.** `loadAssignedSpotProfile` no longer writes/clears inventory during profile loading; its focused source regression passes. | UAT-10 | **Fix verified locally at source level.** Retest portal refresh against a populated staging venue and confirm inventory is unchanged. This does not close broader owner-portal deployment/configuration concerns. |
| F-07 | **AUD-16/17: browser photo handling and output MIME.** Anonymization now handles web blob/data images; submission photo upload uses processed JPEG metadata. Browser photo paths in review/gallery services differ from the still-broken proof/video paths. | UAT-07, UAT-10, UAT-14, UAT-19 | **Implemented; retest needed.** Source review establishes the changes, not cross-device media persistence or face-detection accuracy. LA-09 remains open for proof/video/verification documents. Sources: `src/services/imageAnonymization.ts:443`, `spotSubmissionService.ts:134–156`, `reviewMediaService.ts`, `ownerGalleryService.ts`. |
| F-08 | **AUD-21: saved spots shared across accounts and restricted by discovery window.** Storage keys now include the current user/guest; Saved fetches selected IDs through `getSpotsByIds` in batches. | UAT-02, UAT-04, UAT-19 | **Implemented; retest needed.** Exercise account switching, older saved records, reload, removal, and unavailable records. This is local per-account storage, not evidence of cross-device synchronization. Sources: `src/services/savedSpotService.ts`, `src/services/spotService.ts:77`, `app/saved.tsx:24`. |
| F-09 | **AUD-15: repeated/stale reminders.** Scheduler skips elapsed reminder times, includes rescheduled bookings, namespaces IDs by user, and provides cancellation wired from the layout. | UAT-11, UAT-17, UAT-19 | **Implemented; retest needed.** Verify actual Android delivery, reschedule, logout/switch, permission denial and terminated-app behavior. Code alone does not establish remote push or exactly-once delivery. Sources: `src/services/reservationReminderService.ts:80–175`, `app/_layout.tsx:160`. |
| F-10 | **AUD-19: activity failure after successful submission.** The post-insert activity write now has its own catch and the saved submission can be returned. | UAT-10, UAT-14, UAT-18 | **Partial implementation; retest needed.** Inject that failure and verify correct UI status; durable retry deduplication/outbox behavior is not established. Source: `src/services/spotSubmissionService.ts:320–344`. |
| F-11 | **AUD-22: async subscription cleanup.** Reservations and initial activity loading contain mounted checks and dispose subscriptions created after unmount. | UAT-11, UAT-18, UAT-20 | **Partial implementation; retest needed.** Stress rapid navigation and all remaining activity subscription effects before closing the broader lifecycle finding. Sources: `app/reservations.tsx:60–84`, `app/activity.tsx:260–314`. |
| F-12 | **AUD-29: update-download recovery.** Update prompt now retains a failed state/error and permits retry/dismissal. | UAT-20; supporting release check | **Implemented; retest needed.** Exercise a failed OTA download and retry on a signed native build. Source: `src/components/AppUpdatePrompt.tsx:50–80`. |

Additional successful checks are not automatically fixes to a previous defect: test-account login, rejected anonymous privileged requests, local owner table-setting tests, and free-booking owner check-in all have supporting audit evidence. The earlier map run's two timing-sensitive failures are superseded for that recorded run by the later full **11/11 passing** map suite; actual GPS/device behavior remains a separate check.

## Mapping all 20 UAT scenarios

The UAT IDs below come from the October 6 review. Scenario status describes the evidence available, not a participant PASS/FAIL entry. Web-specific failures apply wherever the evaluated role uses web; record the platform instead of assuming a web defect also reproduces on Android. Backend security and financial integrity remain shared release requirements.

| UAT scenario | Fixed or successful evidence available | Remaining failure, gap, or required retest | Engineering disposition |
| --- | --- | --- | --- |
| **UAT-01 Authentication** | Configured regular test account logged in; email verification enabled; empty-email recovery feedback visible. | Web login/signup errors are invisible (LA-08). Real signup/verification/resend, recovery completion, OAuth, expired sessions and logout lifecycle are not fully executed. | **Partial; open defect.** |
| **UAT-02 Profile** | Profile route rendered in browser fixtures; unrelated-user profile queries returned no rows in the tested live query. Saved-spot scoping is implemented (F-08). | Real profile/photo edit persistence, failed/cancelled uploads and two-account switching need execution. Bookmark changes do not prove profile upload correctness. | **Not verified end to end.** |
| **UAT-03 Owner request** | Anonymous provisioning was rejected; dedicated-owner flow has source tests in the retained backend suite. | Browser document upload is implicated by LA-09. Real approval/rejection, invitation, password setup and assigned-owner login need separate accounts/fixtures. | **Partial; open defect.** |
| **UAT-04 Discovery** | No sample-listing substitution in current live discovery checks (F-05); discovery filter/ranking tests passed in the retained suite. | Offline error/retry presentation, 500-record cap, and original plan's price/trending/hidden requirements remain gaps unless formally revised. | **Partial; retest/scope decisions needed.** |
| **UAT-05 Map/navigation** | Full map suite 11/11 passed: gestures, resizing, fallback, untrusted labels and reduced motion. | Real GPS denial/unavailability, supported distance filters with known coordinates, route timeout, and complete internet loss need device execution. Offline details/search are not established. | **Passing browser subcases; device UAT pending.** |
| **UAT-06 Venue details** | Detail/missing-record routes were covered by browser smoke checks. | Verify actual venue photos/hours/contact/fees, gallery/similar links and missing-data recovery. Reservable inventory is incomplete (LA-03). | **Partial; real fixtures needed.** |
| **UAT-07 Reviews** | Failed writes no longer create session-only review success in the checked source (F-05); browser photo adapters are implemented (F-07). | Actual posting/replies/reports/votes, media persistence, rating refresh and cross-user restrictions need execution. Review edit/delete controls were not established; web feedback is affected by LA-08. | **Partial; scope gaps and retests remain.** |
| **UAT-08 Reservation** | Local 50-user table race: one accepted, 49 rejected; capacity/table validation passes (F-03). Availability failures are handled conservatively (F-04). | Missing live booking surfaces/inventory, manual-proof regression, indefinite holds (LA-02/03/04/07); full customer UI winner/loser flow and expiry/cancellation need retest. | **Partial; core flow blocked.** |
| **UAT-09 Checkout/deposit** | Allowed return origins (F-01), GCash stable-key behavior (F-02), auth rejection, contact billing and webhook signature checks pass locally. | LA-04/05/06/07/08/09; real manual and QRPh settlement/retry/relaunch/refund not verified. Voucher entry remains unestablished if required. | **Partial; core flow blocked.** |
| **UAT-10 Listing management** | Portal no longer clears inventory on profile load (F-06); local owner settings/service tests and isolated dashboard layouts pass within stated limits. | Missing deployed walk-in/availability surfaces; persistent media; complete owner Add/Edit/Remove Listing requirement not established. Separate owner edits from community submissions. | **Partial; deployment and scope gaps.** |
| **UAT-11 Owner reservations** | Local database owner check-in of a free pending booking succeeded; scoped walk-in/policy/attendance and concurrency tests passed. | Manual proof approval fails (LA-04); payment reconciliation/hold issues persist; actual owner-vs-owner isolation and release UI need deployed retest. | **Partial; core flow blocked.** |
| **UAT-12 Review monitoring** | Owner dashboard review rendering exercised with fixtures; source has reply/report-related behavior. | Execute real owner replies, duplicate reports, reason capture, admin queue entry and venue isolation. Include an administrator among testers. | **Not verified end to end.** |
| **UAT-13 Account management** | Admin account listing/search exists in the reviewed implementation. | Admin account update/deactivation/login blocking was not established in the reviewed Users interface. Actual admin execution absent. | **Requirement gap / not verified.** |
| **UAT-14 Listing approval** | Post-submission activity failure is separated from insertion in source (F-10); supporting admin/source checks exist. | Approve/reject separate real fixtures; verify unpublished records stay private, rejection reason and requester status, and visibility after relogin. Media defects may obstruct submissions. | **Not verified end to end.** |
| **UAT-15 Moderation** | Relevant controls/source reviewed; retained backend checks provide supporting implementation evidence. | Real removal versus dismissal, rating refresh, and visibility across customer/owner/admin sessions have no complete execution record. | **Not verified end to end.** |
| **UAT-16 Analytics** | Dashboard renders with fixtures; source/automated checks cover parts of admin reporting. | Establish expected totals from a fixed dataset and verify status inclusion/exclusion. Payment-state divergence (LA-06) can make reservation-based money totals misleading. | **Not verified; financial dependency open.** |
| **UAT-17 Notifications** | Local reminder changes address several earlier source problems (F-09); notification wiring appears in backend source tests. | Real Android foreground/background/terminated delivery, permissions, exact recipients, tap destinations and timing are unverified. Remote owner/admin push is not established. | **Implemented portions; device retest needed.** |
| **UAT-18 Circle/Activity** | Screens rendered with synthetic data; initial subscription cleanup improved (F-11). | Live private reservation activity exposure (LA-01), demo-feed fallback, sharing-off/leave lifecycle and circle privacy checks remain open. | **Open privacy failure; incomplete workflow evidence.** |
| **UAT-19 Security/privacy** | Tested profile/reservation/payment reads were isolated; anonymous privileged functions and unsigned webhook rejected; no known private credential match in scanned current source/web export. | LA-01 and LA-10; actual owner/admin/storage permission matrix, history exposure review, public privacy access, account deletion and location consent/revocation remain unresolved/unverified. | **Partial defenses; overall security acceptance blocked.** |
| **UAT-20 End-to-end** | Builds, route smoke checks and many component/service/database tests pass. | No complete signed-build multi-role signup → booking → payment → attendance/cancellation lifecycle with real isolated accounts and cross-device persistence. All applicable LA blockers feed this scenario. | **Not verified; launch blocked.** |

## Trace every launch blocker to UAT

| Launch issue | Relevant UAT IDs | Current status | Evidence needed to close |
| --- | --- | --- | --- |
| **LA-01** private activity exposure | 18, 19, 20; notification recipient checks in 17 | **Open — confirmed live in retained audit.** | Deployed policy change plus direct API allow/deny tests for anonymous, two customers, assigned/unrelated owners and admin; no private events to wrong recipients. |
| **LA-02** unavailable booking/walk-in API | 08, 10, 11, 20 | **Open — confirmed deployed API failure in retained audit.** | Recorded migration/deployment version; successful actual availability/walk-in requests and full affected workflows. |
| **LA-03** reservable venues without inventory | 06, 08, 10, 20 | **Open — live configuration evidence.** | Each advertised reservable venue has tested valid inventory/configuration, or is unavailable for booking. |
| **LA-04** manual proof erased on insert | 08, 09, 11, 20 | **Open — locally reproduced migration defect.** | Full migration regression followed by upload → saved proof → authorized owner read/approval → customer confirmation in staging. |
| **LA-05** QRPh replacement sessions | 09, 20 | **Open — handler/source evidence.** | Concurrent/retry test with real database constraints and PayMongo test sessions; one intended payable attempt, superseded sessions expired. GCash passing does not close this. |
| **LA-06** inconsistent payment states | 09, 11, 16, 20 | **Open — fault-injection evidence.** | Atomic/idempotent database transitions, amount/currency checks, durable recovery and an explicit late-payment/refund outcome across injected failures. |
| **LA-07** unattached holds do not expire | 08, 09, 11, 20 | **Open — SQL/database evidence.** | Server-owned expiry and creation time; abandoned/crashed checkout releases capacity safely regardless of provider attachment. |
| **LA-08** invisible web alerts | 01, 07, 09, 20 | **Customer/owner web removed; retained admin alerts repaired locally.** | Deploy/retest Render admin feedback/recovery and Android device UAT. See [scope](android-only.md). |
| **LA-09** nonpersistent browser media | 03, 07, 09, 10, 14, 20 | **Not applicable to Android customers/owners; browser upload routes removed locally.** | Publish restricted admin artifact; Android media persistence/reviewer UAT. See [scope](android-only.md). |
| **LA-10** public upload/processing admission risk | 03, 07, 10, 19, 20; expert load/security supplement | **Open — source risk; upstream controls not verified.** | Effective deployed upload authorization, quotas/queue bounds/type/size limits, cleanup and controlled staging overload/recovery evidence. |

No fresh live probes were run for this alignment; live rows above refer to the dated October 11–12 evidence. No later deployed fix evidence was found in the local UAT records. This is a reason to retain an open status, not a claim that every hosted configuration was re-read on October 13.

## UAT record changes needed

Use this document as the engineering evidence attachment to the plan. Keep the original participant results separate. For each required subcase record: **UAT ID, approved requirement ID, platform/device, account/fixture reference, build/source snapshot, backend migration version, expected result, observed result, evidence link, audit issue ID, tester/date, fix build and retest result**.

Suggested subcases for the next cycle (new suggested IDs, not claimed existing results):

| Suggested ID | Acceptance target | Current evidence / next execution |
| --- | --- | --- |
| UAT-01c | Invalid login/signup produces understandable visible feedback. | Web defect LA-08; retest after repair. |
| UAT-05a | Map provider failure shows usable fallback/recovery while internet remains available. | Browser suite passed; repeat on evaluated device/build. |
| UAT-08a | Two customers request the exact same venue/table/date/slot; one wins with a clear loser response. | Database race passed; execute customer UI + deployed database, checking no unintended payment. |
| UAT-08b | Invalid table/capacity and forged financial fields cannot create an unauthorized booking. | Database subset passed; add outstanding validation cases and repeat against staging. |
| UAT-08c | A checkout abandoned before provider attachment releases its hold at server expiry. | LA-07 remains open. |
| UAT-09a | Manual GCash proof persists and only an authorized owner can verify it. | LA-04/09 remain open. |
| UAT-09b | QRPh retry/duplicate/late callback cannot create unexplained charges or inconsistent booking state. | LA-05/06 remain open. |
| UAT-09c | Configured hosted payment returns stay on the correct reservation route; unrelated origins are rejected. | Local handler fix verified; actual hosted/provider return still needed. |
| UAT-10a | Opening/refreshing the owner portal cannot erase configured inventory. | Source regression passed; retest with populated staging venue. |
| UAT-17a | Repeated sync/reschedule/logout/account switch respects notification recipient and timing. | Source improvements present; actual Android execution needed. |
| UAT-19a | Anonymous/customer B/unrelated owner cannot read customer A's reservation events or private media. | Activity denial currently fails in latest live evidence. |
| UAT-20a/b/c | Separate complete free, manual-paid and QRPh journeys persist correctly across relaunch/devices. | No complete participant/staging execution evidence yet. |

The original UAT preparation corrections remain unresolved in the available review: reconcile participant counts, identify role interfaces/platforms, fill build/date fields, replace placeholder requirement IDs, distinguish NOT TESTED from approved N/A, and split bundled scenarios. Missing required functionality must remain a gap unless formally removed from scope.

Keep load/security engineering checks attached separately: dependency triage, historical credential/session investigation, sustained API load, upload limits, restore/rollback, and cloud configuration cannot be accepted solely through participant usability ratings. No percentage of successful small tests overrides a failed mandatory privacy or payment subcase.

## Evidence index and rerun

- [Current launch audit and all limitations](../LAUNCH_AUDIT_2026-10-12.md)
- [Focused alignment regression: 59 passed](../tests/launch-audit/evidence/uat-alignment-regression.log)
- [Earlier backend run: 147 passed, 5 skipped](../tests/launch-audit/evidence/backend-tests.log)
- [Separate native PostgreSQL run: 24 passed, including previously skipped concurrent cases](../tests/launch-audit/evidence/postgres-concurrency.log)
- [Database probes](../tests/launch-audit/evidence/database-probes.json), [payment probes](../tests/launch-audit/evidence/payment-probes.json), [media probes](../tests/launch-audit/evidence/media-probes.json)
- [Live read-only/auth probes](../tests/launch-audit/evidence/live-readonly.json), [browser smoke checks](../tests/launch-audit/evidence/browser.json), [browser failures](../tests/launch-audit/evidence/browser-errors.json), [map suite](../tests/launch-audit/evidence/map.log)
- [Secret scan scope/results](../tests/launch-audit/evidence/secret-scan.json)

The 59-check run overlaps earlier suites; do not add it to earlier counts as new unique coverage. Reproduce locally with:

```powershell
node --test tests/backend/payments.test.cjs tests/backend/audit-remediation.test.cjs tests/backend/owner-reservation-settings.test.cjs tests/backend/walk-ins-policy.test.cjs
```

**Acceptance remains pending.** F-01 and F-06 have local fix evidence; F-02 through F-05 have successful but incomplete coverage; F-07 through F-12 contain implementation improvements requiring the stated retests. No entire UAT scenario is promoted to signed participant PASS by this document, and no LA-01–LA-10 blocker is closed.
