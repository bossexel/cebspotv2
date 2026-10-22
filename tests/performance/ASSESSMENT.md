# CebSpot Performance and Reliability assessment

**Assessment date: 2026-10-08, Asia/Manila. Overall: INCONCLUSIVE for deployed performance and booking reliability.** Local execution found a payment audit-field idempotency defect and a reproducible browser-test failure. No Supabase load level, supported-load ceiling, stress breakpoint or Android frame-rate claim is established.

## Provenance and environment

| Item | Actual evidence |
|---|---|
| Repository HEAD | `eb839e670bfc98ffbd9180cc0ba57d357d975a53` |
| Working tree | Already dirty on entry; existing unrelated changes preserved. Tested working source differs from HEAD. SHA-256 snapshots identify actual inputs. |
| Primary local measurement run | Started `2026-10-07T21:09:58.459Z`; summary recorded `2026-10-08 05:11:13` Manila time. Earlier runs are retained, not pooled. |
| Generator/algorithm host | Windows `10.0.26200`; Intel i5-1135G7 @ 2.40 GHz; eight logical CPUs; approximately 7,971 MiB RAM; shared interactive host, no CPU isolation |
| Tools actually used | Node `v22.18.0`; TypeScript `5.8.3`; Node test runner; existing handler VM adapter; Playwright `1.63.0` with installed Chrome; Python `3.11.9`, existing face-service virtual environment and MediaPipe models |
| Hosting tier | Local workstation only for executed tests. Hosted Supabase/Render plan, region and compute limits **unknown**; no dashboard/deployment inventory access used. |
| Local API target | Temporary FastAPI server on `http://127.0.0.1:8000`, stopped after the single-job check |
| Supabase target | No verified staging target. `http://127.0.0.1:54321` health probe failed; Docker/Supabase CLI were unavailable. Application `.env.local` hosted project was not used. |
| Actual datasets | Algorithm-only: 500/1,000/5,000 synthetic spot objects. Replay-only: 91 independent mocked reservation/payment fixtures. Face: one 1280x720 synthetic no-face JPEG, 65,093 bytes. No Supabase fixture records created. |
| Prepared future API fixture | 50 synthetic users, 1,000 spots, 1,000 reviews, 5,000 completed reservation-history rows, 20 free reservable venues plus one paid venue, 20 tables per slot with guest capacities 2/4/6/10. **Not seeded or tested.** |
| Durations | Algorithms: ten warmups and 100 measured iterations per operation/size. Handler bursts: one paid event plus 20 retries per fixture. Face pipeline: 1.408 s including one-second polling wait. Initial map suite: CLI reported 2.7 min; focused retry: 44.657 s overall. |
| Planned API load durations | Ten-second baseline; 30-second 1-VU smoke; then 5/10/25/50 VUs, each with 60-second ramp and 180-second hold; 60-second recovery after every level. Approximately 21 min 40 s plus draining/audits, **not executed**. |

The latest full local collection contains 94 passing backend tests and eight passing suite tests. The final suite expanded to ten tests and all ten passed; use that final TAP, not a sum of repeated runs. Thus **94 existing backend tests and ten current suite tests passed**. Many backend tests assert source/SQL structure; only relevant handler tests execute the real TypeScript payment handlers under mocked adapters. These are not deployed integration results.

Evidence:

- [Primary summary](evidence/local-2026-10-07T21-09-58-459Z/summary.json), [raw algorithm observations](evidence/local-2026-10-07T21-09-58-459Z/algorithm-samples.jsonl), [raw signed-handler observations](evidence/local-2026-10-07T21-09-58-459Z/mock-replay-samples.jsonl).
- [Backend TAP](evidence/local-2026-10-07T21-09-58-459Z/backend-regression.tap), [final ten-test TAP](evidence/suite-final.tap), [measurement-time source hashes](evidence/local-2026-10-07T21-09-58-459Z/source-manifest.json), [final suite/source hashes](evidence/source-final.json).
- [Environment probes](evidence/prerequisites.json), [face HTTP observations](evidence/face-1791407815966.json), [post-check face process snapshot](evidence/face-server-snapshot.json).
- [Initial map observation](evidence/map-initial-observation.json), [initial error/source context](evidence/map-initial-error-context.md), [focused retry JSON](evidence/map-2026-10-07T21-18-36-512Z.json).

