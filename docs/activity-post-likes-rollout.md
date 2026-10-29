# Activity likes on historical approved posts

## Prepared change

Earlier approval SQL changed a post's `source_type` from `spot_submission` to
`community`. Activity disabled its Spot action for that type, and the voting
RPC updated counters only for `spot_submission`. This was reproduced against
an isolated PostgreSQL cluster: a historical like was saved but its displayed
counter remained zero before this upgrade.

Activity now accepts valid submission source IDs for both types, including
notification navigation. The server validates that a pending/approved submission
has an actual post by the same author. Map listings and reviews are not vote
targets. Announcements without a submission source remain ineligible. The
server is the final authority for a UUID that does not resolve to a real post.

The focused migration retains both installed-client RPC signatures, existing
vote rows and account guards. It serializes toggles per submission, reconciles
stale displayed counters from the preserved vote rows for eligible posts,
updates matching counters on each toggle and notifies the author for new likes.
Direct client table mutations are revoked so they cannot bypass these
operations; reads and service-role access are retained. No captions, media,
threads, source types, timestamps or historical vote ownership are rewritten,
and no booking/payment schema changes are required.

## Validation and local commands

Database coverage includes the complete migration chain and a representative
older beta schema with only its documented independent-post/identity updates.
Tests cover preservation, like/unlike, own likes, vote direction changes,
recipient-only notifications and routing to the exact submission, private
per-user vote selections, anonymous/unconfirmed/deleting-account denial,
rejected/missing/orphaned posts, direct-write denial and concurrent toggles.
The Activity handler's synchronous per-submission lock and optimistic rollback
are covered; the actual Activity card is rendered through native primitive
adapters to check enabled/selected/in-flight state. These checks are not Android
device acceptance.

On Linux, install test-only dependencies outside the application's package files:

```sh
npm install --prefix /workspace/.cebspot-test-tools --cache /workspace/.npm-cache --no-audit --no-fund @embedded-postgres/linux-x64@18.4.0-beta.17 pg@8.16.3
WALK_IN_PG_PACKAGES=/workspace/.cebspot-test-tools/node_modules node --test --test-concurrency=1 tests/remediation/activity-post-likes*.test.cjs tests/refactoring/activity-post-likes.test.cjs tests/backend/activity-spot-vote.test.cjs
npm run typecheck
CI=1 EXPO_NO_TELEMETRY=1 npm run build:android -- --max-workers 2 --output-dir build/activity-likes-android
CI=1 EXPO_NO_TELEMETRY=1 npm run build -- --max-workers 2 --output-dir build/activity-likes-admin
```

The shared remediation PostgreSQL helper now chooses the actual OS/architecture
instead of hardcoding Windows, and creates its temporary-cluster parent. Windows
users retain the existing `@embedded-postgres/windows-x64` setup.

Full-suite command:

```sh
WALK_IN_PG_PACKAGES=/workspace/.cebspot-test-tools/node_modules npm test -- --test-concurrency=2
```

The earlier Linux run had one failure in the existing deployment-script test's
hardcoded Windows Git Bash path assertion. On this Windows run that test passed;
no assertions were disabled or skipped to obtain a pass.

Current implementation validation: full suite **433 passed, 0 failed, 5
skipped (438 total)**. TypeScript, Android export, admin web export and
`git diff --check` passed. The regenerated migration manifest includes the
focused migration and refreshes the previously stale hash for the unchanged
authorization-hardening migration. No live database, authenticated API or
Android-device validation was performed.

## Release order — not executed by implementation

1. Identify the intended Supabase project and take the approved backup. Inspect
   current function definitions, grants and policies. Confirm prerequisites:
   both vote tables, `local_updates` with source/author/counter fields,
   `profiles`, `activities` and the installation's `require_active_account()`.
   Keep the deletion-aware guard where present. Do not reset the database or
   replay foundation/account-erasure migrations to deploy this correction.
2. On an isolated target, apply only
   `supabase/migrations/20261030000100_activity_post_votes.sql`. It is transactional
   and repeatable. Test new and historical posts with two synthetic users, and
   rejection of invalid targets. Compare row counts and content before/after.
3. After explicit release authorization, apply the same reviewed migration to
   the release backend with operational lock/statement timeouts. These functions
   support old clients; no Edge Function or face-service deployment is needed.
   Recheck grants and the two RPCs through authenticated API calls using the
   designated test accounts, not real users' identities or content.
4. Publish the JavaScript change only to the verified Android preview
   channel/environment for runtime 1.0.4. Confirm the served manifest, channel,
   runtime and update ID against the tested source. No native dependency is
   added by this fix, but verify the installed runtime before using OTA.
5. Have testers download/activate that update and verify About's update ID.
   Backend deployment alone cannot enable a button disabled in older clients.
   Phones on runtime 1.0.3 require the supported 1.0.4 APK first.
6. On an actual phone: like and unlike a historical approved post and a new
   post; confirm counts after reload and on a second account/device; verify the
   author gets the right notification and can open the exact historical post.
   Verify another user's like remains after removing your own. Confirm rejected
   content cannot be liked. Posting and photo uploads must still work.

Capture sanitized API error code/status, source commit and device update ID if
any attempt fails. Do not log tokens, private notifications or full user records.
Live backend, API and device acceptance remain unverified until performed.

For rollback, retain the pre-upgrade function definitions/privileges. Prefer
pausing or reverting the client update while retaining the compatible server
correction. If server rollback is necessary, review restoration from that
snapshot without deleting votes or resetting tables. Restoring old functions
reintroduces the historical-counter defect; do not treat it as a successful fix.
