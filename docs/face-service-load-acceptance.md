# Face service load and recovery acceptance

The client performs a warm-up `GET /health` with a 15-second request timeout and bounded retries for up to 90 seconds. Cold-start timeout should show the existing retryable privacy-processing message and must never upload the original image. Android job creation reuses one `X-Idempotency-Key` across retries; the service maps it to the accepted job for the authenticated user and returns that job without reading another upload. The mapping is process-local and is cleared with the job. A restart clears unfinished jobs and their files, so a subsequent retry is safe after restart cleanup.

Local service security tests cover same-key replay, missing-key denial, failed-worker cleanup and one-worker enforcement. A client cold-start end-to-end test and an actual Android interruption/recovery test remain required before accepting this behavior.

The service assumes one Uvicorn worker, one replica and disabled autoscaling. Job state and idempotency are in process memory; multiple replicas or worker processes are unsafe without shared admission/job storage. `render.yaml` does not pin a memory tier. Capture the selected plan’s RAM/CPU/disk limits, measure peak memory with both models loaded and a maximum-size synthetic image, and run a queue saturation test before launch.

Capacity acceptance should record queue depth, request p50/p95, health wake time, 429/5xx rates, processing timeout count, peak RSS, temporary disk use, job cleanup delay and recovery after process restart. Test ramp, spike, soak and restart recovery only with synthetic no-face fixtures.
