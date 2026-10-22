# Reproducible CebSpot performance and reliability tests

Read [the assessment](ASSESSMENT.md) for actual findings. This suite deliberately does **not** inherit `.env.local` or `.env.test.local`. An earlier script targeted the app's hosted backend by default; that path has been replaced. Historical figures without retained raw evidence are not used.

## What this tests

- Real Supabase REST requests: the app's 500-row public discovery query, details, reviews, own reservations, actual availability RPCs, and authenticated reservation inserts.
- Two 20-row REST pages as a backend pagination exercise. Explore currently fetches up to 500 spots at once; it has no server-page UI.
- Actual discovery search/filter code extracted from `app/index.tsx` and actual `rankSimilarSpots` utility. These run on the client. No invented search/recommendations API is used.
- Real authenticated Storage photo/video uploads, byte-for-byte downloads, categorized submission inserts, record verification, activity publishing and grouped submission RPC. The load fixture photo has already been processed and contains no faces. Face processing is measured separately.
- Booking races with distinct authenticated users and a real configured table/slot, privileged **read-only** audit of resulting records, rejected-ID checks, replay checks and cross-user visibility checks.
- Actual payment handler source under the existing in-memory database/provider adapters, with signed duplicate events. This is separate from deployed HTTP load and does not demonstrate database transactions, RLS, provider settlement, or charging behavior.

Node 22's built-in HTTP client is the k6 equivalent here because Node and TypeScript are already installed and the existing handler test adapter uses them; k6 is absent. The runner implements closed-loop VUs, pacing, common stage end times, staged ramps, operation metrics and stop rules. It is a single-process generator, not distributed capacity testing.

## Run what requires no backend

From the repository root:

```powershell
node tests/performance/isolated/prerequisites.cjs
node tests/performance/isolated/local-evidence.cjs
```

The second command saves backend regression TAP, suite self-test TAP, raw algorithm/replay samples, source SHA-256 hashes and a sanitized JSON summary in a timestamped `evidence/local-*` folder. Microbenchmarks warm up 10 times, then measure 100 iterations at 500, 1,000 and 5,000 synthetic spots. Replay bursts use 1, 5, 10, 25 and 50 independent mocked fixtures, one initial signed event and 20 sequential retries per fixture. Those are short **mocked handler bursts**, not the required API load levels.

The command exits nonzero if the payment replay audit finds a defect, while retaining all evidence. At present it detects that repeated paid events rewrite `paid_at`; a nonzero exit with passing regression/self-tests is therefore an application finding, not a prerequisite failure.

## Prepare an isolated backend

The supplied environment has no Docker/Supabase executable or running local stack. A separate generated local project is already under `tests/performance/local-stack/`; it is ignored by Git. To recreate it in a new checkout:

```powershell
node tests/performance/isolated/prepare-local.cjs
```

This copies unchanged current repository SQL into a separate project, including the base schema, submission grouping, review interactions, attendance, admin dashboard, identity cutover and authorization-hardening migration. Snapshot hashes are retained alongside it. It does not reset, link, push to, or modify the app's project. SQL startup is **NOT TESTED** until a real stack starts successfully. The root `supabase/config.toml` is not a complete local-stack definition, and the few timestamped migrations alone are not a complete fresh database schema.

