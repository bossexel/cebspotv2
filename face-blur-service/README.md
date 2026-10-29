# CebSpot Face Anonymizer

FastAPI service that receives a temporary user-selected image, detects human faces with MediaPipe Face Detector, blurs every detected face with OpenCV Gaussian blur, returns the anonymized image, and deletes temporary files.

The current pipeline outputs JPEGs capped at 1280 px / 320 KiB, uses oval head masks and a minimum 0.70 detection confidence, and validates Supabase credentials at startup. See [the media/feed release notes](../docs/media-feed-fixes-2026-10-25.md) for rollout steps, client compression and validation limits.

The intended flow is:

```text
Expo ImagePicker
-> POST /api/anonymize-jobs
-> poll job status
-> MediaPipe Face Detector
-> OpenCV Gaussian blur
-> download anonymized job result
-> anonymized image response
-> Supabase Storage spot-images bucket
```

The original image must never be uploaded to Supabase Storage.

## Requirements

- Python 3.11
- FastAPI
- MediaPipe
- OpenCV
- NumPy
- MediaPipe Tasks BlazeFace short-range and full-range TFLite models

This service performs face detection only. It does not identify people, compare identities, generate embeddings, or store biometric templates.

## Model File

Use both public MediaPipe face detection models:

```text
blaze_face_short_range.tflite
blaze_face_full_range.tflite
```

Official MediaPipe model URL:

```text
https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite
https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/latest/blaze_face_full_range.tflite
```

Expected local path:

```text
face-blur-service/models/blaze_face_short_range.tflite
face-blur-service/models/blaze_face_full_range.tflite
```

If you store the model elsewhere, set:

```env
MEDIAPIPE_FACE_SHORT_MODEL_PATH=/absolute/path/to/blaze_face_short_range.tflite
MEDIAPIPE_FACE_FULL_MODEL_PATH=/absolute/path/to/blaze_face_full_range.tflite
```

Model files are intentionally ignored by Git.

## Install

### Windows Git Bash

```bash
cd ~/Downloads/cebspotv3/face-blur-service
cp .env.example .env
python -m venv venv
source venv/Scripts/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### Windows PowerShell

```powershell
cd C:\Users\9real\Downloads\cebspotv3\face-blur-service
copy .env.example .env
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### WSL2 / Ubuntu

```bash
cd ~/Downloads/cebspotv3/face-blur-service
cp .env.example .env
python3.11 -m venv venv
source venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

## Download The Model

From `face-blur-service`:

```bash
mkdir -p models
curl -L https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite \
  -o models/blaze_face_short_range.tflite
curl -L https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/latest/blaze_face_full_range.tflite \
  -o models/blaze_face_full_range.tflite
```

If `curl` is unavailable, download the URL in a browser and place the file in `models/`.

## Run

```bash
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

## Expo Configuration

Set this in the Expo app environment:

```env
EXPO_PUBLIC_FACE_BLUR_API_URL=http://YOUR_COMPUTER_LAN_IP:8000
```

Do not hardcode this in application code. On a physical phone, `localhost` means the phone itself, not your laptop.

For Android emulator:

```env
EXPO_PUBLIC_FACE_BLUR_API_URL=http://10.0.2.2:8000
```

Published EAS builds must use the public HTTPS URL of the deployed service. CebSpot intentionally rejects HTTP and private-LAN face-blur URLs in release builds, because those addresses cannot reliably serve installed applications.

Configure the same variable in the Expo project environment used by the build:

```text
EXPO_PUBLIC_FACE_BLUR_API_URL=https://your-deployed-service.example.com
```

After changing a public Expo environment variable, create a new preview or production build so the bundled application receives it.

## Deploy With Render

The repository root contains `render.yaml`, and this service contains a production `Dockerfile`. The Docker build downloads and checksum-verifies both public MediaPipe models, while `.dockerignore` keeps the local virtual environment, temporary images, and local model copies out of the build context.

1. Use an isolated staging Render service; production deployment is outside this remediation run.
2. Use the face service configuration in the root `render.yaml`, retaining the existing admin service.
3. Set server-only `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the same isolated Auth project as Android. Set `FACE_BLUR_ALLOWED_ORIGINS` explicitly for any retained admin origin.
4. Wait for `/health` to pass, then copy the generated HTTPS service URL.
5. Set that URL as `EXPO_PUBLIC_FACE_BLUR_API_URL` for the isolated staging preview build.
6. Rebuild the Android app.

The container binds to Render's `PORT` value. Run exactly **one Uvicorn worker and one Render replica**, with autoscaling disabled. A filesystem lock rejects a second worker on the same instance. Admission and ownership state are in memory; multiple replicas require shared admission/job storage first. A restart removes abandoned job files; the Android client may retry lost jobs.

## Health Check

```bash
curl http://localhost:8000/health
```

Expected:

```json
{"status":"ok","service":"cebspot-face-anonymizer"}
```

## Upload Test

```bash
curl -X POST http://localhost:8000/api/anonymize-jobs \
  -H "Authorization: Bearer $STAGING_ACCESS_TOKEN" \
  -F "image=@synthetic-test.png"
