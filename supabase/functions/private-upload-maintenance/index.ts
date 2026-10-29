import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getRequiredEnv, makeServiceClient } from '../_shared/paymongo.ts';
import { sha256 } from '../_shared/paymentSignature.ts';

Deno.serve(async (request: Request) => {
  if(request.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  if(request.method!=='POST')return jsonResponse({error:'Method not allowed.'},405);
  try {
    const token=getRequiredEnv('PRIVATE_UPLOAD_WORKER_TOKEN');
    if(token.length<32 || await sha256(request.headers.get('authorization')??'')!==await sha256(`Bearer ${token}`)) {
      return jsonResponse({error:'Server worker authentication required.'},401);
    }
    const client=makeServiceClient();
    const {data,error}=await client.rpc('list_expired_private_uploads',{batch_size:50});
    if(error)throw new Error('Cleanup lookup unavailable.');
    let removed=0;
    for(const bucket of ['payment-proofs','owner-verification-documents']) {
      const names=(data??[]).filter((row: {bucket_id:string})=>row.bucket_id===bucket).map((row: {object_name:string})=>row.object_name);
      if(names.length){const result=await client.storage.from(bucket).remove(names);if(result.error)throw new Error('Cleanup unavailable.');removed+=names.length;}
    }
    return jsonResponse({ok:true,removed});
  } catch {return jsonResponse({error:'Private upload cleanup unavailable. Retry the scheduled job.'},503);}
});