An earlier local preparation run exposed a syntax error in the new report writer. It was corrected and later self-tests passed. That failed preparation run is retained under `evidence/local-2026-10-07T20-50-47-434Z`; it is not application performance evidence. An older assessment present on entry lacked supporting raw results and included incorrect coverage claims, so its reported hosted measurements are not used here.

## Implemented system inspected

| Component | Actual implementation and implications for testing |
|---|---|
| User app | Expo Router/React Native routes in `app/`: Explore, spot details, submissions, saved/profile, reservations, checkout and confirmation. Expo 52, React Native 0.76.9, app version 1.0.3. Android package `com.cebspot.app`. |
| Owner/admin surfaces | `app/owner-dashboard.tsx`, owner-access flow, scoped owner auth, separate admin routes/studio, and a static owner portal under `public/owner-portal/` with `owner-portal-live.js`. These use Supabase directly; no separate general-purpose CebSpot REST server was found. |
| Authentication | `src/lib/supabase.ts` uses Supabase Auth with distinct app/admin/owner storage keys. Table access uses RLS; role/venue checks also appear in SQL and the authorization-hardening migration. Load VUs authenticate distinct synthetic normal users. Service-role privileges are restricted to setup/audit/cleanup. Deployed policy state was not verified. |
| Listings/pagination | `spotService.getSpots` selects `*`, `is_public=true`, newest first, up to 500 rows. Detail selects by ID. The suite includes that actual discovery query and a separately labeled two-page REST exercise. There is no implemented Explore server-pagination screen to claim tested. |
| Search/filters | `app/index.tsx` filters downloaded spots by case-insensitive trimmed name/address/category text, exact primary/secondary category, minimum rating and distance, then sorts by distance/rating/reviews/recency. Supported UI chips include All, Outdoor, Specialty Coffee, Social Dining, Street Food, Chill Vibe, High Pulse and Club. No search HTTP endpoint is called by this flow. |
| Recommendations | `src/utils/similarSpots.ts` ranks public candidates by category-label/word similarity, distance, rating, review count and recency; it excludes the current spot. It runs locally over downloaded candidates, not a recommendation RPC. |
| Categorized submissions/media | `app/submit-spot.tsx` selects one or more categories from the submission category set, up to five assets, videos up to 15 s/25 MiB. `spotSubmissionService` uploads into `spot-images/<user>/...`, stores media URLs in `spot_submissions.images`, inserts primary/secondary categories, logs activity and calls `publish_spot_submission_local_update` with a legacy fallback. Successful submission is pending review. |
| Submission processing | Photos are resized/compressed and sent through face anonymization before Storage upload; native videos bypass face processing. Local draft/queue state and native notifications use device APIs. Grouped local updates/votes do not provide create-request idempotency. No unique content/request key for submission creates was found. |
| Reservation creation | `reservationService` inserts into `reservations`, with schema-gap fallback, then logs activity. The current hardening migration validates public/reservable venue, future/current date, real `sunset/prime/late` slot, configured table and guest capacity, derives price/status from the venue and requires deposit terms when paid. Free initial state is `pending/not_required`; paid is `pending_payment/pending`. This migration is present locally; its deployment is unverified. |
| Capacity/conflicts | Partial unique index on `(spot_id,reservation_date,slot_id,table_id)` for active states. `cancelled/completed/no_show` release that tuple. A table with four seats permits **one active reservation**, not four bookings. `check_reservation_slot_available` and `get_reserved_table_ids` use these states. Availability also expires old PayMongo pending checkouts, so it is not a pure read-only query. |
| Booking changes | User cancellation/rescheduling RPCs implement free self-service rules; unpaid voiding and owner paid approval/attendance have separate RPCs. The load workload does not fake these transitions or mark unpaid rows paid. Realtime subscriptions exist and trigger refetches; fan-out/socket behavior is not part of this HTTP suite. |
| Payments/functions | Source exists for `paymongo-create-gcash-checkout`, `paymongo-create-qrph-checkout`, `paymongo-webhook` and `provision-owner-account`. Checkout/webhook handlers use service clients behind user/signature checks; payment rows have provider-reference and pending-attempt uniqueness rules. GCash pending checkout reuse/provider idempotency and QR Ph replacement attempts differ. Webhook accepts signed test/live events, guards stale/tampered callbacks and protects terminal states. Source presence is not proof of deployed function/version availability. |
| Face service | FastAPI with local dual-range MediaPipe models, in-memory jobs, one-second client polling, five-minute client job timeout and JPEG results; `render.yaml` describes a Docker deployment but not its actual tier. The per-process detector lock and in-memory job registry are source-level scaling considerations. Only one local no-face job was executed. |
| Maps | Bundled Leaflet in native WebView/web iframe; external tile services are dependencies. Browser regression requests were fully intercepted. No public tile traffic or map-provider capacity measurement was generated. |
| Existing tooling | Node backend tests/payment adapter; Playwright map tests; readiness/auth/payment scripts; existing performance scripts reviewed and replaced. Readiness/payment scripts loading live application config were not blindly executed. |

