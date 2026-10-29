# Isolated staging upgrade runbook

This is an operator procedure for a newly verified, isolated staging project. It is not authorization to access or change a hosted project. Never target the CebSpot beta or production project from this repository.

## Pre-checks

1. Create and independently verify a dedicated staging project. Disable outbound email, SMS, payment delivery, external webhooks and any integration that could contact real people or charge real accounts.
2. Take a provider-supported backup and confirm that the restore point is readable. Record the staging project reference in the private change ticket; do not put credentials or private account data in this repository.
3. Compare the live staging catalog with the repository migration chain and inspect all differences. Do not reset, link, push the full foundation schema, or fabricate migration-history entries on a populated database.
4. Provision only synthetic users and synthetic venue data. Use PayMongo test mode only. Keep test credentials in the staging secret manager.
5. Review and checksum the exact SQL and function source. Confirm the staging ref is not listed in `docs/deployment-2026-10-28.md`.

## Order

1. Apply the focused activity privacy migration first, after confirming its actual table and function prerequisites. Verify anonymous and unrelated-user reads return zero private event types, while recipients, assigned venue staff and administrators retain intended access.
2. Apply only a reviewed schema-alignment upgrade. Its source must be derived from current migrations, preserve existing rows and avoid automatically making venues reservable. Stop if schema comparison differs from the approved review.
3. Deploy `payment-maintenance`, `private-upload`, `private-upload-maintenance` and `delete-account` to isolated staging using `scripts/deploy-edge-functions.sh`. Configure the documented secret names and schedules in the staging secret manager.
4. Configure Auth email delivery in staging and use only test inboxes. No production SMTP changes are part of this runbook.

## Post-checks

- Re-run migration/catalog comparison, RLS role tests, payment race/replay tests, upload cleanup tests, account-deletion retry tests and function health/auth checks.
- Verify reservation holds expire, inventory stays unverified until owner confirmation, and all unverified venues remain unbookable.
- Verify the maintenance jobs run and alert on non-2xx responses and nonzero failure/manual-reconciliation counters.
- Run the Android customer/owner acceptance checklist and admin-web six-role checklist. Capture sanitized status/count evidence only.
- Repeat a full staging backup after acceptance and perform a restore rehearsal before any release decision.

## Rollback

Stop new booking/payment/upload/deletion admission and scheduler invocations first. Preserve activity privacy policies, payment ledgers, webhook inbox/outbox records, private objects and account-erasure state. Prefer a reviewed forward migration. Restore a database backup only after reconciling payment/provider outcomes and confirming the restore will not discard valid customer activity. Never roll back by weakening RLS or replaying foundation SQL over existing rows.

The repository does not certify that any hosted project has received these steps.
