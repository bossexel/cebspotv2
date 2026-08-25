import asyncio
import base64
import binascii
import logging
import os
import threading
import time
from dataclasses import dataclass
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from starlette import status

from services.face_blur import AnonymizedImage, FaceBlurService, FaceBlurSettings, PreparedImage

load_dotenv()

logger = logging.getLogger("cebspot-face-anonymizer")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

settings = FaceBlurSettings.from_env()
face_blur_service = FaceBlurService(settings)
job_ttl_seconds = max(60, int(os.getenv("FACE_BLUR_JOB_TTL_SECONDS", "900")))


@dataclass
class AnonymizationJob:
    id: str
    status: str
    created_at: float
    updated_at: float
    result: AnonymizedImage | None = None
    error: str | None = None


anonymization_jobs: dict[str, AnonymizationJob] = {}
anonymization_jobs_lock = threading.Lock()
expiration_tasks: set[asyncio.Task] = set()

app = FastAPI(title="CebSpot Face Anonymizer", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class Base64AnonymizeRequest(BaseModel):
    image_base64: str = Field(..., min_length=1)
    media_type: str = Field(..., min_length=1)


@app.on_event("startup")
def startup_check() -> None:
    face_blur_service.validate_startup()
    logger.info("CebSpot face anonymizer ready")


@app.on_event("shutdown")
def shutdown_cleanup() -> None:
    for task in list(expiration_tasks):
        task.cancel()

    with anonymization_jobs_lock:
        jobs = list(anonymization_jobs.values())
        anonymization_jobs.clear()

    for job in jobs:
        if job.result is not None:
            for path in job.result.cleanup_paths:
                _cleanup_file(path)


@app.get("/health")
def health() -> dict[str, str | float | int]:
    return {
        "status": "ok",
        "service": "cebspot-face-anonymizer",
        "face_detector": "mediapipe-dual-range",
        "min_detection_confidence": settings.min_detection_confidence,
        "tile_size": settings.tile_size,
        "max_tiles": settings.max_tiles,
        "max_image_dimension": settings.max_image_dimension,
    }


@app.post("/api/anonymize-jobs", status_code=status.HTTP_202_ACCEPTED)
async def create_anonymization_job(
    background_tasks: BackgroundTasks,
    image: UploadFile | None = File(default=None),
) -> dict[str, str]:
    if image is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image file is required.")

    try:
        prepared = await face_blur_service.prepare_upload(image)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    except Exception as error:
        logger.exception("unable to prepare anonymization job")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="We couldn't prepare this photo for privacy protection. Please try again.",
        ) from error

    now = time.time()
    job = AnonymizationJob(
        id=prepared.request_id,
        status="queued",
        created_at=now,
        updated_at=now,
    )
    with anonymization_jobs_lock:
        anonymization_jobs[job.id] = job

    background_tasks.add_task(_process_anonymization_job, job.id, prepared)
    return {"job_id": job.id, "status": job.status}


@app.get("/api/anonymize-jobs/{job_id}")
def get_anonymization_job(job_id: str) -> dict[str, str | int]:
    job = _get_job_or_404(job_id)
    response: dict[str, str | int] = {"job_id": job.id, "status": job.status}

    if job.error:
        response["detail"] = job.error
    if job.result is not None:
        response["faces_detected"] = job.result.faces_detected
        response["processing_time_ms"] = job.result.processing_time_ms

    return response


@app.get("/api/anonymize-jobs/{job_id}/result")
def download_anonymization_job_result(
    job_id: str,
    background_tasks: BackgroundTasks,
) -> FileResponse:
    with anonymization_jobs_lock:
        job = anonymization_jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Anonymization job not found.")
        if job.status == "failed":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=job.error or "Image anonymization failed.",
            )
        if job.status != "complete" or job.result is None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Anonymized image is not ready yet.")
        if not job.result.output_path.is_file():
            raise HTTPException(status_code=status.HTTP_410_GONE, detail="Anonymized image has expired.")

        job.status = "delivering"
        job.updated_at = time.time()
        result = job.result

    background_tasks.add_task(_remove_anonymization_job, job_id)
    return FileResponse(
        result.output_path,
        media_type=result.media_type,
        filename=f"anonymized-{result.output_path.name}",
        headers={
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "X-Faces-Detected": str(result.faces_detected),
            "X-Processing-Time-Ms": str(result.processing_time_ms),
        },
        background=background_tasks,
    )