## Results against provisional API targets

No established numerical API targets were found in the inspected repository documentation. The requested p95/failure/recovery values are therefore **provisional**. They measure API behavior, not complete screen-loading time. Booking correctness remains a separate criterion.

| Operation | Planned concurrency | Measured request count | p95 | p99 | Unexpected failure rate | Provisional target | Status |
|---|---|---:|---|---|---|---|---|
| Public discovery/list pages | 1, 5, 10, 25, 50 | 0 | — | — | — | p95 < 2 s; failures < 1% | NOT TESTED |
| Spot detail/review retrieval | 1, 5, 10, 25, 50 | 0 | — | — | — | detail p95 < 2 s; failures < 1% | NOT TESTED |
| Search/filter/recommendation data retrieval | 1, 5, 10, 25, 50 | 0 | — | — | — | Actual discovery API < 2 s; local processing separate | NOT TESTED |
| Availability RPC | 1, 5, 10, 25, 50 | 0 | — | — | — | p95 < 3 s; failures < 1% | NOT TESTED |
| Reservation creation/record verification | 1, 5, 10, 25, 50 | 0 | — | — | — | create p95 < 3 s; zero overbooking | NOT TESTED |
| Photo/video upload and categorized submission | 1, 5, 10, 25, 50 | 0 | — | — | — | Correct persisted content; failures < 1%; latency exploratory | NOT TESTED |
| Distinct-user constrained booking race | 10 users, 3 rounds | 0 | — | — | — | Exactly one winner per empty table/slot; rejected IDs absent | NOT TESTED |
| API recovery after load reduction | One probe user | 0 | — | — | — | Baseline thresholds within 60 s | NOT TESTED |

Supabase load requests/RPS: **0 requests; achieved RPS not applicable**. Successful real bookings, expected real conflicts, booking integrity violations and API timeouts are **unmeasured**, not assumed zero.

## Executed local algorithm results

These observations run the actual source algorithms on desktop Node, with 100 measured calls per row and zero HTTP requests. The 5,000-object case is a scalability experiment beyond the app's current 500-row discovery limit. PASS below means output validation passed; no Android or API latency target is applied.

