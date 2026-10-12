import { getRequiredEnv } from './paymongo.ts';
export async function sha256(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function verifyTestPaymentSignature(request: Request, raw: string) {
  const header = request.headers.get('paymongo-signature') ?? request.headers.get('x-paymongo-signature') ?? '';
  const parts = Object.fromEntries(header.split(',').map(part => part.trim().split('=')));
  if (!/^[0-9]{10}$/.test(parts.t ?? '') || !/^[0-9a-f]{64}$/.test(parts.te ?? '')
    || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) throw new Error('Invalid signature.');
  const secret = getRequiredEnv('PAYMONGO_TEST_WEBHOOK_SECRET');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${parts.t}.${raw}`));
  const expected = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,'0')).join('');
  let difference = expected.length ^ parts.te.length;
  for (let i=0;i<expected.length;i++) difference |= expected.charCodeAt(i) ^ parts.te.charCodeAt(i);
  if (difference) throw new Error('Invalid signature.');
}
