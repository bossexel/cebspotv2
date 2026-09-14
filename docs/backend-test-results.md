# Authenticated database and payment test results

Latest rerun (September 10, 2026): authenticated profile write/restoration passed again; local payment tests remain 24 passed / 4 failed; test webhook is enabled and the deployed handler accepts the locally configured signing secret. Both original provider sandbox payments remain paid while their CebSpot reservations remain pending. Cleanup still returns PostgreSQL 42702. The user reported the standalone repair file was empty; it has now been restored with an explicitly written 1,808-byte function definition and checked on disk. Deployed application and cleanup are still pending. See `release-readiness.md` for the broader rerun and readiness checklist.

## Real authenticated database check: passed

Using the account supplied for this test, `npm run test:authenticated-write`:

1. Signed in through Supabase (1,161 ms).
2. Read that user's profile with the user session and public client key.
3. Changed only that profile's display name to a unique temporary test value.
4. Read it back and verified the write.
5. Restored the original display name and verified restoration.
6. Signed out the test session.

The script uses compare-and-set filters so cleanup will not overwrite a concurrent edit. Credentials are read from ignored `.env.test.local` and are not printed. No service-role key was used. This confirms an authenticated profile write under deployed permissions; it does not establish reservation/payment write permissions or all other RLS policies.

## Deployed payment entry points: passed rejection checks

| Endpoint | Probe | Observed response |
| --- | --- | --- |
| `paymongo-create-gcash-checkout` | Anonymous request for a nonexistent fixture reservation | HTTP 400, Authentication required |
| `paymongo-create-qrph-checkout` | Anonymous request for a nonexistent fixture reservation | HTTP 400, Authentication required |
| `paymongo-webhook` | Unsigned fixture event, with no payment reference | HTTP 400, Missing PayMongo signature |

These probes did not create a checkout, a reservation or a charge.

## Payment handler regression tests: 24 passed, 4 failed

Run `npm run test:payments`. Tests execute the actual TypeScript checkout/webhook handlers and shared payment helper using a Node harness. Supabase and PayMongo are replaced with isolated in-memory adapters. These are application-logic tests, not evidence of successful PayMongo processing, deployed function equivalence, database transactions, concurrency safety, or RLS enforcement.

Passing tests cover authentication and ownership rejection, paid/cancelled/completed/no-show reservation guards, centavo conversion, pending checkout persistence, checkout reuse, QR retry creation, provider/database errors, signature verification and replay protection, paid/failure notifications, cancellation preservation, and untracked payment references.

Four regressions reproduce in the current local handlers:

| Failure | Reproduction and observed result | Source |
| --- | --- | --- |
| Late failure downgrades payment | Deliver a valid paid event, then a valid failure for the same checkout. Reservation changes from `confirmed/paid` to `cancelled/failed`. | `supabase/functions/_shared/paymongo.ts`, `reservationUpdatesForPaymentStatus` and `upsertReservationPayment` |
| Unhandled event resets payment | After a paid event, deliver a signed unhandled notification referencing the same checkout. The default event mapping produces `pending`, resetting the reservation to `pending_payment`. | `supabase/functions/paymongo-webhook/index.ts`, `statusFromEvent` |
| Duplicate paid event reopens completed booking | Deliver a paid event for a completed reservation. Its state changes to `confirmed`. The update guard excludes only `cancelled`. | `supabase/functions/_shared/paymongo.ts`, reservation update guard |
| Old QR attempt cancels replacement | Create a replacement QR checkout, then deliver a failure for the expired previous attempt. The reservation is cancelled while its replacement payment remains pending. | QR checkout retry and shared reservation update; the update is filtered by reservation ID without checking its current payment reference |

Payment implementation and deployed functions were not changed during this testing task. The failing regression expectations remain enabled so `test:payments` correctly exits unsuccessfully until these behaviors are repaired. Actual deployed behavior may additionally depend on database triggers and the deployed function version; these four cases were not replayed against customer records.

## Real PayMongo sandbox transactions: provider passed, application confirmation failed

After a valid Secret Test key was added to ignored `.env.test.local`, both deployed checkout functions were exercised with two explicitly labelled sandbox reservations at the existing test spot. Neither reservation allocated a table or slot. The supplied account could insert and read its reservations and read the payment rows written by the deployed functions.

| Check | GCash | QRPh |
| --- | --- | --- |
| Deployed checkout creation | Passed | Passed |
| Provider confirms `livemode: false` | Passed | Passed |
| Provider test authorization | `succeeded`, payment `paid` | `succeeded`, payment `paid` |
| CebSpot reservation after authorization | `pending_payment`, payment `pending` | `pending_payment`, payment `pending` |
| CebSpot payment row after authorization | `pending` | `pending` |

PayMongo's webhook listing returned one matching CebSpot test webhook with **status `disabled`**, subscribed to `checkout_session.payment.paid`. This blocks delivery of successful payment notifications. Its configuration was not changed. A complete integration pass still requires enabling the intended test webhook, verifying its signing secret matches the deployed function, and confirming a fresh sandbox payment updates the reservation. Existing paid test checkouts are not proof that event delivery works.

Follow-up: after the user updated the webhook setup, a read-only PayMongo check confirmed the matching test webhook is now **enabled**. `.env.local` contains `PAYMONGO_WEBHOOK_SECRET` with the expected webhook-secret prefix. A request signed with that local secret, containing no payment reference, received HTTP 200 from the deployed function with `received: true`, `ignored: true`, and `reason: "No PayMongo reference id."`. This verifies that the deployed function accepts the configured signing secret without modifying a payment. A fresh provider-delivered payment event and resulting reservation confirmation remain unverified.

Authorization used PayMongo's hosted test pages and their `Authorize Test Payment` buttons. QRPh used the provider's `test_url`; no QR code was scanned. See [PayMongo payment acceptance testing](https://docs.paymongo.com/docs/payment-acceptance-testing) and [webhook setup and verification](https://docs.paymongo.com/docs/developer-tools-webhook-setup-management).

## Sandbox reservation cleanup: waiting for database repair

The deployed `void_unpaid_reservation` RPC fails with PostgreSQL `42702`: `column reference "cancellation_reason" is ambiguous`. A direct authenticated cancellation updated zero rows under the supplied account's permissions. The two labelled fixtures therefore remain pending until the repair is applied:

- GCash reservation: `cf45f3fb-124d-4feb-aa8a-b3b82f3d8477`
- QRPh reservation: `2a5387de-158f-4edd-b4a1-c56ef32d548e`

`supabase-fix-void-unpaid-reservation.sql` contains the standalone function replacement for Supabase SQL Editor. The same correction is included in `supabase-schema.sql` and `supabase-unpaid-payment-void.sql`. It qualifies the function parameter as `void_unpaid_reservation.cancellation_reason`, preserving the API signature, ownership checks, paid-reservation protection and row lock. PostgreSQL documents [function-qualified parameter references](https://www.postgresql.org/docs/15/plpgsql-implementation.html). The SQL repair has not yet been applied or exercised against the deployed database.

After applying it, run `node --use-system-ca scripts/check-paymongo-sandbox.mjs cleanup`. This cancels only the recorded test reservations and expires their pending application payment rows. Successful provider sandbox payments are retained by PayMongo; already-paid checkout sessions cannot be expired. The ignored state file retains fixture identifiers for cleanup retries.

Reusable read-only checks: `node --use-system-ca scripts/check-paymongo-sandbox.mjs inspect` verifies the key and webhook configuration; use `status` to compare the recorded provider payments with CebSpot. `start` creates new test reservations and must only be used intentionally with sandbox credentials and the known test spot.
