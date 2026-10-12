# Account deletion verification

Self-service deletion is implemented locally. No hosted account was deleted. Local tests execute native PostgreSQL migrations and actual Edge handler modules with synthetic Auth/Storage contracts. They are not evidence of deployed Supabase or Render acceptance.

## Sequence and configuration

Apply timestamped migrations in lexical order through `20261013000900_block_deleting_owner_assignments.sql` on a **new isolated staging project**. Migration 009 prevents assigning a new venue responsibility to a deleting account after its obligation check. Review existing-database history and backups before any existing database application. Deploy `delete-account`, the matching `private-upload` update and face service together. Set server-only `FACE_BLUR_API_URL` to that staging face service and matching random `ACCOUNT_DELETION_WORKER_TOKEN` of at least 32 characters in Edge secrets and the face-service environment. Never add it to `EXPO_PUBLIC_*` or an app bundle. Keep exactly one face-service worker/replica.

The customer authenticates again within ten minutes using password/OAuth/OTP/TOTP/magic link; token refresh/recovery alone does not authorize starting deletion. The endpoint obtains the target only from verified Auth. It checks active bookings, financial resolution/refunds, outstanding provider attempts/retirement and venue/admin assignments. The customer closes bookings, the payment maintenance worker completes reconciliation/retirement, and an administrator transfers venue assignments when those blockers apply. The endpoint does not charge, refund, cancel or transfer those obligations itself.

A server job freezes database access through restrictive RLS and guarded definer RPCs. It clears location sharing, removes circle membership, transfers group ownership and expires invites. Two minutes allow bounded in-flight uploads to finish. Each retry cancels the account's face jobs using server authentication; running processing must finish/terminate before cleanup proceeds. The function removes contact details, contribution rows and payment billing payloads; it retains de-identified financial amounts, dates, statuses and provider identifiers. Storage API removal precedes `auth.admin.deleteUser`. Each invocation removes at most 150 files; HTTP 202 means pending, HTTP 503 means retry retained progress, and HTTP 200 `deleted` means Auth deletion succeeded. The user can resume from Profile → Delete account after closing the app. Jobs cannot be cancelled after starting.

## Required staging/device acceptance

- Create disposable customers A/B, an assigned owner, unassigned owner and admin. Deny cross-account targets and all client access to cleanup RPCs. Require recent real authentication.
- Test active booking, pending refund, unknown provider outcome and assigned venue blockers. Finish obligations through authorized test workflows and retry. Never use a live provider key.
- Add posts, reviews, applications, personal uploads and a circle with another member. Delete A. Verify B's data/group survives, old invite fails, A's coordinates disappear, and no A-owned files/contributions or direct contact fields remain. Retain ledger counts, amounts, provider references and original `paid_at`.
- Use the old JWT directly against REST, RPC and Storage after the job starts and after Auth deletion. Deny private reads, joining circles and all mutations, including overlapping permissive policies. Also verify normal signup and empty invited-owner rollback.
- Interrupt before/after each Storage removal, before/after Auth success and during the final bookkeeping write. HTTP 200 must never precede Auth success. A `ready` job with missing Auth user indicates completed deletion with bookkeeping to reconcile; verify identity absence with a server Auth API read before marking complete.
- Race deletion with upload, joining a circle, booking and delayed webhook processing. Test actual Storage server timeouts and verify a timed-out request cannot write a late orphan after final cleanup. This distributed behavior is **unverified** by local contract fixtures. Keep deletion release-gated until the staging race passes.
- Verify Android password/OAuth reauthentication, keyboard/320 px scrolling, double taps, 202 retry, process death/relaunch, local draft removal and logout. Face detector tests use a blank synthetic image; human-face anonymization quality remains a device/manual gate.

## Retention and rollback

Provider references are pseudonymous ledger identifiers, not an assertion of irreversible anonymization across the payment processor. Publish the approved retention/privacy policy before user testing. Supabase documents that issued JWTs remain valid until expiry and owned Storage objects prevent Auth deletion: [User management](https://supabase.com/docs/guides/auth/managing-user-data); recent authentication uses documented [AMR claims](https://supabase.com/docs/guides/auth/jwt-fields).

Disable starting new deletion jobs if staging acceptance fails; retain the database guards, private buckets and ledger schema. Repair pending jobs forward. Erased data and completed Auth deletions cannot be undone by rolling back an app. Restoring an existing database/Storage backup is a separate destructive operational action requiring explicit approval. No rollback migration drops retained ledger rows.