| Operation | Synthetic spots | Concurrency | Calls | Avg ms | Median ms | p95 ms | p99 ms | Validation failure rate | Target/status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Search/filter | 500 | 1 | 100 | 1.51 | 0.85 | 4.63 | 12.45 | 0% | Content checks PASS; performance INCONCLUSIVE |
| Recommendation rank | 500 | 1 | 100 | 16.86 | 13.83 | 32.60 | 38.50 | 0% | Content checks PASS; performance INCONCLUSIVE |
| Search/filter | 1,000 | 1 | 100 | 1.64 | 1.24 | 4.08 | 6.81 | 0% | Content checks PASS; performance INCONCLUSIVE |
| Recommendation rank | 1,000 | 1 | 100 | 24.67 | 21.64 | 44.60 | 58.35 | 0% | Content checks PASS; performance INCONCLUSIVE |
| Search/filter | 5,000 | 1 | 100 | 19.97 | 13.37 | 62.08 | 89.28 | 0% | Content checks PASS; performance INCONCLUSIVE |
| Recommendation rank | 5,000 | 1 | 100 | 167.23 | 152.30 | 294.34 | 387.99 | 0% | Content checks PASS; performance INCONCLUSIVE |

The shared-host timings varied across retained runs; they are not averaged or selected for fastest values. The latest full measurement run is reported. Sorting/filter/ranking cost grows with candidate count, but this does not identify a server bottleneck or establish a phone's frame budget.

## Mocked payment retry observations

Each fixture receives one signed paid event plus 20 retries. All **1,911 handler invocations** returned HTTP-style status 200 in the local adapter; these are function calls, not network requests. There were zero duplicate payment/reservation rows and zero incorrect final amount/status observations. However, **all 91 fixtures changed the original `paid_at` on replay**. Strict audit-field idempotency is FAIL. This is not evidence that users were charged twice.

| Mocked concurrency | Handler calls | Avg ms | Median ms | p95 ms | p99 ms | Unexpected failure rate | Duplicate rows/final state | First-payment timestamp |
|---:|---:|---:|---:|---:|---:|---:|---|---|
| 1 | 21 | 44.49 | 6.08 | 11.38 | 798.81 | 0% | PASS | FAIL, 1/1 rewritten |
| 5 | 105 | 40.25 | 11.09 | 20.09 | 870.76 | 0% | PASS | FAIL, 5/5 rewritten |
| 10 | 210 | 59.99 | 20.41 | 43.04 | 1,184.65 | 0% | PASS | FAIL, 10/10 rewritten |
| 25 | 525 | 154.00 | 73.83 | 141.73 | 2,475.55 | 0% | PASS | FAIL, 25/25 rewritten |
| 50 | 1,050 | 672.20 | 229.46 | 2,420.53 | 6,057.02 | 0% | PASS | FAIL, 50/50 rewritten |

Burst durations were 0.993/1.479/1.904/4.633/17.437 s. Achieved **handler calls/s**, including fixture/transpilation overhead, were 21.14/71.01/110.32/113.31/60.22. These are not API RPS and must not be compared with API p95 targets. Initial calls include TypeScript compilation/VM setup and scheduling delay; high-concurrency elapsed times primarily describe this single Node process and its mocked adapters. There was no real PayMongo request, charge, receipt or callback deployment test.

The source explanation is specific: `_shared/paymongo.ts` assigns `paid_at` to the current timestamp whenever a paid payment row is upserted, and repeated paid webhook events reach that upsert. No source change was made. A proposed fix is to preserve the first successful payment timestamp and add a dedicated regression expectation, then verify transaction/retry behavior against real isolated Postgres constraints.

## Face pipeline and browser observations

The local face pipeline passed: four real loopback HTTP requests, 1.408 s end to end (including poll pacing), approximately **2.84 achieved requests/s for this single small check**. Server-reported processing was 202 ms, with zero faces detected. A JPEG result of 67,357 bytes passed the signature/size validation. This measures a synthetic no-face pipeline, not detector accuracy or load capacity.

