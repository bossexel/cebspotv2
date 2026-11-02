# Reservation test-payment rollout — November 3, 2026

The authorized **test-mode** reservation flow passed, including the user's
Android QR Ph test approval, return to the app, and owner check-in. A separate
GCash test payment also passed. This does not approve real customer payments or
certify the whole application for launch. Owner-confirmed inventory contains
62 tables and a PHP 1 reservation fee.

Starting branch: `fix/reservation-schema-alignment`; starting HEAD: `ffa35b4`.
The working tree was clean. Evidence timestamps use UTC; this report's date is
November 3 in Asia/Manila. No environment files were read.

## Plan and completed stages

1. Back up the public schema/data in encrypted local storage; compare historical
   financial records and shared account guards before replacing handlers.
2. Close checkout admission, deploy durable GCash/QR Ph handlers and maintenance,
   preserve the legacy webhook for historical live-labelled sessions, and route
   only the existing test webhook to a separate durable test handler.
3. Install minute maintenance with Vault-held credentials, bounded test-only
   processing, short-lived purpose-bound signatures, and atomic replay denial.
4. Validate actual client services and Android checkout, provider test payment,
   webhook persistence, return navigation, and owner/customer visibility. Keep
   admission closed after any financial gate fails; diagnose before retrying.

Stages 1–3 were executed against the explicitly authorized beta project. The
legacy webhook was retained. No provider keys were changed. The dedicated test
webhook was verified before and after changing its URL. Maintenance returned four
successful scheduled HTTP responses before synthetic checkout acceptance began.
See `tests/remediation/evidence/payment-rollout-2026-11-03-*.json`.
The legacy webhook's metadata version increased from 20 to 24 during the rollout.
A fresh isolated source download verified that its entrypoint and both deployed
dependencies are byte-for-byte identical to the original download; see
`payment-rollout-2026-11-03-legacy-webhook-source.json`. Version numbers alone were
not used to claim source preservation.

The platform-owned HTTP request queue could not be hardened by the database
operator role. Instead, queued requests never contain the reusable worker token:
Vault signs a purpose-bound epoch-minute message, and the Edge handler claims
that minute once through a service-only SQL function. The operator Bearer token
remains private. Direct client invocation of that claim function is denied.

## Confirmed checkout mismatch and correction

Two synthetic confirmed customers authenticated with the actual SDK. Unconfirmed
login and anonymous reservation reads were denied. Actual availability services
returned 62 configured / 58 online-available tables. The current owner UI rendered
on the connected Android phone without changing inventory.

A synthetic customer saved a pending-payment reservation, but real GCash
checkout initially failed. Admission was closed immediately. The exact durable
request and idempotency key were retained. Safe diagnostics established a
successful provider response followed by SQLSTATE `22023`, specifically failure
of the reservation-reference check. This was not an authentication rejection or
an unconfigured fee. Retrieving that same provider session returned a resource
that passed the existing strict database validation.

`checkoutResourceForAttempt` in `_shared/paymongo.ts` now retrieves incomplete or
mismatching creation responses using the returned session ID. Both checkout
handlers and recovery use it. The retrieved ID must equal the created ID; the
database still validates test mode, reservation/attempt metadata, PHP amount,
currency, quantity and checkout origin. Missing provider fields are never filled
from client input or copied from our request to evade validation.

The original abandoned session was recovered using its original key/body, then
expired and retired after its hold elapsed. Two subsequent abandoned synthetic
sessions also expired and retired. No booking was reopened or marked paid by an
operator. Admission was enabled after corrected handlers and maintenance passed.

## Actual hosted and Android acceptance

- Five synthetic reservations and five distinct provider sessions were created.
  Three abandoned sessions are cancelled/expired/retired. The two paid sessions
  have distinct provider payment references, with methods `gcash` and `qrph`.
