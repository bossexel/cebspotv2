import asyncio
import logging
import os
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from fastapi import UploadFile
from PIL import Image, UnidentifiedImageError

logger = logging.getLogger("cebspot-face-anonymizer")

SUPPORTED_TYPES = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
}

JPEG_SIGNATURES = (b"\xff\xd8\xff",)
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


@dataclass(frozen=True)
class FaceBlurSettings:
    short_model_path: Path
    full_model_path: Path
    temp_dir: Path
    max_image_bytes: int
    max_image_dimension: int
    max_source_pixels: int
    min_detection_confidence: float
    min_suppression_threshold: float
    tile_size: int
    tile_overlap_ratio: float
    max_tiles: int
    duplicate_iou_threshold: float
    face_padding_ratio: float
    blur_kernel_ratio: float
    jpeg_quality: int
    allowed_origins: list[str]

    @classmethod
    def from_env(cls) -> "FaceBlurSettings":
        origins = os.getenv(
            "FACE_BLUR_ALLOWED_ORIGINS",
            "http://localhost:8081,http://localhost:19006,http://127.0.0.1:8081,http://localhost:8000",
        )
        legacy_model_path = os.getenv("MEDIAPIPE_FACE_MODEL_PATH", "./models/blaze_face_short_range.tflite")
        return cls(
            short_model_path=Path(os.getenv("MEDIAPIPE_FACE_SHORT_MODEL_PATH", legacy_model_path)).resolve(),
            full_model_path=Path(
                os.getenv("MEDIAPIPE_FACE_FULL_MODEL_PATH", "./models/blaze_face_full_range.tflite")
            ).resolve(),
            temp_dir=Path(os.getenv("FACE_BLUR_TEMP_DIR", "./temp")).resolve(),
            max_image_bytes=int(os.getenv("FACE_BLUR_MAX_IMAGE_BYTES", str(10 * 1024 * 1024))),
            max_image_dimension=int(os.getenv("FACE_BLUR_MAX_IMAGE_DIMENSION", "3072")),
            max_source_pixels=int(os.getenv("FACE_BLUR_MAX_SOURCE_PIXELS", "80000000")),
            min_detection_confidence=float(os.getenv("FACE_DETECTION_MIN_CONFIDENCE", "0.5")),
            min_suppression_threshold=float(os.getenv("FACE_DETECTION_MIN_SUPPRESSION", "0.5")),
            tile_size=int(os.getenv("FACE_DETECTION_TILE_SIZE", "768")),
            tile_overlap_ratio=float(os.getenv("FACE_DETECTION_TILE_OVERLAP", "0.25")),
            max_tiles=int(os.getenv("FACE_DETECTION_MAX_TILES", "64")),
            duplicate_iou_threshold=float(os.getenv("FACE_DETECTION_DUPLICATE_IOU", "0.35")),
            face_padding_ratio=float(os.getenv("FACE_PADDING_RATIO", "0.25")),
            blur_kernel_ratio=float(os.getenv("FACE_BLUR_KERNEL_RATIO", "0.65")),
            jpeg_quality=int(os.getenv("FACE_BLUR_JPEG_QUALITY", "92")),
            allowed_origins=[origin.strip() for origin in origins.split(",") if origin.strip()],
        )


@dataclass(frozen=True)
class PreparedImage:
    request_id: str
    source_path: Path
    output_path: Path
    media_type: str


@dataclass(frozen=True)
class AnonymizedImage:
    output_path: Path
    media_type: str
    faces_detected: int
    processing_time_ms: int
    cleanup_paths: list[Path]


@dataclass(frozen=True)
class FaceBox:
    x1: int
    y1: int
    x2: int
    y2: int
    score: float


