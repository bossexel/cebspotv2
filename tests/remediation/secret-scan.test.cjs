const {test}=require('node:test');const assert=require('node:assert/strict');
const {scan}=require('../../scripts/remediation-secret-scan.cjs');
test('scanner detects private bytes in binary artifacts without returning values',()=>{
 const value='private-value-created-only-for-this-test';
 const result=scan(Buffer.concat([Buffer.from([0,255,1]),Buffer.from(value)]),[value]);assert.deepEqual(result,['known-private-value']);assert.ok(!JSON.stringify(result).includes(value));
 const token='eyJ0eXAiOiJKV1QifQ.'+Buffer.from('{"role":"service_role"}').toString('base64url')+'.synthetic';assert.ok(scan(Buffer.from(token)).includes('service-role-jwt'));
 assert.deepEqual(scan(Buffer.from('pk_test_public_and_sk_test_fixture')),[]);
});
