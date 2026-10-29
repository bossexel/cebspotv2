import asyncio
import hashlib
import hmac
import logging
import os
import re
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from services.face_blur import FaceBlurSettings, JPEG_SIGNATURES, PNG_SIGNATURE, SUPPORTED_TYPES
from services.job_runtime import AdmissionError, JobRuntime, SupabaseVerifier

load_dotenv()
logger = logging.getLogger(__name__)


class UploadBoundary:
    """Authenticate and reserve capacity before multipart parsing or body reads."""
    def __init__(self, app, runtime, verifier, upload_timeout=30):
        self.app, self.runtime, self.verifier, self.upload_timeout = app, runtime, verifier, upload_timeout

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or not scope['path'].startswith('/api/'):
            return await self.app(scope, receive, send)
        job = None
        try:
            header = dict(scope['headers']).get(b'authorization', b'').decode('ascii', errors='ignore')
            if not header.startswith('Bearer ') or not 1 <= len(header[7:]) <= 8192:
                raise AdmissionError(401, 'Sign in to privacy process photos.')
            owner = await self.verifier(header[7:])
            if not owner:
                raise AdmissionError(401, 'Session expired. Sign in again.')
            scope.setdefault('state', {})['owner'] = owner
            if scope['method'] == 'POST' and scope['path'] == '/api/anonymize-jobs':
                request_headers = dict(scope['headers'])
                raw_key = request_headers.get(b'x-idempotency-key')
                if raw_key is None:
                    # Supported older Android runtimes did not send this header.
                    # Reserve capacity before reading bytes; the route later binds
                    # the validated image digest to this provisional job.
                    job = self.runtime.admit(owner)
                    scope['state']['legacy_idempotency'] = True
                else:
                    try:
                        idempotency_key = raw_key.decode('ascii')
                    except UnicodeDecodeError:
                        raise AdmissionError(400, 'A valid photo request idempotency key is required.') from None
                    if not re.fullmatch(r'[A-Za-z0-9._:-]{16,128}', idempotency_key):
                        raise AdmissionError(400, 'A valid photo request idempotency key is required.')
                    job, replayed = self.runtime.admit_idempotent(owner, idempotency_key)
                    if replayed:
                        return await JSONResponse({'job_id': job.id, 'status': job.status}, status_code=202)(scope, receive, send)
                scope['state']['job'] = job
                limit = self.runtime.settings.max_image_bytes + 65536
                length = dict(scope['headers']).get(b'content-length', b'')
                if length and (not length.isdigit() or int(length) > limit):
                    raise AdmissionError(413, 'Photo request is too large.')
                body = bytearray()
                try:
                    async with asyncio.timeout(self.upload_timeout):
                        while True:
                            message = await receive()
                            if message['type'] == 'http.disconnect':
                                raise AdmissionError(400, 'Upload interrupted.')
                            body.extend(message.get('body', b''))
                            if len(body) > limit:
                                raise AdmissionError(413, 'Photo request is too large.')
                            if not message.get('more_body'):
                                break
                except TimeoutError:
                    raise AdmissionError(408, 'Photo upload timed out.') from None
                delivered = False
                async def buffered_receive():
                    nonlocal delivered
                    if not delivered:
                        delivered = True
                        return {'type': 'http.request', 'body': bytes(body), 'more_body': False}
                    return await receive()
                await self.app(scope, buffered_receive, send)
            else:
                await self.app(scope, receive, send)
        except AdmissionError as error:
            await JSONResponse({'detail': error.detail}, status_code=error.status,
                               headers={'Retry-After': str(error.retry)} if error.status == 429 else {})(scope, receive, send)
        finally:
            if job and job.status == 'uploading':
                self.runtime.remove(job.id)


