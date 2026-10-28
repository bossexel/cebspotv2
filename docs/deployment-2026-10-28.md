# User-testing release — October 28, 2026

The user authorized publication of the complete admin/user patch set and its required backend changes. This release targets the existing CebSpot public beta: Supabase project `fathkdyxgeeokxeobxqp`, Render admin service `srv-daagnhlg1s2s73d4r0r0`, and Android runtime **1.0.4** on Expo's **preview** channel/environment. No Play Store release or incompatible runtime 1.0.3 bundle is intended.

## Included patches

- Separate community posts, map listings and reviews; existing-place suggestions and an explicit different-place choice.
- Admin linking without post/media/thread merging, preserved post moderation, and a historical relationship review queue.
- Similar Posts above Similar Places, direct post navigation, Your Posts, and paged/virtualized post rendering.
- Restored Circle square cards; location consent/stop/leave controls behind a settings icon.
- Admin announcements in Activity notifications, persistent guide completion, and route-line location refresh.
- Stable map-pin dragging and pinch zoom, optional latitude/longitude entry in posting and location edits, synchronized coordinates, and immediate picker opening.
- Account Details with names, profile picture, verified password recovery, and pending/confirmed email-change states. Delete Account remains in Settings.
- Privacy-module rename repair and the user's About/content edits.

## Backend deployed

Applied as one transaction with an eight-second lock timeout and sixty-second statement timeout:

1. `20261013000700_circle_location_controls.sql`, absent from this hosted installation.
2. `20261027000100_independent_spot_posts.sql`.
3. `20261028000100_beta_identity_prerequisites.sql`, which adds missing profile identity protection and the confirmed-account guard without replacing an existing deletion-aware guard.

The existing hosted database has no migration-history table; these exact reviewed migrations were executed through the authenticated Management API rather than marking unrelated migrations applied. Existing booking/inventory/payment behavior was not replaced by the older reservation overhaul.

A before/after comparison confirmed all **78 map listings, 137 reviews, 20 submissions, 19 original posts, 8 comments, 15 reactions and 3 Circle memberships** were retained. One suppressed historical post was restored, bringing posts to 20. Existing captions, media, authors, timestamps and interactions were unchanged; historical listing links remain flagged for admin review rather than guessed. Old profile coordinates were cleared by the consent migration; users opt in to Circle sharing again.

A rollback-only transaction against the hosted database verified two authors' independent posts, one pin, admin linking with reactions/comments preserved, pending moderation, Circle sharing/stop/leave, direct identity-write rejection and Auth-to-profile email synchronization. All synthetic rows were rolled back. A real synthetic tester sign-in verified REST access, profile synchronization, workflow version, matching, paged feed and Circle privacy state. No real user's email was changed.

Hosted Auth now permits `cebspot://auth/email-change` and uses the CebSpot email-change template. Secure Email Change stays enabled, email confirmation stays required, and existing redirect entries and Site URL were preserved.

## Email limitation

The user confirmed there is **no custom SMTP sender**. The built-in Supabase sender remains restricted to project-team addresses and two emails per hour. General testers cannot rely on signup confirmations, password recovery or email-change delivery until a verified custom SMTP sender is configured. Existing authenticated users and available verified Google sign-in can test the other app features. Confirmation was not disabled to bypass this limit. See [Supabase SMTP requirements](https://supabase.com/docs/guides/auth/auth-smtp).

## Validation

- Full preflight JavaScript suite: **372 passed, 5 existing skips, 0 failures**.
- Focused older-schema upgrade tests: **2 passed**, validating only the selected deployment dependencies.
- Existing independent-post, account-details and email synchronization database scenarios passed locally.
- TypeScript and generated map-source checks passed. All **13 map interaction tests** passed.
- Actual-screen fixtures passed for location edits, posting coordinates and email changes, including network recovery and resend cooldown.
- Admin web export passed. Circle settings, Your Posts and Account Details screen fixtures also passed.
- Final focused migration/identity/email checks: **15 passed**; these overlap earlier suites and are not summed as unique tests.
- The approved hosted preview environment passed Auth, spots/submissions REST, Storage and face-service health checks. The free face service initially timed out during cold start, then returned healthy and passed the repeated preflight.
- Published Android and admin artifacts were scanned against the local private credentials; no matches were found across 69 artifact files. Private environment files, snapshots and browser profiles were not committed.

No Android phone is attached; native touch/performance and real inbox acceptance are not claimed. The older account-erasure/private-upload/payment-maintenance rollout described in the October 25 release record is a separate existing backend limitation; this focused patch does not silently install that booking overhaul.

## Publication

Release source: [`8d0e830c6f5b092f7e9604ee66b289746045f7cb`](https://github.com/bossexel/cebspotv2/commit/8d0e830c6f5b092f7e9604ee66b289746045f7cb), pushed to `main` with the configured user author and no assistant attribution.

| Target | Published release | Verification |
| --- | --- | --- |
| Admin web | [CebSpot admin](https://cebspot-admin-web.onrender.com/admin); Render deployment `dep-dbgq11ei0phs73cnif3g` | Render reports Live at `8d0e830`, duration 1m16s. The page and updated JS bundle return HTTP 200; the deployed bundle contains the new linking and historical-review code. |
| Android preview | [Update group `90130292-a322-4908-9c0c-2fd272dc1772`](https://expo.dev/accounts/exl123/projects/cebspot/updates/90130292-a322-4908-9c0c-2fd272dc1772) | Android runtime 1.0.4, preview branch/channel/environment, source `8d0e830`. Update ID `01a1815e-fbde-7fdf-b19a-9e9642d13d5f`, published `2026-10-28T07:17:28.158Z`. |
| Device update endpoint | Exact new Android update ID and runtime returned using the installed-app headers | HTTP 200, 64 assets plus the launch bundle. The downloaded 5,378,044-byte launch bundle matches the manifest's SHA-256 and contains Similar Posts, Circle settings, Account Details and Your Posts. |
| Older Android runtime | Existing 1.0.3 installer-prompt update remains served | Its downloaded bundle hash and 1.0.4 installer link were verified. No incompatible new code was published to 1.0.3. |

For testers already on Android **1.0.4**, fully close and reopen the installed CebSpot preview app, then tap **Update** when prompted. This patch adds no native dependency, so a new binary is unnecessary for existing 1.0.4 installations.

For a new tester or someone still on **1.0.3**, [download CebSpot.apk](https://github.com/bossexel/cebspot-downloads/releases/download/android-1.0.4-12/CebSpot.apk), install it, reopen CebSpot, and accept the new in-app update. The APK's embedded bundle predates this patch; its preview channel delivers the verified latest update. Expo Go does not receive this release.

The named installer is hosted in the separate public [CebSpot downloads repository](https://github.com/bossexel/cebspot-downloads/releases/tag/android-1.0.4-12). It contains the already-published signed installer, not app source. The download returns HTTP 200 with `Content-Disposition: attachment; filename=CebSpot.apk`. Its size is 106,003,096 bytes, and GitHub's SHA-256 digest matches the verified Expo APK: `30a3d4865737048425f562bfc83e33574bfd4598c6dbd49dbf65252391a60d1d`. The source repository remains private; the existing Expo installer URL remains available too.

No new paid hosting plan, email provider or Play Store release was created. Real-phone acceptance and general-user email delivery remain limitations described above.
