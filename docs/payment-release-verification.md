# Android capstone payment verification

This release accepts **PayMongo test mode only**. No live charge, wallet transfer,
refund, production write or deployment is authorized by these instructions.
Manual proof is a simulation: synthetic image, reference and payer number only.

## Local evidence

`tests/remediation/durable-payments.test.cjs` replays every timestamped migration
in a new loopback PostgreSQL cluster. `payment-handlers.test.cjs` executes the
actual Edge Function modules and real SQL RPCs with isolated Auth/provider
adapters. `npm run test:payments` runs that handler suite. These checks do not
verify deployed Supabase Auth, Storage, Edge runtime, PayMongo account capability,
provider delivery or an Android device.

## Isolated staging prerequisites

1. Confirm a new, disposable Supabase staging project identity. Do not use the
   application's current hosted environment or blindly reset/push its schema.
   Apply timestamped migrations lexicographically as described in
   [MIGRATIONS.md](../supabase/MIGRATIONS.md). No root SQL scripts or demo seeds.
2. Set server-only test secrets through a protected environment/secrets manager:
   `PAYMONGO_SECRET_KEY` starting with `sk_test_`,
   `PAYMONGO_TEST_WEBHOOK_SECRET`, Supabase service role credentials,
   and a private `PAYMENT_WORKER_TOKEN` of at least 32 random characters.
   Never put these in `EXPO_PUBLIC_*`, build artifacts, logs or Git.
3. Set `CHECKOUT_RETURN_BASE_URL` to
   `https://<retained-render-admin-origin>/payment-return.html`. The static bridge
   opens the authenticated Android confirmation screen; its parameters do not
   authorize payment. Verify the actual Render artifact serves this file.
4. Deploy `private-upload`, both `paymongo-create-*-checkout` handlers,
   `paymongo-webhook`, and `payment-maintenance` to **isolated staging only**.
   Respect `supabase/config.toml`: webhook and maintenance use their own
   signatures/server token; private-upload verifies JWT and server user identity.
5. Register the staging PayMongo webhook for
   `checkout_session.payment.paid`, `checkout_session.payment.failed`, and
   `checkout_session.expired`. Require explicit test-mode payloads and `te`
   signatures. Live events are rejected.
6. Schedule authenticated POSTs to the staging `payment-maintenance` endpoint
   **every minute** using the server worker token. The job persists hold expiry,
   reconciles known sessions, recovers unknown outcomes with the exact durable
   key/request, and expires cancelled/replaced sessions. Alert on non-2xx,
   `counts.failed`, `counts.manual`, or a growing/old retirement backlog.
   An Android timer is not the scheduler. Until this is configured and verified,
   payment lifecycle acceptance is blocked.
7. Provision six synthetic test identities and actual client inventory. Only
   `66666666-6666-4666-8666-666666666666` may be confirmed by its assigned owner
   using `confirm_client_venue_inventory`; a floor-plan template is insufficient.

## Required test-mode journeys

The executable webhook verifier is test-mode-only and reads credentials from process environment variables only (it does not load `.env` files). It must refuse before any network request unless `PAYMONGO_SECRET_KEY` has an `sk_test_` key shape. `node --test tests/backend/paymongo-test-key-guard.test.cjs` verifies that live and malformed keys are rejected. Never use the live-readiness script for these scenarios.

- Provider success followed by local persistence failure: expect retryable delivery failure, then replay the same provider event; verify exactly one payment transition and original paid timestamp.
- Retry after ambiguous checkout creation: reuse the durable attempt, persisted request and same idempotency key; never create a second session.
- Cancellation racing provider success: preserve the paid/financial-resolution state and require human resolution where funds may have settled.
- Duplicate webhook: return duplicate without changing payment rows, activity count or `paid_at`.
- Late paid webhook after cancellation/expiry: do not silently reopen inventory or downgrade the financial ledger; set `financial_resolution` for review.

- GCash and QR Ph: one attempt/session for rapid double taps, navigation retries,
  network interruption, and provider success followed by local write failure.
- Retries send the same persisted body and idempotency key. An active session is
  reused; replacing it waits until provider expiry is verified by maintenance.
- Complete a synthetic test-mode payment; retain provider test event ID,
  reservation ID, attempt ID and sanitized response/status evidence.
- Replay the same signed event and deliver another event for the same payment:
  one financial transition, unchanged original `paid_at`, no duplicate activity.
- Wrong signature, old signature, missing/true mode, wrong amount, non-PHP,
  wrong reservation/reference/attempt, duplicate payment ID: no paid transition.
- Cancel while payment delivery races. The final state is either confirmed/paid
  or cancelled/refund_pending with `financial_resolution=resolution_required`.
  No automatic refund is issued. An expired table must never be reclaimed.
- Deliver a stale failure/expiry after payment: no downgrade. A failed method
  inside an active provider session may be retried until the bounded hold ends.
- Kill the app before attaching a provider method: table released after five
  minutes. Submit synthetic manual proof: fixed 30-minute review, retries do not
  extend it, late approval rejected.
- Customer B/unrelated owner/anonymous cannot upload, attach or read customer A's
  proof; assigned owner/admin can read submitted proof using signed private URLs.
- Disable the database during webhook handling: retryable 503; the same event
  succeeds once persistence is restored. Never acknowledge a lost transition.

## Unknown outcomes beyond the recovery window

PayMongo documents 24-hour idempotency key retention. Automatic replay stops
after 23 hours to avoid creating a new session after key expiry. A maintenance
response with `counts.manual > 0` is an explicit external reconciliation gate:

1. Query staging `reservation_payments` for `creating` or
   `reconciliation_required` attempts with `checkout_request` missing or
   `created_at <= now() - interval '23 hours'`. Keep the attempt and key.
2. In the **test-mode** PayMongo dashboard, find the session by reservation
   `reference_number` and `metadata.checkout_attempt_id`. Record the session ID.
   Do not send another create request or use another key to guess the outcome.
3. Retrieve that session using the server-only test API. Verify mode, reference,
   attempt metadata, line-item amount and PHP currency. Bind the minimal snapshot
   with service-only `record_checkout_session`, then reconcile through a unique
   `ingest_paymongo_event` / `apply_paymongo_snapshot` transaction. Expire any
   unused session and complete its retirement outbox entry only after verified
   provider expiry. The scheduler handles known sessions on its next run.
4. If the provider cannot establish the outcome, leave checkout blocked for that
   reservation and record the exact attempt ID as an unresolved release blocker.
   Never delete payment history or mark paid/refunded to clear the warning.

Existing legacy sessions without attempt metadata also require explicit staging
alignment; they are retained for reconciliation rather than guessed or deleted.

## Rollback boundary

Freeze new booking/checkout admission before reverting client behavior. Preserve
privacy/storage guards, payment inbox, attempt keys, financial records and the
maintenance worker until all outstanding sessions are reconciled/retired.
Use a reviewed forward migration to repair schema issues; do not drop the inbox,
restore direct customer financial updates, or revert to split payment writes.
No production rollback or migration is performed by this local work.

## Provider references

- [Idempotent requests](https://docs.paymongo.com/reference/idempotent-requests)
- [Checkout resource](https://docs.paymongo.com/reference/checkout-session-resource)
- [Expire session](https://docs.paymongo.com/reference/expire-a-checkout-session)
- [Checkout lifecycle](https://docs.paymongo.com/docs/payment-channels-key-concepts)
