# PayMongo reservation billing investigation

Fix deployed to project `fathkdyxgeeokxeobxqp`. October 7 verification confirms guest billing on both a new paid live payment and a simulator-paid test payment. The backend is now temporarily configured with the user-supplied test keys.

Production redeployment verification: `paymongo-create-qrph-checkout` version 13 and `paymongo-create-gcash-checkout` version 16 are ACTIVE with JWT verification enabled in `fathkdyxgeeokxeobxqp`, the same project configured in the app and used for the observed live payments. Both were deployed with the shared billing helper. Their deployed artifact hashes match the earlier source-verified patched builds: QR Ph `13c07704669d3e1db157a24ef772ac35c072a47185b3e0d3aca52cc727ccca23`, GCash `7f051e74c1c8009e8cade383e448b7c421bcc9ad1d835c5f35e40a4cc2a94a4f`. Authenticated post-deployment requests for a nonexistent reservation return `Reservation not found.` for both endpoints. All 39 payment and six reservation checkout checks passed before the initial deployment; the code was unchanged for this redeployment. No new charge was created for verification.

## Confirmed evidence

Authenticated Supabase reads and read-only PayMongo API requests identified the payment shown in the screenshot: `pay_iad4oEjcPJdEo3G8iabraN1M`, linked to reservation `42056401-c105-4fa4-8edd-b5c177f26b51`.

The reservation contains nonempty `guest_name`, `guest_email`, and `guest_phone`. The PayMongo Checkout Session, Payment Method, and paid Payment all have empty name, email, and phone billing fields. Two other recent live QR Ph payments also have this gap. Payment status synchronization works for these records: CebSpot records them as paid.

Both deployed checkout endpoints safely reject an authenticated nonexistent reservation with `Reservation not found.` This verifies endpoint behavior, not equivalence with local source. No provider payments or reservations were created or modified during the audit. Customer contact values and credentials are not printed.

## Code findings and changes

- The committed QR Ph checkout implementation omitted `data.attributes.billing` from the Checkout Session request. This omission explains the observed provider data, although the deployed source itself was not downloaded.
- The working QR Ph `index.ts` had been replaced by webhook code. The deployed endpoint still behaves as checkout, so this is a separate local defect. Restored checkout behavior using the committed flow, retaining the current return-route restrictions and venue pricing protections.
- QR Ph and GCash now use shared `getReservationBilling`, which reads and trims the reservation's saved guest name, email, and phone. All three are required before checkout reuse, creation, or database writes. Request-body identity overrides are ignored.
- Both flows explicitly send the billing object. GCash previously allowed partial or entirely absent billing.
- Existing reservation contact columns and the checkout UI already capture these details; no database migration is needed for this fix.

