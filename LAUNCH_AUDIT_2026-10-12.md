# CebSpot launch audit — 11–12 October 2026

Current status: [October 28–29 audit rerun](LAUNCH_AUDIT_2026-10-29.md) rechecks current source, local fixes and the hosted beta. It supersedes this report's current-status conclusions while preserving the original evidence.

UAT follow-up: [October 13 alignment](docs/uat-audit-alignment-2026-10-13.md). Subsequent platform decision: **customers/owners are Android-only; admin stays on Render.** Their web routes were removed locally; retained admin alerts were repaired for LA-08; LA-09 browser uploads are outside customer/owner scope. See [platform changes and deployment boundary](docs/android-only.md). Original observations below are preserved; deployed retests and other blockers remain.

**Decision: DO NOT LAUNCH.** This audit found one confirmed live privacy blocker and nine additional high-priority defects or release risks. Passing builds and tests do not override these findings. This is a bounded audit, not a guarantee that every defect has been found.

The findings describe the current working tree, including pre-existing uncommitted changes, and the backend configured locally. No application fixes, database deployments, real payments, or production load tests were performed. New audit scripts and sanitized evidence are in [tests/launch-audit](tests/launch-audit). The older `AUDIT.md` is preserved; some of its findings have already been addressed locally and should not be treated as current without revalidation.

## Release blockers

P0 means an immediately actionable privacy/security failure. P1 means a high-impact correctness, availability, or security issue to resolve before general launch. Evidence labels distinguish deployed observations, local execution, and source review.

### LA-01 — P0: Other users' reservation activity is readable publicly

**Confirmed against the configured live backend.** Anonymous queries for reservation approval, reminder, check-in, and no-show activity returned five rows, the probe limit. A signed-in regular test user also received five activity rows belonging to other users. This discloses private reservation-event information across the intended recipient boundary.

The probe deliberately selected only event types and, for the cross-user check, user IDs. It retained counts rather than customer identifiers or message bodies. It does not establish the exact contents of every exposed activity row.

The base schema defines `activities_read` with unrestricted reads (`supabase-schema.sql:822`). A narrower policy exists at `supabase/migrations/20261006000100_audit_authorization_hardening.sql:133`, but the observed deployed behavior is still permissive for these event types. The live test cannot identify the complete deployed policy set.

