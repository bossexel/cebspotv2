# SMTP and authentication email acceptance

Use isolated staging addresses controlled by the test team. Keep email confirmation enabled. Verify normal inbox, spam/quarantine behavior, link expiry, redirect allow-list and delivery latency.

- [ ] Signup confirmation arrives and confirms the intended staging account.
- [ ] Password recovery arrives, expires correctly, and cannot change another account.
- [ ] Owner invite/provisioning message reaches only the intended business contact and does not reveal account state to an unrelated address.
- [ ] Secure email change sends confirmation to the current and new addresses as configured; pending change does not replace the active address early.
- [ ] Resend cooldown and rate limits are clear; repeated taps do not send uncontrolled duplicate messages.
- [ ] Test ordinary Gmail, Outlook and one non-major provider; check SPF, DKIM, DMARC alignment, sender identity and reply-to.
- [ ] Verify links open the app/web route with the correct state and reject unapproved redirect hosts.
- [ ] Review Auth logs for delivery/provider errors without exporting message bodies or tokens.

Record provider, template version, timestamps and pass/fail status only. A default low-volume project sender is not accepted as general-user delivery capacity.
