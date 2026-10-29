# LA-01 focused upgrade packet — October 29, 2026

**Prepared and tested locally; not applied to a hosted database.** The reviewed newer audit returned five private reservation-event types for anonymous access and five for a signed-in unrelated user, capped at five in each probe. This is an observed hosted privacy failure, not just missing acceptance evidence. The audit selected types only and retained no private message text or user IDs. Its probe code and sanitized results were inspected; this work did not repeat those hosted operations or use live provider credentials.

The existing shared backend contains real/mixed data. The user's explicit no-production-deployment boundary applies to a policy change there. This packet makes the candidate reviewable; it is not authorization to execute it. General user testing remains **NO-GO** while the exposure is present.

## Candidate and scope

Use the existing authoritative timestamped migration [20261013000100_activity_privacy.sql](../supabase/migrations/20261013000100_activity_privacy.sql), unchanged:

`53d9513b16551b6b03772b2f7c1fa93a9b2dece93a2532874f1b0bb7f4e96cf5`

It adds the whitelist/recipient/authoritative-owner/admin predicate, installs a restrictive SELECT guard alongside the permissive policy, prevents client rewriting/deleting events, validates customer-generated events, and protects profile identity/role. It is transactional and requests PostgREST schema reload. It contains no booking/payment schema overhaul, business-row deletion, payment action, venue flag update, or inventory seed. No new or duplicate schema history was introduced for this packet.

Do not extract a second hand-maintained SQL copy, run archived root SQL, replay foundation migrations over existing data, or use a UI filter as the privacy fix. Unknown/future event types remain private. Old reservation events without an authoritative reservation target remain limited to their recipient/admin; do not widen owner access using only a venue ID.

## What was tested

[activity-legacy-upgrade.test.cjs](../tests/remediation/activity-legacy-upgrade.test.cjs) creates a new loopback PostgreSQL fixture through the older authorization migration, adds the independent Circle/post/identity prerequisites, and intentionally models the observed missing-effective-guard failure with a permissive overlap. This is a representative compatibility fixture, **not a copy or proof of the hosted catalog**. No existing database is reset.

The six new checks establish:

1. Anonymous and unrelated users can read private synthetic events before the candidate, with the ineffective-guard fixture made explicit.
2. The existing privacy migration applies alone without modern availability/walk-in/deadline/idempotency/financial-resolution prerequisites. Booking/payment columns, all activity rows, the reservation row, and the complete synthetic paid-ledger row—including amount, currency, provider IDs and original paid-at—remain unchanged.
3. Anonymous/customer B/unrelated owner see only public discovery; customer A and admin retain intended private access; assigned and granted secondary owners see only authoritative reservation events.
4. A caller cannot forge a payment event, republish an event or elevate profile identity. Ordinary permitted profile-name editing still works.
5. Reapplying the same candidate is idempotent for the tested data/schema and retains the existing active-account prerequisite.
6. The catalog preflight runs read-only, checks actual types and collects no business rows.

Combined with the original privacy and complete migration/fresh-upgrade checks, `resume-2026-10-29-privacy-ledger-preservation` passes **22/22**, with no skips. Initial retained attempts exposed two fixture mistakes: the first fixture still had an effective older restrictive guard, and a subsequent fixture DROP POLICY omitted its table. Both were corrected in test setup; neither is claimed as a product defect. The earlier reports remain retained.

The complete suite, including these six new checks, was rerun with two workers: `resume-2026-10-29-post-privacy-full-tests` passes **397 tests, zero failures, five optional legacy skips (402 total)**. No application TypeScript/native/map/payment-handler implementation changed in this follow-up; the prior exports and checks remain evidence for the same application source, rather than an invented new APK build.

The [packet manifest](../tests/remediation/evidence/activity-focused-upgrade-2026-10-29.json) hashes the candidate, preflight and regression source. Actual Supabase/PostgreSQL-17, Auth/JWT, PostgREST, positive/negative hosted-role tests and live catalog compatibility remain unverified.

## Catalog preflight — read-only, still not run remotely

[activity-privacy-preflight.sql](../supabase/verification/activity-privacy-preflight.sql) uses a read-only transaction and rollback. It reports the connection/database version, 21 required column/type checks, relevant function presence/security settings, RLS flags, all activity/identity/ownership-related policies and grants, and relevant triggers. It does not select customer records, function bodies, passwords, tokens or provider secrets. Policy expressions can contain account identifiers; keep the output in a private local review location, outside Git/chat.

An authorized operator must first independently confirm the intended project/connection. Run this preflight privately on the target, then inspect the result. Any absent/different prerequisite, custom guard/policy, altered admin authority function, differing activity target semantics, view exposure or unexpected role/grant is a reason to stop and adapt/retest against that actual catalog. Do not create guessed replacement columns/tables or overwrite an existing stronger identity/account-deletion guard.

The preflight is metadata evidence, not authorization acceptance. A catalog export without personal data can be rehearsed on a new isolated schema-only fixture; preserve custom definitions and compare its catalog before/after. Review the admin identity helper privately without printing sensitive definitions to command logs. Confirm JWT requests use public/anon and normal user credentials rather than a service-role bypass.

## Explicit apply boundary and validation

No apply command was executed or scheduled. After actual catalog review, isolated rehearsal and a separately authorized hosted operation:

1. Record the reviewed target identity, exact candidate checksum, approval, schema backup and policy/function snapshot privately. Confirm no incompatible schema deploy is concurrent.
2. Apply only the reviewed existing privacy migration in its transaction. Do not run a blanket `db push`, reset, migration-history repair or all-foundation replay against this mixed-data project. Record the exact focused application; do not fabricate records asserting unapplied migrations ran. Full history alignment remains a separate reviewed operation.
3. Re-read the effective policies and grants; confirm the restrictive predicate applies to anonymous and authenticated reads despite any permissive overlaps. Preserve stronger existing guards. Verify normal admin and owner operations.
4. On isolated staging with synthetic events, use real JWT/API requests for anonymous, customers A/B, assigned/unrelated owner and admin. Include direct table queries and API paths used by the app. Negative tests must return zero private events; positive tests must retain recipient/authorized-staff access. Test unknown event types, forged targets, forged privileged events, profile escalation and UPDATE/DELETE denial. Client filtering does not count.
5. After the separately approved hosted change, repeat a minimal type-only anonymous check and agreed scoped unrelated-user check without collecting message bodies or creating real bookings/payments. Record effective role, timestamps and status/counts. Recheck existing recipient/authorized-staff access through an approved controlled fixture. A server reload/build success alone is not closure.
6. Mark LA-01 closed only when applicable direct-API acceptance passes. Keep booking/payment/upload/deletion and general UAT gates open until their independently missing contracts pass.

If a check fails, keep the affected experience unavailable and repair forward under the approved operation. Do not restore permissive reads or remove the restrictive guard as a rollback. UI hiding does not contain a direct API leak. Existing-data restoration, credential actions and production rollback need separate authorization.

## Other external failures remain separate

Reviewed hosted observations also show missing modern availability/walk-in contracts, inventory verification/deadline/payment-resolution columns, and payment-maintenance/private-upload/deletion functions. The configured provider is live. None is resolved by this privacy candidate, and the live configuration must not be used for the goal's payment testing.

Provide an identified isolated Supabase staging target, deploy the matching full history/functions and PayMongo test-only configuration there, verify real inventory for the sole client, configure/test email delivery, and run real Storage, Linux face-service and Android-device acceptance. See the [complete release handoff](android-release-candidate-2026-10-29.md) for the checklist and rollback. No percentage or general-launch acceptance is inferred from local tests.
