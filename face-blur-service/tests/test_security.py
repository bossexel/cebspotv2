"""No network or real personal images. Exercise the actual ASGI boundary."""
import asyncio
import io
import json
import multiprocessing
import sys
import tempfile
import time
import unittest
from dataclasses import replace
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app import create_app
from services.face_blur import FaceBlurSettings, PNG_SIGNATURE
from services.job_runtime import AdmissionError, JobRuntime, run_child


async def request(app, path='/api/anonymize-jobs', method='POST', token='customer-a', data=PNG_SIGNATURE+b'synthetic', mime='image/png', raw=None, stalled=False):
    boundary = 'testboundary'
    body = raw if raw is not None else (f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="synthetic.png"\r\nContent-Type: {mime}\r\n\r\n'.encode()+data+f'\r\n--{boundary}--\r\n'.encode())
    headers=[(b'content-type', f'multipart/form-data; boundary={boundary}'.encode())]
    if token is not None: headers.append((b'authorization', ('Bearer '+token).encode()))
    messages=[]; reads=0
    async def receive():
        nonlocal reads
        reads+=1
        if stalled: await asyncio.Future()
        if reads==1: return {'type':'http.request','body':body,'more_body':False}
        return {'type':'http.disconnect'}
    async def send(message): messages.append(message)
    scope={'type':'http','asgi':{'version':'3.0'},'http_version':'1.1','method':method,'scheme':'https','path':path,
           'raw_path':path.encode(),'query_string':b'','headers':headers,'client':('127.0.0.1',1),'server':('test',443)}
    await app(scope, receive, send)
    start=next(m for m in messages if m['type']=='http.response.start')
    output=b''.join(m.get('body',b'') for m in messages if m['type']=='http.response.body')
    return start['status'], output, dict(start['headers']), reads


def hang(connection, settings, source, mime, directory):
    time.sleep(30)


class SecurityTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.settings=replace(FaceBlurSettings.from_env(),temp_dir=Path(self.temp.name),
            short_model_path=ROOT/'models/blaze_face_short_range.tflite',full_model_path=ROOT/'models/blaze_face_full_range.tflite',max_image_bytes=1000)
        self.running=0;self.peak=0;self.gate=asyncio.Event();self.gate.set()
        async def runner(job,mime):
            self.running+=1;self.peak=max(self.peak,self.running)
            try:
                await self.gate.wait()
                output=job.directory/'result.png';output.write_bytes(PNG_SIGNATURE)
                return {'output_path':str(output),'media_type':mime,'faces_detected':0,'processing_time_ms':1}
            finally: self.running-=1
        self.runtime=JobRuntime(self.settings,runner,queue_limit=2,max_jobs=4,rate=3)
        async def verify(token):
            if token=='invalid': raise AdmissionError(401,'Invalid session.')
            return token
        self.app=create_app(self.settings,verify,self.runtime,upload_timeout=.02)
        self.lifespan=self.app.router.lifespan_context(self.app)
        await self.lifespan.__aenter__()

    async def asyncTearDown(self):
        self.gate.set()
        await self.lifespan.__aexit__(None,None,None)
        self.temp.cleanup()

    async def test_app_parent_keeps_native_image_runtime_unloaded(self):
        self.assertNotIn('cv2', sys.modules)
        self.assertNotIn('mediapipe', sys.modules)

    async def test_auth_before_read_and_private_result(self):
        for token in (None,'invalid'):
            status,_,_,reads=await request(self.app,token=token)
            self.assertEqual(status,401);self.assertEqual(reads,0)
        status,body,_,_=await request(self.app)
        self.assertEqual(status,202);job_id=json.loads(body)['job_id']
        await self.runtime.queue.join()
        for suffix in ('','/result'):
            self.assertEqual((await request(self.app,f'/api/anonymize-jobs/{job_id}{suffix}',method='GET',token='customer-b'))[0],404)
        self.assertEqual((await request(self.app,f'/api/anonymize-jobs/{job_id}',method='GET'))[0],200)
        status,body,headers,_=await request(self.app,f'/api/anonymize-jobs/{job_id}/result',method='GET')
        self.assertEqual(status,200);self.assertEqual(headers[b'cache-control'],b'no-store');self.assertEqual(body,PNG_SIGNATURE)
        self.assertNotIn(job_id,self.runtime.jobs);self.assertEqual(list(self.runtime.root.glob('face-job-*')),[])

    async def test_cancel_owner_never_cancels_other_users_and_removes_running_output(self):
        self.gate.clear()
        _,body,_,_=await request(self.app)
        job_id=json.loads(body)['job_id']
        await asyncio.sleep(.01)
        _,other,_,_=await request(self.app,token='customer-b')
        other_id=json.loads(other)['job_id']
        status,_,_,_=await request(self.app,method='DELETE')
        self.assertEqual(status,202)
        self.assertIn(other_id,self.runtime.jobs)
        self.assertEqual((await request(self.app,f'/api/anonymize-jobs/{job_id}',method='GET'))[0],404)
        self.gate.set();await self.runtime.queue.join()
        self.assertNotIn(job_id,self.runtime.jobs)
        self.assertIn(other_id,self.runtime.jobs)
        self.assertEqual((await request(self.app,method='DELETE',token=None))[0],401)

    async def test_internal_account_cleanup_requires_server_secret(self):
        from unittest.mock import patch
        owner='30000000-0000-4000-8000-000000000001'
        _,body,_,_=await request(self.app,token=owner)
        await self.runtime.queue.join()
        job_id=json.loads(body)['job_id']
        token='synthetic-worker-token-at-least-32-characters'
        with patch.dict('os.environ',{'ACCOUNT_DELETION_WORKER_TOKEN':token}):
            self.assertEqual((await request(self.app,'/internal/account-jobs/'+owner,method='DELETE',token=owner))[0],401)
            self.assertEqual((await request(self.app,'/internal/account-jobs/'+owner,method='DELETE',token=token))[0],200)
        self.assertNotIn(job_id,self.runtime.jobs)

    async def test_verifier_rejects_existing_auth_identity_with_locked_or_missing_profile(self):
        from unittest.mock import patch
        from services.job_runtime import SupabaseVerifier
        owner='30000000-0000-4000-8000-000000000001'
        class Reply:
            def __init__(self, value): self.value=value
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, size): return json.dumps(self.value).encode()
        with patch.dict('os.environ',{'SUPABASE_URL':'https://synthetic.invalid','SUPABASE_ANON_KEY':'synthetic-public-key'}):
            verifier=SupabaseVerifier()
        for profiles in ([],[{'id':owner}]):
            with patch('services.job_runtime.urlopen',side_effect=[Reply({'id':owner}),Reply(profiles)]) as network:
                if profiles: self.assertEqual(await verifier('synthetic'),owner)
                else:
                    with self.assertRaises(AdmissionError) as failure: await verifier('synthetic')
                    self.assertEqual(failure.exception.status,401)
                self.assertEqual(network.call_count,2)
                self.assertIn('/rest/v1/profiles?',network.call_args[0][0].full_url)

    async def test_mime_size_stream_limit_timeout_and_interruption_cleanup(self):
        inputs=[({'mime':'text/html'},415),({'data':b'fake'},415),({'data':b''},413),({'raw':b'x'*66537},413)]
        for index,(kwargs,expected) in enumerate(inputs):
            status,_,_,_=await request(self.app,token=f'customer-{index}',**kwargs)
            self.assertEqual(status,expected);self.assertFalse(self.runtime.jobs)
        self.assertEqual((await request(self.app,token='stalled',stalled=True))[0],408)
        self.assertFalse(self.runtime.jobs);self.assertEqual(list(self.runtime.root.glob('face-job-*')),[])

    async def test_queue_per_user_limits_and_single_concurrency(self):
        self.gate.clear()
        self.assertEqual((await request(self.app))[0],202)
        await asyncio.sleep(.001)
        self.assertEqual((await request(self.app))[0],202)
        status,_,headers,reads=await request(self.app)
        self.assertEqual(status,429);self.assertEqual(headers[b'retry-after'],b'60');self.assertEqual(reads,0)
        self.assertEqual((await request(self.app,token='customer-b'))[0],202)
        self.assertEqual((await request(self.app,token='customer-c'))[0],429)
        self.gate.set();await self.runtime.queue.join();self.assertEqual(self.peak,1)

    async def test_rate_and_retained_state_are_bounded(self):
        for _ in range(3):
            status,body,_,_=await request(self.app)
            self.assertEqual(status,202)
            await self.runtime.queue.join();self.runtime.remove(json.loads(body)['job_id'])
        self.assertEqual((await request(self.app))[0],429)
        for i in range(4):
            self.assertEqual((await request(self.app,token=f'other-{i}'))[0],202)
            await self.runtime.queue.join()
        self.assertEqual((await request(self.app,token='over-cap'))[0],429)
        self.assertEqual(len(self.runtime.jobs),4)

    async def test_worker_failure_cleanup_and_legacy_routes_retired(self):
        async def failure(job,mime): raise TimeoutError('private details must not leak')
        self.runtime.runner=failure
        status,body,_,_=await request(self.app);self.assertEqual(status,202)
        job_id=json.loads(body)['job_id'];await self.runtime.queue.join()
        status,body,_,_=await request(self.app,f'/api/anonymize-jobs/{job_id}',method='GET')
        self.assertEqual(json.loads(body)['status'],'failed');self.assertNotIn(b'private details',body)
        self.assertEqual(list(self.runtime.root.glob('face-job-*')),[])
        for path in ('anonymize','anonymize-upload','anonymize-base64'):
            self.assertEqual((await request(self.app,'/api/'+path))[0],410)

    async def test_ttl_releases_retained_capacity_and_removes_private_files(self):
        status,body,_,_=await request(self.app);self.assertEqual(status,202)
        job_id=json.loads(body)['job_id'];await self.runtime.queue.join()
        job=self.runtime.jobs[job_id];directory=job.directory
        job.created=time.monotonic()-901
        self.runtime.reap()
        self.assertNotIn(job_id,self.runtime.jobs);self.assertFalse(directory.exists())

    async def test_second_worker_fails_and_cleanup_stays_in_job_root(self):
        other=JobRuntime(self.settings)
        with self.assertRaisesRegex(RuntimeError,'one face-service worker'): await other.start()
        with self.assertRaisesRegex(RuntimeError,'cleanup target'): self.runtime._cleanup(self.settings.temp_dir)

    async def test_process_timeout_terminates_child_before_return(self):
        before={p.pid for p in multiprocessing.active_children()}
        with self.assertRaises(TimeoutError):
            await asyncio.to_thread(run_child,self.settings,self.runtime.root/'unused','image/png',self.runtime.root,.05,hang)
        self.assertEqual({p.pid for p in multiprocessing.active_children()},before)

    async def test_real_detector_blank_image_smoke(self):
        from PIL import Image
        image=io.BytesIO();Image.new('RGB',(32,32),'white').save(image,format='PNG')
        settings=replace(self.settings,max_image_bytes=100000)
        job=self.runtime.admit('detector-smoke')
        (job.directory/'upload').write_bytes(image.getvalue())
        result=await asyncio.to_thread(run_child,settings,job.directory/'upload','image/png',job.directory,30)
        self.assertEqual(result['faces_detected'],0);self.assertTrue(Path(result['output_path']).is_file())
        self.runtime.remove(job.id)


if __name__=='__main__': unittest.main(verbosity=2)
