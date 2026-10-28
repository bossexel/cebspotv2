# Resumed Android remediation — October 28, 2026

The current worktree, not the October 13 handoff, is the baseline. Entry HEAD is `6f0cb72`, on `audit-remediation-2026-10-12`. Only `.media-review.diff` and `docs/final-defense-scenario.md` were untracked on entry; both are preserved. No AGENTS.md was found in the repository search.

The previous walkthrough produced new evidence and identified next work. It was a progress turn, not a wait. This resumed turn first re-ran TypeScript and the complete current JavaScript suite: **376 passed, 0 failed, 5 skipped**. Those results do not establish deployed database, provider or native-device acceptance.

## LA-03 regression: missing verification no longer grants reservations

The newer compatibility path in `isReleaseReservable` returned true for any public venue with `is_reservable=true` when inventory-confirmation metadata was absent. This contradicted the approved one-client/verified-inventory release rule. The availability/checkout compatibility service could also accept an old reserved-ID response without verification. Three new regression tests reproduced all three failures before the code change; the failing command is retained.

Local correction:

- Require the sole client UUID, public/reservable flags, inventory confirmation and real active online table inventory for all client versions.
- Guest table availability refuses unverified/discovery venues before requesting availability. A missing modern availability RPC is an unavailable-service state, not permission to reconstruct bookable tables from a legacy API.
- Checkout still re-reads current stored inventory. Owner changes to walk-in-only inventory stop it before any payment/session creation.
- Existing server reservation guards and payment logic are unchanged. Database migrations remain authoritative; no hosted schema or record was changed.

Evidence: `resume-2026-10-28-reservation-scope-red` fails 3/3 before the fix; `resume-2026-10-28-reservation-scope-verified` passes 6/6. `resume-2026-10-28-inventory-and-checkout` passes **26/26**, including complete current migration replay/upgrade, six-role activity privacy and reservation-scope SQL checks. The complete current migration chain has 23 timestamped files; its refreshed checksum manifest is retained by the replay test. Source test expectations that explicitly permitted unverified legacy booking were corrected to the approved acceptance rule, not used as proof of safety.

## Current external acceptance boundary

The October 28 deployment record documents an existing public beta on runtime 1.0.4 and an installed-APK distribution path. Those facts supersede earlier statements that no APK or publication existed. That deployment intentionally did not apply the original full reservation/payment overhaul to the existing database. It therefore does not establish acceptance of this goal's inventory verification, private activities, bounded holds, durable checkout or account-erasure schema. The shared backend contains real/mixed data, as the user confirmed.

Exact next steps before reservation acceptance: provide a new isolated Supabase target, apply all timestamped migrations in lexical order there, deploy matching test-only Edge functions and face service, create synthetic six-role accounts, confirm the real client venue's actual inventory through its protected owner workflow, and execute the booking/payment interruption and duplicate-event cases. A separate reviewed operation would be needed to align the real-data deployment; do not apply the complete foundations/overhaul to it blindly or reset it.

No device is attached according to this turn's `adb devices -l`. Docker/Supabase CLI/Deno were not available from the command discovery check. Native Windows PostgreSQL fixture tests remain a substitute for local SQL verification only, not a full Supabase/PostgREST/Storage or matching PostgreSQL-17 acceptance.

The deployment record also reports no custom SMTP sender and restricted default email delivery. General testers' confirmation/recovery/email-change journeys need a verified sender and actual delivery testing; do not disable email confirmation. Native APK flows, real Storage cleanup/timeouts, test-provider callbacks, deployed policies and email delivery remain specific external gates. Do not perform a live charge to close a test-mode requirement.

No production/public-beta deployment, hosted write, real payment, destructive existing-database operation, credential rotation or Git-history rewrite was performed by this resumed audit. Local fixes require their own reviewed deployment; they are not declared installed on users' devices.

## Free-booking contact and truthful creation correction

Inspection found a free-booking request without the name/email/mobile snapshot required by migration 006. The free path now displays the profile name/email, collects a Philippine mobile number, validates the complete contact snapshot and includes it in the insert. Invalid or missing contact disables confirmation. Phone input clears on account identity change. The server remains responsible for contact validation, arrival-slot derivation, fees and status.

Two service regressions were reproduced and corrected: missing backend configuration returned a locally fabricated reservation, and a schema-mismatch retry stripped guest/table/payment fields. Creation now requires a configured backend and submits the full contract once; schema mismatch reports an unavailable/update-required state. Missing or incomplete availability configuration no longer returns `true`.

`resume-2026-10-28-booking-contacts`: 10 passed across contact, actual service contract and native server detail checks. `resume-2026-10-28-free-booking-accepted`: actual free-booking screen and reservation client use fresh native PostgreSQL, select a real fixture table, reject malformed contact, save exactly one normalized contact snapshot and navigate to confirmation without a provider call. Fixture accounts/venues only; this is not a hosted Auth/API or Android-device acceptance.

