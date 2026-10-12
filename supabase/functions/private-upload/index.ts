import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getUserFromRequest, makeServiceClient } from '../_shared/paymongo.ts';
import { readPrivateUpload, privateUploadExtension, UploadError } from '../_shared/privateUpload.ts';

// This endpoint accepts bytes only after verifying a customer-owned, active
// reservation. The service role remains here; clients cannot insert objects.
Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);
  try {
    const client = makeServiceClient();
    let user;
    try { user = await getUserFromRequest(request, client); }
    catch { return jsonResponse({ error: 'Authentication required.' }, 401); }
    const url = new URL(request.url);
    const id = url.searchParams.get('resourceId') ?? '';
    if (url.searchParams.get('kind') !== 'reservation_proof' || !/^[0-9a-f-]{36}$/i.test(id)) {
      return jsonResponse({ error: 'Invalid upload request.' }, 400);
    }
    const { data: reservation, error } = await client.from('reservations')
      .select('id,user_id,status,payment_required,payment_status,payment_method,hold_expires_at')
      .eq('id', id).eq('user_id', user.id).single();
    if (error || !reservation) return jsonResponse({ error: 'Reservation unavailable.' }, 403);
    if (!reservation.payment_required || !['pending','pending_payment','rescheduled'].includes(reservation.status)
      || !['pending','unpaid','failed'].includes(reservation.payment_status)
      || (reservation.payment_method && reservation.payment_method !== 'gcash')
      || !(Date.parse(reservation.hold_expires_at) > Date.now())) {
      return jsonResponse({ error: 'Reservation hold is no longer eligible for proof.' }, 409);
    }
    const mime = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const bytes = await readPrivateUpload(request);
    const extension = privateUploadExtension(bytes, mime);
    const path = `${user.id}/${id}/${crypto.randomUUID()}.${extension}`;
    const uploaded = await client.storage.from('payment-proofs').upload(path, bytes, { contentType: mime, upsert: false });
    if (uploaded.error) return jsonResponse({ error: 'Private upload unavailable. Retry while your hold is active.' }, 503);
    return jsonResponse({ path }, 201);
  } catch (error) {
    if (error instanceof UploadError) return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: 'Private upload unavailable.' }, 503);
  }
});
