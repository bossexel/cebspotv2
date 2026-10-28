# Account Details and email-change assessment

Account Details is available under Profile → Account. Names update `auth.users.raw_user_meta_data` (`first_name`, `last_name`, `display_name`, `full_name`) and the matching `profiles` record. The existing Auth trigger normally synchronizes names; the client also checks the resulting profile and updates only those name fields if needed. Existing post authorship, captions, media, review text, and booking snapshots are not rewritten.

Profile pictures use the existing `profile-photos/<user-id>/avatar.jpg` upload and `profiles.photo_url`. Password changes use the existing verified recovery-code flow, prefilled with the account email. Passwords stay in Supabase Auth, not profile records. Existing password requirements and session revocation remain in effect.

## Email changes: implemented after user approval

Supabase supports authenticated email changes through `auth.updateUser({email})`. With Secure Email Change enabled, both the current and new addresses must confirm the change. Following the user's publication authorization on October 28, 2026, authenticated Management API checks verified secure email changes and required email confirmation. The exact callback and CebSpot template were deployed and read back successfully. No custom SMTP is configured; the user confirmed none is available. General-user delivery remains limited by the default sender. Sources: [updateUser](https://supabase.com/docs/reference/javascript/auth-updateuser), [secure email confirmation](https://supabase.com/docs/reference/kotlin/auth-updateuser), [SMTP requirements](https://supabase.com/docs/guides/auth/auth-smtp).

| Area | Implemented behavior and backend impact |
| --- | --- |
| Authentication | Account Details includes Change email, the confirmed current address, a pending address, resend cooldown, and Check status. The service sends only `auth.updateUser({email}, {emailRedirectTo})`. Request success and a first inbox confirmation do not imply completion. Duplicate, rate-limit, network, and expired-link errors have actionable messages. |
| Public profile | `handle_new_user` and `on_auth_user_updated` synchronize confirmed Auth email into `profiles.email`. `guard_profile_identity` prevents a client from directly editing that column. Use Auth, never a direct profile-email update. |
| Permissions | Both the screen and service limit this self-service flow to ordinary customers. The service reads the verified Auth user and private profile, checks matching IDs and confirmed email, and rejects managed profiles or reserved admin/owner addresses. Existing managed-account provisioning stays unchanged; this client gate is not a new server-wide email-change policy. |
| Ownership and RLS | The user UUID stays unchanged. Local PostgreSQL tests replay the repository migrations and confirm posts, reviews, comments, circles, bookings, payments, and storage ownership survive the email update. This is a local trigger/RLS test, not a live Auth integration test. |
| Reservations and payments | New bookings can use the updated profile email. Existing `reservations.guest_email`, payment payer information, and booking history remain unchanged contact snapshots. |
| Owner requests | Business email uniqueness checks continue to compare Auth users, profiles, and pending owner requests. No owner-provisioning rules or historical requests are rewritten. A pending business request is not an Auth email reservation; existing provisioning still enforces its checks. |
| App callbacks | `cebspot://auth/email-change` has a dedicated status screen. It reads the existing signed-in account and never imports tokens or codes from this return link. Signed-out users must sign in. After server confirmation, the existing session and profile refresh together; opening a return link alone never reports success. |
| Cached sessions | Both ordinary and scoped profile initialization stop copying cached email into `profiles.email`. The backend identity trigger is authoritative, so a phone caching the old address cannot overwrite a newly confirmed address. |

Relevant code: `src/constants/authRoles.ts`, `src/hooks/useAuth.ts`, `src/hooks/useScopedAuth.ts`, `src/services/profileService.ts`, `src/services/reservationService.ts`, `supabase/functions/_shared/paymongo.ts`, `supabase/functions/provision-owner-account/index.ts`, and the identity/authorization migrations.

## Validation and release requirements

Passed locally:

- `node --test tests/refactoring/email-change.test.cjs tests/refactoring/account-details.test.cjs tests/remediation/email-change.test.cjs tests/remediation/account-details.test.cjs`
- `node tests/user-walkthrough/email-change.cjs`: actual AuthProvider, Account Details, service and return screen with fixture Auth/mail/database; partial and final confirmation, existing-session refresh, resend after the cooldown, offline status failures, automatic foreground recovery, lost-response recovery, duplicate/rate errors, account switch, signed-out return, and light/dark/320px layouts. Auth network errors now show retry guidance instead of incorrectly asking for another sign-in.
- `node tests/user-walkthrough/account-details.cjs`: existing name, photo and verified-password behavior.
- `npm run typecheck`
- `npx expo export --platform android --output-dir .codex-tmp/email-change-setup-export`

Hosted Auth Secure Email Change, the template, and the exact redirect entry `cebspot://auth/email-change` are now configured. Working general-user SMTP delivery remains pending. On an installed Android build with the registered `cebspot` scheme, test both inbox confirmations in either order, expired links, completion on another device, sign-in/password recovery with the new address, and old-address rejection after completion. Expo Go does not register this custom app scheme; after server confirmation, manually returning to Account Details and using Check status can still check the email state. Native callback acceptance needs an installed development or app build.

## Local setup completed October 28, 2026

`supabase/config.toml` explicitly enables email confirmation and double confirmation of email changes, sets the minimum request interval to one minute, and includes the exact callback `cebspot://auth/email-change`. Existing callback entries are retained. The local inbox catcher is explicitly enabled on port 54354. The CebSpot email-change subject and HTML template are configured under `[auth.email.template.email_change]`.

The new [email-change template](../supabase/templates/email-change.html) uses the provider-generated `{{ .ConfirmationURL }}` for both the button and fallback link. It displays the requested new address, explains both inbox confirmations, and gives the Account Details path and manual return instructions. It does not link directly to the app before server verification. Local preview checks at 390px and 320px passed without horizontal overflow. TOML parsing and all configured template paths were checked. Configuration names and template variables follow [Supabase local Auth configuration](https://supabase.com/docs/guides/local-development/cli/config) and [email template configuration](https://supabase.com/docs/guides/local-development/customizing-email-templates).

These files configure a local Supabase stack; editing them does not update the hosted project. Docker and Supabase CLI are unavailable in this session, so the full local Auth/mail stack was not started. The native SQL tests use their existing isolated PostgreSQL harness. Android platform tools are available, but `adb devices -l` reports no connected devices.

## Remaining hosted setup and acceptance

Steps 1–3 were applied and verified during the authorized October 28 user-testing release. Steps 4–6 remain acceptance work:

1. In the intended Supabase project's Auth URL configuration, add `cebspot://auth/email-change` to allowed redirect URLs while preserving all existing entries. Do not replace the Site URL with this feature-specific callback.
2. Enable Secure Email Change and keep email confirmation enabled. The corresponding local option is `auth.email.double_confirm_changes = true`. Do not disable confirmation to make a test pass.
3. In Change email address templates, use the subject `Confirm your CebSpot email change` and the contents of `supabase/templates/email-change.html`. Keep the provider-generated confirmation URL. Leave the existing password recovery template unchanged.
4. Verify the project's SMTP sender and delivery configuration. Use two inboxes controlled by the tester and a disposable regular customer account in an approved test environment. This session sent no emails and changed no real account.
5. Install a development or app build that registers the `cebspot` scheme on an authorized Android phone. From Account Details, request the new address. Confirm one inbox: the old email and pending new email should remain. Confirm the other: Check status must show the new confirmed email, refresh the current session/profile, and retain the same account ID. Repeat in the reverse order on another disposable account.
6. Verify expired links, resend cooldown, restart with a pending change, completion on another device, offline/foreground recovery, and sign-out before link return. Sign in and recover the password using the new address; the old address should no longer sign in to this changed account. Check posts, threads, media, reviews, circles and booking/payment history through the same UUID. Keep historical booking and payment contacts unchanged.

Hosted callback/template settings were updated with the user's publication authorization; confirmation stayed enabled and unrelated settings were preserved. The focused identity prerequisite was applied alongside the independent-post and Circle backend changes. No real user's email was changed and no confirmation emails were sent. SMTP delivery and installed-device acceptance remain unverified. See [the release record](deployment-2026-10-28.md).
