# Android release candidate review — October 29, 2026

**Recommendation: NO-GO for unrestricted UAT or production.** The local application at source commit `023f5a0` passes the checks below. The retained Android artifact is backend-disabled Hermes bytecode, not an installable or staging-approved APK. An earlier runtime 1.0.4 public beta/installer exists, as documented in [the October 28 deployment record](deployment-2026-10-28.md); it does not contain proof that these fixes or the original complete security/payment schema are deployed.

No real-data backend writes, production deployment, real payments, existing-database reset, credential rotation or history rewrite were performed in this resumed remediation. Original user changes and separately generated audit work were preserved. The approved Saturday, October 17 deadline has passed; this report does not backdate acceptance.

## Findings and current evidence

The original acceptance rules remain in [REMEDIATION_STATUS.md](../REMEDIATION_STATUS.md), with ongoing work in [FINAL_AUDIT_CLOSURE.md](../FINAL_AUDIT_CLOSURE.md). A passed narrow check does not close an entire finding.

| Finding | Implementation and regression evidence | Current acceptance limit |
|---|---|---|
| LA-01 activities | `20261013000100_activity_privacy.sql`; six-role restrictive/overlapping-policy tests in `tests/remediation/activity-privacy.test.cjs` pass in the full native SQL run. | Real JWT/PostgREST direct API checks on isolated staging remain open. |
| LA-02 migration history | All 23 timestamped migrations replay fresh and upgrade in `tests/remediation/migrations.test.cjs`; required walk-ins, inventory, availability functions, policies/triggers/indexes are checked. | Native fixture uses PostgreSQL 18 with synthetic Auth/Storage contracts; matching PostgreSQL 17/full Supabase reset/API is unverified. No existing database was reset. |
| LA-03 inventory | `20261013000200_android_reservation_scope.sql`, `src/utils/tableInventory.ts`, `reservationTableService.ts`; current client refuses unverified/legacy discovery venues and absent availability RPCs. Native SQL and client/checkout regressions pass. | Only `66666666-6666-4666-8666-666666666666` can become reservable. Actual inventory still needs assigned-owner verification on isolated staging. |
| LA-04 proof | Migration 003, `paymentProofService.ts`, `private-upload` function; authenticated, owned and private proof submission/read tests pass. Customer cannot approve or set paid fields. | Real Auth/Storage and owner approval on isolated staging remain open. |
| LA-05 checkout | Migration 004 and checkout Edge functions persist/reuse attempts, durable keys, exact requests and metadata; actual-handler mocks/native SQL retries/reconciliation tests pass. | PayMongo test-provider sessions, interrupted network/return and maintenance scheduling remain unverified. |
| LA-06 webhook | Migration 004 unique event inbox/atomic transitions; signature, PHP amount/currency/reference, duplicate/race/delayed/cancellation/database-failure and original paid-at checks pass. | Real test webhook delivery and provider success/local failure reconciliation remain open. No live charge/refund was made. |
| LA-07 holds | Migration 003; server-owned five-minute checkout and fixed thirty-minute proof review tests pass, including no method attached, interruption, expiry and concurrent approval. | Deployed maintenance scheduling and real interrupted Android workflow remain open. |
| LA-08/09 web | Android-only route/config guards pass; customer/owner web export is rejected; the separate Render admin export/browser checks pass. | **Outside Android v1 scope, not repaired web features.** Render admin is retained; no deployment was made. |
| LA-10 uploads | Migration 005, private-upload functions and bounded face service: ownership/MIME/size/admission/rate/queue/concurrency/timeout/cleanup/429 regressions pass. Current 22 Python checks and installed-environment audit pass. | Linux container, representative consented face photos and real distributed Storage timeout/deletion races remain unverified. |
| Other enabled features | Migration 006 contact/server slot validation; migrations 007–009 consent/stop/leave and self-deletion with retained de-identified ledger; full regressions pass. Saved account isolation/retry/cache, truthful location labels, accessible recovery and inactive-menu removal pass local UI checks. | Actual signup/SMTP, Android permissions/process death/notifications, multi-device sharing and Auth/file deletion remain open. |

