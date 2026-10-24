"""Bounded per-process admission and killable image workers. Run one replica."""
import asyncio
import base64
import json
import logging
import multiprocessing
import os
import shutil
import time
import threading
import uuid
from collections import deque
from dataclasses import dataclass, replace
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

logger = logging.getLogger('cebspot-face-anonymizer')


class AdmissionError(Exception):
    def __init__(self, status, detail, retry=60):
        self.status, self.detail, self.retry = status, detail, retry


class SupabaseVerifier:
    def __init__(self):
        self.url = os.getenv('SUPABASE_URL', '').strip().rstrip('/')
        self.key = (os.getenv('SUPABASE_PUBLISHABLE_KEY') or os.getenv('SUPABASE_ANON_KEY', '')).strip()
        if not self.url.startswith('https://') or not self.key:
            raise RuntimeError('Configure SUPABASE_URL and SUPABASE_ANON_KEY on the server.')
        self.slots = threading.BoundedSemaphore(8)

    def _request_json(self, path, token=None):
        headers = {'apikey': self.key}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        request = Request(self.url + path, headers=headers)
        try:
            with urlopen(request, timeout=5) as response:
                return json.loads(response.read(65536))
        except HTTPError as error:
            # The gateway also returns 401 for a wrong API key. That is a server
            # configuration failure, not an expired customer session.
            try:
                detail = json.loads(error.read(8192))
            except Exception:
                detail = {}
            code = str(detail.get('code') or detail.get('error_code') or '')
            invalid_key = 'api key' in str(detail.get('message', '')).lower() or code in ('invalid_api_key', 'no_api_key')
            logger.warning('Supabase verification failed: endpoint=%s status=%s code=%s', path.split('?')[0], error.code, code[:80])
            if path == '/auth/v1/user' and error.code in (401, 403) and not invalid_key:
                raise AdmissionError(401, 'Please sign in again to upload photos.') from None
            raise AdmissionError(503, 'Photo uploads are temporarily unavailable. Please try again shortly.') from None

    async def check_configuration(self):
        try:
            await asyncio.to_thread(self._request_json, '/auth/v1/settings')
        except Exception:
            raise RuntimeError('Face service cannot validate Supabase credentials. Check SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY/SUPABASE_ANON_KEY.') from None

    async def __call__(self, token):
        if not self.slots.acquire(blocking=False):
            raise AdmissionError(429, 'Authentication capacity reached. Retry later.', 5)
        # Release in the network thread; HTTP cancellation must not free its slot.
        return await asyncio.to_thread(self._lookup, token)

    def _lookup(self, token):
        try:
            # Issuer is only a routing/configuration check. Supabase still verifies
            # the signature, expiry and user on every request; never trust decoded claims.
            try:
                payload = token.split('.')[1]
                issuer = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4))).get('iss')
            except Exception:
                issuer = None
            if issuer and issuer.rstrip('/') != self.url + '/auth/v1':
                logger.error('Face service and client Supabase projects do not match')
                raise AdmissionError(503, 'Photo uploads are temporarily unavailable. Please try again shortly.')
            user = self._request_json('/auth/v1/user', token)
            owner = str(uuid.UUID(user['id']))
            profiles = self._request_json('/rest/v1/profiles?select=id&id=eq.' + owner, token)
            if not profiles or profiles[0].get('id') != owner:
                raise AdmissionError(403, 'Your account is not ready to upload. Please reopen CebSpot and try again.')
            return owner
        except AdmissionError:
            raise
        except Exception:
            logger.warning('Supabase verification unavailable', exc_info=False)
            raise AdmissionError(503, 'Photo uploads are temporarily unavailable. Please try again shortly.') from None
        finally:
            self.slots.release()


def process_image(connection, settings, source, media_type, directory):
    from services.face_blur import FaceBlurService
    try:
        service = FaceBlurService(replace(settings, temp_dir=Path(directory)))
        service.validate_startup()
        result = asyncio.run(service.anonymize_bytes(Path(source).read_bytes(), media_type))
        connection.send({'output_path': str(result.output_path), 'media_type': result.media_type,
                         'faces_detected': result.faces_detected, 'processing_time_ms': result.processing_time_ms})
    except Exception as error:
        # Keep the client response generic, but retain enough server-side
        # information to distinguish decoder, detector and process failures.
        logger.exception('face worker failed (%s)', type(error).__name__)
        connection.send({'error': 'Image could not be privacy processed.'})
    finally:
        connection.close()


def run_child(settings, source, media_type, directory, timeout=60, target=process_image):
    context = multiprocessing.get_context('spawn')
    reader, writer = context.Pipe(duplex=False)
    child = context.Process(target=target, args=(writer, settings, source, media_type, directory), daemon=True)
    try:
        child.start()
        writer.close()
        if not reader.poll(timeout):
            raise TimeoutError('Image processing timed out.')
        result = reader.recv()
        child.join(2)
        if child.is_alive() or result.get('error'):
            raise RuntimeError('Image could not be privacy processed.')
        output = Path(result['output_path']).resolve()
        if output.parent != Path(directory).resolve() or not output.is_file():
            raise RuntimeError('Invalid worker output.')
        return result
    finally:
        if child.pid and child.is_alive():
            child.terminate()
            child.join(2)
            if child.is_alive():
                child.kill()
                child.join()
        reader.close()
        writer.close()


