# Media/feed deployment — 25 October 2026

Release source: `50400371d93ec73bf0a6e3804235a8c0ea641b16`, pushed to `bossexel/cebspotv2` main with the user's explicit deployment authorization.

## Deployed

- Admin web: https://cebspot-admin-web.onrender.com/admin — Render deployment `dep-dbehkjss728c73ckgpe0`, live at the release commit. HTTP 200 for the page and its updated JavaScript bundle.
- Face service: https://cebspot-face-anonymizer.onrender.com — Render deployment `dep-dbehkkb4qb4c739pnnp0`, live at the release commit. Startup checks accepted its Supabase configuration; authenticated processing and result download passed.
- Supabase project `fathkdyxgeeokxeobxqp`: applied `20261025000100_activity_feed_pagination.sql` and `20261025000200_public_media_size_limits.sql` in one transaction, with lock/statement timeouts. The project's existing database has no `supabase_migrations.schema_migrations` history table; deployment used the authenticated Management API SQL command and was verified directly, without marking unrelated migrations applied.
- Android: version **1.0.4**, version code **12**, package `com.cebspot.app`, EAS `beta` profile, preview channel/environment. Build `d3cf2032-c39d-4c41-90c3-f05b8fbfbb5f` finished successfully using the existing signing credentials. Downloaded artifact passed APK Signature Scheme v2 verification; target SDK 35, minimum SDK 24.

[Install Android APK](https://expo.dev/artifacts/eas/4aKd8iEFWeuOc2YLGJDTmrpLmnoQajvRWgX96sP3bus.apk) · [EAS build](https://expo.dev/accounts/exl123/projects/cebspot/builds/d3cf2032-c39d-4c41-90c3-f05b8fbfbb5f)

APK size: 106,003,096 bytes. SHA-256: `30a3d4865737048425f562bfc83e33574bfd4598c6dbd49dbf65252391a60d1d`.

Users must install this APK to receive the native video compressor and new app behavior. No incompatible OTA was sent to runtime 1.0.3, and no Play Store publication was performed.

## Live verification

- Final full JavaScript suite: **321 passed, 5 existing skips, 0 failed** (326 tests). Earlier TypeScript, Python security/quality checks and Android/admin exports also passed; see the implementation notes for their scope.
- Newest, Popular and Nearest each returned all 19 currently visible feed posts over two cursor pages, with no duplicate IDs and no full media arrays. The RPC remains security-invoker; anonymous/authenticated execute privileges and existing RLS were verified.
- Both feed indexes exist. `spot-images` now enforces 3,145,728 bytes; `profile-photos` enforces 262,144 bytes. Existing media objects were preserved.
- Synthetic test account sign-in and refresh succeeded. Anonymous face requests returned 401; refreshed authenticated requests returned 202 and their results returned 200.
- The same public coffee sample changed from the old service's 466,666-byte PNG output to a 35,236-byte JPEG with zero detected faces (about 92% smaller).
- The public astronaut sample returned a 31,998-byte JPEG with one detected face. Reported processing time was approximately 3.2 seconds. These samples do not establish general detection accuracy.
- The EAS upload archive was inspected: private environment files, browser profiles, local credentials/test fixtures and Python service files were excluded. Only the public environment example was included.

## Remaining limits and separate rollout

The face service is on Render's free instance. Render reports that inactivity spin-down can add 50 seconds or more to a request. This deployment did not change the paid hosting plan. Compression does not remove cold starts.

No Android device was connected. Native compilation and APK signing passed, but hardware scrolling FPS, camera/gallery selection and native video encoding still require phone acceptance testing. The original user's exact expired-session request was unavailable; live fresh/refreshed-session requests passed, and automated tests cover bounded refresh/retry and friendly client error handling.

An older reservation/account overhaul remains absent from the hosted database. In particular, the remote project does not have `claim_private_upload`, `create_owner_application_draft`, `account_is_active`, or the `private-upload`, `private-upload-maintenance`, `payment-maintenance` and `delete-account` Edge services. Private proof/document uploads in the current source depend on that separate rollout; deploying compression alone does not make those missing endpoints available.

Those older migrations also include disabling all venue reservations until inventory reapproval and changes to payment/account/location behavior. They were not silently applied as part of this media/feed release. The user was asked whether to include that older overhaul; the decision is pending. Existing payment Edge services were preserved. The already-deployed Admin Updates table and its policies were verified.
