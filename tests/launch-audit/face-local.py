"""One local face pipeline and invalid-input probes, with a synthetic no-face JPEG."""
import io, json, os, socket, sys, threading, time, urllib.request, urllib.error
from pathlib import Path
root = Path(__file__).resolve().parents[2]
os.chdir(root / 'face-blur-service')
sys.path.insert(0, str(root / 'face-blur-service'))
os.environ['FACE_BLUR_TEMP_DIR'] = str(root / '.codex-tmp/launch-audit-face-temp')
from PIL import Image
import uvicorn
from app import app
sock = socket.socket(); sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]; sock.close()
server = uvicorn.Server(uvicorn.Config(app, host='127.0.0.1', port=port, log_level='error'))
thread = threading.Thread(target=server.run, daemon=True); thread.start()
results = []
def request(label, route, data=None, content_type=None):
    started = time.perf_counter()
    req = urllib.request.Request(f'http://127.0.0.1:{port}{route}', data=data, headers={'Content-Type':content_type} if content_type else {})
    try:
        response = urllib.request.urlopen(req, timeout=25)
    except urllib.error.HTTPError as error:
        response = error
    body = response.read()
    results.append({'case':label,'status':response.status,'bytes':len(body),'ms':round((time.perf_counter()-started)*1000)})
    return response.status, body
try:
    for attempt in range(150):
        if server.started: break
        time.sleep(.2)
    if not server.started: raise RuntimeError('Local server failed to start')
    request('health','/health')
    request('missing-image','/api/anonymize-jobs',b'','application/octet-stream')
    request('invalid-base64','/api/anonymize-base64',json.dumps({'image_base64':'not-base64!!','media_type':'image/jpeg'}).encode(),'application/json')
    output = io.BytesIO(); Image.new('RGB',(320,240),(180,200,180)).save(output,format='JPEG')
    boundary='audit-synthetic-boundary'
    body=(f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="synthetic.jpg"\r\nContent-Type: image/jpeg\r\n\r\n').encode()+output.getvalue()+f'\r\n--{boundary}--\r\n'.encode()
    status,raw=request('job-create','/api/anonymize-jobs',body,'multipart/form-data; boundary='+boundary)
    if status!=202: raise RuntimeError('Synthetic job creation failed')
    job=json.loads(raw)['job_id']
    for attempt in range(100):
        time.sleep(.2); status,raw=request('job-poll','/api/anonymize-jobs/'+job); result=json.loads(raw)
        if result['status']=='complete': break
        if result['status']=='failed': raise RuntimeError('Synthetic processing failed')
    status,raw=request('download-result','/api/anonymize-jobs/'+job+'/result')
    results[-1]['jpeg']=raw[:2]==b'\xff\xd8'; results[-1]['facesDetected']=result.get('faces_detected')
    time.sleep(.3); request('repeat-result-download','/api/anonymize-jobs/'+job+'/result')
finally:
    server.should_exit=True; thread.join(timeout=10)
    report={'kind':'local-real-face-service-synthetic-no-face-image','checks':results,'limitations':'No detector-accuracy, upload-size exhaustion or service-capacity claim.'}
    (root/'tests/launch-audit/evidence/face-local.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))
