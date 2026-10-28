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
- Admin web export passed. Additional release checks and publication identifiers are recorded below as rollout completes.

No Android phone is attached; native touch/performance and real inbox acceptance are not claimed. The older account-erasure/private-upload/payment-maintenance rollout described in the October 25 release record is a separate existing backend limitation; this focused patch does not silently install that booking overhaul.

## Publication

Backend configuration is deployed and verified. Admin/Expo publication and final identifiers are pending in this record until their deployment checks finish.
