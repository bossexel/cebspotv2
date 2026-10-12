import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getRequiredEnv, makeServiceClient } from '../_shared/paymongo.ts';

// Auth is verified on every retry, including when the profile is already locked.
// No target ID is accepted from the client and no payment-provider call is made.
Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);
  const retry = () => new Response(JSON.stringify({ status: 'pending', message: 'Deletion is in progress. Retry to finish cleanup.', retryAfter: 30 }), {
    status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '30' },
  });
  try {
    const client = makeServiceClient(15000);
    const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token || token.length > 8192) return jsonResponse({ error: 'Sign in again to delete your account.' }, 401);
    const identity = await client.auth.getUser(token);
    if (identity.error || !identity.data.user) return jsonResponse({ error: 'Sign in again to delete your account.' }, 401);
    const id = identity.data.user.id;
    const existing = await client.from('account_deletion_requests').select('state,erase_after').eq('user_id', id).maybeSingle();
    if (existing.error) throw new Error('database_unavailable');
    if (!existing.data) {
      // Signature/issuer/session were checked by getUser before reading AMR.
      let fresh = false;
      try {
        const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        const now = Date.now() / 1000;
        fresh = claims.sub === id && Array.isArray(claims.amr) && claims.amr.some((amr: { method?: string; timestamp?: number }) =>
          ['password', 'oauth', 'otp', 'totp', 'magiclink'].includes(amr.method ?? '') && typeof amr.timestamp === 'number' && amr.timestamp <= now + 30 && amr.timestamp >= now - 600);
      } catch { /* Fail closed; refreshing a token alone is not reauthentication. */ }
      if (!fresh) return jsonResponse({ error: 'Sign in again before deleting your account.', code: 'reauthentication_required' }, 401);
    }
    const rpc = async (name: string) => {
      const result = await client.rpc(name, { customer_id: id });
      if (result.error) throw Object.assign(new Error(name), { databaseCode: result.error.code, safeMessage: result.error.code === '55000' ? result.error.message : undefined });
      return result.data;
    };
    // Check blockers before creating a job or clearing temporary photos.
    await rpc('account_deletion_check');
    const faceUrl = new URL(getRequiredEnv('FACE_BLUR_API_URL'));
    const workerToken = getRequiredEnv('ACCOUNT_DELETION_WORKER_TOKEN');
    if (faceUrl.protocol !== 'https:' || faceUrl.username || faceUrl.password || faceUrl.search || faceUrl.hash || workerToken.length < 32) throw new Error('cleanup_configuration');
    const cleared = await fetch(new URL(`/internal/account-jobs/${id}`, faceUrl), {
      method: 'DELETE', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${workerToken}` },
    });
    if (![200, 202].includes(cleared.status)) throw new Error('photo_cleanup_unavailable');
    const data = await rpc('begin_account_deletion');
    const job = Array.isArray(data) ? data[0] : data;
    if (Date.parse(job.erase_after) > Date.now() || cleared.status === 202) return retry();
    await rpc('erase_account_personal_data');
    // Bound work per invocation. Further invocations resume the same job.
    for (let batch = 0; batch < 3; batch++) {
      const files = await rpc('account_deletion_files');
      if (!files.length) break;
      const grouped = new Map<string, string[]>();
      for (const file of files) grouped.set(file.bucket_id, [...(grouped.get(file.bucket_id) ?? []), file.name]);
      for (const [bucket, paths] of grouped) {
        const removal = await client.storage.from(bucket).remove(paths);
        if (removal.error) throw new Error('file_cleanup_unavailable');
      }
      if (batch === 2 && (await rpc('account_deletion_files')).length) return retry();
    }
    await rpc('ready_account_deletion');
    const removed = await client.auth.admin.deleteUser(id);
    if (removed.error) throw new Error('auth_deletion_unavailable');
    // Auth deletion is the success boundary. A failed bookkeeping update cannot
    // resurrect an account; the ready job remains auditable for maintenance.
    await client.from('account_deletion_requests').update({ state: 'complete', completed_at: new Date().toISOString() }).eq('user_id', id).then(() => {}, () => {});
    return jsonResponse({ status: 'deleted' });
  } catch (error) {
    const detail = error as { databaseCode?: string; safeMessage?: string };
    if (detail.databaseCode === '55000') return jsonResponse({ error: detail.safeMessage ?? 'Resolve active account obligations before deletion.' }, 409);
    return jsonResponse({ error: 'Deletion could not finish. Retry; completed cleanup is retained.', retryable: true }, 503);
  }
});
