# CebSpot audit rerun — October 28–29, 2026

**Decision: NO-GO for a general launch.** There is substantial verified local progress, but the configured public-beta backend still exposes private reservation events and lacks several services required by the current app. Local passing tests do not close those deployed failures.

This rerun supersedes the October 11–12 audit's current-status conclusions, while preserving its evidence. Supported scope is now **Android for customers/owners and web for administrators**. Historical customer/owner browser defects are outside that release scope; they must not be described as repaired browser features.

## Scope and evidence boundary

The run began late October 28 and continued October 29 in Asia/Manila. Commands retain UTC timestamps. Fresh sanitized observations are in [rerun evidence](tests/launch-audit/evidence/2026-10-29-rerun); exact commands/results are the `rerun-audit-2026-10-*` files under [command evidence](tests/remediation/evidence/commands).

The workspace changed during execution: entry HEAD was `a23151d`; a Python dependency commit `0fcff30` and compatible JavaScript dependency changes followed, with the latter committed as `023f5a0`. A subsequent documentation handoff was committed as `08579dd`. These were concurrent workspace changes, not fixes performed by this audit. Advisory counts were refreshed, and typecheck, exports, and the complete regression suite were repeated after the dependency changes. The final source/artifact hashes identify the audited file contents; the original run is retained separately.

Hosted checks used the existing configured backend, which the deployment record identifies as a public beta with real/mixed data. They comprised selected reads, legitimate configured test-user login/logout, rejected unauthenticated calls, provider webhook-configuration GET, and public artifact GETs. No new hosted booking, payment, email, post, review, upload, deletion, migration, publication, or load flood was performed. Private response bodies, user IDs, tokens, and credentials were not saved. All write/failure/race experiments used synthetic adapters or new loopback PostgreSQL clusters.

## Confirmed launch problems

### R-01 — P0: Live private reservation activity remains exposed

Both anonymous access and a signed-in regular user querying other users' reservation events returned **five rows**, the probe cap. Event types covered approvals, reminders, check-ins and no-shows. This reproduces LA-01 against the currently configured hosted backend.

The probe selected event types, with a server-side unrelated-user filter; it did not collect message text or claim to enumerate the full exposure. Other selected anonymous/unrelated-user profile, reservation and payment queries returned zero rows. Those successful denials do not cancel the activity leak or prove every permission path safe.

**Close when:** effective deployed RLS/grants prevent anonymous and unrelated-user reads, with positive recipient and authorized-staff checks. Local six-role SQL tests already pass; deploy and recheck the actual hosted policy set. Prepare a focused migration against the existing schema rather than blindly replaying all foundation SQL over real data.

**Evidence:** [hosted probe](tests/launch-audit/evidence/2026-10-29-rerun/live-readonly.json), `anonymous:private-reservation-events` and `unrelated-user:private-reservation-events`; local `tests/remediation/activity-privacy.test.cjs` and current migration replay.

### R-02 — P1: Hosted booking and walk-in APIs are incompatible with the current app

`get_venue_table_availability` still returns **404 / PGRST202**. `walk_in_visits` is unavailable through the Data API (**404 / PGRST205**). Queries for `spots.reservation_inventory_verified_at` and `reservations.hold_expires_at` return **400 / 42703**, establishing missing columns rather than merely an empty protected table.

Current reservation selection and checkout require verified inventory and modern availability; they deliberately refuse unverified/legacy data. Owner table/walk-in workflows require the corresponding backend. Therefore the current local app cannot be accepted for these hosted flows. Existing older published behavior is a separate release snapshot, not proof of compatibility with current source.

**Close when:** a schema comparison and reviewed upgrade bring the chosen release backend and Edge functions into alignment; the real owner confirms real inventory; customer and owner workflows pass against that deployment. Fresh/upgrade SQL tests pass locally across all **23 timestamped migrations**, but that is not evidence that the shared beta has applied them.

**Evidence:** hosted probe; `src/services/reservationTableService.ts`, `src/services/venueTableService.ts`, `src/utils/tableInventory.ts`, and the SQL migration manifest in [booking race](tests/launch-audit/evidence/2026-10-29-rerun/booking-race.json).

### R-03 — P1: Current durable-payment protections are not installed on the hosted contract

`reservation_payments.idempotency_key` and `reservations.financial_resolution` return **42703**. The `payment-maintenance` function returns **404**. The configured provider credentials are live; the existing live webhook is enabled, subscribes to the paid checkout event, and matches the local signing secret.