Retained earlier runs include a test-helper syntax error, a missing SVG text adapter and an activity-log request counted incorrectly by the synthetic insert adapter. They were fixed in test infrastructure. The final test uses actual reservation creation and checks both one stored reservation and one reservation insert, rather than hiding a duplicate. The initial service reproduction and missing-availability failures remain separate evidence of real pre-fix behavior.

The broader booking run passed 380 tests and failed five old VM-loader checks because their explicit import map did not include the new user-facing error module. Supplying that actual module fixes the fixture without weakening assertions; `resume-2026-10-28-booking-suite-verified` passes all 18 relevant adjustable-time/contact/service/server tests. `resume-2026-10-28-free-booking-typecheck` passes. A final complete-suite rerun follows the remaining local UI corrections; the earlier failed run is not declared clean.

## Saved Spots recovery and account isolation

The walkthrough reproduced a load failure presented as an empty saved list. Saved Spots now distinguishes unavailable from genuinely empty, offers Retry, preserves same-account cached cards, retains cards when removal fails, and ignores late responses after an account switch. A successful removal invalidates older pending reads. Removal state is account-bound as well.

Further inspection found Explore's bookmark loader marked failed loads as ready and could persist an empty list; overlapping account loads could redirect the old list into the current account's storage. Explore now binds its state, reads and writes to the originating account, ignores old loads, and never enables persistence after a failed initial read. Storage operations validate the expected identity; removal resolves its storage key once so an account switch cannot redirect its write.

`resume-2026-10-28-saved-account-contract`: four actual-service regressions pass (identity mismatch, account-switch removal, missing config/session, corrupt storage). `resume-2026-10-28-explore-bookmark-isolation`: actual Explore/service with delayed synthetic storage passes old-response isolation, bound writes and failed-load preservation. `resume-2026-10-28-saved-recovery-final`: actual screen passes error/retry/cache/removal/account-switch interactions. TypeScript passes. Earlier failing UI reproduction remains retained. These are local browser/service checks, not a deployed fix or native-device acceptance.

## Walkthrough corrections and broader regression

The unfinished Activity three-dot control is removed while linked-place navigation and Comments remain. Discovery explicitly labels distances from the Cebu reference point when device location is unavailable; a real location retains nearby wording. Clear filters is an accessible button. Circle excludes the current user from its friend count and labels recent shared coordinates rather than online presence; both Circle screens reject missing/null/out-of-range coordinates and invalid/stale/future timestamps. Self location is shown as unavailable when there is no device location. The photo notice acknowledges detection misses, and booking consistently uses reservation/arrival time wording.

`resume-2026-10-28-ux-journeys`: 26 actual-screen fixture observations completed without runtime errors, with explicit assertions for the corrected controls/copy and valid-location behavior. `resume-2026-10-28-ux-unit`: eight location-validation and native privacy/stop/leave SQL tests passed. The actual free-booking screen/client-to-fresh-PostgreSQL journey passes again. TypeScript passes. `resume-2026-10-28-final-tests`: **391 passed, 0 failed, 5 skipped (396 total)**, including current migration replay, role checks, SQL races, payment handlers and account deletion. The five optional legacy skips are not claimed as acceptance.

The Add a Spot default-coordinate confirmation and Share wording suggestions remain lower-priority UX review items; no complete posted-photo quality or native location acceptance is claimed. No backend, provider or public deployment was changed.

## Face-service combined test isolation

The complete Python discovery run initially failed its API-parent cold-start assertion because earlier quality tests had intentionally imported OpenCV into the same test runner. The regression now imports the actual API in a fresh Python process and checks only whether OpenCV/MediaPipe were loaded there. It still fails if the API eagerly imports them, independently of test order, and no longer dumps the entire runner module inventory on failure. No service behavior was changed for this correction.

`resume-2026-10-28-face-tests-verified`: all **22 Python tests pass**, including the actual ASGI authorization/admission/429/queue/concurrency/timeout/cleanup boundaries, worker termination, model-loading bounds, image-size/geometry tests and synthetic blank/tiled-image detector smoke tests. Earlier failed discovery evidence is retained. These do not prove representative human-face detection quality, Linux-container memory or hosted distributed cleanup.

## Python security refresh, completed after midnight October 29

The fresh installed-environment audit superseded the historical clean result: it reported 48 advisory entries across Pillow, certifi, filelock and setuptools. Updated the local environment to Pillow 13.0.0, certifi 2026.10.23, filelock 4.2.4 and setuptools 84.2.1. The service now pins the tested Pillow/certifi versions, and Docker installs the tested setuptools version. Filelock is updated in local tooling; the face service does not introduce it as a new runtime dependency.

Pillow crosses a major-version boundary intentionally to address the current parser findings, after checking the [maintainer's release notes](https://pillow.readthedocs.io/en/stable/releasenotes/13.0.0.html). This is a reviewed targeted update, not an automatic force upgrade. `resume-2026-10-29-python-audit` reports no known vulnerabilities; `resume-2026-10-29-python-dependencies` reports no broken requirements; `resume-2026-10-29-face-security-regression` passes all 22 tests on the updated environment. The Linux image remains unbuilt/unscanned because Docker is unavailable; build and verify it before staging. Existing production dependencies were not changed.
