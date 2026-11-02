# Legacy test-payment reconciliation — November 2–3, 2026

## Verified hosted outcome — November 3

Both operator passes completed successfully. Six verified paid test sessions were
recorded, and four verified unpaid test sessions were explicitly expired at the
provider and then recorded as expired. Pending test payments decreased from ten
to zero. The database retains all 48 payment records and all 72 bookings. Aggregate
hashes verify that all 12 live-labelled payment records and their bookings are
unchanged, as are the shared account and identity guard definitions. No refund or
new checkout was requested.

The focused migration itself preserved every existing value in all 34 public
tables and 889 rows before the explicit financial operations. Its service-only
grant and its individual migration ledger entry were verified. A fresh encrypted
backup was taken and checked in memory before application.

Final local verification: **527 passed, 0 failed, 5 skipped (532 total)** in the
sequential full suite, and typecheck passed. The original parallel failure and
the successful unchanged payment-suite isolation run are retained below. No
existing test assertions were changed or disabled. Android/admin exports passed
in the earlier schema-alignment phase; this phase changes no client code and did
not publish an Android update.

Evidence under `tests/remediation/evidence/`:

- `legacy-payment-migration-application.json`,
  `legacy-payment-migration-preservation.json`, `legacy-payment-ledger.json`.
- `legacy-payment-operation-reconcile-terminal.json` and
  `legacy-payment-operation-retire-unused.json`, plus timestamped copies.
- `legacy-payment-before-operation.json`, `legacy-payment-after-operation.json`,
  `legacy-payment-result-verification.json`: counts, service grants and unchanged
  hashes for the live-labelled records and shared guards.
- `legacy-operator-auth-boundary.json`: unauthenticated POST rejected with 401;
  GET rejected with 405, without sending a financial payload.
- `commands/reservation-2026-11-02-full-legacy-serial.json`: final full run.

The six old paid bookings remain flagged for financial review; this is not
confirmation that those historical bookings were fulfilled. The latest venue
postcheck still shows unverified inventory and zero online-available tables.
The owner must save/confirm the intended inventory through Tables & Pricing.
The general checkout/webhook/maintenance release and Android acceptance remain
separate pending work.

The operator reported four paid sessions after matching the older payments.
The subsequent server-side PayMongo test API inspection verified **six paid
sessions and four open sessions** among the ten pending database records.
All ten matched their saved checkout ID, booking reference, metadata reservation
reference, original amount, PHP currency, and explicit test mode. No live-mode
provider request was made. These findings supersede the operator's initial count;
they do not imply that every historical payment in the project was audited.

## Read-only inspection

`payment-reconciliation-report` is an operator-only GET endpoint. It uses the
existing server worker token, rejects non-test provider keys, limits batches to
five lookups, disables redirects, and returns aggregate counts only. Unknown,
live-labelled, unsupported and durable requests are skipped rather than guessed.
The report never creates, expires or updates a checkout. `scopeHash` detects
database changes between pages. Provider errors remain cannot-verify results.

`scripts/inspect-legacy-test-payments.ps1` uses only the locally generated worker
token from its ignored DPAPI backup, decrypted in memory under the same Windows
account. It does not read `.env` or print/persist response bodies. Server-side
provider credentials remain in Supabase. No keys belong in script arguments.

Evidence: `tests/remediation/evidence/legacy-payment-provider-inspection.json`.

## Controlled correction

`20261102124004_legacy_test_payment_reconciliation.sql` adds only a service-role
RPC. Applying the migration does not rewrite payment records. It preserves all
existing identity guards and strict durable-payment RPCs. The exceptional legacy
path requires a saved session ID, matching original amount/references, an absent
durable request, and explicit test mode in both the saved record and authoritative
provider snapshot. A booking with live/unknown-mode sibling payments is rejected.
Anonymous, customer, owner, unrelated owner and administrator client roles cannot
call it. No guessed attempt metadata is added to a provider session.

The operator Edge function retrieves each known provider session itself before
calling that RPC. The caller cannot submit a paid status, amount, customer ID or
target payment. Two explicit actions are available:

