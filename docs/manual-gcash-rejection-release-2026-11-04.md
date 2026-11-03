# Manual GCash review release — November 4, 2026

**Released to the authorized beta database and Android preview.** Physical owner
rejection passed; final Android update publication and served bundle are verified.
The owner confirmed applying the final update, and its dashboard rendered on the
connected phone. Guest native notification/banner tapping remains a separate
device check; existing security-advisor findings remain open.

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
accounts were denied with `42501`, first for invalid targets, then for the actual
synthetic booking (including its own guest). The new RPC is present in PostgREST's
schema cache. Owner/device acceptance is recorded separately below.

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

The initial update was published to preview: group
`616229f6-66cd-47bb-9906-3cdc2e4281af`, Android update
`01a1a275-13b1-7237-8eae-8cdb67ce2785`, source commit `39a4bea`.
The served 1.0.4 preview manifest points to that ID and its downloaded launch
bundle exactly matches the validated configured local export. Initial receipt
and served evidence are retained with the `-initial.json` suffix.

Final integration review found a missing connection: the notification service
handled cancellation, but the root live-activity listener's type list omitted it.
The correction adds `reservation_cancelled` to that existing list. It preserves
the existing supported event types and excludes unrelated activity and separately
managed reminders. A new regression test exercises the actual listener list.

An initial attempt to share a notification predicate passed typecheck and 45
focused tests, but the full suite returned **578 passed, 1 failed, 5 skipped**.
The existing `tests/backend/reservation-attendance.test.cjs` test "arrival and
no-show activities become user notifications linked to reservation details"
asserts the root listener's explicit arrival/no-show event declarations. Moving
them into a helper broke that assertion. The refactor was removed: the existing
listener structure and all original assertions are retained. The corrected
attendance/client isolation run passed **11/11**; the failed full run is retained
in `commands/manual-reject-release-2026-11-04-full-initial-failed.json`.
The corrected full-suite rerun passed **579 tests, 0 failed, 5 skipped** (584 total),
one additional passing test over the 578/0/5 feature baseline. Typecheck and the
configured Android and admin exports also passed. The final follow-up publication
below delivers the correction. This was an
introduced regression in the proposed refactor, not a Windows failure or a flaky
test, and was not masked by changing an existing assertion.

The final preview group is **`cf125a10-dd09-46ec-b2ba-f83ba1d78929`**, Android
update **`01a1a298-e989-723d-9f6b-ae8dae3923ff`**, runtime **1.0.4**, source
**`bc57cc87ebcd74d1f44749c84c545bc0a80375ff`**. Published after every corrected gate
passed, using the same pinned preview environment and Android-only target. The
served manifest points to this ID. Its downloaded **8,732,459-byte** bundle
matches both the manifest hash and the exact validated local export. The export
is also bound to hashes of 169 tracked app/source/asset/config files; publication
refuses a source mismatch or a failing full-suite result. No production channel,
Play Store release or Render deployment was performed.

Publication and download evidence: `manual-reject-release-2026-11-04-publication.json`
and `manual-reject-release-2026-11-04-served-update.json`. Final gates are under
`commands/manual-reject-release-2026-11-04-{full,typecheck,export,admin,isolation}.json`.

Compared the installed code-12 build too: direct app dependencies, 85 resolved
Expo/React Native module versions, and native app/EAS configuration are unchanged.
Its difference from current source is previously applied JavaScript/build-tool
advisory patches. It successfully ran the new owner controls after the user
applied the initial update. The owner subsequently confirmed applying the final
follow-up; the connected phone rendered the owner dashboard after that update.
The owner-only route guard redirects About to the dashboard, so its exact running
update ID has not been read from About. Do not turn user confirmation or a rendered
dashboard into a claim that the exact native ID was independently read. Device
evidence is `manual-reject-release-2026-11-04-device.json`.

