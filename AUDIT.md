# CebSpot codebase audit

Audit date: 2026-10-02. Baseline: `eb839e6`, plus the existing working tree. This is an audit and remediation plan; application code and deployed services were not changed.

**Disposition: ready for remediation, not a production-readiness approval.** The highest priorities are database authorization, location privacy, payment state integrity, and the web photo anonymization bypass. Passing TypeScript checks does not cover those boundaries.

The report contains **31 findings: 15 high-priority, 15 medium-priority, and 1 low-priority**. Priorities describe remediation urgency; evidence labels distinguish executed checks from static conclusions and improvements.

## Scope, method, and evidence

The review followed the application across Expo routes, hooks and services, the separate owner portal, SQL policies/functions/triggers, payment edge functions, the Python face anonymizer, build configuration, scripts, tests, and deployment documentation. It combined source reading, repository-wide searches, cross-layer tracing, syntax checks, the existing local tests, and five additional isolated payment probes. Findings describe the checked-in implementation. Deployed SQL privileges, migration order, environment settings, and external service behavior were not independently established.

The inventory below counts tracked authored code, excluding the generated map document and compiled owner-portal assets. Line counts include blank lines. Configuration, documentation, and generated-artifact provenance were reviewed separately. Generated/vendor bundles were inspected for integration and configuration, not treated as maintainable authored source or exhaustively audited third-party implementations. Binary assets, browser databases, document attachments, dependencies, and Git history were not decoded or exhaustively reviewed. No claim of line-by-line review of every generated artifact is made.

| Audit scan | Inventory / scope | Review performed | Result / related findings |
| --- | --- | --- | --- |
| Expo routes and screens | 20 files; 25,461 lines | Authentication, discovery, booking, checkout, submissions, social, owner and admin flows; component lifecycle and error paths | AUD-12–16, AUD-20–22, AUD-31 |
| Shared application code | 66 files; 10,760 lines | Services, hooks, types, UI components, map runtime, validation and persistence | AUD-14–22, AUD-26, AUD-29, AUD-31 |
| Database and access control | 28 root SQL files; 9,246 lines; two migrations also inventoried below | RLS policies, privileges, definer functions, triggers, state transitions, overlapping setup scripts | AUD-01–06, AUD-11, AUD-18, AUD-24, AUD-30 |
| Supabase edge functions and migrations | 8 files; 1,247 lines | Provider authentication/signatures, checkout and webhook writes, owner provisioning, migration dependencies | AUD-01, AUD-09–12, AUD-24 |
| Standalone owner portal | 1 authored integration file; 1,266 lines; compiled JS/CSS and HTML | Supabase configuration, DOM integration, inventory writes, duplicated booking rules and build provenance | AUD-11, AUD-23, AUD-25 |
| Face anonymizer | 2 Python files; 947 lines; Docker/requirements/deployment configuration | Input limits, decoding, detector locking, jobs, cleanup and deployment model | AUD-07, AUD-16–18 |
| Operational scripts | 11 files; 1,030 lines | Build/check entry points, external writes, environment handling and portability | AUD-24, AUD-27–28 |
| Automated tests | 11 files; 1,273 lines | Static assertions versus executable behavior, payment harness and browser tests | AUD-27; verification results below |
| Repository and release hygiene | Git inventory, ignore files, manifests, documentation | Tracked browser/scratch artifacts, packaging exclusions, setup instructions and typecheck boundaries | AUD-08, AUD-24–28 |

Existing changes to `.expo/devices.json`, `.expo/settings.json`, and the untracked `docs/paper-alignment-review.md` were preserved. Audit logs and temporary probes are under ignored `.codex-tmp/audit/`; the repeatable payment probe recipe is also included below so the report does not depend on those scratch files being committed.

### Reading the findings

| Label | Meaning |
| --- | --- |
| P1 — high | Address before exposing the affected feature to production use; authorization, privacy, financial integrity, destructive behavior, or a core booking failure |
| P2 — medium | Schedule a concrete fix; correctness, reliability, operational visibility, or scalability gap |
| P3 — low | Maintenance and development improvement |
| Source-confirmed | The problematic behavior or missing guard is visible in source; deployed behavior may depend on configuration or installed SQL |
| Offline-reproduced | Executed against the repository's mocked payment harness; not a live database/provider test |
| Improvement | Architectural recommendation with an explicit trigger or measurable acceptance target, rather than a proven production incident |

## Scan 1 — authorization, privacy, and service exposure

| ID | Priority | Finding | Evidence 01classification | Primary source |
| --- | --- | --- | --- | --- |
| AUD-01 | P1 | Reservation insertion trusts client price, payment state and inventory identifiers | Source-confirmed; GCash price trust offline-reproduced | `supabase-schema.sql:196,765`; GCash edge `:43` |
| AUD-02 | P1 | Circle creators can add arbitrary users and retrieve their stored location | Source-confirmed | `supabase-circles.sql:25,35` |
| AUD-03 | P1 | Popular-submission promotion lacks a caller authorization boundary | Source-confirmed; deployed grants need inspection | `supabase-schema.sql:2238` |
| AUD-04 | P1 | Any authenticated user can insert a public spot directly | Source-confirmed | `supabase-schema.sql:742` |
| AUD-05 | P1 | Moderation records accept client-supplied reviewed states | Source-confirmed | `supabase-schema.sql:1068,1161,1189` |
| AUD-06 | P1 | Personal booking activities and guest profile fields have excessive read access | Source-confirmed | `supabase-schema.sql:725,822` |
| AUD-07 | P1 | Public anonymization work has no application-level admission bound | Source-confirmed; capacity impact not load-tested | `face-blur-service/app.py:94`; detector processing |
| AUD-08 | P1 | Git tracks a browser profile and generated scratch exports | Inventory-confirmed; credential exposure unverified | `.chrome-video-review/`; `.codex-tmp/`; `.gitignore` |

### AUD-01 — validate reservation creation at the database boundary

