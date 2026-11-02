# Reservation follow-up — November 2, 2026

November 3 update: the ten pending legacy test sessions were reconciled: six paid
records were verified and four unused test sessions were expired and verified.
The 12 live-labelled historical records and their bookings are unchanged. See
[legacy-test-payment-reconciliation.md](legacy-test-payment-reconciliation.md)
for the 527/0/5 full-suite result and hosted evidence. Original checkpoint results
below describe the state before that reconciliation.

The owner selected **test payments only**. This follow-up preserves the existing
payment provider settings and legacy financial records. It does not certify a
completed customer checkout or publish an Android update.

## Verified hosted status

The second focused migration applied at **12:03 UTC on November 2**. The
before/after fingerprints match for all 31 existing public tables and 889 rows.
Both original shared account/identity guard definitions are byte-for-byte
unchanged. Postchecks verified dependency tables, RLS, service-only RPCs,
blocked client writes, and a private proof bucket. Both focused migrations are
recorded in the ledger; historical migration entries were not changed.

`private-upload` version 1 and `payment-readiness` version 1 are ACTIVE.
The upload endpoint returned 200 to OPTIONS and 401 to an unauthenticated POST
with no file/body. No real document was uploaded or deleted. The first Node
HTTP check failed at transport; the Windows HTTP client passed with normal TLS
verification. Deployment metadata now lists checkout version 15 and webhook
version 20; version numbers alone do not prove new source. The downloaded
checkout entrypoint is byte-for-byte identical to its earlier version 14 source.
No financial handler source was deployed by this follow-up.

The latest booking postcheck still reports 62 configured tables, 0 online
available, and no recorded inventory verification. The user confirmed that
**62 tables and PHP 1 are intentional**. The supported confirmation RPC requires
an assigned owner/admin session and records that account. Use **Owner dashboard
→ Tables & Pricing → Save**; this work does not impersonate that account or
write a fabricated verification timestamp. Paid-flow acceptance remains pending
even after inventory is confirmed.

## Changes and boundaries

- The main booking alignment migration was applied and verified separately;
  see [reservation-schema-upgrade.md](reservation-schema-upgrade.md).
- `20261102070521_reservation_private_upload_dependencies.sql` adds the missing
  proof-admission, draft and account-state dependencies, with RLS and service-only
  write RPCs. Its generator extracts the reviewed historical implementations and
  preserves already-installed account and upload functions. It does not execute
  account erasure or implement the entire owner-application workflow.
- `get_payment_recovery_batch(integer)` separates recent recoverable requests
  from legacy requests needing manual reconciliation. The maintenance worker
  still reports that manual backlog as a failure requiring attention. Paid records
  and expired legacy records with no durable request are not retried. The worker
  source change is local until the coordinated payment release below.
- A separate `payment-readiness` function returns configuration booleans only.
  It does not query records, contact PayMongo, or replace the existing webhook.
  Its hosted GET verified test-mode key shape, test webhook configuration, both
  worker settings, and the HTTPS return bridge. This does not prove the provider
  will accept the key or that the webhook is registered correctly.
- Only missing `PAYMENT_WORKER_TOKEN`, `PRIVATE_UPLOAD_WORKER_TOKEN`, and
  `CHECKOUT_RETURN_BASE_URL` settings were installed. Existing values and provider
  keys were not changed. Generated worker values are encrypted with Windows
  DPAPI CurrentUser under ignored `.private/`; temporary plaintext was removed.
  The existing `/payment-return.html` was checked for its actual app-return
  bridge content, as well as HTTP success.

## Why payment-handler replacement is not yet accepted

The read-only review found 48 payment records: 10 pending test-mode records,
7 paid records (3 test, 4 marked live), and 31 expired records (23 test, 8 marked
live). These are database classifications, not provider-side confirmations.
The migration preserved original financial columns. An expired database status
alone does not prove a provider checkout can no longer accept payment.

The deployed QR Ph checkout still uses the older direct-write flow. Blindly
replacing the existing webhook with the test-only implementation risks losing
late events for historical live-mode records. No old handler was replaced, no
legacy financial status was rewritten, and no provider checkout was invoked.
The configured fee is PHP 1; PHP 150 in the old function is a fallback, not proof
that the configured fee was charged incorrectly.

## Validation and evidence

Local write tests use synthetic accounts in disposable PostgreSQL databases.
The older public schema was captured read-only and reconstructed locally;
Auth and Storage platform fixtures are synthetic, not a replica of the hosted
platform. The dependency upgrade is tested against that schema plus the first
upgrade, and against the full migration chain. Tests cover reruns, preservation,
six-role denials, ownership, quota, account-state lookup, and cleanup selection.

