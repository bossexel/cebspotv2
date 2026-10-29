# Android device acceptance checklist

- [ ] Test on a supported low-memory Android device and a current Android device; record model, OS, app version and build channel.
- [ ] Verify signup, confirmation, recovery, sign-in, sign-out, secure email change and account switching.
- [ ] Walk Explore, search/filter, map, venue details, reviews, saved spots, activity notifications and community posts as a customer.
- [ ] Check reservation eligibility for approved verified inventory, unverified inventory, zero tables, walk-in-only tables and out-of-scope venues.
- [ ] Exercise availability refresh, duplicate taps, slow/offline transitions, hold expiry, cancellation and payment-return routing with test-mode provider accounts only.
- [ ] Exercise owner table inventory verification, walk-in seating/completion, reservation check-in/no-show and private application document access.
- [ ] Test photo/document uploads with slow network, interruption, retry, 401, 413, 415, 429 and service cold start. Confirm original unprocessed photos are never uploaded.
- [ ] Test background/resume, low storage, rotation, screen reader labels, keyboard overlap, small-screen layout, large text and touch targets.
- [ ] Confirm loading, empty, retry and terminal error states remain understandable and never imply success before server confirmation.
- [ ] Verify Android back navigation and notification/deep-link flows do not expose another account's cached data.
- [ ] Record sanitized screenshots and request counts only; do not capture tokens, private documents or other customers' data.
