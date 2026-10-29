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
    './mediaCompression':{mediaLimits:{document:{}},async compressPhoto(uri){return uri+'-compressed.jpg'},async cleanupMedia(){}},
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
  const calls=[];let uploads=0,healthChecks=0;
  const service=load('src/services/imageAnonymization.ts',{
    '../lib/supabase':{hasSupabaseConfig:true,supabase:{auth:{async getSession(){return {data:{session:options.anonymous?null:{access_token:'synthetic-session'}},error:null}}}}},
    './mediaCompression':{mediaLimits:{privacyInput:{}},async compressPhoto(uri){return uri},async cleanupMedia(){}},
    'react-native':{Platform:{OS:options.platform??'android'},Image:{getSize(uri,cb){cb(32,32)}}},
    'expo-image-manipulator':{SaveFormat:{JPEG:'jpeg'},async manipulateAsync(){return {uri:'file:///compressed.jpg',width:32,height:32}}},
    'expo-file-system':{cacheDirectory:'file:///cache/',EncodingType:{Base64:'base64'},FileSystemUploadType:{MULTIPART:1},
      async getInfoAsync(){return {exists:true,size:20}},async deleteAsync(){},async copyAsync(){},
      async uploadAsync(url,uri,input){uploads++;calls.push({url,input});return {status:options.statuses?.[uploads-1]??options.status??202,body:JSON.stringify({job_id:'synthetic-job',detail:'Photo limit reached. Wait before retrying.'})}},
      async downloadAsync(url,uri,input){calls.push({url,input});return {status:200}}},
  },{__DEV__:true,process:{env:{EXPO_PUBLIC_FACE_BLUR_API_URL:'https://fixture.invalid'}},AbortController,FormData,Blob,URL,
    async fetch(url,input){calls.push({url,input});if(url==='blob:synthetic.png')return new Response('synthetic-original');if(url.endsWith('/health')){const status=options.healthStatuses?.[healthChecks++]??200;return new Response(JSON.stringify({status:status===200?'ok':'warming',service:'cebspot-face-anonymizer'}),{status})}if(url.endsWith('/result'))return new Response('synthetic-anonymized',{status:200});if(input?.method==='POST')return new Response(JSON.stringify({job_id:'synthetic-job'}),{status:202});return new Response(JSON.stringify({status:options.jobStatus??'complete',detail:'Synthetic processing failure',faces_detected:0,processing_time_ms:1}),{status:200})},Response});
  return {service:service.imageAnonymizationService,calls,get uploads(){return uploads},get healthChecks(){return healthChecks}};
}
test('Android authenticates job creation, polling and result download',async()=>{
  const f=face();await f.service.anonymizeImage('file:///synthetic.png');
  const privateCalls=f.calls.filter(c=>c.url.includes('/api/'));assert.equal(privateCalls.length,3);
  for(const call of privateCalls)assert.equal(call.input.headers.Authorization,'Bearer synthetic-session');
  const creation=privateCalls[0].input;
  assert.match(creation.headers['X-Idempotency-Key'],/^face-[A-Za-z0-9._:-]{16,128}$/);
  assert.equal(creation.fieldName,'image');assert.equal(creation.uploadType,1);assert.equal(creation.mimeType,'image/jpeg');
  assert.ok(!f.calls.find(c=>c.url.endsWith('/health')).input.headers);
});
test('Android retries job creation with the same valid key and preserves auth and multipart field',async()=>{
  const f=face({statuses:[503,202]});await f.service.anonymizeImage('file:///synthetic.png');
  const creates=f.calls.filter(c=>c.url.includes('/api/anonymize-jobs')&&c.input?.fieldName==='image');
  assert.equal(creates.length,2);
  const keys=creates.map(call=>call.input.headers['X-Idempotency-Key']);
  assert.match(keys[0],/^[A-Za-z0-9._:-]{16,128}$/);assert.equal(keys[1],keys[0]);
  for(const call of creates){assert.equal(call.input.headers.Authorization,'Bearer synthetic-session');assert.equal(call.input.fieldName,'image');assert.equal(call.input.uploadType,1);}
});
test('cold health check retries and recovers before accepting a photo job',async()=>{
  const f=face({healthStatuses:[503,200]});await f.service.checkAvailability();
  assert.equal(f.healthChecks,2);
});
test('failed processing is surfaced as a privacy-safe failure',async()=>{
  const f=face({jobStatus:'failed'});
  await assert.rejects(f.service.anonymizeImage('file:///synthetic.png'),/original photo was not uploaded/i);
  assert.equal(f.uploads,1);
});
test('missing session and rate limits fail closed without duplicate uploads',async()=>{
  const anonymous=face({anonymous:true});await assert.rejects(anonymous.service.anonymizeImage('file:///synthetic.png'),/Sign in/);assert.equal(anonymous.uploads,0);
  const limited=face({status:429});await assert.rejects(limited.service.anonymizeImage('file:///synthetic.png'),/Photo limit/);assert.equal(limited.uploads,1);
});
test('face-processing failure prevents both public Storage upload and submission insert',async()=>{
  let storageUploads=0,submissionInserts=0;
  const supabase={
    async rpc(){return {data:1,error:null}},
    storage:{from(){return {async upload(){storageUploads++;return {error:null}}}}},
    from(table){assert.equal(table,'spot_submissions');return {insert(){submissionInserts++;return {select(){return {async single(){return {data:{},error:null}}}}}}}},
  };
  const {spotSubmissionService}=load('src/services/spotSubmissionService.ts',{
    '../lib/supabase':{hasSupabaseConfig:true,supabase},
    './mediaCompression':{async cleanupMedia(){},async compressVideo(){}},
    '../utils/mediaFile':{isLocalFileUri:()=>true,isBrowserBlobUri:()=>false,async readMediaBody(){throw Error('Must not read the original photo')}},
    './imageAnonymization':{imageAnonymizationService:{async anonymizeImage(){throw Error('Photo processing is temporarily unavailable.')},async cleanupProcessedImage(){}}},
    './activityService':{activityService:{async logActivity(){}}},
  });
  const submission={name:'Synthetic Cafe',description:'Synthetic caption',category:'Cafe',address:'Cebu',latitude:10,longitude:123,
    images:['file:///synthetic-original.jpg'],submitter_id:'synthetic-user',reservation_fee:0,
    media:[{id:'synthetic-cover',uri:'file:///synthetic-original.jpg',type:'image'}]};
  await assert.rejects(spotSubmissionService.createSubmission(submission,'Synthetic User'),/temporarily unavailable/);
  assert.equal(storageUploads,0);assert.equal(submissionInserts,0);
});