@dataclass
class Job:
    id: str
    owner: str
    directory: Path
    created: float
    status: str = 'uploading'
    result: dict | None = None
    cancelled: bool = False


class JobRuntime:
    def __init__(self, settings, runner=None, *, queue_limit=16, max_jobs=32, per_user=2, rate=10, ttl=900, timeout=60):
        self.settings = settings
        self.root = settings.temp_dir / 'jobs'
        self.jobs, self.rates = {}, {}
        self.queue_limit, self.max_jobs, self.per_user, self.rate = queue_limit, max_jobs, per_user, rate
        self.ttl, self.timeout = ttl, timeout
        self.queue = asyncio.Queue(maxsize=queue_limit)
        self.runner = runner or self._run
        self.tasks = []
        self.lock_file = None

    async def _run(self, job, mime):
        return await asyncio.to_thread(run_child, self.settings, job.directory / 'upload', mime, job.directory, self.timeout)

    async def start(self):
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock_file = (self.root / 'worker.lock').open('a+b')
        try:
            if os.name == 'nt':
                import msvcrt
                self.lock_file.seek(0); self.lock_file.write(b'0'); self.lock_file.flush(); self.lock_file.seek(0)
                msvcrt.locking(self.lock_file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            self.lock_file.close(); self.lock_file = None
            raise RuntimeError('Only one face-service worker is supported.') from None
        for directory in self.root.glob('face-job-*'):
            self._cleanup(directory)
        self.tasks = [asyncio.create_task(self._worker()), asyncio.create_task(self._reaper())]

    def _cleanup(self, directory):
        resolved = directory.resolve()
        if resolved.parent != self.root.resolve() or not resolved.name.startswith('face-job-') or directory.is_symlink():
            raise RuntimeError('Invalid cleanup target.')
        shutil.rmtree(resolved, ignore_errors=True)

    def remove(self, job_id):
        job = self.jobs.pop(job_id, None)
        if job:
            self._cleanup(job.directory)

    def admit(self, owner):
        now = time.monotonic()
        self.rates = {key: times for key, times in self.rates.items() if times and times[-1] > now - 60}
        if owner not in self.rates and len(self.rates) >= 1024:
            raise AdmissionError(429, 'Admission capacity reached. Retry later.')
        times = self.rates.setdefault(owner, deque())
        while times and times[0] <= now - 60:
            times.popleft()
        active = [job for job in self.jobs.values() if job.status in ('uploading', 'queued', 'processing')]
        if len(times) >= self.rate or sum(job.owner == owner for job in active) >= self.per_user:
            raise AdmissionError(429, 'Photo limit reached. Wait before retrying.')
        if len(self.jobs) >= self.max_jobs or len(active) >= self.queue_limit + 1:
            raise AdmissionError(429, 'Photo queue is full. Retry later.')
        job_id = str(uuid.uuid4())
        directory = self.root / ('face-job-' + job_id)
        directory.mkdir(mode=0o700)
        job = Job(job_id, owner, directory, now)
        self.jobs[job.id] = job
        times.append(now)
        return job

    def enqueue(self, job, data, mime):
        if job.cancelled or job.id not in self.jobs:
            raise AdmissionError(409, 'Photo job cancelled.')
        if self.queue.full():
            raise AdmissionError(429, 'Photo queue is full. Retry later.')
        (job.directory / 'upload').write_bytes(data)
        job.status = 'queued'
        self.queue.put_nowait((job, mime))

    def cancel_owner(self, owner):
        pending = False
        for job in list(self.jobs.values()):
            if job.owner != owner:
                continue
            job.cancelled = True
            if job.status in ('processing', 'delivering'):
                pending = True
            else:
                self.remove(job.id)
        return pending

    async def _worker(self):
        while True:
            job, mime = await self.queue.get()
            try:
                if job.id not in self.jobs:
                    continue
                job.status = 'processing'
                # The runner kills and joins its child before returning. Cancelling
                # its supervising thread would leave native image work running.
                job.result = await self.runner(job, mime)
                if job.cancelled:
                    self.remove(job.id)
                    continue
                (job.directory / 'upload').unlink(missing_ok=True)
                for source in job.directory.glob('*-source*'):
                    source.unlink(missing_ok=True)
                job.status = 'complete'
            except Exception as error:
                logger.warning('face job failed (%s)', type(error).__name__)
                if job.cancelled:
                    self.remove(job.id)
                else:
                    job.status = 'failed'
                    self._cleanup(job.directory)
            finally:
                job.created = time.monotonic()
                self.queue.task_done()

    async def _reaper(self):
        while True:
            await asyncio.sleep(10)
            self.reap()

    def reap(self):
        for job in list(self.jobs.values()):
            if job.status in ('complete', 'failed', 'delivering') and time.monotonic() - job.created > self.ttl:
                self.remove(job.id)

    async def close(self):
        self.tasks[1].cancel()
        await asyncio.gather(self.tasks[1], return_exceptions=True)
        for job in list(self.jobs.values()):
            if job.status in ('queued', 'uploading'):
                self.remove(job.id)
        await self.queue.join()
        self.tasks[0].cancel()
        await asyncio.gather(self.tasks[0], return_exceptions=True)
        for job_id in list(self.jobs):
            self.remove(job_id)
        if self.lock_file:
            self.lock_file.close()