- The actual shared client services saved the authoritative PHP 1 amount and
  server hold. Retrying GCash returned the same session and one persisted attempt.
  Another authenticated customer could neither read nor start that checkout.
- The connected Android phone ran the current local preview in **Expo Go**. The
  customer chose a real available table, supplied synthetic contact information,
  accepted terms and opened the deployed QR Ph checkout. The user confirmed
  approving **a test payment only**, then confirmed checking the booking in as
  owner. The app's Reservations screen displayed the venue and confirmed state
  before check-in. The backend subsequently recorded `checked_in` / `paid`.
- A separate automated browser used PayMongo's test GCash authorization page.
  It selected the wallet, continued, submitted the test checkout and authorized
  the test payment. Both payment inbox events were processed with result `paid`;
  no unresolved fixture event remained at verification.
- No test QR code was scanned by this automation. PayMongo warns that scanning
  a test QR with a real wallet can move real money; use the provider test approval
  instead. No real-money payment was requested or tested.

This is user-assisted physical-device acceptance, not an automated native-APK
acceptance run. The installed native package reports 1.0.4, but its exact running
Expo update was not established. No EAS update, APK, Play Store release or admin
site was published. The owner UI/analytics improvement from `ffa35b4` remains a
local preview until separately published to the verified Android channel/runtime.
Return to the customer app was observed; automatic return into the installed
native APK was not independently verified. The native launch encountered the
device's app-clone chooser. Device-profile isolation was not bypassed.

Evidence under `tests/remediation/evidence/`:

- `payment-rollout-2026-11-03-client-checkout.json`: real SDK creation/reuse and isolation.
- `payment-rollout-2026-11-03-provider-page.json`: separate browser test authorization.
- `payment-rollout-2026-11-03-paid-ledger.json`: two distinct paid references and processed events.
- `payment-rollout-2026-11-03-acceptance-status.json`: subsequent owner check-in / paid state.
- `payment-rollout-2026-11-03-android-acceptance.json`: observed app state and user-assisted steps.
- `payment-rollout-2026-11-03-maintenance-final.json`: 15 recent scheduled HTTP successes,
  zero failures, no manual/retirement backlog and no queued reusable credentials.
- `payment-rollout-2026-11-03-legacy-final.json`: all 12 historical live-labelled
  payment/booking fingerprints and shared account/identity guards unchanged.
  Aggregate totals rose from 48 to 53 payments and 72 to 77 reservations, matching
  the five synthetic fixtures. This count comparison is not an all-row content hash.

## Validation to date

- Initial full local suite: **545 passed / 1 failed / 5 skipped** (551 total).
  `commands/payment-rollout-2026-11-03-full-initial.json` retains the failure.
- The failure was the existing account-deletion final-bookkeeping test: expected
  HTTP 200, got 202. Its unchanged isolated rerun passed all six tests. The full
  result is retained; an isolated pass does not erase it. The later full rerun
  passed **554 / 0 / 5** (559 total) with the same assertions. No account-deletion
  source or test was changed. The transient failure's exact cause is unconfirmed.
- Final focused provider/handler/recovery suite: **29 passed / 0 failed** in
  isolated PostgreSQL with mocked provider/Auth. The earlier diagnostic-only
  handler suite passed 25 / 0. Release-control/auth/schedule checks also passed.
- Typecheck, Android export and admin web export passed. Exports used dotenv
  loading disabled; they are compilation checks, not publishable configured
  release artifacts. Command evidence is in `evidence/commands/payment-rollout-*`.
- The first scheduler test run was **7 passed / 1 failed**: PostgreSQL rejected
  regex repetition `{32,256}`. Validation now uses explicit length bounds plus a
  character-class check. The unchanged assertions passed on rerun (8 / 0).

Existing test changes: `payment-handler-harness.cjs` enables the explicit checkout
gate for its synthetic environment and supports injected provider categories /
incomplete creation responses. `payment-handlers.test.cjs` adds gate-denial,
sanitized-diagnostic and canonical-retrieval tests. Existing assertions were
retained. No migration manifest/count assertion or existing migration was edited.

