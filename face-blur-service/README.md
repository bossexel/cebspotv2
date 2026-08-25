# CebSpot Face Anonymizer

FastAPI service that receives a temporary user-selected image, detects human faces with MediaPipe Face Detector, blurs every detected face with OpenCV Gaussian blur, returns the anonymized image, and deletes temporary files.

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

1. Push this repository to the Git provider connected to Render.
2. In Render, create a Blueprint from the root `render.yaml`.
3. Enter the allowed web origins when prompted for `FACE_BLUR_ALLOWED_ORIGINS`. Native Android requests do not rely on browser CORS, but deployed web origins should be listed explicitly.
4. Wait for `/health` to pass, then copy the generated HTTPS service URL.
5. Set that URL as `EXPO_PUBLIC_FACE_BLUR_API_URL` for both the EAS `preview` and `production` environments.
6. Rebuild the Android app.

The container binds to Render's `PORT` value and runs one Uvicorn process. Keep one process per instance because anonymization job status is held in private process memory until its short TTL expires.

## Health Check

```bash
curl http://localhost:8000/health
```

Expected:

```json
{"status":"ok","service":"cebspot-face-anonymizer","face_detector":"mediapipe-dual-range","min_detection_confidence":0.5,"tile_size":768,"max_tiles":64}
```

## Upload Test

```bash
curl -X POST http://localhost:8000/api/anonymize \
  -F "image=@sample-face.jpg" \
  --output anonymized-sample-face.jpg
```

Expo mobile uploads use the asynchronous job endpoint below. It stores the original only in the private temporary directory and responds as soon as the upload is validated:

```text
POST /api/anonymize-jobs
Content-Type: multipart/form-data
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

The binary `/api/anonymize` endpoint exposes the same values through `X-Faces-Detected` and `X-Processing-Time-Ms` headers.

The older `/api/anonymize-upload` and `/api/anonymize-base64` endpoints remain available for direct testing. CebSpot uses jobs so long-running group photos do not exceed Expo Android's upload connection timeout. Completed and failed jobs expire after `FACE_BLUR_JOB_TTL_SECONDS`, default 15 minutes.

## Safety Behavior

- Accepts JPEG/JPG/PNG only.
- Rejects oversized files using `FACE_BLUR_MAX_IMAGE_BYTES`, default 10 MB.
- Checks MIME type and image signature.
- Uses UUID-based temporary filenames.
- Saves files under `FACE_BLUR_TEMP_DIR`.
- Deletes both source and processed temporary files after success.
- Deletes job originals immediately after processing and undownloaded results after the configured job TTL.
- Deletes partial files on processing failures.
- Clamps face boxes to image boundaries.
- Runs short-range and full-range detection on the complete image.
- Scans large images in overlapping tiles so distant faces remain large enough for detection.
- Merges duplicate detections before applying blur.
- Expands each face box by `FACE_PADDING_RATIO`, default 0.25.
- Uses strong OpenCV Gaussian blur with an odd kernel based on face size.
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
