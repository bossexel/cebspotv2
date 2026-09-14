# Dedicated owner-account rollout

The application now treats venue owners as dedicated business accounts. An email already present in Supabase Auth or `public.profiles` is rejected during approval and must not be upgraded from a consumer account.

## Deployment order

1. In Supabase SQL Editor, run `supabase-dedicated-owner-accounts.sql`.
2. In **Authentication → URL Configuration**, add `cebspot://reset-password` to the redirect allow list.
3. Configure the Edge Function redirect secret:

   ```powershell
   supabase secrets set OWNER_INVITE_REDIRECT_URL=cebspot://reset-password
   ```

4. Deploy the provisioning function:

   ```powershell
   supabase functions deploy provision-owner-account
   ```

5. Publish a new app/web build containing the owner portal and sign-in changes.

## Acceptance checks

- Submit a request using an email that already appears under Authentication → Users. Approval must fail with the dedicated-business-email message and must not change that profile's role.
- Submit a request using a new business email. Approval must create one invited Auth user, set its profile role to `owner`, populate `owner_spot_access`, assign `spots.owner_id`, and mark the request approved.
- Open the invitation. It must land on password setup. After setting a password, the business email must sign in to the owner portal and see only its assigned venue.
- Reject a pending request. No Auth user, owner access, or spot assignment should be created.
- Attempt to approve a second owner for an already-managed spot. Approval must fail without replacing the current owner.

Do not add `SUPABASE_SERVICE_ROLE_KEY` to Expo environment variables. Supabase provides it only to the deployed Edge Function, and the application calls the function using the signed-in admin session.