| Face operation | Concurrency | Requests | Observed/average/median ms | p95 ms | p99 ms | Unexpected failure rate | Target/status |
|---|---:|---:|---:|---:|---:|---:|---|
| Health | 1 | 1 | 286.76 | 286.76 | 286.76 | 0% | Content PASS; latency INCONCLUSIVE, n=1 |
| Job create | 1 | 1 | 35.26 | 35.26 | 35.26 | 0% | Content PASS; latency INCONCLUSIVE, n=1 |
| Job poll | 1 | 1 | 23.78 | 23.78 | 23.78 | 0% | Content PASS; latency INCONCLUSIVE, n=1 |
| JPEG result | 1 | 1 | 36.89 | 36.89 | 36.89 | 0% | Content PASS; latency INCONCLUSIVE, n=1 |

Nearest-rank p95/p99 with one observation equal that observation and have no capacity significance. No timeouts occurred in these four requests. An accessible **post-check**, not peak-load, face-process snapshot recorded 8.281 cumulative CPU seconds, 35.977 MiB working set and 403.367 MiB private memory. Startup/model-loading CPU is included. No sustained server utilization, database utilization or resource-exhaustion evidence was available.

The existing map bundle check passed. The initial desktop browser suite passed 10/11 tests; the intermediate-selection assertion failed. A focused rerun failed at the same assertion: expected latitude `<10.331`, received `10.33100536729993`. The target has effectively been reached with map pixel rounding by the time of sampling. The reason is **not established**: delayed sampling on this host, early animation completion, or rounding-sensitive assertions are hypotheses. No production map logic or assertion was altered to obtain a pass. Browser behavioral regression status is FAIL; physical Android smoothness remains NOT TESTED.

## Criterion decisions

| Criterion | Decision | Evidence and limits |
|---|---|---|
| Listing/search-data/detail API p95 < 2 s | NOT TESTED | No isolated Supabase target running; local algorithms are not API results. |
| Availability/create p95 < 3 s | NOT TESTED | No actual availability/booking load requests. |
| Unexpected API failures < 1% | NOT TESTED | Zero API load observations cannot demonstrate a failure rate. |
| Zero overbooking/conflict consistency | NOT TESTED | Real distinct-user race/audit implemented but blocked. Index/source inspection is not concurrency proof. |
| Duplicate booking-request effects | NOT TESTED | Replay scenario ready; no real database result. |
| Mocked payment row/amount/final-status repeat handling | PASS, scoped | 1,911 local handler invocations; no duplicate rows or incorrect final states in 91 mocked fixtures. |
| Payment first-success audit timestamp idempotency | FAIL, scoped | Original `paid_at` changed in 91/91 mocked fixtures. |
| Zero deployed duplicate payment effects | INCONCLUSIVE | In-memory success does not establish real constraint/transaction/provider effects; timestamp defect also remains. |
| Category/photo/video submission correctness under load | NOT TESTED | Authenticated scenario prepared; MP4 and isolated backend missing. |
| Repeated spot submissions | NOT TESTED | Exact-content two-create probe ready; API exposes no content/request idempotency guarantee. |
| Recovery to baseline within 60 s | NOT TESTED | No API load/reduction cycle executed. |
| Local client algorithm output checks | PASS, scoped | 600 measured calls plus final tests of secondary category/address/rating/distance and public-only recommendations. |
| Single local face-image pipeline | PASS, scoped | One no-face job; four HTTP calls; does not establish face accuracy or high-volume behavior. |
| Browser map behavior regression | FAIL | 10/11 initial tests; failed intermediate-selection test also failed focused retry. |
| Physical Android crashes/freezes, memory and frames | NOT TESTED | adb exists in SDK; device list empty. Exact procedure in ANDROID.md. |
| Overall capstone Performance and Reliability | INCONCLUSIVE | API load, booking correctness, recovery and device performance remain unmeasured; scoped defects are reported separately. |

**Highest tested load meeting all applicable targets: none established.** No API smoke or 5/10/25/50 load level ran. Mocked 50-fixture replay concurrency is not a supported 50-user backend claim. No stress breakpoint was observed or sought; maximum capacity is unknown.

## Blockers, proposed work and limitations