Install and start Docker Desktop with a functioning container backend and install the Supabase CLI using the [official Windows setup](https://supabase.com/docs/guides/local-development/cli/getting-started). Then:

```powershell
Push-Location tests/performance/local-stack
supabase start
Pop-Location
Copy-Item tests/performance/perf.env.example .env.perf.local  # only when this file does not already exist
```

Privately fill in `PERF_ANON_KEY` and `PERF_SERVICE_ROLE_KEY` from this local stack's configuration. Do not copy production keys or paste command output containing keys into reports. The generated stack disables edge runtime, uses local mail capture and does not configure external notification/payment transports. Review SQL startup errors without weakening policies. Supabase requires a Docker-compatible runtime on this Windows host; see [local-development prerequisites](https://supabase.com/docs/guides/local-development).

For staging, use an **empty dedicated test project**, verify outbound hooks/notifications are disabled, apply the reviewed repository schema/migrations, and explicitly set:

```text
PERF_ENVIRONMENT=staging
PERF_SUPABASE_URL=https://YOUR-ISOLATED-PROJECT.supabase.co
PERF_ALLOWED_ORIGIN=https://YOUR-ISOLATED-PROJECT.supabase.co
PERF_ISOLATED_ACK=yes
PERF_HOSTING_TIER=<actual plan, region, compute size and limits>
```

Put its keys in environment variables or `.env.perf.local`. `PERF_ENV_FILE` can select another private file. The runner requires an exact hosted-origin acknowledgement, distinct fixture users with role `user`, a fixture-only spot/submission dataset, and unchanged RLS. Setting an acknowledgement is an operator assertion, not automatic proof that a cloud project is staging. Never identify a live project as staging to bypass this gate.

Service-role access is used only for fixture setup, audits and exact-run cleanup. All measured user operations use anonymous access or password-authenticated synthetic user tokens. Credentials and sessions are never included in evidence. Setup accounts use confirmed synthetic `@example.test` identities through the admin API, which does not send signup email. A disposable account pool is created per fixture run; unrelated users are not reused or removed.

## Prepare photo and video fixtures

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/performance/isolated/make-media.ps1
```

This uses a process-only script-policy setting, generates a 1280x720 no-face JPEG, and, when ffmpeg is installed, a five-second 1280x720 H.264 MP4. ffmpeg was unavailable during this run: JPEG exists; MP4 is **not prepared**. Install ffmpeg and rerun, or supply an equivalent synthetic MP4. Do not use personal photos or videos. Configure `PERF_PHOTO_PATH`, `PERF_VIDEO_PATH` and `PERF_SYNTHETIC_MEDIA_ACK=yes`. The app supports up to five assets, video duration up to 15 seconds and video size up to 25 MiB; the load journey uses one JPEG and one MP4.

Missing media disables submission journeys and is explicitly recorded as missing coverage; read/booking load can still run. Media upload/download latency is exploratory because no established media target was found. Client picking, resizing, queue behavior, native notifications and video playback need separate device measurements.

## Seed, verify and run

```powershell
node tests/performance/isolated/fixtures.cjs setup
node tests/performance/isolated/preflight.cjs
node tests/performance/run-suite.cjs
node tests/performance/concurrency-booking.cjs
```

Default fixture: 50 distinct users; 1,000 public synthetic spots; 1,000 reviews; 5,000 terminal synthetic reservation-history rows; 20 free reservable venues and one paid venue; 20 tables per slot, with capacities 2/4/6/10; real `sunset`, `prime`, `late` slot IDs. Fixture history is inserted under normal database constraints then marked completed with setup privileges; measured VUs have no such privileges. Routine load creates free reservations only. Paid checkout/webhook logic is covered by mocked handler tests, not fake paid updates to the backend.

Table capacity means guests per booking; the active-slot unique index allows **one booking per venue/date/slot/table**, irrespective of seat capacity. The normal load allocates distinct configured table/date combinations. The race deliberately targets one empty table with different users (10 users, three rounds by default), requires exactly one winner, checks stored winners and absent rejected attempts, validates availability and reserved-table RPCs, then replays a successful create. No fallback synthetic slot IDs are allowed. It stops immediately on an integrity problem or unexpected race error.

Identical-content spot submissions have no idempotency key in the current API. A separate two-create probe records whether both rows are accepted; it does not mislabel that observation as a duplicate booking. Submission grouping is a community-feed behavior, not request-level deduplication. This probe uses no media; media retry/queue semantics remain a separate device concern.

An invocation starts with 10 seconds of baseline probes and a 1-VU smoke hold (30 seconds), then tests 5, 10, 25 and 50 VUs. Each load level ramps from a single arriving user to its target over 60 seconds, holds for 180 seconds, then reduces to one probe user for 60 seconds of recovery. Approximate planned duration is **21 minutes 40 seconds**, plus bounded in-flight draining and setup/audits. These are **load tests**, not demonstrated stress breakpoints. Levels beyond 50 require `PERF_BREAKPOINT_ACK=yes` and a reviewed resource budget; the hard limit is 200 VUs.

All durations, pacing and levels are configurable in `perf.env.example`. To do just an initial smoke run on fresh fixtures:

```powershell
$env:PERF_VU_LEVELS='1'
node tests/performance/run-suite.cjs
Remove-Item Env:PERF_VU_LEVELS
```

A fixture run cannot start the same load or race twice, even after interruption: clean it up and prepare a fresh manifest. The default manifest path is `tests/performance/.private/manifest.json`. To keep private journals for several fixture runs, set `PERF_MANIFEST` to a new private path before setup. Do not delete or overwrite an existing manifest until its cleanup/audit is resolved.

## Metrics, thresholds and stopping

Sanitized `requests.jsonl` records operation, elapsed response-body time, phase, VUs, HTTP status, bytes, timeout, validation outcome and expected conflict. It contains no payload, email, password, token, request URL, raw error message or payment secret. Summary JSON retains request counts, actual RPS, average/median/p95/p99, unexpected failures, timeouts, expected conflicts, successful creates, recovery and generator telemetry. Total HTTP figures include measured journey, audit and recovery traffic, and exclude fixture setup and session setup/refresh; per-level RPS explicitly uses actual wall time including draining. Percentiles use nearest rank. At least 20 samples are required for a latency row to be called PASS; low sample counts are INCONCLUSIVE, and p99 remains uncertain at small n.

Provisional targets:

- Listing/detail p95 < 2,000 ms. Search/recommendations use the discovery data and local source functions; there is no separate search API to apply a fabricated latency to.
- Availability/create p95 < 3,000 ms.
- Unexpected failures < 1%, including invalid response content. Expected unique-slot conflicts are separate.
- Zero overbooking and duplicate booking/payment effects; correctness is assessed independently of latency.
- Recovery within 60 seconds: three consecutive probe cycles must satisfy listing, detail and availability content checks and latency thresholds. Each operation's threshold is the smaller of its provisional target and 120% of baseline p95 (250 ms floor). Recovery does not exercise new reservation creation; that remains a limitation.

Per-request timeout defaults to 15 seconds. Automatic stopping occurs on integrity failures, unavailable integrity audits, exhausted write budgets, HTTP 429/507, sustained rolling failures >5% (at least 20 observations and three successive five-second checks), generator RSS >1 GiB, or event-loop p99 >500 ms. A level failing latency or <1% failure targets stops escalation. Recovery probes still run after stopping; no later load level runs. Aborted/incomplete observations remain evidence, never a PASS.

Generator telemetry samples Node RSS/heap, CPU relative to one logical core, event-loop delay and in-flight journeys every five seconds. Host CPU model and memory are recorded for local benchmarks. This is **not server telemetry**. To collect accessible local server evidence during a future run:

```powershell
docker stats --no-stream --format '{{json .}}'  # sample every 5 seconds in a separate terminal
```

Capture timestamped samples for API/auth/storage/Postgres containers. Record Docker CPU/memory limits, database connections, locks/waits, slow queries and query plans using read-only local database access. On staging, export Supabase CPU/memory, connections, query latency, storage/edge error and quota metrics for the same UTC interval. Redact query text and identifiers before committing. No remote telemetry access or tier was available in this run. Resource exhaustion cannot be diagnosed from generator CPU alone.

## Optional face and PayMongo integration

On a local Python environment with `face-blur-service/requirements.txt` installed, provision the model files described in [its README](../../face-blur-service/README.md), start the service on loopback, and configure `PERF_FACE_URL` and `PERF_FACE_ISOLATED_ACK=yes`. For a hosted test service, additionally confirm `PERF_FACE_ALLOWED_ORIGIN`. Then:

```powershell
node tests/performance/isolated/face-check.cjs
```

This runs one no-face synthetic JPEG job: health, job creation, bounded polling and JPEG download. Request timeouts are 20 seconds, job deadline five minutes. It tests pipeline behavior, not anonymization accuracy or privacy. No repeated external face traffic is part of API load. The existing Python 3.11 virtual environment and both MediaPipe models were eventually found; Python required execution outside the sandbox. One loopback job passed and its temporary server was stopped. See the assessment for the four actual HTTP timings.

No PayMongo calls are made by this suite. Existing sandbox scripts can create hosted checkout/payment state and load application configuration; they are intentionally not run automatically. A separate small integration check requires a confirmed isolated functions deployment, test-only provider credentials, test webhook signing secret and an approved synthetic pending reservation. Keep it to one checkout and one signed test callback, verify sandbox mode and unchanged booking identity/amount, and clean its exact fixture IDs. Do not use live credentials, generate real payments or dispatch receipts. High-volume retries use `local-evidence.cjs` only.

## Reports and exact-run cleanup

The API runner writes a `summary.json`, `requests.jsonl` and conservative `report.md`. The race writes matching `*-race.json`. Generate a combined report with explicit matching paths:

```powershell
node tests/performance/report-generator.cjs <path-to-summary.json> <path-to-matching-race.json>
node tests/performance/isolated/fixtures.cjs cleanup
```

Cleanup deletes only journaled UUIDs and user/run-scoped object paths, plus grouped feed records whose source IDs are exactly this run's submissions. It preserves the private journal. If setup is interrupted during account creation after the server commits but before its response is received, an account may not be journaled; inspect admin auth users for this exact run's synthetic email identities before manual removal. No blanket name/date cleanup or schema reset is provided. No remote fixture records were created during this session, so no remote cleanup was necessary.

Keep `.env.perf.local`, `.private/`, generated local-stack data and raw Android traces out of version control. Sanitized `evidence/` is intentionally reviewable. Exact working source hashes are retained because the workspace had unrelated uncommitted changes. See [Android collection instructions](ANDROID.md). API measurements do not equal complete screen-loading times and do not establish Security, Data Privacy, Usability, Compatibility or long-term availability.

Run `node tests/performance/isolated/sanitize-evidence.cjs` before sharing evidence. It checks exact configured credential values without printing them and redacts matches. It does not load those credentials into a network client. To retain browser fixture evidence separately, use `node tests/performance/isolated/browser-evidence.cjs` (all tests) or append a test-name filter; all tile requests remain intercepted.