## Changes since the resumed baseline

Application baseline was `6f0cb72`; current verified application/dependency source is `023f5a0`. Focused commits:

- `b7e14d1`: restore sole-client verified-inventory eligibility and fail closed on unavailable modern table RPCs.
- `dab9514`: free bookings carry validated name/email/phone; no fabricated reservation or stripped-field schema fallback.
- `41a1183`: Saved error/retry/cache/removal recovery and account-bound bookmark state/storage; late old-account loads cannot overwrite the new account.
- `e5dca10`: remove inactive Activity menu, correct fallback-distance/Circle wording and coordinate validity, expose Clear filters as a button, clarify photo detection and reservation-time wording.
- `a23151d`: cold-start face check measures a fresh process independently of image-test order.
- `0fcff30`: tested Pillow/certifi/security tooling update and Docker setuptools pin.
- `023f5a0`: four compatible lockfile patches and retained final checks; no SDK replacement or forced audit fix.

The complete [changed-file inventory](../tests/remediation/evidence/changed-files.json) covers the original remediation baseline, including inherited changes. The [source manifest](../tests/remediation/evidence/release-source-manifest.json) identifies current working-tree hashes and commit history. [Resumed implementation detail](remediation-resume-2026-10-28.md) separates real pre-fix failures from corrected test-helper problems. Reporting-only changes after the verified source commit do not constitute another deployed app version.

## Commands and retained results

Exact commands, timestamps, sanitized outputs and failures are in the [command record](remediation-command-record.md). Relevant final labels below use `resume-2026-10-29-`; older runs remain available and are not summed as additional unique tests.

| Command/check | Result and scope |
|---|---|
| `npm test` (`final-tests`) | 391 passed, zero failed, five optional legacy skips; 396 total. Includes full migration/upgrade/role/concurrency/payment handler/deletion checks with isolated fixtures. |
| `npm run typecheck`, `npm run lint` | Both pass; both are `tsc --noEmit`, not two independent analysis engines. |
| `node tests/user-walkthrough/browser.cjs` (`resume-2026-10-28-ux-journeys`) | 26 fixture-screen observations, zero runtime errors; explicit corrected UI assertions. |
| Saved/Explore/free-booking walkthroughs | Actual screen/service fixtures pass retry/cache/account-switch tests; free booking saves one complete snapshot through actual client into fresh native PostgreSQL without payment. |
| `npm run test:map` (`user-perspective-map-2026-10-28`) | 13 actual map runtime browser tests pass with intercepted providers. Map runtime source did not change afterward. |
| `.venv/Scripts/python.exe -m unittest discover -s face-blur-service/tests -p test_*.py -v` | 22 passed after security updates. Synthetic geometry/blank/tiled images do not prove real face detection quality. |
| Python audit through `scripts/python-audit.py`, `pip check` | Both pass on the installed Windows environment. Linux image remains unbuilt/unscanned. |
| `node scripts/release-env.cjs --offline-verification ...` | Initial guarded Android Hermes export passes with no backend. |
| Final `expo export --platform android ... --max-workers 1` | Passes after tooling patches with public variables cleared and dotenv disabled; cached valid modules reused. No staging/installed APK claim. |
| Separate admin export and `tests/platform/admin-web.cjs` | Pass with synthetic public backend settings and intercepted browser traffic. |
| `node tests/platform/deny-customer-web.cjs` | Pass: customer/owner web distribution rejected. |
| `node scripts/remediation-secret-scan.cjs ...` | Handoff scan: no matches across 807 source/evidence and 106 artifact files, none skipped for size. Five history-sensitive paths remain a filename-only inventory, not a forensic clearance. |
| Final `npm audit --json` | Nonzero: 30 affected packages, 3 high/20 moderate/7 low/zero critical. Current [triage and remaining root paths](dependency-release-triage.md) are retained. |
| End-of-run device/runtime/config checks | No Android device attached, no `.env.staging.local`, and no Docker/Supabase/Deno command found on PATH. |

