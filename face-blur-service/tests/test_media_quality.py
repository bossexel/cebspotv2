"""Geometry, size and authentication regression tests. No customer photos or tokens."""
import asyncio
import base64
import io
import json
import sys
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from services.face_blur import FaceBlurService, FaceBlurSettings, FaceBox
from services.job_runtime import SupabaseVerifier, AdmissionError


class MediaQualityTests(unittest.TestCase):
    def setUp(self):
        self.service = FaceBlurService(replace(FaceBlurSettings.from_env(),
            short_model_path=ROOT/'models/blaze_face_short_range.tflite',
            full_model_path=ROOT/'models/blaze_face_full_range.tflite'))

    def test_oval_covers_head_and_preserves_every_pixel_outside(self):
        import numpy as np
        source = np.random.default_rng(12).integers(0, 256, (240, 320, 3), dtype=np.uint8)
        output = source.copy()
        self.assertTrue(self.service._blur_head(output, FaceBox(100, 80, 180, 170, .99)))
        # Padded rectangle corners and adjacent food/background remain byte identical.
        np.testing.assert_array_equal(output[:25], source[:25])
        np.testing.assert_array_equal(output[:, :80], source[:, :80])
        np.testing.assert_array_equal(output[32, 82], source[32, 82])
        self.assertFalse(np.array_equal(output[100:140, 120:160], source[100:140, 120:160]))
        self.assertFalse(np.array_equal(output[45:65, 125:155], source[45:65, 125:155]))
        # Clipped heads at every image edge still process without recentering/crashing.
        for box in [FaceBox(0, 0, 50, 60, 1), FaceBox(280, 195, 320, 240, 1)]:
            self.assertTrue(self.service._blur_head(output, box))

    def test_landmark_geometry_rejects_texture_and_accepts_profile_like_face(self):
        box = SimpleNamespace(origin_x=20, origin_y=20, width=60, height=70)
        def face(points):
            return SimpleNamespace(bounding_box=box, keypoints=[SimpleNamespace(x=x/100, y=y/100) for x,y in points])
        self.assertTrue(self.service._plausible_face(face([(35,40),(65,40),(50,55),(50,70)]),100,100))
        self.assertTrue(self.service._plausible_face(face([(48,40),(58,42),(67,57),(62,72)]),100,100))
        for points in [[], [(50,50)]*4, [(1,1),(99,1),(5,98),(98,98)], [(float('nan'),40),(65,40),(50,55),(50,70)]]:
            self.assertFalse(self.service._plausible_face(face(points),100,100))

    def test_png_input_becomes_small_jpeg_with_bounded_dimensions(self):
        import cv2
        import numpy as np
        image = np.random.default_rng(3).integers(0,256,(1800,2400,3),dtype=np.uint8)
        with tempfile.TemporaryDirectory() as directory:
            service = FaceBlurService(replace(self.service.settings,temp_dir=Path(directory)))
            service._detect_faces = lambda image: []
            ok, encoded = cv2.imencode('.png',image)
            self.assertTrue(ok)
            service.settings = replace(service.settings,max_image_bytes=encoded.size+1)
            result = asyncio.run(service.anonymize_bytes(encoded.tobytes(),'image/png'))
            self.assertEqual(result.media_type,'image/jpeg')
            self.assertEqual(result.output_path.suffix,'.jpg')
            self.assertLessEqual(result.output_path.stat().st_size,320*1024)
            self.assertTrue(result.output_path.read_bytes().startswith(b'\xff\xd8\xff'))
            decoded = cv2.imread(str(result.output_path))
            self.assertLessEqual(max(decoded.shape[:2]),1280)

    def test_legacy_config_cannot_restore_oversized_output_or_low_confidence(self):
        with patch.dict('os.environ',{'FACE_DETECTION_MIN_CONFIDENCE':'.5','FACE_BLUR_JPEG_QUALITY':'92','FACE_BLUR_MAX_IMAGE_DIMENSION':'3072'}):
            settings = FaceBlurSettings.from_env()
        self.assertEqual(settings.min_detection_confidence,.7)
        self.assertEqual(settings.max_image_dimension,1280)
        self.assertEqual(settings.jpeg_quality,68)


class VerificationTests(unittest.IsolatedAsyncioTestCase):
    def verifier(self):
        with patch.dict('os.environ',{'SUPABASE_URL':'https://test.supabase.co','SUPABASE_PUBLISHABLE_KEY':'synthetic-key'}):
            return SupabaseVerifier()

    async def test_expiry_is_401_but_bad_server_key_and_profile_failures_are_503(self):
        owner='30000000-0000-4000-8000-000000000001'
        class Reply:
            def __enter__(self): return self
            def __exit__(self,*args): pass
            def read(self,limit): return json.dumps({'id':owner}).encode()
        for prefix, status, body, expected in [
            ([],401,{'code':'bad_jwt'},401),
            ([],401,{'message':'Invalid API key'},503),
            ([Reply()],403,{'code':'42501','message':'permission denied'},503),
            ([],503,{'message':'unavailable'},503),
        ]:
            error = HTTPError('https://test.invalid',status,'failure',{},io.BytesIO(json.dumps(body).encode()))
            with patch('services.job_runtime.urlopen',side_effect=prefix+[error]):
                with self.assertRaises(AdmissionError) as failure:
                    await self.verifier()('synthetic')
            self.assertEqual(failure.exception.status,expected)
            self.assertNotIn('42501',failure.exception.detail)

    async def test_wrong_project_never_passes_and_never_trusts_decoded_claims(self):
        payload=base64.urlsafe_b64encode(json.dumps({'iss':'https://wrong.supabase.co/auth/v1'}).encode()).decode().rstrip('=')
        with patch('services.job_runtime.urlopen') as lookup:
            with self.assertRaises(AdmissionError) as failure: await self.verifier()('x.'+payload+'.x')
            self.assertEqual(failure.exception.status,503)
            lookup.assert_not_called()
        payload=base64.urlsafe_b64encode(json.dumps({'iss':'https://test.supabase.co/auth/v1'}).encode()).decode().rstrip('=')
        with patch('services.job_runtime.urlopen',side_effect=OSError('network down')) as lookup:
            with self.assertRaises(AdmissionError): await self.verifier()('x.'+payload+'.x')
            lookup.assert_called_once()


if __name__ == '__main__': unittest.main()
