const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm'); const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const calls = []; const stored = [];
const supabase = {
  storage: { from: () => ({ upload: async (...args) => { calls.push('upload'); return { error: null }; }, remove: async () => ({ error: null }), getPublicUrl: p => ({ data: { publicUrl: 'https://fixture.invalid/' + p } }) }) },
  from: table => { let data; const query = { insert: v => { data = v; stored.push({ table, value: v }); return query; }, select: () => query, single: async () => ({ data: { id: 'synthetic-id', ...data }, error: null }) }; return query; },
  rpc: async () => ({ data: null, error: null }),
};
function load(file) {
  const exports = {};
  const requireStub = name => {
    if (name === '../lib/supabase') return { supabase, hasSupabaseConfig: true };
    if (name === 'expo-file-system') return { EncodingType: { Base64: 'base64' }, readAsStringAsync: async () => { calls.push('native-file-read'); throw Error('readAsStringAsync is unavailable on web'); } };
    if (name === './activityService') return { activityService: { logActivity: async () => {} } };
    if (name === './localUpdateService') return { localUpdateService: { createLocalUpdate: async () => {} } };
    if (name === './imageAnonymization') return { imageAnonymizationService: { anonymizeImage: async uri => uri, cleanupProcessedImage: async () => {} } };
    throw Error('Unexpected test dependency ' + name);
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,require:requireStub,console,Date,Uint8Array,URL,fetch}); return exports;
}
async function main() {
  const findings = [];
  const proof = load('src/services/paymentProofService.ts').paymentProofService;
  const uri = 'blob:http://app.test/synthetic-proof';
  findings.push({case:'browser-proof',returned:await proof.uploadProof(uri,'synthetic-user'),storageCalls:calls.length});
  const submission = load('src/services/spotSubmissionService.ts').spotSubmissionService;
  await submission.createSubmission({submitter_id:'synthetic-user',name:'Synthetic venue',description:'Test',category:'Cafe',categories:['Cafe'],address:'Cebu',latitude:10,longitude:123,images:[],media:[{id:'asset',uri:'blob:http://app.test/synthetic-video',type:'video',mimeType:'video/mp4'}]},'Synthetic User');
  findings.push({case:'browser-video-submission',storedImages:stored.at(-1).value.images,storageCalls:calls.length});
  const documents = load('src/services/ownerVerificationDocumentService.ts').ownerVerificationDocumentService;
  try {await documents.upload([{uri:'blob:http://app.test/synthetic-document',name:'permit.pdf',mimeType:'application/pdf'}],'synthetic-request');}
  catch(e) {findings.push({case:'owner-document-web',error:e.message,classification:'Source executed with the unavailable web file-reader modeled; installed ExponentFileSystemShim has no readAsStringAsync'});}
  fs.writeFileSync(path.join(__dirname,'evidence/media-probes.json'),JSON.stringify({kind:'actual-service-code-with-storage-adapters',findings},null,2));console.log(JSON.stringify(findings,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