Current local payment tests now cover durable attempts, provider retirement, atomic event application, amount/currency validation, duplicate delivery, terminal reservations and recovery boundaries. These are meaningful fixes to LA-05/06/07. The hosted schema/function mismatch means those fixes cannot be credited as deployed. This rerun did **not** recreate a real duplicate charge or submit valid paid events, and it does not infer every line of the deployed payment handler from these missing fields.

**Close when:** matching payment SQL/functions, worker credentials, retirement/reconciliation schedules and alerts are deployed and accepted using **PayMongo test mode** on an isolated target. Test provider-success/local-failure, retry, cancellation, duplicate/late callbacks and financial resolution. Never use a live charge to substitute for the test-mode requirement.

**Evidence:** hosted probe, `tests/remediation/durable-payments.test.cjs`, `tests/remediation/payment-handlers.test.cjs`, and [payment acceptance procedure](docs/payment-release-verification.md).

### R-04 — P1: Private uploads and account deletion depend on absent hosted functions

`private-upload`, `private-upload-maintenance`, and `delete-account` each return **404 / NOT_FOUND**. `owner_application_drafts` is also unavailable through the Data API; the latter observation alone could reflect grants/schema exposure, but the missing Edge functions are independently confirmed.

Current proof/document clients depend on private upload; the account-deletion feature depends on its server operation. A working Settings route or local handler test is insufficient to make those features available. The original manual-proof clearing regression is repaired in local SQL through a protected submission RPC; its complete hosted workflow is not accepted.

**Close when:** matching private-upload/deletion SQL and functions are deployed with authorization, retention/cleanup and maintenance schedules; execute proof → authorized owner viewing → approval, owner application/document review, and deletion/retry/reauthentication on disposable staging accounts. Android camera/file persistence and actual Supabase Storage behavior remain required.

**Evidence:** hosted probe; `tests/remediation/manual-proof.test.cjs`, `private-upload.test.cjs`, `owner-private-uploads.test.cjs`, `account-deletion*.test.cjs`; [upload verification](docs/upload-release-verification.md).

### R-05 — P1: Advertised reservability still disagrees with verified release inventory

The current anonymous public query returned **12 visible spots**, of which **2 are flagged reservable and 1 has no table inventory**. These are visible-query counts, not a count of every database listing. The inventory-verification column is absent, so hosted flags cannot establish the protected owner confirmation required by current release code.

This improves the earlier raw count of 34 unconfigured reservable venues, but does not close LA-03. The approved local release restricts bookings to the client venue with confirmed real inventory; discovery venues remain browsable.

**Close when:** hosted configuration and the published client enforce that approved scope, with actual owner-confirmed tables/capacity/fees. Remove booking entry for venues that do not satisfy the scope rather than presenting fallback tables.

**Evidence:** hosted probe, `public-inventory`; `tests/remediation/inventory*.test.cjs`, `release-scope-regression.test.cjs`.

## Additional unresolved release gates

| Gate | Current evidence | Required before acceptance |
| --- | --- | --- |
| **Email delivery** | A verified test account can sign in. Hosted signup/email/Google settings are enabled and email confirmation is required. The October 28 deployment record states no custom SMTP sender was configured. No new message was sent by this audit; SMTP configuration was not re-read through an administrative API. | Verify the current sender and complete signup confirmation, recovery, owner invitation and secure email-change delivery to ordinary tester inboxes. Supabase's default sender restricts recipients and is not intended for production; see [official SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp). Do not declare all signup flows successful from one existing-account login. |
| **Android device acceptance** | `adb devices -l` returned no attached device. Local Hermes export passed; an existing signed APK/public beta is documented. | Use the intended APK/update on actual phones: permissions, keyboard, camera/gallery, video encoding, GPS, notifications, deep links, background/termination and recovery. Phone-sized browser adapters do not validate native behavior. |
| **Sustained capacity** | A fresh 50-user SQL race stored one booking; ten performance-harness safety/measurement checks passed. | Define expected users and latency/error targets, then execute ramp/spike/soak/recovery through the real isolated API including Auth/Storage/provider/face queues. No production-capacity pass is claimed. |
| **JavaScript advisories** | With `npm audit --omit=dev`, initial scan: 32 affected packages, five high, zero critical. After concurrent compatible dependency updates: **29 affected packages — 3 high, 19 moderate, 7 low, 0 critical**. High package names: `@xmldom/xmldom`, `image-size`, `postcss`. The separate handoff's 30-package figure includes development dependencies. | Triage actual runtime/build reachability and patch or document justified exposure decisions; verify the release toolchain/native build. These package counts are not a count of demonstrated exploitable app vulnerabilities. No force upgrade was performed by this audit. |
| **History/session exposure** | No known private value/pattern hit in the scanned current source and local artifacts. No browser/scratch paths remain in current HEAD, but five sensitive historical path candidates remain in the filename inventory. | Privately investigate historical blobs/session artifacts and repository access; rotate/revoke if exposure is established. A filename inventory is not a forensic clearance. |
| **Face cold-start/hosting** | First health GET timed out at 20 seconds. Subsequent health GET returned 200 in 498 ms. Anonymous job creation returned 401. Local queue/admission/timeout/cleanup tests pass. | Validate cold/warm client recovery, actual Linux/container memory, one-worker/replica assumptions, bounded queue/load and representative image quality. This run does not classify the transient timeout as a persistent outage or prove face-detection accuracy. |
| **Admin/owner operations** | Synthetic admin export tests, local SQL role tests and owner table/state checks pass. Public admin HTML/JS return 200. | Real scoped owner/admin accounts must exercise approval/rejection, moderation, analytics totals, private document opening, logout and direct API denial. Public HTTP 200 is not successful authorized operation. |
| **Recovery and operations** | Local rollback/reconciliation procedures exist. | Rehearse backup restoration and deployment rollback, monitor privacy/payment/worker errors, and identify the on-call owner. Existing shared-data schema upgrades require a reviewed alignment plan. |

