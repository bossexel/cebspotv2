import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getUserFromRequest, makeServiceClient } from '../_shared/paymongo.ts';
import { readPrivateUpload, privateUploadExtension, UploadError } from '../_shared/privateUpload.ts';

// Accept bytes only after persistent admission for an owned active reservation
// or owner application draft. The service role remains server-side.
Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);
  try {
    const client = makeServiceClient(15000);
    let user;
    try { user = await getUserFromRequest(request, client); }
    catch { return jsonResponse({ error: 'Authentication required.' }, 401); }
    const url = new URL(request.url);
    const id = url.searchParams.get('resourceId') ?? '';
    const kind = url.searchParams.get('kind');
    if (!['reservation_proof','owner_document'].includes(kind ?? '') || !/^[0-9a-f-]{36}$/i.test(id)) {
      return jsonResponse({ error: 'Invalid upload request.' }, 400);
    }
    // Persistent admission runs before reading bytes; its profile row lock
    // serializes quotas across Edge isolates and simultaneous requests.
    const { data: admissionData, error: admissionError } = await client.rpc('claim_private_upload', {
      customer_id:user.id,upload_kind:kind,target_resource_id:id,
    });
    if (admissionError) return jsonResponse({ error: 'Upload request unavailable or expired.' }, admissionError.code === '42501' ? 403 : 503);
    const admission = Array.isArray(admissionData) ? admissionData[0] : admissionData;
    if (!admission?.allowed) return new Response(JSON.stringify({error:'Private upload limit reached. Retry later.',retryAfter:admission?.retry_after ?? 60}), {
      status:429,headers:{...corsHeaders,'Content-Type':'application/json','Retry-After':String(admission?.retry_after ?? 60)},
    });
    const mime = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const bytes = await readPrivateUpload(request);
    const extension = privateUploadExtension(bytes, mime);
    const path = `${user.id}/${id}/${admission.id}.${extension}`;
    const bucket = kind === 'owner_document' ? 'owner-verification-documents' : 'payment-proofs';
    const uploaded = await client.storage.from(bucket).upload(path, bytes, { contentType: mime, upsert: false });
    if (uploaded.error) return jsonResponse({ error: 'Private upload unavailable. Retry while your hold is active.' }, 503);
    const active = await client.rpc('account_is_active', { customer_id: user.id });
    if (active.error || active.data !== true) {
      await client.storage.from(bucket).remove([path]);
      return jsonResponse({ error: 'Account unavailable. Upload was not attached.' }, active.error ? 503 : 409);
    }
    return jsonResponse({ path }, 201);
  } catch (error) {
    if (error instanceof UploadError) return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: 'Private upload unavailable.' }, 503);
  }
});