```

Expo mobile uploads use the asynchronous job endpoint below. It stores the original only in the private temporary directory and responds as soon as the upload is validated:

```text
POST /api/anonymize-jobs
Content-Type: multipart/form-data
Authorization: Bearer <customer access token>
Field: image
```

Example response:

```json
{
  "job_id": "random-job-id",
  "status": "queued"
}
```

Poll and download with:

```text
GET /api/anonymize-jobs/{job_id}
GET /api/anonymize-jobs/{job_id}/result
```

Completed job status includes:

```text
faces_detected
processing_time_ms
```

Polling and download require the same authenticated customer. Another customer receives 404, and anonymous requests receive 401 before reading an upload. The legacy `/api/anonymize`, `/api/anonymize-upload` and `/api/anonymize-base64` endpoints return 410 after authentication. Completed and failed jobs expire after 15 minutes (swept every 10 seconds).

Android first wakes the service through `GET /health`, with bounded retries over a 90-second cold-start window. A failed wake produces a recoverable user-facing message and does not upload the original image. Each job-creation POST carries an `X-Idempotency-Key`; retries of the same request reuse that key. The server scopes keys to the authenticated user and returns the already accepted job without reading or enqueueing a second upload. Keys are retained with the job in process memory and removed with it. After a process restart, abandoned job directories are removed and a retry may create a new job because no prior job remains accepted.

Admission happens before multipart parsing: at most 2 pending jobs per user, 10 uploads per user per minute, a queue of 16, 1 processing child and 32 retained jobs. Rate tracking is capped at 1024 active users. Exhaustion returns 429 with `Retry-After: 60`; Auth verification has 8 bounded network slots and returns `Retry-After: 5` when full. Android stops automatic upload retries on 429.

The in-memory job and idempotency ledger requires exactly one worker and one replica, with autoscaling disabled. The repository does not pin the Render instance memory tier in `render.yaml`; measure peak resident memory with both detector models loaded and one maximum-size synthetic image before selecting a plan. Do not add replicas or workers until admission, jobs and idempotency move to shared durable storage.

The total request is limited to the configured image limit plus 64 KiB multipart overhead. Upload reading times out after 30 seconds. A separate child process loads the detectors and processes one image with a 60-second deadline; timeout terminates and joins that child before the next job. Sources are removed on completion, and failure, interruption, result delivery, TTL and shutdown remove private temporary files. The parent does not log image data, credentials or raw worker exceptions. `/health` is public.

Run local synthetic regression tests from the repository root: `python face-blur-service/tests/test_security.py`. These cover the ASGI boundary, quotas, private polling/results, actual detector blank-image smoke test, timeout termination and cleanup; real Android/device and container staging tests remain required.

## Safety Behavior

- Accepts JPEG/JPG/PNG only.
- Rejects oversized files using `FACE_BLUR_MAX_IMAGE_BYTES`, default 10 MB.
- Rejects unreasonable decoded dimensions using `FACE_BLUR_MAX_SOURCE_PIXELS`, default 80 megapixels.
- Decodes oversized phone photos to at most `FACE_BLUR_MAX_IMAGE_DIMENSION`, capped at 1280 pixels on the longest edge; all output is JPEG, including PNG input.
- Checks MIME type and image signature.
- Uses UUID-based temporary filenames.
- Saves files under `FACE_BLUR_TEMP_DIR`.
- Deletes both source and processed temporary files after success.
- Deletes job originals immediately after processing and undownloaded results after 15 minutes.
- Deletes partial files on processing failures.
- Clamps face boxes to image boundaries.
- Runs short-range and full-range detection on the complete image.
- Scans large images in overlapping tiles so distant faces remain large enough for detection.
- Merges duplicate detections before applying blur.
- Expands each face box by `FACE_PADDING_RATIO`, default 0.25.
- Strongly smooths each detected head inside an oval mask; inward feathering leaves the surrounding pixels outside the mask unchanged before JPEG encoding.
- Does not log image contents, tokens, credentials, face crops, or private user information.

## Test Checklist

1. One person: one face should be blurred.
2. Multiple people: every detected face should be blurred.
3. No people: image returns without crashing.
4. Small or side face: verify detection quality.
5. Invalid file: `.txt`, `.exe`, `.pdf` rejected.
6. Large file: rejected above configured max size.
7. Missing model: API fails safely and Expo does not upload the original image.
8. Complete CebSpot flow: selected image -> API -> blurred image -> Supabase `spot-images` -> displayed in CebSpot.