1. **Complete isolated API execution:** install/start a Docker-compatible runtime and Supabase CLI, start the separate generated stack successfully, privately fill local `PERF_ANON_KEY` and `PERF_SERVICE_ROLE_KEY`, then seed/preflight/load/race. Alternatively identify and configure an empty dedicated staging project with outbound hooks disabled. The user was asked which environment to use; no staging identity was supplied. The current load command stops with `Missing PERF_ANON_KEY`; there is also no local service on port 54321. A final `wsl.exe --list --quiet` check reported that Windows Subsystem for Linux is not installed, so no existing WSL container environment was found. SQL snapshots are prepared, not startup-validated. No RLS/business rules were disabled.
2. **Finish media coverage:** ffmpeg is absent; generated JPEG exists but synthetic MP4 does not. Install ffmpeg or supply a synthetic ≤15-second, ≤25-MiB MP4. No real people's media is necessary. Native selecting, queue retries, partial-upload cleanup and video playback need separate device checks.
3. **Fix payment audit-field replay behavior separately:** preserve first `paid_at`; verify duplicate/out-of-order/failure retry semantics against real local/staging database constraints. The existing adapter cannot model transaction isolation or cross-process race effects. No business logic or production infrastructure was changed here.
4. **Investigate browser intermediate-motion failure:** inspect browser-side animation timestamps/trace and pixel precision before changing the test or renderer. A host-side fixed sleep is not reliable frame sampling. Do not treat this failure alone as proof that Android animation freezes.
5. **Profile candidate ranking and the actual phone:** latest desktop p95 ranking increased from 32.60 ms at 500 candidates to 294.34 ms at 5,000. Precomputing category metadata or caching distance work are hypotheses for optimization; measure on a physical phone before deciding. [ANDROID.md](ANDROID.md) specifies build/device metadata, repeated interactions, frame statistics, memory, thermal conditions, crashes and ANRs.
6. **Add correlated backend monitoring for the load run:** record the actual hosting plan/compute limits, API/storage/Postgres CPU and memory, connection/wait/slow-query metrics and quotas. Current source-level possibilities include 500 full-row discovery payloads, refetches from realtime fan-out, side-effecting availability expiry work, and serialized face inference. None is an established deployed bottleneck from these results.

A single closed-loop generator may reduce achieved RPS when responses slow, hiding unmet demand. CPU scheduling, garbage collection, TypeScript/VM initialization, browser instrumentation and other host processes distorted local timing comparisons. No arrival-rate/distributed load or long-duration soak ran. API history fixtures use terminal synthetic rows, not an organic production data distribution. Media in load tests is already processed, external payment responses are mocked, external tile requests intercepted, and no customer notifications are generated. Android, external sandbox payments, owner-function deployment, realtime fan-out, sustained server resources and database metrics remain outside measured coverage.

Only the temporary loopback face server and its generated processing files required runtime cleanup; the server was stopped and its test temp directory had no residual files. Synthetic JPEG/local configuration/schema snapshots remain as intended test artifacts, privately ignored. No hosted records were created, changed or deleted. Existing unrelated workspace changes remain intact.

## Capstone-ready paragraph

On 8 October 2026, CebSpot passed 94 existing backend regression tests and ten performance-suite validation tests. Local testing of the actual client search/filter and recommendation algorithms completed 600 measured calls over synthetic datasets of 500 to 5,000 spots with no content-validation failures. In 1,911 signed payment-handler invocations using isolated mocked adapters, no duplicate payment rows or incorrect final payment states were observed, but repeated paid events changed the original payment timestamp in all 91 fixtures. One local face-processing job completed successfully, while one of eleven browser map tests failed and failed again on focused rerun. Deployed API latency, supported concurrent-user load, reservation overbooking protection under real database concurrency, recovery time and physical Android performance remain unverified; therefore the overall Performance and Reliability requirement is inconclusive pending isolated backend and device testing.

These findings do **not** prove Security, Data Privacy, Usability, Compatibility or long-term availability.
