const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-client.cjs');
const {ids}=require('./fixtures.cjs');
const reservation='40000000-0000-4000-8000-000000000001';
function fixture(options={}) {
  const calls=[];let reads=0;
  const path=`${ids.a}/${reservation}/40000000-0000-4000-8000-000000000002.png`;
  const client={functions:{async invoke(name,input){calls.push({name,input});return {data:{path:options.path??path},error:options.error??null}}},storage:{from(){return {async createSignedUrl(name,seconds){calls.push({name,seconds});return {data:{signedUrl:'https://fixture.invalid/signed'},error:null}}}}}};
  const {paymentProofService}=load('src/services/paymentProofService.ts',{
    './mediaCompression':{mediaLimits:{document:{}},async compressPhoto(uri){return uri+'-compressed.jpg'},async cleanupMedia(){}},
    'expo-file-system':{EncodingType:{Base64:'base64'},async getInfoAsync(){return {exists:true,size:options.size??9}},async readAsStringAsync(){reads++;return 'iVBORw0KGgoA'}},
    '../lib/supabase':{supabase:client,hasSupabaseConfig:true},
  });
  return {service:paymentProofService,calls,get reads(){return reads},path};
}
test('Android proof client sends bytes to authenticated request-bound endpoint',async()=>{
  const f=fixture();assert.equal(await f.service.uploadProof('file:///synthetic.png',ids.a,reservation),f.path);
  assert.equal(f.calls[0].name,`private-upload?kind=reservation_proof&resourceId=${reservation}`);
  assert.equal(f.calls[0].input.headers['Content-Type'],'image/jpeg');assert.equal(f.calls[0].input.body.byteLength,9);
});
test('external URLs, unsupported MIME and oversized local files never enter an upload',async()=>{
  for(const [uri,size] of [['https://fixture.invalid/proof.png',9],['file:///synthetic.svg',9],['file:///synthetic.png',5242881]]) {
    const f=fixture({size});await assert.rejects(f.service.uploadProof(uri,ids.a,reservation));assert.equal(f.calls.length,0);assert.equal(f.reads,0);
  }
});
test('failed or incorrectly scoped server responses never become attached proof',async()=>{
  for(const options of [{error:{message:'Injected failure'}},{path:`${ids.b}/${reservation}/proof.png`}]) {
    const f=fixture(options);await assert.rejects(f.service.uploadProof('file:///synthetic.png',ids.a,reservation));
  }
});
test('reviewers open only short-lived signed private paths',async()=>{
  const f=fixture();assert.equal(await f.service.getProofUrl(f.path),'https://fixture.invalid/signed');assert.equal(f.calls[0].seconds,300);
  for(const path of ['file:///local.png','https://fixture.invalid/public.png',`${ids.a}/legacy.png`]) await assert.rejects(f.service.getProofUrl(path),/resubmitted/);
});