The recovery test verifies that six older pending attempts cannot starve a newer
request whose provider response was lost: retry uses the same key/body and
returns one provider session, while preserving all old rows and reporting the
manual backlog. Its initial synthetic fixture violated an existing unique index
by placing multiple pending attempts on one booking. Each fixture payment now
uses a distinct booking; no assertion was weakened. Both runs are retained.

The exact new hosted postcheck also runs locally. Its first run failed because
the public-only fixture omitted the Storage bucket. A synthetic existing bucket
was added before the migration, with the same private-bucket assertion retained.

Evidence lives under `tests/remediation/evidence/` and `commands/`:

- `reservation-upload-sources.json`: historical source hashes.
- `reservation-2026-11-02-uploads.json`: 45 passed, 0 failed.
- `reservation-2026-11-02-readiness-final.json`: 4 passed, 0 failed.
- `reservation-2026-11-02-recovery-final.json`: 34 passed, 0 failed.
- `reservation-2026-11-02-full-complete.json`: **485 passed, 0 failed, 5 skipped**
  (490 total), versus the original 391/0/5 baseline.
- `reservation-2026-11-02-upload-verification-final.json`: exact postcheck
  execution and all local assertions passed.
- `reservation-upload-application.json`, `reservation-upload-preservation.json`,
  `reservation-upload-hosted-after.json`, `reservation-upload-guard-preservation.json`,
  `reservation-booking-followup.json`, `reservation-followup-ledger.json`:
  hosted SQL application and read-only verification.
- `reservation-followup-functions.json`, `reservation-private-upload-endpoint.json`,
  `reservation-checkout-source-preserved.json`: deployed function metadata,
  unauthenticated boundary check, and old checkout source preservation.
- `reservation-worker-settings.json`, `reservation-payment-readiness.json`,
  `reservation-return-bridge.json`: hosted configuration checks, not payments.
- `reservation-backup-summary.json`: latest encrypted backup verification.
  The backup includes public rows/schema and Storage bucket/policy metadata,
  excludes Auth data and object bytes, and is not a full restore rehearsal.

Existing tests have not been loosened or disabled. The generated migration
manifest extends from 26 to 27 entries. Typecheck and Android/admin exports
passed during the main alignment work; no client code changed in this follow-up.

Advisors retain the pre-existing definer-view error, five mutable-search-path
warnings, and leaked-password-protection warning. The two additional authenticated
table-exposure warnings correspond to own-row reads of drafts and deletion state;
their RLS/write denial was checked separately. Anonymous exposure warning counts
did not increase. Performance advisories were also returned in the latest run;
this reservation follow-up is not a full security/performance remediation.

## Remaining release order

1. Completed: application of the two focused migrations and verification of their
   individual ledger entries. Never replay the foundation chain or repair the
   historical ledger by assuming every old migration ran.
2. Completed: proof-upload deployment after its dependency postchecks passed.
   Endpoint checks are not an authenticated upload acceptance test. Do not invoke
   cleanup against real documents as a health check.
3. Completed: reconciliation of the ten pending legacy provider sessions in test
   mode. Six paid test bookings remain flagged for review. Review the
   historical live-mode sessions separately with the payment operator; retain a
   verified late-event handling path until those obligations are resolved. Do
   not blindly expire, erase, mark paid, or recreate them.
4. Release the durable test-only checkout/check/webhook handlers together with
   payment-maintenance after that compatibility review. Validate test webhook
   registration and duplicate/late-event behavior with designated accounts.
5. Configure worker schedules and alerts using secret references, never literal
   tokens in committed commands. The preflight found Vault, but neither pg_cron
   nor pg_net. No schedule or worker invocation was installed in this follow-up.
   Alert on non-2xx, manual reconciliation backlog, stalled holds and cleanup
   failure; verify an accountable operator receives the alert.
6. The assigned owner must inspect actual tables/capacities and the intended
   fee, then save/confirm inventory in Tables & Pricing. The user confirmed the
   62-table count and PHP 1 fee, but the database still has no owner verification.
   Do not fabricate the timestamp
   or interpret those IDs as physical inventory.
7. On the matching Android client, run customer/owner acceptance: booking,
   same-table race, test payment success/retry/cancel, hold expiry, proof upload,
   approval, check-in, walk-in, and late payment resolution. Until those checks
   pass, paid booking is not accepted for users.

If a deployment fails, keep booking unavailable and make a tested forward fix.
Do not drop new tables, weaken RLS, replay foundation SQL, or restore an entire
backup over newer customer writes. No Android publication is part of this work.