- `reconcile-terminal`: record verified paid/expired outcomes; leave open sessions
  unchanged.
- `retire-unused`: verify an open test session, request expiry, then retrieve and
  verify it again. A paid outcome racing expiry is recorded as paid, never expired.
  An interrupted expiry response also requires a fresh lookup of the same session.

The SQL takes the venue/booking/payment locks in the same order as the existing
payment machinery. Its event journal and stable snapshot hash make delivery and
concurrent retries idempotent. Original amounts, checkout references, payloads,
creation dates and existing paid timestamps are preserved. An expiry cannot
downgrade a paid record. No new checkout or refund is requested.
Where the database never recorded `paid_at`, the RPC records the reconciliation
time, consistently with the existing payment RPC; it does not claim that this
is the provider's original transaction timestamp.

Historical paid bookings are flagged `financial_resolution='resolution_required'`
with `payment_status='refund_pending'` and `refund_status='pending_review'`; this
is a review state, not a refund instruction or a claim that real money moved.
Pending historical bookings are cancelled rather than reopening table capacity.
Unpaid provider expiry changes the payment attempt only. An operator must review
the six historical test booking outcomes; they are not current fulfilled bookings.

## Execution and verification

Default execution is read-only:

```powershell
./scripts/reconcile-legacy-test-payments.ps1
```

The write modes require an explicit switch, a passing final local suite, a
verified encrypted backup, the fixed authorized project and the operator token:

```powershell
./scripts/reconcile-legacy-test-payments.ps1 -Apply
./scripts/reconcile-legacy-test-payments.ps1 -Apply -RetireUnused
```

Deploy the operator function only after its focused migration and service-only
grant postcheck pass. Do not run it with live keys. Keep all pagination IDs and
raw responses in memory; committed evidence contains aggregate counts only.

Before and after operations, run
`supabase/verification/legacy-payment-reconciliation-postcheck.sql`. Compare
live-labelled payment/booking hashes, payment/booking counts and shared guard
hashes; those must remain unchanged. Only the verified test attempts, related
test bookings and new audit events may change. Record only the new migration's
ledger version after application; never repair the old ledger by assumption.

The local tests use synthetic PostgreSQL records and mocked provider/Auth
adapters. They cover six-role denial, preserved records/guards, both migration
chains, concurrent delivery, duplicate/stale events, malformed references and
amounts, mixed modes, expiry/payment races, ambiguous expiry and provider failure.
They do not establish customer Android acceptance or historical live obligations.
The generated migration manifest extends from 27 to 28 entries; existing test
assertions and historical migrations are unchanged.

The first expanded full run returned 505 passed, 22 failed, 5 skipped. All 22
failures shared one PostgreSQL startup hook failure: Windows error 1455 while
allocating shared memory. The tests never reached their assertions. The same
unchanged payment-handler suite then passed all 22 tests in isolation. Windows
commit memory was nearly exhausted, with the OneDrive sync process accounting
for about 11.6 GB. The full retry runs every original/new test sequentially and
keeps the failed parallel evidence; no test is skipped or weakened. Typecheck
passed separately. Financial operations remain gated on the full retry result.

## Remaining payment release boundary

The existing financial handlers have not been replaced by these operator tools.
Keep the old webhook path available for historical live-mode obligations until
its compatibility has been reviewed. Clearing the ten pending test sessions does
not authorize a live charge, refund, or silent replacement of that path.

New checkout admission must be controlled during the eventual cutover: the older
handler can otherwise create another legacy session after this inspection.
Recheck all pending attempts immediately before switching. Release the matching
test checkout/check/webhook/maintenance handlers, verify test webhook registration
and schedules, then run designated customer/owner Android acceptance.

If a correction fails, inspect its aggregate evidence, re-read the same provider
session and retry safely. Do not undo a verified paid result, restore an entire
backup over newer writes, delete audit history, or mark a refund as completed.

Provider references: [checkout expiry](https://docs.paymongo.com/reference/expire-a-checkout-session),
[Supabase function configuration](https://supabase.com/docs/guides/functions/function-configuration).
