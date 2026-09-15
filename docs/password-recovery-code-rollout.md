# Password recovery code rollout

The password recovery screen now keeps users inside CebSpot. Supabase emails a six-digit recovery code, the app verifies it, and only then does the app allow the account password to be replaced.

## 1. Publish the Supabase recovery email template

1. Open the CebSpot project in Supabase.
2. Go to **Authentication -> Email Templates**.
3. Open **Reset Password**.
4. Set the subject to `Your CebSpot password reset code`.
5. Replace the template body with the complete contents of `supabase/templates/recovery.html`.
6. Confirm the template contains `{{ .Token }}`.
7. Confirm the template does not contain `{{ .ConfirmationURL }}`.
8. Save the template.

The hosted Supabase project does not automatically read the repository template. It must be copied into the dashboard or published through the Supabase Management API.

## 2. Configure code lifetime and resend protection

1. Go to **Authentication -> Sign In / Providers -> Email**.
2. Keep the minimum resend interval at 60 seconds or longer.
3. Set the email OTP expiration to 3600 seconds or less.
4. Save any changes.

## 3. Publish the application changes

1. Create a new production Android build containing the recovery-code screen.
2. Install that build on the test Android phone.
3. Redeploy the Render admin build so administrator recovery uses the same code-entry screen.
4. Do not publish the OTP email template before at least one compatible app build is installed; the old build expects a clickable recovery link.

## 4. Test Android recovery

1. Open the installed CebSpot Android app.
2. Select **Forgot password?**.
3. Enter an existing test account email.
4. Select **Send verification code**.
5. Open the newest recovery email without closing CebSpot.
6. Copy the six-digit code from the email.
7. Return to CebSpot and enter the code.
8. Select **Verify code**.
9. Enter and confirm a new password.
10. Select **Update password**.
11. Sign in with the new password.
12. Confirm the old password no longer works.

## 5. Test failure cases

1. Enter fewer than six digits and confirm verification remains unavailable.
2. Enter an incorrect code and confirm the app displays an invalid-or-expired message.
3. Try reusing a successfully consumed code and confirm it fails.
4. Request another code and confirm the resend control enforces the 60-second cooldown.
5. Confirm the recovery request does not reveal whether an email address belongs to an account.
6. Complete an administrator reset from the Render admin login and confirm it returns to `/admin` after the password is updated.

## Rollback

If the compatible Android build cannot be distributed, restore the hosted **Reset Password** email template to one that uses `{{ .ConfirmationURL }}`. The code supports legacy recovery links, so previously issued links can still be processed until they expire.
