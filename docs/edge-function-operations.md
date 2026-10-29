# Edge function operations

Deploy only to an independently verified isolated staging project. Required secret **names** (values belong in the staging secret manager): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYMONGO_SECRET_KEY` (must be test mode), `PAYMONGO_TEST_WEBHOOK_SECRET`, `PAYMENT_WORKER_TOKEN`, `PRIVATE_UPLOAD_WORKER_TOKEN`, and the endpoint-specific Auth/JWT configuration already defined by each function. Do not add secret values to Expo variables, source, command output or evidence.

Schedule `payment-maintenance` every minute with its worker token. Alert on non-2xx responses, `counts.failed`, `counts.manual`, or an increasing/aging retirement backlog. Schedule `private-upload-maintenance` hourly; alert on non-2xx responses and repeated cleanup failures/backlog growth. Both jobs require an external scheduler and must not depend on a mobile client being active.

`private-upload` and `delete-account` are user-authenticated endpoints. The maintenance functions use their dedicated worker credentials; the webhook uses PayMongo's test signature. Review `supabase/config.toml` before deployment and retain function-level authentication checks.
