import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getRequiredEnv, makeServiceClient } from '../_shared/paymongo.ts';
import { sha256 } from '../_shared/paymentSignature.ts';
import { readPrivateUpload } from '../_shared/privateUpload.ts';

// Temporary operator control, not a customer/admin API. Keys and provider
// webhook identifiers stay server-side. No checkout, charge or refund operation.
Deno.serve(async (request: Request) => {
  const reply = (body: unknown, status = 200) => {
    const response = jsonResponse(body, status);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  };
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!['GET', 'POST'].includes(request.method)) return reply({ error: 'Method not allowed.' }, 405);
  try {
    const token = getRequiredEnv('PAYMENT_WORKER_TOKEN');
    if (token.length < 32 || await sha256(request.headers.get('authorization') ?? '') !== await sha256(`Bearer ${token}`)) {
      return reply({ error: 'Operator authentication required.' }, 401);
    }
    const key = getRequiredEnv('PAYMONGO_SECRET_KEY');
    if (!/^sk_test_[A-Za-z0-9_]+$/.test(key)) return reply({ error: 'Test mode required.' }, 503);
    const origin = new URL(getRequiredEnv('SUPABASE_URL')).origin;
    if (!/^https:\/\/[a-z]{20}\.supabase\.co$/.test(origin)) return reply({ error: 'Hosted project identity required.' }, 503);
    const oldUrl = origin + '/functions/v1/paymongo-webhook';
    const newUrl = origin + '/functions/v1/paymongo-test-webhook';
    const configuredSecret = getRequiredEnv('PAYMONGO_TEST_WEBHOOK_SECRET');
    const provider = async (path: string, init: RequestInit = {}) => {
      const response = await fetch('https://api.paymongo.com/v1' + path, {
        ...init, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Basic ${btoa(`${key}:`)}`, 'Content-Type': 'application/json' },
      });
      if (!response.ok) { await response.body?.cancel(); throw new Error('Provider operation unavailable.'); }
      return response.json();
    };
    async function inspect() {
      const payload = await provider('/webhooks');
      if (!Array.isArray(payload?.data) || payload.data.length > 100 || payload.has_more === true) throw new Error('Unbounded webhook list.');
      const hooks = payload.data;
      const scoped = hooks.filter((h: any) => h.attributes?.livemode === false && h.attributes?.status === 'enabled'
        && [oldUrl, newUrl].includes(h.attributes?.url));
      const candidate = scoped.length === 1 && /^hook_[A-Za-z0-9_]+$/.test(scoped[0]?.id ?? '') ? scoped[0] : null;
      const secretMatches = Boolean(candidate && typeof candidate.attributes.secret_key === 'string'
        && await sha256(candidate.attributes.secret_key) === await sha256(configuredSecret));
      const scopeHash = await sha256(JSON.stringify(hooks.map((h: any) => ({ id: h.id, attributes: h.attributes }))));
      const ready = Boolean(candidate && secretMatches && candidate.attributes.url === newUrl
        && Array.isArray(candidate.attributes.events) && candidate.attributes.events.length === 1
        && candidate.attributes.events[0] === 'checkout_session.payment.paid');
      return { candidate, summary: { testOnly: true, scopeHash, matchingEnabledTestHooks: scoped.length,
        secretMatches, routedToDurableTestHandler: ready,
        liveHooksUntouched: true, readOnly: true } };
    }
    const before = await inspect();
    if (request.method === 'GET') return reply(before.summary);
    const raw = await readPrivateUpload(request, 5000, 1024);
    let body;
    try { body = JSON.parse(new TextDecoder().decode(raw)); } catch { return reply({ error: 'Invalid control request.' }, 400); }
    if (!body || Object.keys(body).some(k => !['action', 'expectedScopeHash'].includes(k))
      || !['activate-test-webhook', 'configure-maintenance'].includes(body.action) || !/^[a-f0-9]{64}$/.test(body.expectedScopeHash ?? '')) {
      return reply({ error: 'Invalid control request.' }, 400);
    }
    if (body.expectedScopeHash !== before.summary.scopeHash) return reply({ error: 'Webhook configuration changed. Inspect again.' }, 409);
    if (!before.candidate || !before.summary.secretMatches) return reply({ error: 'One matching enabled test webhook and signing secret are required.' }, 409);
    if (body.action === 'configure-maintenance') {
      if (!before.summary.routedToDurableTestHandler) return reply({ error: 'Activate the verified durable test webhook first.' }, 409);
      const { data, error } = await makeServiceClient(15000).rpc('configure_test_payment_maintenance', { worker_token: token });
      if (error || data?.scheduled !== true || data?.secretStoredInVault !== true) throw new Error('Maintenance setup unavailable.');
      return reply({ ...before.summary, readOnly: false, maintenanceScheduled: true });
    }
    if (before.summary.routedToDurableTestHandler) return reply({ ...before.summary, readOnly: false, changed: false });
    // Only this existing test-mode endpoint is updated. The signing secret,
    // legacy function and any live-mode provider endpoint are left untouched.
    await provider('/webhooks/' + encodeURIComponent(before.candidate.id), { method: 'PUT', body: JSON.stringify({
      data: { attributes: { url: newUrl, events: ['checkout_session.payment.paid'] } },
    }) });
    const after = await inspect();
    if (!after.summary.routedToDurableTestHandler || after.candidate?.id !== before.candidate.id) throw new Error('Read-back verification failed.');
    return reply({ ...after.summary, readOnly: false, changed: true });
  } catch {
    return reply({ error: 'Test webhook control unavailable. Inspect current state before retrying.' }, 503);
  }
});