## Comparison with the original ten findings

“Fixed locally” below means current executable regression/source evidence supports the intended correction. It does not mean installed on testers' devices or closed in the hosted deployment.

| Original finding | Current local result | Hosted/release disposition |
| --- | --- | --- |
| **LA-01** private activity | Six-role SQL and overlap-policy protections pass. | **Still failing live: R-01.** |
| **LA-02** missing booking API | Complete migration replay/upgrade and table-service checks pass. | **Still unavailable: R-02.** |
| **LA-03** missing inventory | Sole-client/verified-inventory checks pass; nonexistent/unverified inventory is rejected. | **Configuration/schema gap remains: R-05.** |
| **LA-04** manual proof erased | Protected proof submission, private ownership and idempotent owner approval pass in current SQL tests. | **Hosted upload/approval lifecycle not accepted: R-04.** No claim that the original clearing bug was newly reproduced live. |
| **LA-05** QRPh duplicate sessions | Actual handlers/native SQL exercise durable attempts and retirement/retry recovery. Verified-inventory checkout fixture passes. | **Current contract/maintenance absent: R-03.** Real provider test-mode integration pending. |
| **LA-06** financial inconsistency | Atomic event/ledger transitions, validation and explicit late-payment resolution pass locally. | **Current contract absent: R-03.** Hosted money flow not accepted. |
| **LA-07** indefinite holds | Server-owned times, bounded unattached holds and release/approval races pass locally. | **`hold_expires_at` absent: R-02/03.** Hosted expiry scheduling not accepted. |
| **LA-08** invisible web feedback | Current admin artifact shows visible browser validation/failure feedback and guarded routes. | **Customer/owner browser flow removed from scope.** Do not count removal as repairing it. Android alerts/device testing pending. |
| **LA-09** browser media persistence | Android proof/upload clients have local regression coverage. | **Customer/owner browser flow removed from scope.** Android upload/authorized-reviewer acceptance still blocked by R-04/device gates. |
| **LA-10** unbounded public uploads | Local authenticated admission, quotas, bounded worker/queue, timeout and cleanup tests pass. Hosted face endpoint now rejects anonymous requests. | **Partially deployed/verified.** Hosted private-upload/cleanup services absent; saturation/container/Storage validation pending. |

## Tests rerun and their limits

