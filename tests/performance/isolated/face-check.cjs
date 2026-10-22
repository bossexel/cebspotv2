'use strict';
// Optional SMALL integration check of a confirmed isolated face service. Never a bulk external-service workload.
const fs = require('node:fs');
const path = require('node:path');
const { loadEnv, root } = require('./config.cjs');
const { sleep } = require('./journeys.cjs');
async function main() {
  loadEnv();
  const url = new URL(process.env.PERF_FACE_URL || 'http://127.0.0.1:8000');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Face target must be a bare origin');
  if (process.env.PERF_FACE_ISOLATED_ACK !== 'yes' || (!local && process.env.PERF_FACE_ALLOWED_ORIGIN !== url.origin)) throw Error('Confirm an isolated face service with PERF_FACE_ISOLATED_ACK=yes and exact hosted allowed origin');
  if (!process.env.PERF_PHOTO_PATH || process.env.PERF_SYNTHETIC_MEDIA_ACK !== 'yes') throw Error('Provide a synthetic photo and PERF_SYNTHETIC_MEDIA_ACK=yes');
  const requests = [], begin = performance.now();
  async function call(operation, endpoint, init = {}, image = false) {
    const start = performance.now();
    const r = await fetch(url.origin + endpoint, { ...init, signal: AbortSignal.timeout(20000), redirect: 'error' });
    const bytes = new Uint8Array(await r.arrayBuffer());
    requests.push({ operation, status: r.status, elapsedMs: performance.now() - start, bytes: bytes.length });
    if (!r.ok) throw Error(`Face ${operation} HTTP ${r.status}`);
    return image ? bytes : JSON.parse(new TextDecoder().decode(bytes));
  }
  const result = { kind: 'isolated-face-integration', status: 'INCONCLUSIVE', requests };
  try {
    const health = await call('health', '/health');
    if (health.status !== 'ok' || health.service !== 'cebspot-face-anonymizer') throw Error('Unexpected face service');
    const form = new FormData(); form.append('image', new Blob([fs.readFileSync(process.env.PERF_PHOTO_PATH)], { type: 'image/jpeg' }), 'synthetic.jpg');
    const job = await call('job_create', '/api/anonymize-jobs', { method: 'POST', body: form });
    if (typeof job.job_id !== 'string' || !/^[a-f0-9-]+$/i.test(job.job_id)) throw Error('Invalid job identifier');
    let complete;
    const deadline = Date.now() + 300000;
    while (Date.now() < deadline) {
      await sleep(1000);
      const state = await call('job_poll', '/api/anonymize-jobs/' + job.job_id);
      if (state.status === 'failed') throw Error('Face job failed');
      if (state.status === 'complete') { complete = state; break; }
    }
    if (!complete) throw Error('Face job deadline exceeded');
    const image = await call('job_result', `/api/anonymize-jobs/${job.job_id}/result`, {}, true);
    if (image.length < 100 || image[0] !== 255 || image[1] !== 216) throw Error('Result is not a JPEG');
    result.status = 'PASS'; result.facesDetected = complete.faces_detected; result.processingTimeMs = complete.processing_time_ms;
    result.interpretation = 'Single synthetic no-face image pipeline check; does not test detector accuracy or face-service load capacity';
  } catch (error) { result.status = 'FAIL'; result.reason = /HTTP \d+/.test(error.message) ? error.message : 'Integration/deadline validation failed'; }
  result.elapsedMs = performance.now() - begin;
  const dir = path.join(root, 'tests/performance/evidence'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'face-' + Date.now() + '.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: result.status, requests: requests.length }));
  if (result.status !== 'PASS') process.exitCode = 1;
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