**Evidence and trigger.** [The insert policy](supabase-schema.sql#L765) checks only authentication and `user_id = auth.uid()`. The [checkout-details trigger](supabase-schema.sql#L196) validates contact/terms only when the incoming row itself says payment is required. Neither derives price or payment requirement from the spot, validates the table against inventory, or enforces a safe initial state. A direct authenticated insert can submit an allowed but false combination such as `payment_required = false`, `payment_status = 'paid'`, `status = 'confirmed'`, or a noncanonical table ID. UI validation is bypassable through the API.

The [GCash endpoint](supabase/functions/paymongo-create-gcash-checkout/index.ts#L43) also trusts a positive stored reservation fee. The offline probe charged 100 centavos for a reservation changed to PHP 1 while the fixture spot price was PHP 150. **The QRPh endpoint is different:** it reads the spot's configured amount and must not be described as having the same price calculation.

**Impact.** Forged financial/booking records, undercharging through GCash, and bypass of table and policy checks. The existing partial unique index does protect simultaneous inserts using the same non-null spot/date/slot/table tuple; this finding is not an assertion that there is no double-booking protection.

**Remediation.** Create a narrowly authorized booking RPC that derives authoritative price, payment requirement, legal starting state, capacity, schedule and inventory identifiers. Restrict raw writes to those protected columns. Snapshot the agreed price server-side and use it consistently across payment methods.

**Acceptance.** In a disposable Supabase database, ordinary-user inserts with fake payment state, a reduced price, null/unknown table identifiers, an invalid slot/date, or insufficient capacity must fail. Two valid concurrent bookings for the same table must produce one success. Both providers must charge the server-approved amount.

### AUD-02 — circle membership can be forged to disclose location

**Evidence and trigger.** [Circle insertion](supabase-circles.sql#L25) requires that the creator be the owner and appear somewhere in `members`; it does not require the initial array to contain only that creator. [get_circle_members](supabase-circles.sql#L35) runs with definer privileges and returns `profiles.location` and `last_location_update` for every member if the caller owns or belongs to the circle. An attacker who knows another profile UUID can create `[attacker, victim]` and query that victim's stored location without the victim joining. The base schema repeats this logic.

**Impact.** Exposure of a user's stored coordinates, including a previous location when sharing is no longer actively updating. This does not require breaking invite-code generation.

**Remediation.** Limit initial membership to the creator, and permit additional membership only through a validated join/invitation operation. Prefer a membership table with foreign keys, consent state, and explicit leave/revocation behavior. Apply sharing authorization when returning location, not just when writing it.

**Acceptance.** An attacker-created array containing another user is rejected; an invited user is visible only after joining and consenting; leaving/revoking sharing removes coordinate access immediately.

### AUD-03 — privileged promotion is callable without an internal guard

**Evidence and trigger.** [promote_popular_spot_submissions](supabase-schema.sql#L2238), also defined in `supabase-popular-submissions-workflow.sql`, is `SECURITY DEFINER`, creates public spots, and approves submissions. It has no admin/service-role check, no repository-defined revoke for this function, and accepts caller-controlled score and row limits. A caller could request a negative threshold and a large limit.

PostgreSQL grants new functions execution privileges to `PUBLIC` by default unless defaults or explicit grants change that, and definer functions run with their owner's privileges. Thus this is unsafe on an ordinary installation; actual deployed grants/default privileges still require verification. [PostgreSQL CREATE FUNCTION documentation](https://www.postgresql.org/docs/current/sql-createfunction.html).

**Impact.** Bypassing the intended popularity/review gate to publish submissions. Do not assume that hiding this function from the UI restricts its API availability.

**Remediation.** Revoke public/anonymous/authenticated execution as appropriate, add an internal trusted-caller check, bound parameters, and expose a dedicated authorized job/admin path. Lock candidates and make promotion idempotent so concurrent runs cannot publish duplicate listings.

**Acceptance.** Inspect `has_function_privilege` for each application role and execute negative API tests. Authorized promotion must respect server-controlled thresholds and produce at most one listing per submission under concurrent execution.

### AUD-04 — the publication review gate is optional at the API layer

**Evidence and trigger.** [spots_owner_insert](supabase-schema.sql#L742) allows any authenticated account to create a spot whose `owner_id` equals its UUID. It neither requires the owner role/approved access nor restricts `is_public`. A normal explorer can insert a public, reservable listing directly instead of going through submission review. Adding a separate restrictive-looking permissive policy would not narrow this existing authorization path.

**Impact.** Unreviewed listings and user-controlled venue/payment metadata can appear in discovery.

**Remediation.** Separate creating a draft from publishing a spot. Make publication a trusted moderation operation; decide explicitly whether verified owners may create drafts or request new venues. Enforce those rules in SQL.

**Acceptance.** A regular explorer cannot create a public spot through the raw API; approved admin/owner workflows still work, and ownership cannot be used to self-publish without the intended approval.

### AUD-05 — submitted workflow records can start already reviewed

**Evidence and trigger.** Own-row insert policies for [spot submissions](supabase-schema.sql#L1068) and [review reports](supabase-schema.sql#L1189), plus [anonymous owner requests](supabase-schema.sql#L1161), do not force the starting status or clear reviewer fields. The owner-request email trigger checks availability, not review state. With the gamification script installed, [submission/report triggers](supabase-gamification.sql#L533) award points even on inserts already marked approved/handled.

**Impact.** Forged moderation history and potential reward farming using new record IDs. An owner request inserted as approved does **not**, by itself, provision an owner account; the separate provisioning/finalization process remains necessary. An approved submission insert likewise is not, on its own, a public spot insert.

**Remediation.** Enforce pending initial state and null reviewer metadata in trusted database code. Restrict review transitions to authorized RPCs. Award rewards only for a verified review transition, while retaining the existing reward deduplication protections.

**Acceptance.** Raw inserts with approved/handled/reviewed metadata are rejected or normalized before triggers run; they create no rewards. Legitimate reviewed records receive one reward only.

### AUD-06 — read policies expose more than the user-facing queries

**Evidence and trigger.** [activities_read](supabase-schema.sql#L822) uses `true`, while the same table stores reservation approval, attendance and reminder notifications. Approval can include the guest's display name or email fallback, reservation identifier and venue. Filtering by user in `activityService` does not restrict a direct query. Separately, [profiles_select_owned_reservation_guests](supabase-schema.sql#L725) makes an entire guest profile row readable to a related venue owner, without a time/status bound; RLS filters rows, not sensitive columns such as `location`.

**Impact.** Other API readers can obtain booking notification data, and venue owners can access guest fields beyond the necessary booking contact details. Exact deployed table grants determine whether the activity read is also anonymous; the policy itself does not restrict it.

**Remediation.** Separate public feed events from private notifications, or enforce recipient-based policies for private types. Provide a limited guest-contact projection/RPC rather than granting access to complete profiles. Keep circle location sharing behind its own consent boundary.

**Acceptance.** Anonymous and unrelated authenticated callers cannot read private reservation events. Owners can read only the approved booking contact fields for appropriate reservations and cannot retrieve guest coordinates through profile queries.

### AUD-07 — per-image limits do not bound aggregate processing

**Evidence and trigger.** [Job creation](face-blur-service/app.py#L94) and the synchronous upload/base64 endpoints do not authenticate callers or apply an application queue/concurrency limit. Jobs live in a process-local dictionary. The [detector implementation](face-blur-service/services/face_blur.py) has byte/pixel/tile limits and a detector lock, but image preparation/decoding can consume resources while work queues behind that lock. Completion-based expiration does not bound queued work.

**Impact.** Concurrent uploads can exhaust memory, disk or processing capacity, delaying privacy processing for legitimate users. In-memory job lookup also prevents transparent multi-worker/replica routing and loses jobs on restart. The checked-in single-process deployment is not evidence that a multi-worker outage already occurs.

**Remediation.** Bound admission before expensive preparation, enforce aggregate upload/queue limits, apply client quotas or authenticated access at the service/gateway, and return retryable overload responses. If scaling beyond one process, use shared job state and a bounded worker queue. Add cleanup for abandoned input files and operational metrics.

**Acceptance.** A controlled burst exceeding capacity returns bounded overload responses without unbounded RSS/disk growth; accepted jobs finish or fail explicitly; restart/retention behavior is tested. No production load test was performed during this audit.

### AUD-08 — remove browser and generated scratch artifacts from version control

**Evidence.** Git tracks 264 files under `.chrome-video-review/`, including browser `History`, `Login Data`, `Network/Cookies`, and Local Storage paths, and 404 files under `.codex-tmp/`. The latter remains tracked despite its ignore entry; `.chrome-video-review/` is missing from [.gitignore](.gitignore). [.easignore](.easignore) already excludes these directories from EAS uploads, which is helpful but does not protect Git clones/history.

**Impact.** Unnecessary repository size and distribution of browser session/history containers. Their contents were not decoded, and this report does not claim that usable passwords or tokens were found. Supabase anonymous public keys are not service-role secrets and are not classified as leaked private credentials here.

**Remediation.** Stop tracking these artifacts and add the missing ignore rule. Review their history/access exposure using an appropriate secret/privacy scan; rotate or revoke only credentials actually exposed. Any history rewrite must be coordinated separately rather than performed as part of this audit.

**Acceptance.** `git ls-files .chrome-video-review .codex-tmp` returns no artifacts after cleanup, clean builds still work, and any confirmed sensitive history exposure has a documented response.

## Scan 2 — booking, checkout, and financial state

| ID | Priority | Finding | Evidence classification | Primary source |
| --- | --- | --- | --- | --- |
| AUD-09 | P1 | Concurrent/repeated checkout creation can leave multiple payable sessions | Offline-reproduced for GCash; QRPh source-confirmed | GCash edge `:87,131`; QRPh edge `:65,102` |
| AUD-10 | P1 | Payment/webhook writes are non-atomic and do not preserve all booking states | Offline-reproduced | `_shared/paymongo.ts:130,193`; webhook `:160` |
| AUD-11 | P1 | Owner payment approval bypasses terminal-state and provider rules | Source-confirmed | `supabase-schema.sql:785,1705` |
| AUD-12 | P2 | Hosted HTTPS checkout returns are replaced with native links | Offline-reproduced for GCash; shared pattern in QRPh | Both checkout edges `:14` |
| AUD-13 | P1 | Non-club booking uses simulated availability and a fixed first table | Source-confirmed | `app/reservation/[id].tsx:204,1115,1125` |
| AUD-14 | P2 | The displayed five-minute hold is not a server-side lease | Source-confirmed | `app/reservation/[id].tsx:1408`; checkout creation path |
| AUD-15 | P2 | Reminder synchronization can repeat alerts and mishandle lifecycle changes | Source-confirmed; native delivery needs device verification | `reservationReminderService.ts:79,105,142`; `_layout.tsx:150` |

### AUD-09 — checkout creation needs durable idempotency

**Evidence and trigger.** GCash checks for a pending local payment, then calls PayMongo and inserts a payment row. Two simultaneous requests can both observe no pending row. The offline `Promise.all` probe produced two successful requests and two pending checkout sessions. QRPh expires pending rows locally and uses a fresh random UUID in each provider idempotency key, so repeated requests are intentionally distinct at the provider. No provider expiration/cancellation call accompanies the local expiry in that path.

**Impact.** Multiple checkout links can remain payable for one booking. A local expired flag is not proof that the provider stopped accepting payment. Sequential reuse tests do not cover concurrent creation.

**Remediation.** Reserve a checkout attempt under a database lock/unique business key, use a stable provider idempotency key for retries, and distinguish an explicit new attempt from a retry. Reconcile or expire superseded sessions at the provider where supported; otherwise track and handle their possible late payments.

**Acceptance.** Parallel requests and network retries create one intended payable attempt. A second explicit attempt cannot silently strand a payable first session; duplicate/late receipts enter a defined reconciliation path.

### AUD-10 — make payment event application atomic and monotonic

**Evidence and reproduced cases.** [upsertReservationPayment](supabase/functions/_shared/paymongo.ts#L130) writes the payment row and then independently updates the reservation. Three offline probes demonstrated:

| Input / injected condition | Observed result |
| --- | --- |
| Repeated signed paid event for a paid, checked-in reservation | Reservation changes back to `confirmed`; the paid guard excludes cancelled/completed/no-show but omits checked-in |
| Reservation write fails after payment upsert | Payment is `paid`, reservation is still pending, handler returns HTTP 400 |
| Paid event arrives after reservation cancellation | Payment is `paid`; reservation remains cancelled with `payment_status = 'failed'` |

The webhook's existing paid/expired checks prevent some **sequential** downgrades, but the read-before-upsert guard is not an atomic compare-and-set for concurrent events. Repeated paid upserts also replace `paid_at`. Keeping cancelled reservations closed is correct; the missing piece is representing/reconciling the money received, not reopening them automatically.

**Impact.** Attendance regression, contradictory ledgers, misleading totals based on reservations, and no explicit late-payment/refund-review outcome. An external retry may repair some partial failures, but there is no durable local event application transaction. This audit does not assume a particular PayMongo retry policy for HTTP 400.

**Remediation.** Persist verified provider events with unique event IDs, apply ledger and reservation changes in one locked database transaction, and define legal monotonic transitions. Preserve attendance/terminal booking state, the original payment timestamp, and an explicit payment-received/reconciliation status for closed bookings. Classify transient failures appropriately and add reconciliation against provider records.

**Acceptance.** Test duplicates, failed-then-paid and paid-then-failed ordering, concurrent delivery, checked-in/completed/no-show bookings, late paid events, and failure between writes. No committed contradictory state or repeated side effect should remain.

### AUD-11 — owner authority must still respect booking/payment invariants

**Evidence and trigger.** [approve_paid_reservation](supabase-schema.sql#L1705) checks ownership and locks the reservation, then unconditionally sets `confirmed` and `paid`. It does not reject a cancelled/completed/no-show/checked-in booking, require a manual-payment method, or require acceptable proof. The [owner update policy](supabase-schema.sql#L785) also permits broad raw row updates, bypassing narrower attendance and free-booking RPC rules. Expo's `canManuallyApproveReservation`/proof UI checks do not secure these API paths, and the standalone portal has separate approval behavior.

**Impact.** A venue owner or buggy portal can overwrite final attendance states or mark a gateway booking paid without a matching provider payment. Ownership authorization exists; the issue is the scope and state transitions it permits.

**Remediation.** Put manual approval rules in a database transition RPC and limit direct financial/status writes. Keep gateway settlement authoritative to verified provider events. Preserve a separate audited process for legitimate manual corrections.

**Acceptance.** Owners can approve eligible manual bookings only; direct requests cannot settle gateway payments or resurrect terminal bookings. Ordinary owners still cannot modify another venue's reservation.

### AUD-12 — allow configured production web return origins

**Evidence and trigger.** Both [GCash](supabase/functions/paymongo-create-gcash-checkout/index.ts#L14) and [QRPh](supabase/functions/paymongo-create-qrph-checkout/index.ts#L14) return-URL normalizers permit native/development schemes and localhost HTTP but reject hosted HTTPS web URLs. The offline probe supplied an HTTPS app URL and observed a `cebspot:` success URL instead.

**Impact.** Payment from the hosted web app returns toward a native app rather than the browser confirmation route; this is especially disruptive on a device without the app installed.

**Remediation.** Add an explicit environment-configured HTTPS origin allowlist and safe confirmation/cancellation route construction. Do not accept arbitrary client-supplied HTTPS domains.

**Acceptance.** An allowed hosted origin, native app, and approved local development flow each return correctly; unrelated origins and malformed URLs are rejected. Repeat on both payment methods.

### AUD-13 — real non-club bookings use demo availability

**Evidence and trigger.** [getTableInventoryForDate](app/reservation/[id].tsx#L204) modifies inventory using the day number when `simulateDemoAvailability` is enabled. The production screen passes `!isClubBooking`. Non-club selection then uses `availableTables[0]`, while the live reserved-table refresh is guarded by `isClubBooking`. If that first apparently open table is actually booked, the final availability check rejects it even when another physical table is free.

**Impact.** Arbitrary unavailable dates/tables and bookings that cannot progress despite available capacity. A final database collision check exists, but it does not make the earlier availability display or table choice correct.

**Remediation.** Remove simulation from live data paths, fetch availability for all reservable venue types, and select an actually available table or let the user choose. Keep demo inventory behind an explicit demo mode.

**Acceptance.** With two suitable tables and the first already booked, a real non-club booking selects the second. Calendar availability must match database occupancy across dates that previously triggered the simulation.

### AUD-14 — represent the hold honestly or implement a lease

**Evidence and trigger.** The reservation screen computes a local countdown and passes [holdExpiresAt](app/reservation/[id].tsx#L1408) as a route parameter. No server row/lease is acquired by that selection; the reservation is persisted later in the checkout/confirmation flow. Two devices can therefore see a hold for the same table until one actually reserves it.

**Impact.** The interface promises exclusivity it cannot provide. The unique index can reject the later contender, so this is primarily a hold/checkout contract problem, not proof that identical table tuples can both commit.

**Remediation.** Either describe the timer as a checkout/session deadline or create an authenticated expiring server lease and convert it atomically to a booking. Align database, UI and provider attempt expiration; provider payment completion after local expiration must enter AUD-10 reconciliation.

**Acceptance.** Two sessions cannot both receive an exclusive hold on one table; expiry/release works without relying on another user's availability query. If no lease is implemented, all hold language must accurately describe the behavior.

### AUD-15 — reminders need delivery and account lifecycle state

**Evidence and trigger.** [Reminder scheduling](src/services/reservationReminderService.ts#L95) uses `max(reminderDate, now + 1000)`, and [the layout](app/_layout.tsx#L150) synchronizes every minute. After the intended reminder time and before arrival, each synchronization can recreate an immediate trigger under the same notification ID. There is no persisted delivered marker. Eligibility excludes a free booking in `rescheduled` state because it accepts only confirmed or paid. Signing out stops synchronization but does not cancel existing OS triggers.

**Impact.** Potential repeated alerts during the final hour, missed reminders for rescheduled free bookings, and reminders from a previous account on a shared device. The exact repeat presentation depends on the native notification library and should be verified on a device.

**Remediation.** Track delivery/scheduling by account, reservation and schedule version; do not recreate elapsed reminders. Include eligible rescheduled bookings and cancel account-owned triggers on logout/switch. Use the venue timezone consistently.

**Acceptance.** Repeated synchronization sends at most one reminder per schedule; rescheduling replaces it; cancellation, attendance and logout remove it; switching accounts never displays another user's reservation reminder.

## Scan 3 — media, persistence, and client reliability

| ID | Priority | Finding | Evidence classification | Primary source |
| --- | --- | --- | --- | --- |
| AUD-16 | P1 | Browser photo URIs bypass anonymization or durable upload | Source-confirmed | `imageAnonymization.ts:384`; `spotSubmissionService.ts:119`; `ownerGalleryService.ts:98` |
| AUD-17 | P2 | Submission upload metadata can describe PNG/HEIC while bytes are JPEG | Source-confirmed | `spotSubmissionService.ts:67,80,132` |
| AUD-18 | P2 | Cleanup calls lack corresponding storage delete policies and error checks | Source-confirmed under supplied SQL | `supabase-schema.sql:849,895`; upload services |
| AUD-19 | P2 | A failed activity write reports failure after a submission has committed | Source-confirmed | `spotSubmissionService.ts:260,279` |
| AUD-20 | P2 | Live data and errors are silently replaced with demo/session data | Source-confirmed | `spotService.ts:61`; `adminDashboardService.ts`; spot review screen |
| AUD-21 | P2 | Saved spots are device-global and limited by unrelated discovery pagination | Source-confirmed | `savedSpotService.ts:3`; `app/saved.tsx:25` |
| AUD-22 | P2 | Async loading can create realtime subscriptions after unmount | Source-confirmed | `app/reservations.tsx:59`; `app/activity.tsx:259` |

### AUD-16 — implement a complete browser media path

**Evidence and trigger.** [anonymizeImage](src/services/imageAnonymization.ts#L384) returns the input unchanged unless its scheme is `file:`, `content:` or `ph:`. A web picker commonly supplies `blob:`/`data:`. [Owner gallery uploading](src/services/ownerGalleryService.ts) then fetches those bytes and stores them publicly, so the original image can be published without face processing. [Submission uploading](src/services/spotSubmissionService.ts#L119) instead returns a non-device URI directly, storing a browser-local URL as if it were durable media. [Review uploading](src/services/reviewMediaService.ts#L49) rejects those URIs. These are three distinct results of the missing platform adapter.

**Impact.** Privacy protection is bypassed in the web owner gallery, submitted photos can disappear after the browser session, and web review uploads fail. Native image processing failures generally fail closed; this finding is specifically about URI handling across platforms.

**Remediation.** Normalize browser `File`/`Blob` and native files into an explicit upload representation, require a successful anonymizer result for every new photo, and upload only the processed bytes. Distinguish a trusted existing storage URL from a new local URI; reject persistent `blob:`/`data:` fields.

**Acceptance.** Web and Android image flows submit the image to the anonymizer and store processed media readable from another browser/device. An anonymizer outage must prevent new original-photo publication, and review uploads must support the documented platforms.

### AUD-17 — derive content type from processed output

**Evidence and trigger.** [Submission extension selection](src/services/spotSubmissionService.ts#L67) prioritizes the original asset filename; [content-type selection](src/services/spotSubmissionService.ts#L80) prioritizes the original MIME type. The anonymizer produces JPEG output. A selected PNG/HEIC photo can therefore upload JPEG bytes with the original extension/MIME. Owner gallery and review code already handle processed JPEG metadata more explicitly.

**Impact.** Inconsistent storage metadata, unreliable downstream decoding/caching, and validation failures for unsupported original types despite a valid processed JPEG.

**Remediation.** Make the processor return `{ uri/body, contentType, extension }`, and use that authoritative output metadata across all media services.

**Acceptance.** PNG, HEIC where supported, JPEG and WebP inputs produce an object whose magic bytes, extension and HTTP content type agree after processing.

### AUD-18 — compensating storage cleanup is ineffective under the declared policies

**Evidence and trigger.** The supplied SQL declares read/insert policies for `spot-images` and insert/admin-read policies for owner verification documents, but no matching delete policy for those buckets was found across the SQL scripts. [Review](src/services/reviewMediaService.ts#L80), [owner gallery](src/services/ownerGalleryService.ts#L147) and [verification-document](src/services/ownerVerificationDocumentService.ts#L76) uploads attempt removal on later failures. Several use `.catch`, which does not inspect a Supabase result containing `{ error }`. Submission upload has no complete compensation for earlier uploads when a later operation fails.

**Impact.** Orphaned public photos or private verification documents and storage growth after partial failures. Actual deployed storage policies could differ; inspect them before applying a policy change.

**Remediation.** Define safe owner-scoped deletion or a trusted cleanup job, check returned errors, and track upload ownership/attachment status. Avoid allowing anonymous broad deletion merely to support the anonymous owner-request flow. Apply a retention policy to unattached verification documents.

**Acceptance.** Inject failure after the second of several uploads and before database attachment. Unattached objects are removed or queued for bounded cleanup; one user cannot delete another user's attached media.

### AUD-19 — separate submission commitment from secondary publishing

**Evidence and trigger.** [createSubmission](src/services/spotSubmissionService.ts#L260) successfully inserts/selects a submission, then awaits [activityService.logActivity](src/services/spotSubmissionService.ts#L279) without isolating its failure. The subsequent local-update publishing is caught, but this earlier side effect is not. The queue consequently treats an activity failure as a failed submission despite the durable row.

**Impact.** Users can retry an already-created submission and produce duplicates, while earlier media objects also remain. The queue's local status record does not supply a server-side idempotency key.

**Remediation.** Commit the submission through an idempotent operation and return its stable ID. Use a transactional outbox/trigger or separately retryable secondary work for activity/feed publication. Report the committed submission accurately even if those secondary steps are delayed.

**Acceptance.** Force activity insertion to fail after submission creation, then retry. Exactly one submission and one intended media set exist, with eventual secondary publishing and accurate user status.

### AUD-20 — make demo and offline states explicit

**Evidence and trigger.** [spotService](src/services/spotService.ts#L61) returns sample spots for an empty live result and injects a local test club even into nonempty live results. Detail lookup can fall back to a sample entry missing from the database. [Explore](app/index.tsx#L60) synthesizes a rating when none exists. Admin fallback logic in [adminDashboardService](src/services/adminDashboardService.ts) substitutes sample reservations/reports and merges live RPC data over sample defaults. Local-update/error paths similarly hide missing backend data, and [the review screen](app/spot/[id].tsx#L509) labels component-state-only feedback as saved locally while explaining it lasts only for the session.

**Impact.** Empty data or backend failures can look like real listings, bookings, metrics or successful submissions. Users may attempt to reserve a nonexistent test listing or trust an invented rating. A session-only review disappears on reload.

**Remediation.** Introduce an explicit demo fixture provider. In live mode, distinguish loading, empty, failed, stale cached and pending-local states; never manufacture financial/admin records or ratings. Persist offline work if the UI promises it is saved, and expose its sync state.

**Acceptance.** Empty live tables remain visibly empty; authorization/network failures show actionable error states; test listings and invented ratings never appear in live mode; any offline draft survives restart and is clearly unsubmitted.

### AUD-21 — saved spots need account scope and ID-based retrieval

**Evidence and trigger.** [savedSpotService](src/services/savedSpotService.ts#L3) uses one AsyncStorage key without a user ID. [The saved screen](app/saved.tsx#L25) loads only the latest 150 discovery spots and intersects them with saved IDs. A saved older spot disappears from this screen once it falls outside that unrelated window. Account switching retains the previous account's favorites on the device.

**Impact.** Incomplete bookmarks and account-boundary surprises. The current implementation is device-local; it is not cross-device saved-account storage.

**Remediation.** Scope local keys by account, define guest-to-account migration deliberately, and fetch saved records by their IDs in bounded batches. If account synchronization is intended, use a user/spot relation with own-row policies. Represent deleted/unavailable saved records explicitly.

**Acceptance.** Save a spot older than 150 newer entries and verify it remains visible. Switch between two users and a guest session with no unintended sharing; removal and reload remain consistent.

### AUD-22 — close the async subscription cleanup gap

**Evidence and trigger.** [Reservations](app/reservations.tsx#L59) and the initial [activity local-update effect](app/activity.tsx#L259) await a fetch before assigning a subscription cleanup callback. If the component unmounts while the fetch is pending, effect cleanup sees no callback; the continuation later creates a subscription that survives the screen. Some neighboring effects guard state updates but still need to guard subscription creation itself.

**Impact.** Extra realtime channels, unnecessary network work and stale callbacks after navigation or account changes. Broad realtime handlers that re-fetch whole lists amplify the cost.

**Remediation.** Use an effect generation/cancellation guard before every post-await state write and subscription creation; immediately dispose late-created resources. Centralize reusable account-scoped query/subscription ownership and reject out-of-order refresh results.

**Acceptance.** Delay the initial fetch, unmount or switch accounts, then resolve it. Active subscriptions return to baseline and no obsolete account state is applied; repeated navigation does not increase channel count.

## Scan 4 — architecture, deployment, performance, and quality

| ID | Priority | Finding | Evidence classification | Primary source |
| --- | --- | --- | --- | --- |
| AUD-23 | P1 | Loading the owner portal can erase a legitimate table inventory | Source-confirmed | `owner-portal-live.js:41` |
| AUD-24 | P1 | Database setup is not a reproducible ordered migration chain | Source-confirmed | `supabase/migrations/`; root SQL; `README.md` |
| AUD-25 | P2 | Owner portal lacks a reproducible source build and shared environment/domain configuration | Source-confirmed / improvement | `public/owner-portal/`; `package.json` |
| AUD-26 | P2 | Discovery and dashboard reads trade completeness for client-side bulk work | Source-confirmed / improvement | `spotService.ts`; `adminDashboardService.ts:909` |
| AUD-27 | P2 | Current checks do not validate the highest-risk database and platform boundaries | Execution-confirmed / improvement | `tests/`; `tsconfig.json`; `package.json` |
| AUD-28 | P3 | Development commands and dependency patching are platform/version fragile | Source-confirmed | `package.json`; `scripts/fix-expo-ngrok-timeout.cjs` |
| AUD-29 | P2 | A failed optional app update can trap the user in a modal | Source-confirmed | `src/components/AppUpdatePrompt.tsx:80` |
| AUD-30 | P2 | Public email-status RPC enables account/request enumeration | Source-confirmed | `supabase-schema.sql:1092` |
| AUD-31 | P2 | Large screens and loosely typed service boundaries impede safe changes | Improvement grounded in source structure | `app/admin.tsx`; `app/owner-dashboard.tsx`; services/types |

### AUD-23 — remove destructive repair from ordinary portal loading

**Evidence and trigger.** [loadAssignedSpotProfile](public/owner-portal/owner-portal-live.js#L41) classifies any non-test venue with exactly 62 tables in each of three slots as an inherited club template. It then writes an empty inventory to the database and removes local table storage. It does not verify table IDs, provenance, or an explicit migration marker.

**Impact.** Opening the portal can silently erase a legitimate venue's inventory if its counts match that heuristic. This is a persisted update, not merely filtering demo data from the view.

**Remediation.** Remove automatic cleanup from the read path. If a historical repair is needed, implement an explicit, backed-up, narrowly targeted migration keyed by known affected records and exact prior values.

**Acceptance.** Loading a real venue with 62 tables in each slot causes zero inventory writes and retains all tables. Any repair dry run lists the exact affected records and can be reversed from a snapshot.

### AUD-24 — establish one authoritative migration history

**Evidence.** [The migrations directory](supabase/migrations) contains only attendance and admin-identity cutover migrations; they depend on pre-existing tables/functions. [README setup](README.md) says to run `supabase-schema.sql`, while gamification, admin features, dedicated owner finalization and other changes live in separate manual scripts. Functions are repeated with divergent behavior: for example, [reservation-locking SQL](supabase-reservation-locking.sql#L32) defines a stable read-only availability function, while [the base schema](supabase-schema.sql#L1353) also expires stale unpaid reservations. Applying the older script later changes behavior again.

**Impact.** Fresh environments are incomplete and existing environments can drift with script order. Static tests against one SQL file cannot tell which definition is active in production, including authorization guards and grants.

**Remediation.** Build a reviewed baseline plus ordered forward migrations, mark legacy repair scripts as historical/manual, and make seeding separate from schema changes. Record deployed migration versions and produce a schema/privilege diff before rollout. Avoid blindly rerunning all historical scripts against production.

**Acceptance.** A new disposable database can be built from the documented command chain alone, all application RPCs exist, migration upgrades from the current supported baseline succeed, and schema/function/policy output matches the expected snapshot.

### AUD-25 — make the owner portal maintainable and environment-aware

**Evidence.** [owner-portal-live.js](public/owner-portal/owner-portal-live.js#L1) pins a specific Supabase project and imports its SDK from a CDN. The page loads compiled assets, while no corresponding editable portal project/build command is present. Its integration layer modifies DOM content, observes mutations, and duplicates reservation/table/profile behavior implemented in Expo services. Main-app environment changes do not automatically repoint this portal. The anonymous key is public configuration, not a private secret.

**Impact.** Staging can accidentally operate against the wrong database; compiled UI changes can break selector-based integration; booking fixes can diverge across clients. The portal auth callback also awaits further session work and removes channels without recreating them in that callback, which warrants a focused login/refresh/realtime regression test before relying on it.

**Remediation.** Recover the portal source and a reproducible build, or consolidate it with the maintained owner UI. Inject environment configuration at build/runtime through a documented mechanism. Share domain operations and move authorization/state transitions into server-side APIs; replace DOM patching with component integration.

**Acceptance.** A clean checkout builds the portal from source; staging and production select the intended projects; owner login, token refresh, account changes and realtime updates pass browser tests; the same booking rules apply in both clients.

### AUD-26 — paginate the actual query, not an arbitrary precursor

**Evidence.** [Discovery](src/services/spotService.ts) fetches a capped, recency-ordered list, after which Explore applies local proximity/category/search operations. A nearby older venue can therefore be absent even though it matches the user's query. [Admin loading](src/services/adminDashboardService.ts#L909) pages through all profiles on each full load, while fallback spot/reservation reads stop at 1,000 and compute metrics from the truncated arrays. The normal admin RPC aggregates in SQL, so the truncated-metric issue specifically concerns the fallback path; profiles still have the full-fetch cost.

**Impact.** Incomplete search/saved results and misleading fallback totals at scale; growing response size and repeated work on dashboard refreshes. Large list rendering and full-list realtime refreshes should be measured rather than optimized speculatively.

**Remediation.** Apply geographic/search filters server-side with suitable indexes, stable cursor pagination and deterministic ordering. Fetch admin users by page/search, keep global counts/financial aggregates on the server, and return an explicit unavailable metric if fallback data is incomplete. Coalesce realtime invalidations and select only required columns.

**Acceptance.** Seed more than 500 discovery spots and 1,000 bookings, including older nearby matches. Query completeness and aggregate totals remain correct; profile payloads stay bounded by page size. Establish measured latency/payload budgets before and after changes.

### AUD-27 — strengthen checks at the actual trust boundaries

**Evidence.** TypeScript passes, but [tsconfig.json](tsconfig.json) includes only `app` and `src` TS/TSX; it does not typecheck Deno edge functions, portal JavaScript or Python. `lint` is another `tsc --noEmit` alias. Many backend tests assert SQL/source strings rather than executing RLS or transactions. The payment harness executes handler code and is useful, but its mocked database does not enforce PostgreSQL policies, constraints, locks or transaction isolation.

The backend run had one stale recovery-link assertion after the app moved toward code-based recovery. The full map run had two timing-sensitive failures; both passed twice when rerun alone. See the exact results below. No CI workflow was found in the tracked tree.

**Remediation.** Preserve useful unit/browser tests while adding disposable-database role tests for AUD-01–06/11, payment concurrency/event-order tests, browser upload tests, and Python input/cleanup/capacity tests. Add separate checks for edge/portal/Python code. Update recovery tests to the intended OTP flow and make animation assertions tolerant of scheduler timing and map pixel rounding.

**Acceptance.** CI provisions a disposable schema, exercises anonymous/user/owner/admin permissions and concurrent booking/payment behavior, and runs platform-appropriate checks. Do not make tests green merely by dropping the behavior being tested. Live-write scripts must remain clearly distinguished from isolated tests.

### AUD-28 — reduce development command and patch fragility

**Evidence.** [Package scripts](package.json) use Windows `set NAME=value&&` syntax even for commands such as `ios`. They repeatedly disable Expo dependency validation. [The ngrok helper](scripts/fix-expo-ngrok-timeout.cjs) rewrites exact strings inside installed Expo CLI files and can warn/skip if upstream structure changes.

**Impact.** Commands are not portable as documented, and package updates can silently invalidate local patches. Skipping validation for offline startup is understandable, but needs a separate dependency-compatibility check in release validation. No CVE or unsafe dependency version is asserted by this audit.

**Remediation.** Use a portable script wrapper/environment mechanism, document supported development hosts, and replace mutation of vendor files with supported configuration or a version-pinned, verified patch. Run dependency validation in the release workflow where connectivity is available.

**Acceptance.** Supported Windows and POSIX commands behave consistently, a changed patch target fails clearly when the patch is required, and clean-install/release checks establish dependency compatibility independently of offline startup.

### AUD-29 — allow recovery from update-download failure

**Evidence and trigger.** [AppUpdatePrompt](src/components/AppUpdatePrompt.tsx) shows its modal for available/updating/failed states, provides only Update, and makes `onRequestClose` a no-op. If an update is discovered and connectivity then fails, the user can neither dismiss the failure nor return to the functioning installed application.

**Impact.** A transient download problem blocks normal use even though no explicit mandatory minimum-version policy is implemented.

**Remediation.** Allow Later/Close when not actively applying an update, retain a retry path, and distinguish optional updates from a deliberate supported-version gate. If updates must be mandatory, provide an explicit recoverable offline/error policy.

**Acceptance.** Discover an update, disable network, attempt download, and verify the user can recover and use the supported installed version without restarting or repeatedly hitting the failed download.

### AUD-30 — reduce public account enumeration

**Evidence and trigger.** [get_owner_business_email_status](supabase-schema.sql#L1092), repeated in owner-account scripts, is explicitly executable by anonymous and authenticated callers. It checks `auth.users`, profiles and pending requests and distinguishes registered/pending/available for any supplied email.

**Impact.** A caller can test whether a person has an account or a pending business application. This is a privacy tradeoff in the current availability UX, not an authentication bypass.

**Remediation.** Return a generic public response, keep precise reasons in an authorized workflow, or require evidence of email control before revealing account/request state. Apply abuse controls to the public submission/checking path and document the intended disclosure policy.

**Acceptance.** Unauthenticated callers cannot reliably distinguish an existing account from an unregistered address or a pending owner request through the endpoint response; legitimate applicants still receive a usable verification path.

### AUD-31 — extract domain boundaries before adding more screen logic

**Evidence.** [Admin](app/admin.tsx), [owner dashboard](app/owner-dashboard.tsx), [spot detail](app/spot/[id].tsx), and [reservation](app/reservation/[id].tsx) combine substantial data loading, state transitions, derived metrics, dialogs, rendering and styles. Services normalize many `any` database responses and support legacy schema fallbacks. Booking/payment rules are repeated across SQL, edge functions, Expo utilities and the standalone portal, with concrete divergence documented above.

**Impact.** A local change can leave another client or schema variant inconsistent; source-string tests and broad casts do not expose those contract mismatches. Splitting files alone would not repair authorization.

**Remediation.** After fixing server invariants, define typed domain operations and generated database contracts, isolate query/subscription hooks, and extract screen sections by responsibility. Keep route components focused on orchestration/presentation. Retire legacy fallbacks only after migrations establish a supported schema baseline.

**Acceptance.** A booking-state rule is enforced in one authoritative server operation, clients consume its typed result, and changing it requires no duplicate portal/Expo transition logic. Screen-level extractions preserve behavior and have clear ownership of loading, cancellation and errors.

## Verification performed

| Check | Result | Interpretation / limit |
| --- | --- | --- |
| `npm.cmd run typecheck` | Passed; exit 0 | App/shared TypeScript scope only |
| TypeScript parser sweep over inventoried TS/TSX/JS/CJS/MJS | No parse diagnostics | Syntax check; not edge/portal typechecking or behavioral verification |
| `node --test tests/backend/*.test.cjs` | 78 tests: 77 passed, 1 failed | Failure: `admin login offers password visibility and recovery controls`, at `tests/backend/admin-dashboard.test.cjs:39`; expects `createURL('/reset-password')` |
| Recovery failure cross-check | Stale assertion identified | Recovery documentation describes code-based recovery; this failure alone does not prove password recovery is broken. Align remaining reset-link copy and test with the intended flow |
| `npm.cmd run test:map` | Generated bundle check passed; 11 browser tests: 9 passed, 2 failed | Drag momentum and selection-intermediate-position assertions failed in the full run |
| Targeted map rerun, two repetitions | 4 of 4 passed | `npx.cmd playwright test --config playwright.map.config.cjs --grep "drag loads\|selection travels" --workers=1 --repeat-each=2`; evidence of timing sensitivity, not a clean full-suite rerun |
| Five additional isolated payment probes | 5 of 5 reproduced the described current behaviors | Price/redirect handling, duplicate checkout creation, checked-in regression, partial-write inconsistency, late payment after cancellation |
| Git artifact inventory | 264 browser-profile files; 404 scratch files tracked | Inspected filenames/provenance, not private database contents |
| Final report integrity check | 31 table findings match 31 deep dives; all 62 local links resolve and line references are in range | The embedded payment recipe was extracted from this document and executed successfully; source claims were also cross-checked against existing guards and alternative implementations |
| Database execution / migration replay | Not run | PostgreSQL/Supabase database execution was not available in the local review environment; SQL exploitability must be verified against a disposable schema and deployed grants |
| Python service integration / capacity | Not run | No verified Python/model runtime was exercised; conclusions are static, not face-detection accuracy or load-test results |
| Android device / external payment / owner invitation | Not run | No live charges, account provisioning, email delivery, native notification delivery or live database mutations were performed |
| Dependency vulnerability / full visual accessibility audit | Not performed | No claim of CVE clearance, complete accessibility coverage, or production readiness |

### Repeatable offline payment probes

Run this JavaScript from the repository root using Node (for example, save it to a temporary `.cjs` file in the root). It uses the existing harness and makes no provider/network requests. The assertions intentionally confirm the **current defects**; after remediation they should be replaced with assertions of the desired behavior. These mocks cannot prove SQL/RLS behavior.

```js
const assert = require('node:assert/strict');
const { fixture, pendingPayment } = require('./tests/backend/payment-harness.cjs');

async function probe() {
  const price = fixture({ reservation: { reservation_fee: 1, fee: 1 } });
  await price.invoke('paymongo-create-gcash-checkout', {
    reservationId: 'reservation-test',
    successUrl: 'https://app.example.test/confirmed/reservation-test',
  });
  const attrs = price.calls[0].payload.data.attributes;
  assert.equal(attrs.line_items[0].amount, 100);
  assert.match(attrs.success_url, /^cebspot:/);

  const attendance = fixture({
    reservation: { status: 'checked_in', payment_status: 'paid' },
    payments: [{ ...pendingPayment, status: 'paid' }],
  });
  await attendance.webhook(attendance.event());
  assert.equal(attendance.db.reservations[0].status, 'confirmed');

  const race = fixture();
  const responses = await Promise.all([1, 2].map(() =>
    race.invoke('paymongo-create-gcash-checkout', { reservationId: 'reservation-test' })
  ));
  assert.deepEqual(responses.map(r => r.status), [200, 200]);
  assert.equal(race.db.reservation_payments.length, 2);

  const partial = fixture({ payments: [pendingPayment], failWrite: 'reservations' });
  assert.equal((await partial.webhook(partial.event())).status, 400);
  assert.equal(partial.db.reservation_payments[0].status, 'paid');
  assert.equal(partial.db.reservations[0].payment_status, 'pending');

  const late = fixture({
    reservation: { status: 'cancelled', payment_status: 'failed' },
    payments: [pendingPayment],
  });
  await late.webhook(late.event());
  assert.equal(late.db.reservation_payments[0].status, 'paid');
  assert.equal(late.db.reservations[0].payment_status, 'failed');
  console.log('Five audit probe scenarios reproduced.');
}
probe().catch(error => { console.error(error); process.exitCode = 1; });
```

## Final review of the audit

The report was checked against policy/function definitions and caller behavior, existing mitigations, test output, and the isolated probes. Findings are actionable source-level issues or labeled improvements; production exposure and unexecuted integration checks remain explicitly qualified.

| Potential mismatch / overstatement checked | Final disposition |
| --- | --- |
| "There is no protection against double booking" | Rejected. A partial unique index protects identical non-null active table tuples; AUD-01/13/14 describe validation and UX gaps around it |
| "Both PayMongo methods trust the reservation fee identically" | Rejected. GCash trusts the positive stored fee; QRPh reads spot configuration |
| "Every webhook ordering fails" | Rejected. Existing guards protect some sequential transitions. AUD-10 identifies the uncovered checked-in, partial-write, concurrent and late-payment cases |
| "A cancelled reservation should be reopened when paid" | Rejected. Cancellation should remain closed; incoming money needs explicit accounting/reconciliation |
| "Users can directly edit their XP" | Not asserted. Gamification protection and award deduplication exist; AUD-05 concerns forged reviewed input reaching reward triggers |
| "An approved owner-request insert grants owner access" | Rejected. Provisioning/finalization remains a separate operation |
| "Supabase anonymous keys are leaked private credentials" | Rejected. AUD-08 concerns tracked browser containers; AUD-25 concerns fixed environment configuration |
| "The map is broken because two tests failed" | Rejected. Both failed cases passed twice in a targeted rerun; full-suite stability still needs attention |
| "Password recovery is broken because the backend test failed" | Rejected. The assertion expects an older reset-link pattern; code-based flow must be tested directly |
| "A mocked handler test verifies RLS or live provider behavior" | Rejected. Database and external integration verification remain separate acceptance tasks |
| "The checked-in SQL is certainly deployed as written" | Not assumed. Migration/grant drift is an explicit risk and rollout prerequisite |
| "EAS currently uploads the browser profile" | Not asserted. EAS exclusions are present; Git tracking is the confirmed issue |
| "All dependencies, generated artifacts and binaries were exhaustively audited" | Not claimed. Scope and exclusions are stated above |

### Suggested remediation order

| Stage | Work | Completion gate |
| --- | --- | --- |
| 1. Establish the deployed baseline | AUD-24, inspect effective policies/grants, preserve database snapshots; triage AUD-08 artifact exposure | Disposable schema reproduces deployed behavior and privilege tests can run safely |
| 2. Close authorization/privacy gaps | AUD-01–06, AUD-16, AUD-30; remove AUD-23 automatic destructive update | Negative role/API tests pass; new browser images cannot bypass processing |
| 3. Repair booking/payment contracts | AUD-09–15 with shared server state transitions | Concurrency, duplicate delivery, late payment and terminal-state tests pass; hosted web checkout works |
| 4. Stabilize persistence and operations | AUD-07, AUD-17–22, AUD-29 | Bounded work/cleanup, accurate commit/error behavior, account isolation and lifecycle tests pass |
| 5. Improve maintainability and scale | AUD-25–28, AUD-31 | Reproducible builds, bounded server queries, platform checks and shared typed domain contracts |

Each table finding has a matching deep dive, concrete evidence, a proposed fix, and a verification gate. No remediation is marked complete merely because this audit is complete.