| Check | Fresh result | What it establishes |
| --- | --- | --- |
| Full JavaScript/SQL/handler/platform/refactoring suite | Initial and final runs each **391 passed, 0 failed, 5 skipped (396 total)**. Final repeat after dependency changes used two test-file workers; its exact result is retained in `rerun-audit-2026-10-29-final-frozen-tests.json`. | Source assertions plus actual services/handlers, synthetic adapters and native PostgreSQL tests; not full hosted Supabase or participant UAT. |
| TypeScript | Passed initially and after dependency changes. | Current checked app/shared types. |
| Admin web export | Passed twice; same main bundle name/size, approximately 4.12 MB. | Administrator web artifact compiles. Synthetic public config was used; external traffic intercepted for UI checks. |
| Android export | Passed twice; Hermes bundle approximately 8.66 MB. | Backend-disabled verification bytecode compiles; no new APK or publication was produced. |
| Admin browser / map | Passed actual exported login/recovery/visible errors/route removal/return bridge; synthetic authorized admin map/actions/layout checks passed. | Exported browser behavior with intercepted services; no real admin mutation. |
| Map runtime | **13/13 passed.** | Actual bundled map gestures, pinch, camera state, fallback, resizing, coordinate entry and untrusted labels against fixture providers. |
| Face service | **22/22 passed.** Installed Python audit found **zero known advisories**. | Actual local ASGI/auth/admission/429/queue/worker timeout/cleanup boundaries and synthetic detector/geometry tests. Not a scan of the deployed Linux image or representative human-face quality. |
| Fifty competing customers | **1 accepted, 49 rejected, 1 stored row**, using the full 23-migration chain. Measured write phase 6,796 ms; p95 6,336 ms. | Correctness of the isolated SQL race under current shared-machine load. Connections were prepared before timing. No HTTP, provider, sustained throughput or production-latency inference. The older 311-ms race used a different fixture/load and is not a comparable benchmark. |
| Screen walkthrough | **26 completed fixture observations; zero runtime errors.** Profile checked at 320/390 px and light/dark states. | Actual screen components through React Native Web adapters with synthetic accounts/data; layout and basic navigation/recovery. Native components, permissions, real posting/payment/notifications remain separate. |
| Free booking | Passed actual screen/client → new PostgreSQL. | Invalid contact blocked; one normalized contact/table snapshot stored; confirmation opened without provider call. |
| QRPh screen | Original legacy fixture failed. Current-contract follow-up passed, including explicit unverified/legacy rejection and verified modern success, policy/race/network failure and retry without a second reservation. | UI/service wiring with provider/database/link-opening fixtures. Preserve both runs; this is not provider settlement. |
| Saved/account/Circle/posting journeys | Saved error/retry/cache/isolation, Explore delayed-response isolation, Circle settings, names/photo/password UI, email change, posting coordinates and actual location picker all passed. | Current local recovery/account boundaries with synthetic services. Email inboxes, real GPS/photos and hosted persistence remain open. |
| Your Posts | Original run failed media/card count (`12` vs `18`) during virtualization. **Unchanged isolated rerun passed.** | Pagination, cached return/scroll, preview count and empty/error states have passing local evidence; retain the timing-sensitive failure. Native scrolling FPS is not established. |
| Performance harness | **10/10 passed.** | Target-isolation guards, content/error classification and bounded measurements; not a capacity test. |
| Secrets | Current source and both platform export artifacts scanned with no known private-value/pattern matches. | See exact scope, counts/hashes/skips in [source and secret scan](tests/launch-audit/evidence/2026-10-29-rerun/source-and-secret-scan.json). Not exhaustive history or cloud-console key restriction verification. |

The five skipped default-suite cases are optional legacy PostgreSQL multi-session tests (owner seating and four online/walk-in/policy races). Current full-chain transaction/race tests and the new fifty-user test add relevant local evidence, but skipped tests themselves are not counted as passed. Suite totals overlap earlier or focused runs and must not be summed into a unique pass percentage.

The preliminary October 28 hosted probe used two guessed table names (`payment_checkout_attempts`, `private_upload_claims`) that are not repository relations. Those requests are audit-probe mistakes, not product findings. The corrected October 29 probe uses the actual durable-attempt/deadline columns and required Edge function paths; only those corrected observations support R-02–R-04. Earlier evidence is retained to make the correction reviewable.

## Hosted artifact checks

The public admin page and its approximately 4.13-MB JavaScript asset returned HTTP 200. The Android **preview / runtime 1.0.4** update endpoint returned manifest ID `01a1818e-c970-7de8-816b-1f4602dba113`, created October 28 at 16:09:40 Asia/Manila, with 64 assets. Its 5,378,756-byte launch bundle returned 200 and matched the manifest SHA-256. These checks establish artifact availability, not device adoption or functional acceptance.

