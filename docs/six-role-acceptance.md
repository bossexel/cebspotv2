# Six-role acceptance checklist

Run with synthetic, dedicated accounts and data on isolated staging. Roles are anonymous, customer A, unrelated customer B, assigned venue owner, unrelated venue owner and administrator.

- [ ] Activity events: approval, reminder, check-in and no-show are denied to anonymous and unrelated users; recipient, assigned staff and admin retain intended access.
- [ ] Reservation/customer data: B and unrelated owner cannot read A's reservation, payment state, proof, contact details or private upload.
- [ ] Assigned owner can access only assigned venue reservation operations, walk-ins and linked private documents; unrelated owner is denied.
- [ ] Inventory confirmation is restricted to the assigned owner; direct edits to verification and role fields are denied.
- [ ] Payment creation and webhooks use test mode; customer cannot mutate paid status or financial resolution directly.
- [ ] Account deletion is authenticated, idempotent and retryable; one account cannot request deletion for another.
- [ ] Admin actions require server-side admin authorization and do not grant admin through client profile edits.
- [ ] Realtime event subscriptions disclose no rows beyond the same role-specific REST/RLS boundary.

Save role, route, status/count and test-case result only. Do not retain response bodies, tokens, emails or user IDs in shared evidence.
