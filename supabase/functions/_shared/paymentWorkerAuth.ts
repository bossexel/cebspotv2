import { sha256 } from './paymentSignature.ts';

export async function authenticatePaymentWorker(authorization: string, token: string, now = Date.now()) {
  if (token.length < 32) return null;
  if (authorization.startsWith('Bearer ') && await sha256(authorization) === await sha256(`Bearer ${token}`)) {
    return { mode: 'operator' as const, minute: null };
  }
  const parts = /^Maintenance-HMAC ([0-9]{8,12})\.([a-f0-9]{64})$/.exec(authorization);
  if (!parts) return null;
  const minute = Number(parts[1]);
  if (!Number.isSafeInteger(minute) || Math.abs(Math.floor(now / 60000) - minute) > 1) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`cebspot-payment-maintenance:${minute}`));
  const expected = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  if (await sha256(expected) !== await sha256(parts[2])) return null;
  return { mode: 'scheduled' as const, minute };
}
