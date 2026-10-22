'use strict';
const { performance } = require('node:perf_hooks');
function client(config) {
  return async function request(method, endpoint, { token, admin = false, body, headers = {}, origin = config.origin, binary = false } = {}) {
    if (origin !== config.origin && origin !== config.faceOrigin) throw Error('Unapproved request origin');
    const start = performance.now();
    let status = 0;
    try {
      const credential = admin ? config.service : (token || config.key);
      if (admin && !credential) throw Error('Missing admin credential');
      const res = await fetch(origin + endpoint, { method,
        headers: { ...(origin === config.origin ? { apikey: admin ? config.service : config.key, Authorization: `Bearer ${credential}` } : {}),
          ...(!binary && body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body === undefined ? undefined : binary ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(config.timeout), redirect: 'error' });
      status = res.status;
      const bytes = new Uint8Array(await res.arrayBuffer()); // Include response-body transfer and parse in measured latency.
      let data = null;
      if (!binary || (res.headers.get('content-type') || '').includes('json')) {
        try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { /* Validation rejects malformed JSON. */ }
      }
      return { status, ok: res.ok, data, bytes: bytes.length, elapsed: performance.now() - start, timeout: false,
        ...(binary ? { buffer: bytes } : {}) };
    } catch (error) {
      return { status, ok: false, data: null, bytes: 0, elapsed: performance.now() - start,
        timeout: ['TimeoutError', 'AbortError'].includes(error.name), networkError: true };
    }
  };
}
function assertResponse(result, predicate, label) {
  if (!result.ok || !predicate(result.data)) throw Error(`${label}: invalid response (HTTP ${result.status}); response content suppressed`);
  return result.data;
}
function bookingConflict(result) {
  return result.status === 409 && result.data?.code === '23505' && /reservations_active_table_slot_unique_idx/.test(result.data?.message || '');
}
async function signIn(request, account) {
  const result = await request('POST', '/auth/v1/token?grant_type=password', { body: { email: account.email, password: account.password } });
  const data = assertResponse(result, d => d?.access_token && d.user?.id === account.id, 'Synthetic account authentication');
  return { id: account.id, token: data.access_token, expires: Date.now() + data.expires_in * 1000 };
}
module.exports = { client, assertResponse, bookingConflict, signIn };