PayMongo documents [Checkout Session billing fields](https://docs.paymongo.com/reference/checkout-session-resource) and [billing in the resulting paid checkout webhook](https://docs.paymongo.com/docs/payment-channels-hosted-checkout).

## Validation

`npm run test:payments`: 39 passed, 0 failed. Includes guest billing mapping, ignored request overrides, missing contact rejection before writes/provider calls, authentication, lifecycle, and webhook regression checks.

`npm run test:reservation-checkout`: 6 passed, 0 failed. These local tests use mocked provider/database adapters or inspect source; they do not prove the provider retains billing after a fresh payment.

Read-only deployed audit: `node --use-system-ca scripts/check-paymongo-billing.mjs`. Reads ignored environment files, signs in as the configured test user, checks recent reservations visible to that account, and reports contact presence rather than actual contact details. Recent live paid QR Ph records were verified; a fresh test-mode payment with the fix has not been verified.

## Rollout and acceptance

1. Review and deploy the two checkout functions, including their shared imports, to the CebSpot Supabase project. Do not deploy the former webhook content as the QR Ph checkout function. With an authenticated Supabase CLI:

   ```powershell
   supabase functions deploy paymongo-create-qrph-checkout --project-ref fathkdyxgeeokxeobxqp
   supabase functions deploy paymongo-create-gcash-checkout --project-ref fathkdyxgeeokxeobxqp
   ```

2. Use a fresh test reservation/session created with the backend Secret Test key. Verify Checkout Session billing matches the saved booking name/email/phone before payment simulation; use PayMongo's `test_url` simulator, then verify the resulting Payment billing and dashboard, and confirm CebSpot status updates. Do not scan/pay a test QR with a real wallet or bank app: PayMongo warns that this can process a real transaction. Reopening an old hosted checkout does not test the new payload. GCash intentionally reuses existing pending sessions.
3. Repeat with a new authorized small live QR Ph reservation. Validate dashboard name/contact and paid webhook data. Test GCash only if enabled for the account and app.
4. If session billing is correct but payment billing is blank, retain the session/payment IDs and escalate to PayMongo with sanitized evidence; investigate provider propagation rather than assuming the deployment succeeded end to end.
5. Deploying this code does not backfill old paid transactions. Preserve their mapping to CebSpot guest records for reconciliation. Ask PayMongo about supported historical correction if dashboard backfill is needed.

The app already submits guest details to Supabase and calls the existing checkout endpoints. This billing fix requires backend deployment, not an app rebuild by itself.

## Historical billing correction follow-up

After the user requested correction of existing paid payments, the official API documentation was checked again. There is no documented billing-update endpoint for paid Payments or completed Checkout Sessions. The documented [Update a Payment Method](https://docs.paymongo.com/reference/update-a-paymentmethod) request schema only supports card type and card CVC; it does not support QR Ph billing correction. No unsupported payment mutation was attempted, and no old payment was recharged or refunded.

To verify deployment independently of historical payments, the deployed checkout sources were downloaded through the Supabase management API into `.codex-tmp/paymongo-deployed-billing-proof`. Both the QR Ph and GCash functions and shared billing helper match local source after newline normalization. Historical correction, if supported internally, requires PayMongo support. A correction performed separately would establish backfill, not verify the deployed checkout creation flow.

## October 7: QR Ph test-mode deduction investigation

The user confirmed scanning and paying through a real wallet/bank app. PayMongo's [QR Ph testing instructions](https://docs.paymongo.com/docs/payment-acceptance-testing) warn that test QR codes can process real transactions when scanned and paid; use `test_url` for simulation instead. API mode is determined by the key used to create the checkout; a dashboard view toggle does not change CebSpot's backend configuration.

The latest visible reservation, `a6047469-0696-4974-b192-4e47d0e78613` (booking date October 8), has a provider checkout with `livemode: true` and an intent in `awaiting_next_action`. Its session billing has all three guest contact fields, confirming the deployed billing patch reaches PayMongo at session creation. Its payment-method billing is still empty and no paid Payment was returned, so completed-payment billing propagation remains unverified. This pending checkout alone does not identify the user's latest deducted transaction. No refund, charge, cancellation, or production key change was performed.

## October 7: test key configuration and completed verification

At the user's explicit request, `PAYMONGO_SECRET_KEY` and `PAYMONGO_PUBLIC_KEY` were switched in the deployed Supabase project to the supplied test keys. Test credentials are stored in ignored `.env.test.local`; existing local live credentials remain available in `.env.local` for a later authorized restoration. This is a shared backend change: new production-app checkouts now use test mode for all users, while previously created live checkouts remain live.

The enabled test webhook `hook_2ziSCQp6cKLXNvomBXCxu5Tq` subscribes to `checkout_session.payment.paid`. Its signing secret was configured as `PAYMONGO_TEST_WEBHOOK_SECRET`. The webhook handler now selects this secret for test callbacks and retains `PAYMONGO_WEBHOOK_SECRET` for live callbacks, preserving completion of previously created live transactions. Both deployed signed probes returned HTTP 200. Payment tests passed 40/40, including separate-secret acceptance and cross-mode signature rejection.

Fresh GCash and QR Ph checkout sessions reported `livemode: false` and contained all three guest billing fields. The QR Ph session was completed exclusively through PayMongo's response-provided `test_url` on `secure-authentication.paymongo.com`, using the page labelled `QRPH Test Payment Page` and `Authorize Test Payment`. No wallet/bank app was used. The resulting test Payment `pay_PwrSZ6wrdDbmZWhJ37JDD8hS` is paid, with guest name/email/phone present, and reservation `4ce08ffa-160c-4362-b4e4-b3f1c97db17c` became confirmed/paid through the provider webhook. The labelled sandbox record allocates no table or slot and is retained as test evidence. The unused GCash test checkout was expired and its fixture reservation was voided successfully.

A subsequent read-only audit also found live Payment `pay_cRT7C2NfVnZRPMzaC9osdjzC` paid with all three billing fields populated, confirming the original patch's completed live-payment result. Earlier payments remain unchanged.

Test users must use the simulator rather than scan/pay a QR through a real wallet, including a QR created with test keys. The dashboard may not show a test banner in the initial hosted page; confirm `livemode: false` through the API. GCash checkout creation was verified in test mode, but its full simulated payment was not exercised in this run. No automatic switch back to live keys was performed.