def create_app(settings=None, verifier=None, runtime=None, upload_timeout=30):
    settings = settings or FaceBlurSettings.from_env()
    runtime = runtime or JobRuntime(settings)
    current_verifier = verifier
    async def verify(token):
        return await current_verifier(token)

    @asynccontextmanager
    async def lifespan(app):
        nonlocal current_verifier
        current_verifier = current_verifier or SupabaseVerifier()
        if isinstance(current_verifier, SupabaseVerifier):
            await current_verifier.check_configuration()
        if not 1 <= settings.max_image_bytes <= 10485760:
            raise RuntimeError('Photo byte limit must be between 1 and 10485760.')
        if not settings.short_model_path.is_file() or not settings.full_model_path.is_file():
            raise RuntimeError('Both face models are required.')
        await runtime.start()
        try:
            yield
        finally:
            await runtime.close()

    app = FastAPI(title='CebSpot Face Anonymizer', version='2.0.0', lifespan=lifespan,
                  docs_url=None, redoc_url=None, openapi_url=None)
    app.state.runtime = runtime
    app.add_middleware(UploadBoundary, runtime=runtime, verifier=verify, upload_timeout=upload_timeout)
    app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins, allow_methods=['GET', 'POST', 'DELETE'],
                       allow_headers=['Content-Type', 'Authorization', 'X-Idempotency-Key'])

    @app.get('/health')
    async def health():
        return {'status': 'ok', 'service': 'cebspot-face-anonymizer'}

    @app.delete('/internal/account-jobs/{owner_id}')
    async def erase_account_jobs(request: Request, owner_id: str):
        expected = os.getenv('ACCOUNT_DELETION_WORKER_TOKEN', '')
        supplied = request.headers.get('Authorization', '').removeprefix('Bearer ')
        if len(expected) < 32 or not hmac.compare_digest(expected, supplied):
            raise HTTPException(401, 'Worker authentication required.')
        try:
            owner = str(uuid.UUID(owner_id))
        except ValueError:
            raise HTTPException(400, 'Invalid account identifier.') from None
        pending = runtime.cancel_owner(owner)
        return JSONResponse({'status': 'cancelling' if pending else 'cleared'}, status_code=202 if pending else 200)

    @app.post('/api/anonymize-jobs', status_code=202)
    async def create_job(request: Request, image: UploadFile = File(...)):
        job = request.state.job
        try:
            mime = (image.content_type or '').lower().split(';')[0].strip()
            if mime not in SUPPORTED_TYPES:
                raise HTTPException(415, 'Only JPEG and PNG photos are supported.')
            data = await image.read(settings.max_image_bytes + 1)
            if not data or len(data) > settings.max_image_bytes:
                raise HTTPException(413, 'Photo is empty or too large.')
            if not (data.startswith(PNG_SIGNATURE) if mime == 'image/png' else any(data.startswith(s) for s in JPEG_SIGNATURES)):
                raise HTTPException(415, 'Photo content does not match its declared type.')
            if getattr(request.state, 'legacy_idempotency', False):
                fingerprint = hashlib.sha256(mime.encode('ascii') + b'\0' + data).hexdigest()
                job, replayed = runtime.bind_idempotency(job, 'legacy-sha256:' + fingerprint)
                if replayed:
                    return JSONResponse({'job_id': job.id, 'status': job.status}, status_code=202)
                request.state.job = job
                logger.info('accepted authenticated legacy photo request using content idempotency')
            runtime.enqueue(job, data, mime)
            return {'job_id': job.id, 'status': job.status}
        finally:
            await image.close()

    @app.delete('/api/anonymize-jobs')
    async def cancel_jobs(request: Request):
        pending = runtime.cancel_owner(request.state.owner)
        return JSONResponse({'status': 'cancelling' if pending else 'cleared'}, status_code=202 if pending else 200)

    def owned_job(request, job_id):
        job = runtime.jobs.get(job_id)
        if not job or job.owner != request.state.owner or job.cancelled:
            raise HTTPException(404, 'Anonymization job not found.')
        return job

    @app.get('/api/anonymize-jobs/{job_id}')
    async def poll(request: Request, job_id: str):
        job = owned_job(request, job_id)
        result = {'job_id': job.id, 'status': job.status}
        if job.status == 'failed':
            result['detail'] = 'Photo processing failed or timed out. Retry with a smaller photo.'
        if job.result:
            result.update({key: job.result[key] for key in ('faces_detected', 'processing_time_ms')})
        return result

    @app.get('/api/anonymize-jobs/{job_id}/result')
    async def download(request: Request, job_id: str, background_tasks: BackgroundTasks):
        job = owned_job(request, job_id)
        if job.status != 'complete' or not job.result:
            raise HTTPException(409, 'Anonymized photo is not ready.')
        path = Path(job.result['output_path']).resolve()
        if path.parent != job.directory.resolve() or not path.is_file():
            raise HTTPException(410, 'Anonymized photo expired.')
        job.status = 'delivering'
        background_tasks.add_task(runtime.remove, job.id)
        return FileResponse(path, media_type=job.result['media_type'], background=background_tasks,
                            headers={'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'})

    @app.post('/api/{legacy_path:path}')
    async def retired():
        raise HTTPException(410, 'Use the authenticated bounded anonymize-jobs API.')

    return app


app = create_app()
