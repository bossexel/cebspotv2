import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { paymentReadiness } from '../_shared/paymentReadiness.ts';

// Public, read-only configuration booleans. Does not create a client, contact
// PayMongo, inspect records, expose key values or modify the legacy webhook.
Deno.serve((request: Request) => {
  const headers = { ...corsHeaders, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Cache-Control': 'no-store' };
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed.' }, 405);
  const status = paymentReadiness(name => Deno.env.get(name));
  const response = jsonResponse(status, status.configurationReady ? 200 : 503);
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
});
