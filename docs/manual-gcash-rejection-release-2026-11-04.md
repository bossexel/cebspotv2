# Manual GCash review release — November 4, 2026

User authorized the focused database migration and Android preview release.
Starting branch `feat/manual-gcash-rejection`, clean HEAD
`17ef013e61457be4887c2680d2aa7decb711e43a`. This release keeps the existing
photo-processing fix and test-only payment configuration. It does not enable
real-money PayMongo payments or authorize actual wallet transfers.

## Database

Applied `20261102200338_reject_manual_reservation_payment.sql` only, to the
authorized project `fathkdyxgeeokxeobxqp`. No foundation replay, reset or broad
`db push`. Its exact SQL and ledger entry were committed atomically after an
encrypted backup with an in-memory decrypt/round-trip check. The backup excludes
Auth credentials and Storage file bytes; it is not a full restore rehearsal.

The installation wrapper was first run twice on a fresh isolated full migration
chain. It compares hashes of every existing public table, existing public
function and public/Storage policy inside the same repeatable-read transaction;
any change aborts installation. Hosted installation passed that preservation
check. Read-back matches the exact function source, SECURITY DEFINER and empty
search path, authenticated EXECUTE and anonymous denial. Existing account,
identity and payment-approval function hashes are unchanged. No existing payment
or reservation was changed by installation.

Through the actual Data API, anonymous and two designated authenticated customer
accounts were denied with `42501` for invalid targets. The new RPC is present in
PostgREST's schema cache. These are denial checks, not an end-to-end owner review.

Security advisor: 186 findings before, 187 after. The only addition is the
expected authenticated SECURITY DEFINER EXECUTE warning for the new, explicitly
authorized RPC. No new advisor error or other warning appeared. Existing findings
remain, including the `pending_spot_submission_popularity` SECURITY DEFINER view
error, mutable search paths, GraphQL exposure warnings and disabled leaked-password
protection. This focused release does not resolve or certify those unrelated items.

Evidence: `tests/remediation/evidence/manual-reject-release-2026-11-04-database.json`,
`manual-reject-release-2026-11-04-api.json`, `manual-reject-release-2026-11-04-advisors-{before,after}.json`,
`tests/remediation/evidence/commands/manual-reject-release-2026-11-04-wrapper.json`,
and `tests/remediation/evidence/reservation-backup-summary.json`.

## Android

Confirmed EAS project `94fc03ff-3971-4713-8744-638ec4925939`: channel `preview`
maps to branch `preview`; environment `preview`; runtime `1.0.4`. The most recent
finished internal beta APK is build `8fa1d0de-c361-4a19-a219-317d71ffb67d`,
version 1.0.4/code 14, source `37cca02c4281879485fec8d7b6789c7d0c97ff53`.
The connected owner's APK is version 1.0.4/code 12. Dependencies, native app
configuration and EAS configuration are identical between the latest APK source
and this feature. This change is eligible for the existing 1.0.4 runtime.
Runtime 1.0.3 installations need the existing 1.0.4 APK upgrade; this release will
not publish incompatible native changes to 1.0.3.

Preview public configuration was loaded through existing EAS authentication and
validated against the pinned beta database and photo-service hosts. No `.env`
file was read, and no key value was printed or retained in evidence. Export uses
`EXPO_NO_DOTENV=1`. The existing GCash/QR Ph public flags are preserved.

Publication, served-manifest verification and actual device adoption are pending
at this checkpoint. They must be recorded separately; a compatible runtime or
successful export alone does not establish installation or workflow success.

Previous exact feature-source gates: 578 passed, 0 failed, 5 skipped; focused
31 passed; typecheck, Android and admin exports passed. Evidence remains under
`tests/remediation/evidence/commands/manual-reject-2026-11-03-*`.

## Owner acceptance and rollback

Use only the designated synthetic unpaid booking and synthetic private proof.
Never approve that proof or make a real transfer. Verify Reject cancels it,
releases its table, preserves proof/reference, and produces one private guest
notification. Unrelated accounts must not read the booking, proof or notification.
Local role/race tests cover repeated rejection and simultaneous Accept/Reject;
hosted/device coverage must be reported independently.

If the UI fails, republish the recorded previous 1.0.4 preview update group.
Retain the additive RPC and all recorded decisions/history. Do not reopen
cancelled bookings or delete proof/notifications. If a server authorization issue
is discovered, revoke authenticated EXECUTE on this new RPC only while
investigating; existing Accept and provider handlers are independent.

## Admin user actions (inspection and recommendation only)

`app/admin.tsx`'s `UsersSection` pencil and circled-X buttons both show
"Coming soon"; Add User is also a placeholder. No account action was performed.

Recommended pencil: open user details and, where necessary, edit ordinary profile
fields. Show account status, relevant submissions/reservations and moderation
history. Role changes and email/password changes should be separate protected
workflows, not ordinary profile edits.

Recommended red action: suspend/reactivate with a required reason, confirmation,
server-enforced access restrictions and an audit trail. Protect the acting admin,
the last admin, pending reservations and financial obligations. Suspension is a
new backend feature to design, not an existing effect of this button. Permanent
account deletion needs its own guarded cleanup/financial-resolution flow. Never
make this button directly delete a profile row or expose/set a user's password.