## Release order and recovery

Keep the owner-confirmed inventory and historical financial records unchanged.
Retain the legacy webhook until historical live obligations have a separately
reviewed replacement. Deploy the durable test webhook before routing test events;
deploy maintenance and verify actual scheduled outcomes before enabling admission.
Only then accept real Android test checkout. Publish the matching Android JS
update only after all acceptance checks pass, preserving configured Supabase
settings and the installed runtime contract. Publication does not prove adoption.

On a checkout failure, set `PAYMENT_CHECKOUT_ENABLED=false` first. Keep durable
attempts, exact request bodies and keys for reconciliation. Do not mark payments
paid, extend holds, delete ledger rows or reopen cancelled reservations manually.
Maintain the test webhook and worker so in-flight outcomes can still reconcile.
Do not restore an old direct-write handler while durable attempts are unresolved.

Reviewed commands for the authorized beta project, already executed in this
rollout (do not rerun blindly):

```powershell
npx.cmd --offline supabase secrets set PAYMENT_CHECKOUT_ENABLED=false --project-ref fathkdyxgeeokxeobxqp
npx.cmd --offline supabase functions deploy paymongo-test-webhook payment-release-control paymongo-create-gcash-checkout paymongo-create-qrph-checkout payment-maintenance --project-ref fathkdyxgeeokxeobxqp --use-api
npx.cmd --offline supabase db query --linked --project-ref fathkdyxgeeokxeobxqp --file supabase/manual/install-test-payment-maintenance.sql
powershell -NoProfile -File scripts/payment-release-control.ps1 -Activate
powershell -NoProfile -File scripts/payment-release-control.ps1 -ScheduleMaintenance
powershell -NoProfile -File scripts/verify-payment-maintenance.ps1
npx.cmd --offline supabase secrets set PAYMENT_CHECKOUT_ENABLED=true --project-ref fathkdyxgeeokxeobxqp
```

Use supported system certificates (`NODE_USE_SYSTEM_CA=1` with the local Node
runtime) when needed; TLS verification stays enabled. Do not deploy the legacy
`paymongo-webhook` slug: it still handles historical obligations. Required secret
names are `PAYMONGO_SECRET_KEY` (test only), `PAYMONGO_TEST_WEBHOOK_SECRET`,
`PAYMENT_WORKER_TOKEN`, `PAYMENT_CHECKOUT_ENABLED`, `CHECKOUT_RETURN_BASE_URL`, and the platform-provided
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`. The verification scripts use an
existing encrypted local worker-token backup and are Windows-operator helpers;
they never print or persist decrypted settings.

Review the latest complete full-suite evidence before any future control write.
The scripts refuse an unsuccessful local gate. The manual SQL does not run in
migration replays; its service-only configuration RPC explicitly installs the
Vault secret and minute schedule. Monitor HTTP worker outcomes, not just Cron's
successful enqueue status. Alert on any failure, manual backlog, retirement
backlog or missed successful invocation; a human on-call owner is still required.
The replay-claim table needs a reviewed retention policy for long-running use.

## Remaining boundaries and assumptions

- The user's 62-table / PHP 1 confirmation is authoritative; no price or inventory
  was invented or changed. Provider test mode was required for every new checkout.
- Legacy live-labelled records were preserved without querying the live provider;
  their classifications are historical database labels, not new live verification.
- Auth users and Storage object bytes are outside the encrypted public-data backup;
  a full restore rehearsal and real-money rollout are separate work.
- User actions supplied the physical-device payment approval and owner check-in.
  The exact native installed update and broader real-device matrix remain unverified.
- No credentials, private response bodies, payment links or synthetic account IDs
  are included in committed evidence. Synthetic test bookings remain in the ledger
  for traceability; they were not deleted to make the result appear clean.