The [final artifact manifest](../tests/remediation/evidence/resume-2026-10-29-artifacts.json) hashes the offline Android Hermes bundle and separate admin HTML/JS/metadata. No store build or OTA publication was started. The untracked `rerun-audit-*` work belongs to separate workspace activity; this review does not count its uninspected reports as acceptance.

The retained `resume-2026-10-29-evidence-integrity` check passes: all 246 release source hashes, all 23 ordered migration hashes and seven artifact hashes/byte counts match the current files. This proves file integrity to the stated scope, not native or hosted acceptance.

Updated [screen observations and source hashes](../tests/user-walkthrough/evidence/2026-10-29-remediated/observations.json) and synthetic screenshots are retained in Git: [Explore without GPS](../tests/user-walkthrough/evidence/2026-10-29-remediated/explore-without-location.png), [Circle without GPS](../tests/user-walkthrough/evidence/2026-10-29-remediated/circle-without-location.png), [Activity without the inactive menu](../tests/user-walkthrough/evidence/2026-10-29-remediated/activity-menu-removed.png). Browser fixture rendering remains distinct from Android-device acceptance.

## Migration application order

There are **no new migrations in this resumed correction**. Apply all **23 existing timestamped files in lexical order**, from `20260901000000_schema_foundation.sql` through `20261028000100_beta_identity_prerequisites.sql`, on a new verified isolated project. [The full ordered list and checksums](remediation-migrations.md) are authoritative; the replay manifest is in `tests/remediation/evidence/migration-manifest.json`.

Do not run archived root SQL afterward. The existing mixed-data deployment did not receive the full original overhaul. It requires a separate schema/history alignment and backup review; never push foundations blindly or reset it. Migrations 007/008 and account erasure have irreversible effects and must be tested with disposable data.

## External blockers and exact next steps

1. **Isolated backend:** create a new Supabase staging project with disposable accounts, retain the project identity, and use only public settings in the ignored `.env.staging.local`. Keep service/provider secrets in server secret storage. Verify the target before a dry-run migration plan, then apply the ordered history to that new project. Existing mixed-data project alignment is a separate operation outside this execution.
2. **Real API authorization:** on that project run anonymous, customers A/B, assigned/unrelated owners and admin through REST/RPC/Storage, including overlapping-policy negatives and competing table claims. Run a PostgreSQL-17/full Supabase reset only against a newly created disposable instance. Native synthetic contracts do not replace this.
3. **Venue and payment:** assigned owner confirms actual active online tables for the sole UUID. Deploy matching checkout/webhook/maintenance functions with PayMongo test keys/test webhook secret, schedule minute-level payment maintenance, and follow [payment verification](payment-release-verification.md). Exercise retries, duplicate/delayed/wrong-amount/wrong-currency events, cancellation, provider success/local failure and unknown outcome. No live financial action.
4. **Uploads/deletion:** build and scan the Linux face image, run one worker/replica with matching staging credentials, and follow [upload verification](upload-release-verification.md) and [deletion verification](account-deletion-verification.md). Saturate queue/rate/admission limits and race cleanup with real timed-out/late uploads; test distributed Auth/file deletion and resumability before enabling deletion for testers.
5. **Email:** configure a verified custom SMTP sender and test confirmation, recovery and email changes to actual tester addresses. The October 28 record notes restricted default delivery; no successful general-tester email acceptance is available. Do not disable confirmation to bypass it.
6. **Android:** connect an authorized phone, build/install an internal preview APK against that isolated target and complete the checklist below. Existing published beta or Hermes compilation does not establish these native results.
7. **Security review:** review the seven remaining npm root findings in the actual build/APK environment; source-based build-only reachability is an inference. Privately inspect the five historical sensitive browser paths. Stop before any needed credential rotation/revocation/history rewrite and obtain a separately authorized operation; no secrets need to be pasted into chat.

