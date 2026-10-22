'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root } = require('./config.cjs');
async function main() {
  const tools = Object.fromEntries(['docker', 'supabase', 'k6', 'ffmpeg', 'adb'].map(name => {
    const probe = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [name], { encoding: 'utf8', timeout: 5000 });
    return [name, { onPath: probe.status === 0 }];
  }));
  const adbSdk = process.platform === 'win32' && path.join(process.env.LOCALAPPDATA || '', 'Android/Sdk/platform-tools/adb.exe');
  let localApi;
  try {
    const res = await fetch('http://127.0.0.1:54321/auth/v1/health', { signal: AbortSignal.timeout(2000) });
    localApi = { reachable: res.ok, status: res.status };
  } catch { localApi = { reachable: false, reason: 'Local connection failed or timed out; no HTTP response' }; }
  const result = { kind: 'prerequisite-inspection', dateUtc: new Date().toISOString(), node: process.version, tools,
    androidSdkAdbExists: Boolean(adbSdk && fs.existsSync(adbSdk)), localApi,
    localStackPrepared: fs.existsSync(path.join(root, 'tests/performance/local-stack/supabase/config.toml')),
    syntheticPhotoPrepared: fs.existsSync(path.join(root, 'tests/performance/.private/media/synthetic.jpg')),
    syntheticVideoPrepared: fs.existsSync(path.join(root, 'tests/performance/.private/media/synthetic.mp4')),
    target: 'Only a loopback health probe was attempted; no hosted target traffic',
    dockerDesktopAtDefaultLocation: fs.existsSync('C:/Program Files/Docker/Docker/resources/bin/docker.exe') };
  const dir = path.join(root, 'tests/performance/evidence'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'prerequisites.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
if (require.main === module) main();