@app.post("/api/anonymize-base64")
async def anonymize_image_base64(payload: Base64AnonymizeRequest) -> dict[str, str | int]:
    result = None

    try:
        encoded_image = payload.image_base64.strip()
        if encoded_image.lower().startswith("data:") and "," in encoded_image:
            encoded_image = encoded_image.split(",", 1)[1]
        max_base64_chars = ((settings.max_image_bytes + 2) // 3) * 4 + 1024
        if len(encoded_image) > max_base64_chars:
            raise ValueError("Image is too large.")

        image_bytes = base64.b64decode(encoded_image, validate=True)
        result = await face_blur_service.anonymize_bytes(image_bytes, payload.media_type)
        anonymized_base64 = base64.b64encode(result.output_path.read_bytes()).decode("ascii")

        return {
            "image_base64": anonymized_base64,
            "media_type": result.media_type,
            "faces_detected": result.faces_detected,
            "processing_time_ms": result.processing_time_ms,
        }
    except (ValueError, binascii.Error) as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    except TimeoutError as error:
        logger.warning("anonymization failed: timeout")
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Image processing timed out.") from error
    except RuntimeError as error:
        logger.warning("anonymization failed: %s", error)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="We couldn't process this photo for privacy protection. Please try again.",
        ) from error
    except Exception as error:
        logger.exception("anonymization failed unexpectedly")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Image anonymization failed.") from error
    finally:
        if result is not None:
            for path in result.cleanup_paths:
                _cleanup_file(path)


@app.post("/api/anonymize-upload")
async def anonymize_image_upload_json(image: UploadFile | None = File(default=None)) -> dict[str, str | int]:
    if image is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image file is required.")

    result = None

    try:
        result = await face_blur_service.anonymize_upload(image)
        anonymized_base64 = base64.b64encode(result.output_path.read_bytes()).decode("ascii")

        return {
            "image_base64": anonymized_base64,
            "media_type": result.media_type,
            "faces_detected": result.faces_detected,
            "processing_time_ms": result.processing_time_ms,
        }
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    except TimeoutError as error:
        logger.warning("anonymization failed: timeout")
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Image processing timed out.") from error
    except RuntimeError as error:
        logger.warning("anonymization failed: %s", error)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="We couldn't process this photo for privacy protection. Please try again.",
        ) from error
    except Exception as error:
        logger.exception("anonymization failed unexpectedly")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Image anonymization failed.") from error
    finally:
        if result is not None:
            for path in result.cleanup_paths:
                _cleanup_file(path)


@app.post("/api/anonymize")
async def anonymize_image(
    background_tasks: BackgroundTasks,
    image: UploadFile | None = File(default=None),
) -> FileResponse:
    if image is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image file is required.")

    try:
        result = await face_blur_service.anonymize_upload(image)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    except TimeoutError as error:
        logger.warning("anonymization failed: timeout")
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Image processing timed out.") from error
    except RuntimeError as error:
        logger.warning("anonymization failed: %s", error)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="We couldn't process this photo for privacy protection. Please try again.",
        ) from error
    except Exception as error:
        logger.exception("anonymization failed unexpectedly")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Image anonymization failed.") from error

    for path in result.cleanup_paths:
        background_tasks.add_task(_cleanup_file, path)

    return FileResponse(
        result.output_path,
        media_type=result.media_type,
        filename=f"anonymized-{result.output_path.name}",
        headers={
            "X-Faces-Detected": str(result.faces_detected),
            "X-Processing-Time-Ms": str(result.processing_time_ms),
        },
        background=background_tasks,
    )


def _cleanup_file(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except Exception:
        logger.warning("temporary cleanup failed for %s", path.name)


def _get_job_or_404(job_id: str) -> AnonymizationJob:
    with anonymization_jobs_lock:
        job = anonymization_jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Anonymization job not found.")
    return job


async def _process_anonymization_job(job_id: str, prepared: PreparedImage) -> None:
    with anonymization_jobs_lock:
        job = anonymization_jobs.get(job_id)
        if job is None:
            _cleanup_file(prepared.source_path)
            return
        job.status = "processing"
        job.updated_at = time.time()

    try:
        result = await face_blur_service.anonymize_prepared(prepared)
        _cleanup_file(prepared.source_path)
    except ValueError as error:
        logger.warning("anonymization job %s rejected: %s", job_id, error)
        _mark_anonymization_job_failed(job_id, str(error))
    except Exception:
        logger.exception("anonymization job %s failed", job_id)
        _mark_anonymization_job_failed(
            job_id,
            "We couldn't process this photo for privacy protection. Please try again.",
        )
    else:
        with anonymization_jobs_lock:
            job = anonymization_jobs.get(job_id)
            if job is None:
                for path in result.cleanup_paths:
                    _cleanup_file(path)
                return
            job.result = result
            job.status = "complete"
            job.updated_at = time.time()
    finally:
        _schedule_job_expiration(job_id)


def _mark_anonymization_job_failed(job_id: str, detail: str) -> None:
    with anonymization_jobs_lock:
        job = anonymization_jobs.get(job_id)
        if job is None:
            return
        job.status = "failed"
        job.error = detail
        job.updated_at = time.time()


def _schedule_job_expiration(job_id: str) -> None:
    task = asyncio.create_task(_expire_anonymization_job(job_id))
    expiration_tasks.add(task)
    task.add_done_callback(expiration_tasks.discard)


async def _expire_anonymization_job(job_id: str) -> None:
    await asyncio.sleep(job_ttl_seconds)
    _remove_anonymization_job(job_id)


def _remove_anonymization_job(job_id: str) -> None:
    with anonymization_jobs_lock:
        job = anonymization_jobs.pop(job_id, None)

    if job is not None and job.result is not None:
        for path in job.result.cleanup_paths:
            _cleanup_file(path)
