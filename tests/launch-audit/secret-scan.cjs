// Never print secret values. Only aggregate findings and safe file paths are retained.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const known = [];
for (const f of ['.env.local', '.env.test.local']) for (const line of fs.readFileSync(path.join(root, f), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*?)\s*$/);
  if (m && /SECRET|PASSWORD|SERVICE_ROLE/.test(m[1]) && m[2].length >= 12) known.push({ name: m[1], value: m[2].replace(/^['"]|['"]$/g, '') });
}
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 200e6, windowsHide: true });
const files = [...new Set(git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean))];
const matches = []; const possible = []; let scanned = 0;
for (const f of files) {
  const full = path.join(root, f); if (!fs.existsSync(full) || !fs.statSync(full).isFile() || fs.statSync(full).size > 15e6) continue;
  const text = fs.readFileSync(full).toString('utf8'); scanned++;
  for (const k of known) if (text.includes(k.value)) matches.push({ file: f, kind: k.name });
  if (/\b(?:sk_live_|sk_test_|whsk_)[A-Za-z0-9]{20,}\b/.test(text)) possible.push({ file: f, kind: 'provider-private-key-pattern' });
  for (const token of text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || []) {
    try { const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url')); if (claims.role === 'service_role') possible.push({ file: f, kind: 'service-role-jwt' }); } catch {}
  }
}
const bundleRoot = path.join(root, '.codex-tmp/launch-audit-web');
const bundleMatches = []; const bundles = [];
function walk(dir) { for (const d of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir,d.name); if(d.isDirectory())walk(f);else if(/\.(js|html|json)$/.test(f)) { const bytes=fs.readFileSync(f); for(const k of known)if(bytes.includes(Buffer.from(k.value)))bundleMatches.push({file:path.relative(bundleRoot,f),kind:k.name}); bundles.push({file:path.relative(bundleRoot,f),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}); } } }
walk(bundleRoot);
const historicalPaths = git(['ls-tree','-r','--name-only','HEAD','.chrome-video-review','.codex-tmp']).trim().split('\n').filter(Boolean);
const currentIndexedPaths = files.filter(f => f.startsWith('.chrome-video-review/') || f.startsWith('.codex-tmp/'));
const historyCandidatePaths = git(['rev-list','--objects','--all']).split('\n').filter(l=>/\s(?:\.env(?:\.|$)|.*(?:Cookies|Login Data|Local Storage)\/)/.test(l)).length;
const historyPatternMatches = [];
try { const lines=git(['grep','-I','-l','-E','(sk_live_|sk_test_|whsk_)[A-Za-z0-9]{20,}','HEAD','--',':!package-lock.json']).trim().split('\n').filter(Boolean); historyPatternMatches.push(...lines); } catch(e) {if(e.status!==1)throw e;}
const report={scannedCurrentFiles:scanned,knownPrivateValueMatches:matches,privatePatternCandidates:possible,bundlePrivateValueMatches:bundleMatches,bundles,headBrowserAndScratchPaths:historicalPaths.length,currentIndexedBrowserAndScratchPaths:currentIndexedPaths.length,historySensitivePathCandidates:historyCandidatePaths,headPrivatePatternPaths:historyPatternMatches,limitations:'HEAD private-key pattern and historical filename inventory; not an exhaustive all-blob history or browser-session forensic scan.'};
fs.writeFileSync(path.join(__dirname,'evidence/secret-scan.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,bundles:bundles.filter(b=>b.bytes>1e6)},null,2));
