# Manual GCash proof review — November 3, 2026

The owner can reject submitted manual GCash evidence when the photo/reference
cannot be verified. Reject sits beside Accept on Overview, Reservations and
Payments, with a confirmation explaining that the unpaid booking will be
cancelled, its table released and its guest notified. This does not enable
real-money transfers or change PayMongo's test-only configuration.

The focused migration was applied to the authorized beta database on November 4,
2026 (Manila date), with its migration ledger entry in the same transaction.
Existing public records, functions and privacy policies were verified unchanged.
Android publication and device acceptance are tracked separately in
`docs/manual-gcash-rejection-release-2026-11-04.md`.

Starting HEAD: `eabc2bf`; branch: `feat/manual-gcash-rejection`. The tree was clean
before this work. The photo-processing and automated checkout handlers are
unchanged. No environment files or customer documents were read.

## Behavior and safety

- Reject is offered only for submitted unpaid manual GCash evidence. It is not
  offered for paid/completed/cancelled bookings, provider checkouts, refund reviews
  or requests without proof/reference. Opening proof remains mandatory for Accept;
  Reject can be used when a submitted document cannot be opened or verified.
- Both decisions are disabled while the request is pending. A synchronous guard
  also prevents double taps or conflicting decisions before React rerenders.
  The UI changes only after a validated server response. Transport failures and
  a missing RPC show a clear message; there is no direct-table fallback.
- The new additive, idempotent migration is
  `supabase/migrations/20261102200338_reject_manual_reservation_payment.sql`.
  `reject_manual_reservation_payment(uuid)` checks confirmed active account state
  and assigned owner/admin access, then locks venue followed by reservation, just
  like approval. It refuses settled, provider-backed, expired or unresolved cases.
- Rejection writes the existing `cancelled` / `failed` states and a clear
  `cancellation_reason`. Proof, reference, payer details and history are retained.
  It does not manufacture a paid/refund state or delete uploads. Repeated rejection
  returns the same decision without sending another notification. Accept racing
  Reject has one coherent terminal result.
- A private `reservation_cancelled` activity is inserted in the same transaction.
  Failure to save it rolls the decision back. Guest notification/Activity links
  open that reservation, and its detail screen displays the cancellation reason.
  Existing activity privacy rules and existing approval/account guards are retained.

## Checks

The full local suite passed **578 tests, 0 failed, 5 skipped** (583 total), up from
554/0/5 before this feature. Typecheck, Android export and admin web export passed.
The focused local run passed **31 tests**, including the new SQL/client checks
and existing dashboard model assertions. SQL writes use synthetic accounts in
isolated loopback PostgreSQL clusters. Both the full migration chain and the
previously captured public-schema fixture plus the focused reservation upgrades
were exercised. The captured fixture includes no hosted records; its Auth and
Storage platform contracts are synthetic. The private bucket must be seeded
explicitly because a public-schema capture does not include Storage metadata.
Without an explicitly configured capture, the test reconstructs the same
documented older-beta approximation used by the existing reservation-upgrade
test, then applies the focused upgrades. This keeps a fresh checkout testable
without requiring a private or untracked schema file. No assertions are skipped.
The history approximation also reproduces the captured beta's existing anonymous
EXECUTE grant on its no-argument self-admin predicate. Without it, the legacy
Storage policies deny anonymous reads with a permission error. This fixture
correction matches the observed catalog; no product permissions or existing
privacy assertions were loosened. That initial fixture failure is retained.

The actual dashboard components were rendered with mocked services at 320-pixel
phone width, 360-pixel phone width with large text, and 800-pixel tablet width.
All nine tab/layout combinations passed adjacent-button and touch-target checks.
Cancel sent no request; a failed request retained the pending reservation; both
decisions stayed disabled in flight; successful rejection removed its actions.
This rendering harness is a test, not an owner browser product or device release.

Initial new-test failures are retained: a BOM in the captured JSON, its CLI
envelope, missing synthetic Storage bucket metadata, and cross-realm prototype
comparison in the client mock. Fixture decoding/setup and value comparison were
corrected without dropping assertions. The earlier 20/0 SQL run and final 31/0
focused run are recorded separately from those failures.
The self-contained history fixture also passed all 20 SQL checks after matching
the captured beta's helper grant. Existing Tables & Pricing regression checks
passed on all eight prior layouts. Command evidence is saved under
`tests/remediation/evidence/commands/manual-reject-2026-11-03-*`.

Only the existing owner-browser **test harness** was extended with review-service
and alert mocks; no existing assertions were removed or loosened. The generated
migration-manifest evidence now includes the new migration. No migration-count
test assertion was changed. Baseline pricing screenshots generated by a regression
rerun were restored to their original committed versions.

## Release order

1. Complete local gates and take an encrypted backup using the existing reviewed
   reservation backup procedure.
2. Apply only the new focused migration after the already-installed reservation
   alignment/dependency upgrades. Do not replay foundation migrations or reset
   data. Record its ledger entry only after the SQL transaction succeeds.
3. Check RPC grants/account guards and a synthetic manual-proof rejection. Confirm
   guest cancellation, released availability, retained proof/reference and one
   private notification. Preserve the synthetic ledger for traceability.
4. Publish the owner/customer Android JS changes to the verified preview channel
   and compatible runtime together with the pending owner UI/analytics update.
   Then test on the installed APK and verify actual update adoption. No live-money
   acceptance is implied by this release.

Rollback the UI to hide Reject if needed. Keep committed rejection decisions and
their history; never reopen cancelled reservations or delete notifications as a
rollback. The new function is isolated from Accept and automated payments, so it
can be revoked separately while investigating. Publication and hosted acceptance
must be reported separately from local test success.