Earlier diagnostic requests returned 406 without multipart acceptance and 403 without the asset credentials carried in the multipart extensions. The final probe follows the installed SDK and [Expo Updates protocol](https://docs.expo.dev/technical-specs/expo-updates-1/): accept multipart and apply each asset's extension request headers in memory. The earlier failures are audit-client protocol errors, not confirmed app update defects. No extension credentials or complete signed asset URLs were retained.

**Evidence:** [final artifact probe](tests/launch-audit/evidence/2026-10-29-rerun/deployed-artifacts-protocol-v1.json) and its `public-artifacts-extensions` command record. The public manifest does not return a release commit, so this audit does not infer that current local HEAD is published. The [deployment record](docs/deployment-2026-10-28.md) documents a partial backend rollout; fresh missing-column/function observations independently confirm the remaining mismatch.

## UAT alignment update

The October 13 [alignment](docs/uat-audit-alignment-2026-10-13.md) remains historical. The following is current engineering support for its 20 scenarios, not signed participant results:

| UAT | Current support and remaining condition |
| --- | --- |
| 01 Authentication | Existing test login passes; local validation/recovery/email-change adapters pass. Real signup/email/OAuth/session-device lifecycle pending. |
| 02 Profile | Account Details name/picture/password and account switching fixtures pass. Actual Storage/device persistence pending. |
| 03 Owner request | Local SQL/handler protections pass; hosted private-upload/application contract unavailable. |
| 04 Discovery | Search, no-match, connection error/retry, bookmark and account isolation fixtures pass. Representative hosted large-data search/physical location acceptance pending. |
| 05 Map/navigation | Thirteen map tests and location picker/post-coordinate journeys pass. Actual Android permissions/GPS/deep links pending. |
| 06 Venue details | Detail/review/booking-entry screens render with fixtures; actual venue content and inventory confirmation still need owner acceptance. |
| 07 Reviews | Existing backend/client/media guards pass; no new hosted review, moderation, private-media or real-photo quality journey performed. |
| 08 Reservation | Full-chain SQL tests, fifty-user race and free-booking screen-to-SQL pass. Hosted R-02/05 block acceptance. |
| 09 Checkout | Current verified-inventory UI and actual handler/native SQL tests pass. Hosted R-03/04 and test-provider settlement remain open. |
| 10 Listing management | Current owner inventory/policy and role checks pass locally. Real owner portal is Android; deployed operations require acceptance and approved listing scope. |
| 11 Owner reservations | Local manual approval/attendance/walk-in/race guards pass. Matching hosted functions, scoped owner accounts and native notifications pending. |
| 12 Review monitoring | Source/backend guards and synthetic admin artifact checks support implementation. Real cross-role report/reply/moderation workflow pending. |
| 13 Account management | Identity/email synchronization and local account deletion authorization/retry tests pass. Actual admin controls in approved scope and absent deletion server need verification. |
| 14 Listing approval | Local independent-post/listing linkage, pending moderation and admin guards are covered. No live approval/rejection/persistence mutation performed. |
| 15 Moderation | Current local tests protect independent posts/thread/media relations. Real scoped admin/customer visibility after moderation pending. |
| 16 Analytics | Local admin presentation/SQL checks pass. Expected totals on an agreed fixture snapshot and current payment ledger need privileged acceptance. |
| 17 Notifications | Source/backend reminder and account guards covered. Real Android foreground/background/terminated delivery and tap destinations pending. |
| 18 Circle/Activity | Local sharing/stop/leave/privacy and corrected location UI pass. Hosted activity leak R-01 persists; actual cross-device consent revocation pending. |
| 19 Security/privacy | Local six-role policies, no-current-secret matches and several hosted denials pass. R-01, missing services/history/advisory/device gates prevent overall security sign-off. |
| 20 End to end | Components and isolated workflows have considerably stronger passing evidence. No complete accepted deployed multi-role Android/payment/email lifecycle. |

## Next actions in dependency order

1. Close **R-01** with a reviewed minimal live-policy correction and retained direct-API retests.
2. Establish an identified isolated backend/test-provider environment and a reviewed upgrade plan for the mixed-data beta. Do not replay foundational SQL or reset the shared database blindly.
3. Deploy the matching booking/payment/private-upload/deletion contract with server maintenance schedules; confirm the actual client's inventory. Keep affected features unavailable until their contract is accepted.
4. Complete ordinary-inbox authentication delivery and six-role API/Storage tests, including failure and retry boundaries.
5. Install the intended APK/update on actual phones and complete the native/manual UAT and test-mode settlement/reconciliation cases.
6. Run sustained capacity/overload/recovery and backup/rollback exercises; finish dependency/history reachability review. Record the evaluated source, artifacts, schema and environment before declaring readiness.

This audit made no application fix or deployment. It added audit probes, retained evidence, and this current comparison. **General launch remains blocked by confirmed hosted failures and specific unverified acceptance gates.**
