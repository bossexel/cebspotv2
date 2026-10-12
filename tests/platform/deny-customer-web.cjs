const {spawnSync}=require('node:child_process');
const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const result=spawnSync(process.execPath,[path.join(root,'node_modules/expo/bin/cli'),'export','--platform','web',
  '--output-dir','.codex-tmp/remediation-denied-customer-web-phase7','--max-workers','1'],{
  cwd:root,env:{...process.env,EXPO_PUBLIC_CEBSPOT_TARGET:'android',EXPO_NO_WEB_SETUP:'1'},encoding:'utf8',windowsHide:true,timeout:120000,
});
assert.equal(result.error,undefined);
assert.notEqual(result.status,0,'Default customer/owner web export must be rejected');
assert.match(result.stdout+result.stderr,/Android only|admin target|not configured|not supported|platform.*web/i);
console.log('PASS default customer/owner web export is rejected; only explicit admin target is supported.');