Existing 1.0.4 preview users reopen CebSpot and tap **Update** when prompted. The
custom foreground checker has a five-minute cooldown after a check; dismissing
the prompt may require foregrounding it again after that period. Publication
does not establish adoption on every phone. Customer accounts can verify **Profile
→ About → App information**: channel `preview`, runtime `1.0.4`, and final Update ID
above. Owners currently verify via the update prompt and working owner controls;
their route guard does not permit About. Version 1.0.3 users first need a compatible
1.0.4 APK from the [verified latest internal build page](https://expo.dev/accounts/exl123/projects/cebspot/builds/8fa1d0de-c361-4a19-a219-317d71ffb67d),
then the preview update. Do not distribute an expired signed CDN URL.

Previous exact feature-source gates: 578 passed, 0 failed, 5 skipped; focused
31 passed; typecheck, Android and admin exports passed. Evidence remains under
`tests/remediation/evidence/commands/manual-reject-2026-11-03-*`.

## Owner acceptance and rollback

The designated synthetic unpaid booking was created through the actual reservation
client service, with authoritative PHP 1 fee. A synthetic PNG was uploaded through
the hosted private-upload function and attached through the payment-proof RPC.
No provider checkout or money transfer occurred. The owner applied the initial
update and rejected only "Synthetic Rejection Test" on their physical phone.
The device showed adjacent Accept/Reject controls before rejection and no Reject
control for the same fixture afterward. One earlier automation attempt stopped
without a decision because the phone had locked; the user subsequently performed
and confirmed the action. No app-lock or profile restriction was bypassed.

Guest API read-back: cancelled/failed, no paid/approval stamp, hold cleared, table
available again, original proof/reference retained, and exactly one private
reservation_cancelled event. Unrelated customer/anonymous event reads returned
no rows. Another customer's booking read returned no rows. The guest could create
a proof signed link; the unrelated customer could not. The authorized synthetic
PNG download matched its original bytes; its anonymous public URL was denied.
No signed link or document contents were logged or retained in evidence. The cancelled synthetic fixture is
retained for traceability, not deleted.

Evidence: `tests/remediation/evidence/manual-reject-release-2026-11-04-synthetic-created.json`
and `manual-reject-release-2026-11-04-synthetic-result.json`. Historical provider
records and shared guards still match preserved hashes; scheduled payment
maintenance has zero failed responses and no manual/retirement backlog, recorded
in `manual-reject-release-2026-11-04-{legacy-preservation,maintenance}.json`.

Local role/race tests cover repeated rejection and simultaneous Accept/Reject.
The physical guest-side native banner/tap flow has not been exercised: this
phone remains signed in as owner. A persisted private event and API routing test
do not establish closed-app push delivery. The root listener uses the existing
client activity subscription; this release adds no server push service.

If the UI fails, republish the recorded previous 1.0.4 preview update group.
Retain the additive RPC and all recorded decisions/history. Do not reopen
cancelled bookings or delete proof/notifications. If a server authorization issue
is discovered, revoke authenticated EXECUTE on this new RPC only while
investigating; existing Accept and provider handlers are independent.

Operator-only UI rollback command, prepared but **not executed** (this restores
the pre-feature 1.0.4 UI, leaving the additive database function and all decisions):

```powershell
$env:NODE_USE_SYSTEM_CA = '1'
$env:EXPO_NO_DOTENV = '1'
eas.cmd update:republish --group 5d226edd-cde5-4aa0-8caf-590f209c9267 --destination-channel preview --platform android --message "Rollback manual GCash owner UI" --non-interactive
```

Republishing still requires device adoption. For a notification-only regression,
group `616229f6-66cd-47bb-9906-3cdc2e4281af` is the initial, phone-tested owner UI;
it omits the cancellation notification listener correction. Review the desired
rollback scope before selecting a group. No rollback was performed.

Release source and evidence are committed on local branch
`feat/manual-gcash-rejection`; publication source is the commit cited above.
This task did not push/merge GitHub main or deploy Render. Do not infer the
published Android version from main or the APK's embedded commit.

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
