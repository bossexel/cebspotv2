const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-client.cjs');
const {ids}=require('./fixtures.cjs');
const draft='40000000-0000-4000-8000-000000000001';
function documents(options={}) {
  const calls=[];let reads=0;
  const client={auth:{async getUser(){return {data:{user:options.anonymous?null:{id:ids.a}},error:null}}},
    functions:{async invoke(name,input){calls.push({name,input});return {data:{path:options.path??`${ids.a}/${draft}/40000000-0000-4000-8000-000000000002.png`},error:null}}},
    storage:{from(){return {async createSignedUrl(path,seconds){calls.push({path,seconds});return {data:{signedUrl:'https://fixture.invalid/signed'},error:null}}}}}};
  const service=load('src/services/ownerVerificationDocumentService.ts',{
    'expo-file-system':{EncodingType:{Base64:'base64'},async getInfoAsync(){return {exists:true,size:options.size??9}},async readAsStringAsync(){reads++;return 'iVBORw0KGgoA'}},
    '../lib/supabase':{hasSupabaseConfig:true,supabase:client},
  }).ownerVerificationDocumentService;
  return {service,calls,get reads(){return reads}};
}
test('owner client uploads only authenticated local supported files into the allocated application',async()=>{
  const f=documents();await f.service.upload([{uri:'file:///synthetic.png',mimeType:'image/png'}],draft);
  assert.equal(f.calls[0].name,`private-upload?kind=owner_document&resourceId=${draft}`);assert.equal(f.calls[0].input.body.byteLength,9);
  for(const [options,document] of [[{anonymous:true},{uri:'file:///a.png'}],[{size:5242881},{uri:'file:///a.png'}],[{},{uri:'https://fixture.invalid/a.png'}],[{},{uri:'file:///a.webp',mimeType:'image/webp'}]]) {
    const bad=documents(options);await assert.rejects(bad.service.upload([document],draft));assert.equal(bad.calls.length,0);assert.equal(bad.reads,0);
  }
});
test('owner client rejects foreign returned paths and public viewing URLs',async()=>{
  const f=documents({path:`${ids.b}/${draft}/fake.png`});await assert.rejects(f.service.upload([{uri:'file:///a.png'}],draft),/owned document/);
  await assert.rejects(f.service.getSignedUrl('https://fixture.invalid/a.png'),/Invalid private/);
  const good=documents();await good.service.getSignedUrl(`${ids.a}/${draft}/synthetic.png`);assert.equal(good.calls[0].seconds,600);
});
function face(options={}) {
  const calls=[];let uploads=0;
  const service=load('src/services/imageAnonymization.ts',{
    '../lib/supabase':{hasSupabaseConfig:true,supabase:{auth:{async getSession(){return {data:{session:options.anonymous?null:{access_token:'synthetic-session'}},error:null}}}}},
    'react-native':{Platform:{OS:'android'}},
    'expo-image-manipulator':{SaveFormat:{JPEG:'jpeg'},async manipulateAsync(){return {uri:'file:///compressed.jpg',width:32,height:32}}},
    'expo-file-system':{cacheDirectory:'file:///cache/',EncodingType:{Base64:'base64'},FileSystemUploadType:{MULTIPART:1},
      async getInfoAsync(){return {exists:true,size:20}},async deleteAsync(){},async copyAsync(){},
      async uploadAsync(url,uri,input){uploads++;calls.push({url,input});return {status:options.status??202,body:JSON.stringify({job_id:'synthetic-job',detail:'Photo limit reached. Wait before retrying.'})}},
      async downloadAsync(url,uri,input){calls.push({url,input});return {status:200}}},
  },{__DEV__:true,process:{env:{EXPO_PUBLIC_FACE_BLUR_API_URL:'https://fixture.invalid'}},AbortController,
    async fetch(url,input){calls.push({url,input});return new Response(JSON.stringify(url.endsWith('/health')?{status:'ok',service:'cebspot-face-anonymizer'}:{status:'complete',faces_detected:0,processing_time_ms:1}),{status:200})},Response});
  return {service:service.imageAnonymizationService,calls,get uploads(){return uploads}};
}
test('Android authenticates job creation, polling and result download',async()=>{
  const f=face();await f.service.anonymizeImage('file:///synthetic.png');
  const privateCalls=f.calls.filter(c=>c.url.includes('/api/'));assert.equal(privateCalls.length,3);
  for(const call of privateCalls)assert.equal(call.input.headers.Authorization,'Bearer synthetic-session');
  assert.ok(!f.calls.find(c=>c.url.endsWith('/health')).input.headers);
});
test('missing session and rate limits fail closed without duplicate uploads',async()=>{
  const anonymous=face({anonymous:true});await assert.rejects(anonymous.service.anonymizeImage('file:///synthetic.png'),/Sign in/);assert.equal(anonymous.uploads,0);
  const limited=face({status:429});await assert.rejects(limited.service.anonymizeImage('file:///synthetic.png'),/Photo limit/);assert.equal(limited.uploads,1);
});