**Required:** Restrict private events to their recipient and explicitly authorized staff; whitelist genuinely public activity types. Verify the effective deployed policies, including overlapping permissive policies. Test anonymous, customer A, customer B, unrelated owner, assigned owner, and admin directly against the API. UI filtering is insufficient; Supabase describes this database enforcement boundary in its [RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

**Evidence:** [live-readonly.json](tests/launch-audit/evidence/live-readonly.json), `anonymous:activities` and `test-user:activities`.

### LA-02 — P1: The deployed API is missing required booking surfaces

**Confirmed against the configured backend.** `get_venue_table_availability` returned HTTP 404 / `PGRST202`; `walk_in_visits` returned HTTP 404 / `PGRST205`. These surfaces are unavailable in the deployed API/schema cache, even though current application code depends on them.

The reservation screen treats availability failure as a blocking condition (`app/reservation/[id].tsx:958–1047,1177`). Customers cannot reliably complete the current table-booking flow against this backend. Walk-in functionality also requires the missing table.

**Required:** Establish an authoritative migration sequence, repair the regression in LA-04, apply and verify the release schema in isolated staging, then coordinate API and client deployment. Demonstrate booking, owner table availability, and walk-in lifecycle against the deployed staging API. A local SQL file is not deployment evidence.

**Evidence:** [live-readonly.json](tests/launch-audit/evidence/live-readonly.json); `supabase/migrations/20261011000100_table_booking_policy_and_walk_ins.sql`.

### LA-03 — P1: 34 of 35 publicly reservable venues lack table inventory

**Confirmed by a read-only inventory query.** Of 75 public spots returned, 35 were marked reservable and 34 lacked table inventory. Current booking depends on actual configured tables. The UI's fallback table presentation does not establish real availability, and current database guards reject nonexistent tables.

**Required:** Configure and validate inventory, capacity, fees, and booking policy for every reservable venue, or remove its reservable status. Each advertised booking path must complete against real configured inventory.

**Evidence:** [live-readonly.json](tests/launch-audit/evidence/live-readonly.json), `public-spot-inventory`; `app/reservation/[id].tsx:969`.

### LA-04 — P1: Current hardening migration breaks manual GCash approval

**Reproduced in isolated PostgreSQL using repository SQL.** The checkout screen uploads the proof and supplies GCash method, reference, and proof path on the initial reservation insert (`app/checkout/[id].tsx:454`). The hardening trigger clears all three fields (`20261006000100_audit_authorization_hardening.sql:115–117`). The owner's approval RPC then rejects that same reservation because the required proof/method is missing (`:297–332`).

The reproduction stored null method, reference, and proof, then received: “Only eligible manual GCash payments with submitted proof can be approved.” This is a defect in the proposed local release SQL; its deployment status was not established.

**Required:** Introduce a narrowly authorized proof-submission operation, or preserve validated proof fields while continuing to prevent customers from setting trusted paid status or fees. Test upload → insert → owner opens proof → approval → customer confirmation with the full migration sequence.

**Evidence:** [database-probes.json](tests/launch-audit/evidence/database-probes.json), `manual-proof-after-current-migrations`.

### LA-05 — P1: QRPh checkout retries leave multiple provider sessions possible

**Reproduced with actual handlers and mocked provider/database; supported by source.** QRPh uses a new random provider idempotency key on each attempt (`supabase/functions/paymongo-create-qrph-checkout/index.ts:154`). It marks the old local payment expired (`:114`) without expiring the provider checkout.

A sequential retry created two provider sessions, made zero provider-expiration calls, and left local states `expired` and `pending`. Ten simultaneous handler calls used ten distinct provider keys. The concurrent mock does **not** enforce the real PostgreSQL partial unique pending-payment index: it does not prove ten pending rows can exist in the real database. That index also cannot undo provider sessions created before a rejected local save.

**Required:** Persist and reuse a durable checkout attempt/idempotency key; explicitly expire replaced or cancelled sessions; recover cleanly if the provider succeeds and local persistence fails. Verify retry and race behavior using PayMongo test mode and real PostgreSQL. PayMongo explicitly recommends expiring replaced/cancelled sessions in its [payment-channel best practices](https://docs.paymongo.com/docs/payment-channels-best-practices).

**Evidence:** [payment-probes.json](tests/launch-audit/evidence/payment-probes.json). The GCash handler's current stable key reused one mocked provider session in the same concurrency test; that improvement is not a QRPh fix.

### LA-06 — P1: Payment and reservation state can diverge without reconciliation

**Reproduced through actual handlers with injected database/provider outcomes.**

- A valid paid notification after cancellation returned HTTP 200, recorded the payment as paid, left the reservation cancelled/failed, and recorded no refund status.
- Failure of the reservation write after the payment write returned HTTP 400 with a paid payment and a still-pending reservation.
- Provider checkout creation followed by a local save failure returned HTTP 400 with no local payment row. The webhook's untracked-session handling ignores unmatched sessions.
- Duplicate paid notifications changed `paid_at`. A synthetic correctly signed event with mismatched amount/currency still confirmed the booking using the saved amount. This test does not imply an attacker can forge the real provider signature.

Relevant code: `supabase/functions/_shared/paymongo.ts:160–225` and `supabase/functions/paymongo-webhook/index.ts:180–226`.

**Required:** Make database payment transitions atomic and idempotent; validate provider amount, currency, and reference; persist recoverable checkout intent; reconcile orphan sessions and delayed events. Define and test the paid-after-cancellation refund/manual-resolution workflow. Preserving terminal booking status is appropriate, but money received still needs an explicit resolution.

**Evidence:** [payment-probes.json](tests/launch-audit/evidence/payment-probes.json). No real money was moved.

### LA-07 — P1: Unattached payment holds can occupy tables indefinitely

**Confirmed in local database tests and SQL review.** A paid reservation with pending payment and no attached provider method still blocks the table after five minutes. Timeout logic applies only to designated PayMongo methods, while the insert trigger initially clears the method. A crash or connection loss between reservation creation and provider attachment can therefore leave a permanent hold. A synthetic insert with a forged future `created_at` was also accepted.

Relevant code: `supabase/migrations/20261011000100_table_booking_policy_and_walk_ins.sql:81–88,246–252` and the hardening insert trigger.

**Required:** Use server-owned creation/expiration times and a bounded pending-checkout state independent of provider attachment. Coordinate hold expiry with provider-session expiry and LA-06. Test app termination and network loss at every creation step, plus an ordinary user's repeated abandoned holds.

**Evidence:** [postgres-concurrency.log](tests/launch-audit/evidence/postgres-concurrency.log), test “a pending paid reservation with no attached provider stays held after five minutes”; [database-probes.json](tests/launch-audit/evidence/database-probes.json), `forged-creation-time`.

### LA-08 — P1: Web login/signup errors and important alerts are invisible

**October 13 disposition: customer/owner web removed; retained admin feedback repaired locally.** Render admin uses visible browser alerts and real confirmations. Customer/owner routes are absent from its route tree. Render deployment/retesting and Android feedback UAT remain required. See [scope](docs/android-only.md).

**Reproduced in the production web export with intercepted synthetic responses.** Empty login, invalid signup, and rejected credentials produced no visible error. With a 25-second simulated authentication response, login remained disabled at 17 seconds and the eventual error was still invisible.

`app/login.tsx:50–135` uses `Alert.alert`; the installed React Native Web `Alert` implementation is a no-op. Other forms also rely on this primitive, so each critical web mutation needs review. Password recovery's inline empty-email error did work.

**Required:** Render platform-appropriate visible validation, failure, success, and confirmation feedback. Add bounded waiting and clear recovery for slow authentication. Verify login, signup, Google sign-in failure, reservation/payment failure, review submission, and owner/admin mutations in the actual web export.

**Evidence:** [browser.json](tests/launch-audit/evidence/browser.json), [browser-errors.json](tests/launch-audit/evidence/browser-errors.json); `node_modules/react-native-web/dist/exports/Alert/index.js`.

### LA-09 — P1: Web payment proof and video uploads save temporary URLs

**October 13 disposition: not applicable to Android-only customers/owners.** Their browser routes and standalone owner portal were removed locally. Render admin retains verification-document viewing. Publish the updated artifact to remove old hosted routes; Android media persistence/reviewer access still need UAT. See [scope](docs/android-only.md).

**Reproduced with actual service code and storage adapters.** Browser `blob:` payment proof returned unchanged with zero storage calls. Video submission likewise placed a browser blob URL in stored media with zero uploads. These URLs do not persist across browsers/sessions and cannot serve as shared durable evidence.

`src/services/paymentProofService.ts:49` only uploads native file URIs. `src/services/spotSubmissionService.ts:139` bypasses upload for non-native video URIs. Owner verification documents use `FileSystem.readAsStringAsync`, which the installed web shim lacks; the modeled web adapter raised the expected unavailable-method error. That last result is source/adapter evidence, not a real file-chooser end-to-end test.

**Required:** Upload browser Blob/ArrayBuffer data to storage, store durable paths, and resolve them with correct private access. Verify proof, video, and verification documents after a reload and from a separately authenticated authorized reviewer. Keep MIME/size validation and ownership checks. Existing image/review upload paths are different and are not all implicated by this finding.

**Evidence:** [media-probes.json](tests/launch-audit/evidence/media-probes.json).

### LA-10 — P1: Public upload processing lacks aggregate abuse controls in source

**Source-confirmed exposure; production saturation was not attempted.** `face-blur-service/app.py:94` admits anonymous jobs, prepares images before queueing them, and keeps a process-local job dictionary without an application-level admission/queue-size limit. Per-image limits and the detector lock do not bound aggregate submitted work. The root storage policy permits anonymous insertion into `owner-verification-documents` without a request-bound path capability (`supabase-schema.sql:895–897`).

An upstream limiter or custom deployed storage policy may exist; neither was verified. The supplied bucket configuration does not specify custom file-size/MIME restrictions. This is not a claim that every upload size is unlimited or that a measured production outage occurred.

**Required:** Verify or implement bounded admission, per-actor quotas, appropriate authentication/request-bound upload authorization, size/type limits, cleanup, and predictable overload responses. Validate limits under controlled staging load before exposing these paths generally. Supabase notes that additional API protections can be necessary alongside RLS in its [API security guide](https://supabase.com/docs/guides/api/securing-your-api).

**Evidence:** source above and [face-local.json](tests/launch-audit/evidence/face-local.json). Local valid-job and malformed-input tests passed; they do not establish capacity.

## Additional defects and release checks

| Issue | Evidence and consequence | Required action |
| --- | --- | --- |
| Dependency advisories | `npm audit --omit=dev`: 75 advisory-bearing packages, including 2 critical (`shell-quote`, `tar`), 47 high, 25 moderate, 1 low. Some are build tooling in the dependency tree, not demonstrated exploitable client paths. | Triage reachable runtime/build exposure, update safely, rerun audit and regression tests. Do not use the count as a count of exploitable application vulnerabilities. See [npm-audit.json](tests/launch-audit/evidence/npm-audit.json). |
| Browser/scratch artifacts in Git history | HEAD still contains 668 browser/scratch paths; current index contains none following pre-existing staged deletions. Seven historical sensitive-path candidates were identified. No private-key pattern hit was found in HEAD. | Inspect historical browser-session artifacts and access to repository copies. Rotate any credentials actually exposed. Removing current files alone does not remove history. No exhaustive all-history forensic scan or history rewrite was performed. |
| Slow/offline discovery | After 17 seconds offline, an error appears alongside “0 spots” / “NO MATCHES FOUND” / “CLEAR FILTERS”; no listing-data retry action was shown. A delayed successful fixture eventually loaded. | Separate unavailable data from a true empty search, preserve useful state, expose a working refetch, and test reconnection. See [browser-errors.json](tests/launch-audit/evidence/browser-errors.json). |
| Demo content shown as live activity | Empty/failed activity data falls back to hardcoded posts in `src/services/localUpdateService.ts:90–104`; the browser fixture rendered demo posts. | Use truthful empty/error states or conspicuously label demonstration content. |
| Server validation gaps | Isolated PostgreSQL accepted malformed contact email/phone and inconsistent slot/time. It correctly rejected unknown tables, invalid slots, negative/over-capacity party sizes, and missing paid contact fields. | Validate contact shape and derive authoritative slot times on the server. See [database-probes.json](tests/launch-audit/evidence/database-probes.json). |
| Free booking status wording | Local SQL stores a free booking as `pending/not_required`; `app/confirmed/[id].tsx:157` labels a nonpaid booking “Reservation Confirmed.” Owner check-in of this pending free booking was tested and succeeded. | Align confirmation wording and business state. Do not misclassify this as a proven inability to check in. |
| Location-sharing lifecycle | Circle entry updates a shared profile location; member queries expose that location to circle members. No complete leave/revoke-sharing UI/API lifecycle was found during source review. | Explicitly communicate scope, provide revoke/leave controls, and test stale-location behavior across circles. This is not a demonstrated live outsider-location exploit. |
| Privacy/account lifecycle | `/privacy` redirected an anonymous browser to login; no signup privacy link or user-facing account-deletion flow was found. The active policy is `Cebspot.ts`, not the unused draft policy file. | Make the policy accessible before signup and implement/document account and associated-data deletion. Validate retention behavior. |
| Missing-page recovery | 53 literal navigation targets matched 26 route files. The default unmatched route overflowed at 320 px; missing reservation content lacks a useful recovery path. | Add usable narrow-screen 404 and missing-record recovery. Dynamic parameters and all external venue links remain outside that static link result. |
| Growing datasets | Discovery has a 500-record fetch cap; some lists lack server pagination. | Implement/test pagination and search against representative data beyond caps. A small current dataset does not establish scale readiness. |

## What was tested

| Area | Result | Limits |
| --- | --- | --- |
| TypeScript | `npm run typecheck` passed. | Does not validate runtime services. |
| Production exports | Web export and Android JS/Hermes export passed. Web main JS approximately 5.09 MB; Android Hermes bundle approximately 8.26 MB. | Android export is not a native APK/device build; byte size is not compressed transfer size. |
| Existing backend/isolated suites | 152 tests: 147 passed, 5 skipped in the initial run. | Mix of source assertions, mocks, and isolated database tests. |
| Native PostgreSQL booking suite | Separate native-PostgreSQL run: 24/24 passed, including the five competing-session cases skipped above. | Overlaps the earlier suite; do not add counts as unique tests. Includes an assertion documenting the problematic unattached hold. |
| Competing reservations | 50 distinct authenticated fixture users attempted the same table concurrently: 1 accepted, 49 rejected, 1 row stored; latest timed write phase 311 ms. | Loopback isolated database; sessions established before timing. No HTTP/auth/provider/production-capacity claim. Initial mass connection setup hit the harness's short connection timeout, so connection setup was serialized before the measured race. |
| Payment failure/race probes | Actual handler code executed against injected provider/database behavior. | No PayMongo settlement; mock does not enforce all real SQL constraints. |
| Public/customer web screens | Production export browser smoke checks included 29 route/viewport combinations across 320, 390, 768, and 1440 px; no uncaught page errors in those cases. Login, signup validation, missing records, offline, and delayed responses were exercised separately. | Synthetic accounts/data; all external requests intercepted. Not a complete successful purchase or real-account end-to-end flow. Screenshots include [320 px reservation](tests/launch-audit/evidence/web-320-reservation.png) and [offline state](tests/launch-audit/evidence/offline-17-seconds.png). |
| Maps | 11/11 browser tests passed: fallback failure/recovery, gestures, resize, untrusted labels, reduced motion. | Intercepted map providers; not a real-device geolocation permission test. |
| Owner dashboard | Six original viewport cases passed. The seventh failed a pending-save assertion with a 500 ms mocked mutation. A focused follow-up increased only the mock delay to 3 seconds; the remaining three configurations passed, covering nine configurations overall with 4x CPU throttling and hundreds of fixture records. | Preserve both logs. The timing-sensitive original failure is not erased or counted as an unchanged-suite pass; no confirmed application pending-save bug was established. This harness mocks native components/services. |
| Hosted auth and guards | Configured regular test account logged in successfully; signup/email verification/Google were enabled in settings. Anonymous checkout and owner provisioning returned 401; unsigned webhook returned 400. | No new accounts/email sent; no completed Google/verification/recovery flow; no actual owner/admin credentials identified. |
| Hosted privacy checks | Anonymous and unrelated-user probes returned no reservation/payment/profile rows in the tested queries. Activity probes failed isolation as LA-01. | Empty results are not exhaustive proof of all policies/roles/operations. No privileged policy introspection. |
| Hosted payment configuration | Enabled live paid-event webhook and matching local secret observed. Deployment readiness scripts accepted a signed untracked probe as ignored and rejected nonexistent-reservation checkout before provider creation. QRPh live method was reported active; inactive GCash was disabled by its flag. | Tool observations supplement saved evidence. Configuration/auth checks do not establish that a real payment can settle or refund correctly. |
| Face service | Local real FastAPI service: health 200; missing image/malformed base64 400; synthetic no-face image job 202 → complete → JPEG 200; repeated result download 404 after cleanup. Hosted health initially timed out at 20 s; later retry returned 200 in approximately 1.08 s. | No face-detection accuracy assessment, saturation test, or basis to classify the initial timeout as persistent outage/cold start. |
| Secrets | Known local private-value/provider-key/service-role patterns found no match in scanned current source or exported web artifacts. Public Supabase anon/map keys are not private server credentials by themselves. | No exhaustive history scan, cloud-console key restriction check, Android bundle secret scan, or external infrastructure assessment. See [secret-scan.json](tests/launch-audit/evidence/secret-scan.json). |

## Untested release gates — cannot claim readiness

Staging and test accounts were said to exist, but their location and isolation could not be identified. The locally configured provider key is live. Accordingly, hosted checks were limited to reads, legitimate test-account login/logout, authorization rejection, and an untracked signed webhook probe designed to make no business-record changes. No real-user booking, charge, mass signup, or production flood was attempted.

Before release, establish a known isolated staging backend, PayMongo test mode, and customer A/customer B/assigned owner/unrelated owner/admin accounts. Then complete:

1. Fresh-database bootstrap and upgrade from the deployed schema, with a recorded migration/version manifest. Root SQL fragments and timestamped migrations must have one authoritative application order. Recheck LA-01 and LA-02 after deployment; local fixes alone do not close them.
2. Real signup → email verification → login/logout → recovery → Google callback, including expired links/tokens, disabled accounts, and session expiry during a mutation.
3. Full free, manual GCash, and enabled provider-payment booking lifecycles; owner approval/rejection, proof access, check-in/no-show, cancellation/reschedule, late/duplicate webhook, refund and reconciliation. Test private records/storage across all roles directly via API.
4. Owner onboarding/document review/provisioning and administrator operations with real scoped accounts; submissions/reviews/moderation and persistent media across devices. Browser route gates alone do not establish backend authorization.
5. Android release build on real phones/tablets: camera/photos/location permissions (allow/deny/revoke), keyboard, large fonts, rotation, app background/termination, notification and payment/auth deep links. `adb devices` showed no attached device during this audit. iOS runtime behavior was not tested.
6. Sustained ramp, spike, and soak tests through the real staging API with representative data. Set expected concurrent users and latency/error targets first. Include auth, availability, checkout initiation, webhook processing, storage, face jobs, and owner reads; monitor database connections/locks, queue depth, provider limits, memory, and recovery. The 50-user local table race cannot answer “all users at once.”
7. Slow, dropped, offline/reconnect requests at every critical write boundary; ensure visible errors, bounded waiting, durable retry/idempotency, and no silent duplicate or lost transaction.
8. Backup/restore drill, deployment rollback, alerting for payment discrepancies, effective cloud/bucket/RLS configuration review, and dependency/history exposure triage.

## Reproduction and evidence handling

Audit probes are in `tests/launch-audit/*.cjs` and `face-local.py`; original test suites remain intact. The database probes use isolated PostgreSQL with selected source SQL and auth fixtures, not a successful clean deployment of every root SQL file. Browser probes use the exported web artifact and intercept external requests. Some harnesses depend on existing `.codex-tmp` tooling and the configured local Python environment; they are audit utilities, not a portable CI setup.

Do not rerun `live-readonly.cjs` or the provider readiness scripts against an arbitrary environment without reviewing their target and behavior. They use local credentials without printing them; the live probe also creates and signs out a legitimate test session. Saved evidence deliberately excludes tokens, passwords, provider secrets, and customer message bodies. The source scan records file paths and hashes, not secret values.

**Release disposition remains blocked.** Close the confirmed defects and complete the unverified release gates with retained evidence before changing that decision.