Lower-priority UX items: Add a Spot should explicitly confirm its default pin, and Share may be clearer as Add a Spot. These remain suggestions; this review did not submit a complete real post. No claim is made for 100 simultaneous hosted users or provider capacity from unit/fixture tests.

## Staging deployment and rollback

Follow the detailed [staging/Render instructions](android-release-candidate.md#staging-deployment-and-render-redeploy), using the current migration list and source commit above rather than the historical counts. Deploy all matching server functions/face code on the new isolated target, configure test-only provider/webhook and maintenance workers, and create six synthetic roles. Run `npm run build:android:rc -- --env-file .env.staging.local --output-dir .codex-tmp/android-staging`; the guard must reject existing hosted targets, live provider keys and public private credentials. Configure the same explicit staging identity in EAS preview before an internal Android build. Do not use the public-beta exception for this isolated acceptance.

Render admin remains a separate supported service. On the staging admin service select the reviewed branch/commit and use Manual Deploy → Deploy latest commit; verify `/admin` and removed customer/owner paths. Do not deploy the existing real-data service. The current exports were not deployed.

Retain a known-good staging APK/admin artifact, provider/session inventory and a reviewed schema/Storage backup before deployment. For a UI failure, redeploy a prior compatible staging artifact or repair forward, keeping web disabled and the sole-venue rule. For security/payment/upload failures, disable the affected feature and repair forward while preserving restrictive policies, private buckets, event inbox/idempotency, bounded holds and retained ledger. Do not roll back into fake availability or permissive proof updates. Reconcile pending sessions/events before restarting workers. Account erasure is not reversed by a Git revert. Existing-data restoration, production rollback, financial actions, credential rotation and history rewriting require a separate operation.

## Android manual acceptance checklist

- [ ] Fresh install/upgrade on a narrow Android screen: Privacy before signup, confirmation/login/recovery/email change with real delivery; offline/error/retry and account-switch behavior.
- [ ] Search/filter/clear, maps/pins/drag/pinch, venue details/reviews, bookmarks/cache/removal, Your Posts pagination/return position, themes and missing-page recovery retain behavior.
- [ ] Denied GPS uses truthful fallback wording. Allowed GPS uses actual location. Circle opt-in/stop/leave revokes remote access and queued updates across devices; no old-account location/bookmarks leak.
- [ ] Camera/gallery permission denial/cancellation, supported MIME/size, face processing and representative consented photos, bounded 429/timeout/cleanup and interrupted uploads work on staging.
- [ ] Only the confirmed client advertises reservations; real tables, phone/contact/server slots, table conflicts, walk-in-only restrictions and owner edits are enforced through direct API too.
- [ ] Free booking confirms once; incomplete paid holds expire in five minutes without an attached method; manual proof has one thirty-minute review deadline. Kill/background/reopen the app during each stage.
- [ ] Run every PayMongo test-mode case and verify the server-authoritative result after cold/warm return. A URL outcome never marks paid. Late-after-cancel goes to resolution, not reclaimed inventory.
- [ ] Six-role activity/proof/document privacy checks pass through real API/Storage URLs. Native notifications/reminders follow the correct account and logout cancels inappropriate reminders.
- [ ] Deletion requires fresh authentication, blocks outstanding obligations, survives interruption/Auth/Storage failure, revokes old sessions and removes personal content while de-identified financial totals/IDs/paid-at remain.
- [ ] Malformed/oversized external links recover on cold and warm starts while valid OAuth/payment/Unicode links work. Record device/OS/APK/source/backend identity and evidence for each result.

**Decision stays NO-GO until the applicable external gates pass.** Local source is improved and locally verified to the stated scope; no audit finding is declared universally resolved by green builds or synthetic tests.
