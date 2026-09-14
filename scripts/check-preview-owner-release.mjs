// Read-only release checks. Never prints credentials or sends invitation emails.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Missing preview Supabase configuration.');
const headers = { apikey: key, 'Content-Type': 'application/json' };
const response = await fetch(`${url}/rest/v1/rpc/get_owner_business_email_status`, {
  method: 'POST', headers,
  body: JSON.stringify({ candidate_email: 'invalid' }),
  signal: AbortSignal.timeout(20000),
});
const data = await response.json();
if (!response.ok || data !== 'invalid') {
  throw new Error(`Owner email validation is unavailable (HTTP ${response.status}). Apply supabase-owner-business-email-validation.sql before release.`);
}
console.log('PASS: deployed owner email validation rejects invalid input.');
const provision = await fetch(`${url}/functions/v1/provision-owner-account`, {
  method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(20000),
});
if (provision.status !== 401) throw new Error(`Unexpected unauthenticated provisioning status: ${provision.status}`);
console.log('PASS: deployed owner provisioning rejects unauthenticated access.');
console.log(JSON.stringify({
  gcashEnabled: process.env.EXPO_PUBLIC_PAYMONGO_GCASH_ENABLED ?? '(unset)',
  qrphEnabled: process.env.EXPO_PUBLIC_PAYMONGO_QRPH_ENABLED ?? '(unset)',
  cartoConfigured: Boolean(process.env.EXPO_PUBLIC_CARTO_BASEMAPS_API_KEY),
  mapTilerConfigured: Boolean(process.env.EXPO_PUBLIC_MAPTILER_KEY),
}));