class FaceBlurService:
    def __init__(self, settings: FaceBlurSettings) -> None:
        self.settings = settings
        self._short_detector = None
        self._full_detector = None
        self._detector_lock = threading.Lock()

    def validate_startup(self) -> None:
        if not self.settings.short_model_path.is_file():
            raise RuntimeError(
                "MediaPipe short-range face model is missing. Set MEDIAPIPE_FACE_SHORT_MODEL_PATH."
            )
        if not self.settings.full_model_path.is_file():
            raise RuntimeError(
                "MediaPipe full-range face model is missing. Set MEDIAPIPE_FACE_FULL_MODEL_PATH."
            )

        if not 0 < self.settings.min_detection_confidence <= 1:
            raise RuntimeError("FACE_DETECTION_MIN_CONFIDENCE must be between 0 and 1.")
        if not 0 <= self.settings.min_suppression_threshold <= 1:
            raise RuntimeError("FACE_DETECTION_MIN_SUPPRESSION must be between 0 and 1.")
        if self.settings.tile_size < 128:
            raise RuntimeError("FACE_DETECTION_TILE_SIZE must be at least 128 pixels.")
        if not 0 <= self.settings.tile_overlap_ratio < 0.75:
            raise RuntimeError("FACE_DETECTION_TILE_OVERLAP must be between 0 and 0.75.")
        if not 1 <= self.settings.max_tiles <= 256:
            raise RuntimeError("FACE_DETECTION_MAX_TILES must be between 1 and 256.")
        if not 0 < self.settings.duplicate_iou_threshold <= 1:
            raise RuntimeError("FACE_DETECTION_DUPLICATE_IOU must be between 0 and 1.")
        if not 0 <= self.settings.face_padding_ratio <= 1:
            raise RuntimeError("FACE_PADDING_RATIO must be between 0 and 1.")
        if not 1024 <= self.settings.max_image_dimension <= 8192:
            raise RuntimeError("FACE_BLUR_MAX_IMAGE_DIMENSION must be between 1024 and 8192 pixels.")
        if self.settings.max_source_pixels < self.settings.max_image_dimension**2:
            raise RuntimeError("FACE_BLUR_MAX_SOURCE_PIXELS is too small for the configured image dimension.")

        self.settings.temp_dir.mkdir(parents=True, exist_ok=True)
        try:
            self.settings.temp_dir.chmod(0o700)
        except OSError:
            logger.debug("could not chmod temp directory; continuing")

        short_detector = self._create_detector(self.settings.short_model_path)
        try:
            full_detector = self._create_detector(self.settings.full_model_path)
        except Exception:
            short_detector.close()
            raise

        self._short_detector = short_detector
        self._full_detector = full_detector
        logger.info("MediaPipe short-range and full-range face detectors loaded")

    async def anonymize_upload(self, upload: UploadFile) -> AnonymizedImage:
        prepared = await self.prepare_upload(upload)
        return await self.anonymize_prepared(prepared)

    async def prepare_upload(self, upload: UploadFile) -> PreparedImage:
        media_type = self._validate_content_type(upload)
        extension = SUPPORTED_TYPES[media_type]
        request_id = uuid.uuid4().hex
        source_path = self.settings.temp_dir / f"{request_id}-source{extension}"
        output_path = self.settings.temp_dir / f"{request_id}-anonymized{extension}"

        logger.info("image processing started: %s", request_id)

        try:
            await self._save_upload(upload, source_path, media_type)
            return PreparedImage(
                request_id=request_id,
                source_path=source_path,
                output_path=output_path,
                media_type=media_type,
            )
        except Exception:
            self._cleanup_quietly(source_path)
            self._cleanup_quietly(output_path)
            raise
        finally:
            await upload.close()

    async def anonymize_prepared(self, prepared: PreparedImage) -> AnonymizedImage:
        try:
            return await self._anonymize_source_file(
                prepared.source_path,
                prepared.output_path,
                prepared.media_type,
                prepared.request_id,
            )
        except Exception:
            self._cleanup_quietly(prepared.source_path)
            self._cleanup_quietly(prepared.output_path)
            raise

    async def anonymize_bytes(self, image_bytes: bytes, media_type: str) -> AnonymizedImage:
        normalized_media_type = self._validate_media_type(media_type)
        extension = SUPPORTED_TYPES[normalized_media_type]
        request_id = uuid.uuid4().hex
        source_path = self.settings.temp_dir / f"{request_id}-source{extension}"
        output_path = self.settings.temp_dir / f"{request_id}-anonymized{extension}"

        logger.info("image processing started: %s", request_id)

        try:
            self._save_bytes(image_bytes, source_path, normalized_media_type)
            return await self._anonymize_source_file(source_path, output_path, normalized_media_type, request_id)
        except Exception:
            self._cleanup_quietly(source_path)
            self._cleanup_quietly(output_path)
            raise

    def _create_detector(self, model_path: Path):
        base_options = mp.tasks.BaseOptions(model_asset_path=str(model_path))
        options = mp.tasks.vision.FaceDetectorOptions(
            base_options=base_options,
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            min_detection_confidence=self.settings.min_detection_confidence,
            min_suppression_threshold=self.settings.min_suppression_threshold,
        )
        return mp.tasks.vision.FaceDetector.create_from_options(options)

    async def _anonymize_source_file(
        self,
        source_path: Path,
        output_path: Path,
        media_type: str,
        request_id: str,
    ) -> AnonymizedImage:
        started = time.perf_counter()
        faces_detected = await asyncio.to_thread(self._blur_file, source_path, output_path, media_type)
        processing_time_ms = int((time.perf_counter() - started) * 1000)
        logger.info("%s faces detected", faces_detected)
        logger.info("image anonymized successfully: %s", request_id)
        return AnonymizedImage(
            output_path=output_path,
            media_type=media_type,
            faces_detected=faces_detected,
            processing_time_ms=processing_time_ms,
            cleanup_paths=[source_path, output_path],
        )

    def _validate_media_type(self, media_type: str) -> str:
        media_type = (media_type or "").lower().split(";")[0].strip()
        if media_type not in SUPPORTED_TYPES:
            raise ValueError("Only JPEG, JPG, and PNG images are supported.")
        return media_type

    def _validate_content_type(self, upload: UploadFile) -> str:
        return self._validate_media_type(upload.content_type or "")

    def _save_bytes(self, image_bytes: bytes, destination: Path, media_type: str) -> None:
        total_bytes = len(image_bytes)
        if total_bytes == 0:
            raise ValueError("Image file is empty.")
        if total_bytes > self.settings.max_image_bytes:
            raise ValueError("Image is too large.")
        if not self._has_valid_signature(image_bytes[:16], media_type):
            raise ValueError("Image content does not match the declared file type.")

        destination.write_bytes(image_bytes)

    async def _save_upload(self, upload: UploadFile, destination: Path, media_type: str) -> None:
        total_bytes = 0
        first_chunk = b""

        with destination.open("wb") as output_file:
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                if not first_chunk:
                    first_chunk = chunk[:16]
                total_bytes += len(chunk)
                if total_bytes > self.settings.max_image_bytes:
                    raise ValueError("Image is too large.")
                output_file.write(chunk)

        if total_bytes == 0:
            raise ValueError("Image file is empty.")

        if not self._has_valid_signature(first_chunk, media_type):
            raise ValueError("Image content does not match the declared file type.")

    def _has_valid_signature(self, header: bytes, media_type: str) -> bool:
        if media_type in {"image/jpeg", "image/jpg"}:
            return any(header.startswith(signature) for signature in JPEG_SIGNATURES)
        if media_type == "image/png":
            return header.startswith(PNG_SIGNATURE)
        return False

    def _blur_file(self, source_path: Path, output_path: Path, media_type: str) -> int:
        source_width, source_height = self._read_image_dimensions(source_path)
        decode_flag = self._decode_flag(source_width, source_height)
        encoded_source = np.fromfile(str(source_path), dtype=np.uint8)
        image_bgr = cv2.imdecode(encoded_source, decode_flag)
        del encoded_source
        if image_bgr is None or image_bgr.size == 0:
            raise ValueError("Image could not be decoded.")

        image_bgr = self._bound_image_dimensions(image_bgr)
        logger.info(
            "image dimensions prepared: %sx%s -> %sx%s",
            source_width,
            source_height,
            image_bgr.shape[1],
            image_bgr.shape[0],
        )

        image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        detections = self._detect_faces(image_rgb)
        blurred_faces = 0

        for box in detections:
            region = self._expanded_region(
                x=box.x1,
                y=box.y1,
                width=box.x2 - box.x1,
                height=box.y2 - box.y1,
                image_width=image_bgr.shape[1],
                image_height=image_bgr.shape[0],
            )
            if region is None:
                continue

            x1, y1, x2, y2 = region
            face_region = image_bgr[y1:y2, x1:x2]
            if face_region.size == 0:
                continue

            kernel = self._kernel_size(face_region.shape[1], face_region.shape[0])
            blurred = cv2.GaussianBlur(face_region, (kernel, kernel), sigmaX=max(12, kernel / 2))
            image_bgr[y1:y2, x1:x2] = blurred
            blurred_faces += 1

        self._write_output(image_bgr, output_path, media_type)
        return blurred_faces

    def _read_image_dimensions(self, source_path: Path) -> tuple[int, int]:
        try:
            with Image.open(source_path) as image:
                width, height = image.size
        except (Image.DecompressionBombError, UnidentifiedImageError, OSError, ValueError) as error:
            raise ValueError("Image could not be decoded.") from error

        if width <= 0 or height <= 0:
            raise ValueError("Image dimensions are invalid.")
        if width * height > self.settings.max_source_pixels:
            raise ValueError("Image dimensions are too large.")
        return width, height

    def _decode_flag(self, width: int, height: int) -> int:
        longest_side = max(width, height)
        reduction = 1
        while reduction < 8 and longest_side / reduction > self.settings.max_image_dimension:
            reduction *= 2

        return {
            2: cv2.IMREAD_REDUCED_COLOR_2,
            4: cv2.IMREAD_REDUCED_COLOR_4,
            8: cv2.IMREAD_REDUCED_COLOR_8,
        }.get(reduction, cv2.IMREAD_COLOR)

    def _bound_image_dimensions(self, image_bgr: np.ndarray) -> np.ndarray:
        height, width = image_bgr.shape[:2]
        longest_side = max(width, height)
        if longest_side <= self.settings.max_image_dimension:
            return image_bgr

        scale = self.settings.max_image_dimension / longest_side
        resized_width = max(1, int(round(width * scale)))
        resized_height = max(1, int(round(height * scale)))
        return cv2.resize(image_bgr, (resized_width, resized_height), interpolation=cv2.INTER_AREA)

    def _detect_faces(self, image_rgb: np.ndarray) -> list[FaceBox]:
        image_height, image_width = image_rgb.shape[:2]

        with self._detector_lock:
            if self._short_detector is None or self._full_detector is None:
                raise RuntimeError("Face detectors are unavailable.")

            candidates = self._detect_in_image(
                self._full_detector,
                image_rgb,
                offset_x=0,
                offset_y=0,
                image_width=image_width,
                image_height=image_height,
            )
            candidates.extend(
                self._detect_in_image(
                    self._short_detector,
                    image_rgb,
                    offset_x=0,
                    offset_y=0,
                    image_width=image_width,
                    image_height=image_height,
                )
            )

            for x1, y1, x2, y2 in self._tile_windows(image_width, image_height):
                tile_rgb = np.ascontiguousarray(image_rgb[y1:y2, x1:x2])
                candidates.extend(
                    self._detect_in_image(
                        self._full_detector,
                        tile_rgb,
                        offset_x=x1,
                        offset_y=y1,
                        image_width=image_width,
                        image_height=image_height,
                    )
                )
                candidates.extend(
                    self._detect_in_image(
                        self._short_detector,
                        tile_rgb,
                        offset_x=x1,
                        offset_y=y1,
                        image_width=image_width,
                        image_height=image_height,
                    )
                )

        unique_faces = self._deduplicate_boxes(candidates)
        logger.info("%s face candidates merged into %s unique faces", len(candidates), len(unique_faces))
        return unique_faces

    def _detect_in_image(
        self,
        detector,
        image_rgb: np.ndarray,
        offset_x: int,
        offset_y: int,
        image_width: int,
        image_height: int,
    ) -> list[FaceBox]:
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(image_rgb))
        detection_result = detector.detect(mp_image)
        boxes: list[FaceBox] = []
        crop_height, crop_width = image_rgb.shape[:2]
        crop_x2 = min(image_width, offset_x + crop_width)
        crop_y2 = min(image_height, offset_y + crop_height)

        for detection in detection_result.detections or []:
            bounding_box = detection.bounding_box
            x1 = max(offset_x, offset_x + bounding_box.origin_x)
            y1 = max(offset_y, offset_y + bounding_box.origin_y)
            x2 = min(crop_x2, offset_x + bounding_box.origin_x + bounding_box.width)
            y2 = min(crop_y2, offset_y + bounding_box.origin_y + bounding_box.height)
            if x2 - x1 < 3 or y2 - y1 < 3:
                continue

            score = 0.0
            if detection.categories:
                score = float(detection.categories[0].score or 0.0)
            boxes.append(FaceBox(x1=x1, y1=y1, x2=x2, y2=y2, score=score))

        return boxes

    def _tile_windows(self, image_width: int, image_height: int) -> list[tuple[int, int, int, int]]:
        if image_width <= self.settings.tile_size and image_height <= self.settings.tile_size:
            return []

        tile_size = self.settings.tile_size
        while True:
            x_starts = self._axis_starts(image_width, tile_size)
            y_starts = self._axis_starts(image_height, tile_size)
            if len(x_starts) * len(y_starts) <= self.settings.max_tiles:
                break
            tile_size = int(round(tile_size * 1.2))

        windows = []
        for y1 in y_starts:
            for x1 in x_starts:
                windows.append(
                    (
                        x1,
                        y1,
                        min(image_width, x1 + tile_size),
                        min(image_height, y1 + tile_size),
                    )
                )
        return windows

    def _axis_starts(self, length: int, tile_size: int) -> list[int]:
        if length <= tile_size:
            return [0]

        step = max(1, int(round(tile_size * (1 - self.settings.tile_overlap_ratio))))
        starts = list(range(0, max(1, length - tile_size + 1), step))
        final_start = length - tile_size
        if starts[-1] != final_start:
            starts.append(final_start)
        return starts

    def _deduplicate_boxes(self, boxes: list[FaceBox]) -> list[FaceBox]:
        kept: list[FaceBox] = []
        for candidate in sorted(boxes, key=lambda item: item.score, reverse=True):
            if any(self._boxes_overlap(candidate, existing) for existing in kept):
                continue
            kept.append(candidate)
        return kept

    def _boxes_overlap(self, first: FaceBox, second: FaceBox) -> bool:
        intersection_width = max(0, min(first.x2, second.x2) - max(first.x1, second.x1))
        intersection_height = max(0, min(first.y2, second.y2) - max(first.y1, second.y1))
        intersection = intersection_width * intersection_height
        if intersection == 0:
            return False

        first_area = (first.x2 - first.x1) * (first.y2 - first.y1)
        second_area = (second.x2 - second.x1) * (second.y2 - second.y1)
        union = first_area + second_area - intersection
        iou = intersection / max(1, union)
        smaller_box_coverage = intersection / max(1, min(first_area, second_area))
        return iou >= self.settings.duplicate_iou_threshold or smaller_box_coverage >= 0.75

    def _expanded_region(
        self,
        x: int,
        y: int,
        width: int,
        height: int,
        image_width: int,
        image_height: int,
    ) -> tuple[int, int, int, int] | None:
        if width <= 0 or height <= 0:
            return None

        pad_x = int(round(width * self.settings.face_padding_ratio))
        pad_y = int(round(height * self.settings.face_padding_ratio))
        x1 = max(0, x - pad_x)
        y1 = max(0, y - pad_y)
        x2 = min(image_width, x + width + pad_x)
        y2 = min(image_height, y + height + pad_y)

        if x2 - x1 < 3 or y2 - y1 < 3:
            return None

        return x1, y1, x2, y2

    def _kernel_size(self, width: int, height: int) -> int:
        smallest_side = max(3, min(width, height))
        raw_kernel = max(3, int(round(smallest_side * self.settings.blur_kernel_ratio)))
        raw_kernel = min(raw_kernel, smallest_side if smallest_side % 2 == 1 else smallest_side - 1)
        if raw_kernel % 2 == 0:
            raw_kernel -= 1
        return max(3, raw_kernel)

    def _write_output(self, image_bgr: np.ndarray, output_path: Path, media_type: str) -> None:
        if media_type == "image/png":
            extension = ".png"
            params = [cv2.IMWRITE_PNG_COMPRESSION, 3]
        else:
            extension = ".jpg"
            params = [cv2.IMWRITE_JPEG_QUALITY, self.settings.jpeg_quality]

        success, encoded = cv2.imencode(extension, image_bgr, params)
        if not success:
            raise RuntimeError("Unable to encode anonymized image.")

        encoded.tofile(str(output_path))
        if not output_path.is_file() or output_path.stat().st_size == 0:
            raise RuntimeError("Anonymized image output was empty.")

    def _cleanup_quietly(self, path: Path) -> None:
        try:
            path.unlink(missing_ok=True)
        except Exception:
            logger.warning("temporary cleanup failed for %s", path.name)
