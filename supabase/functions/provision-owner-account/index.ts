import { createClient } from 'npm:@supabase/supabase-js@2.48.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function getErrorMessage(error: unknown, fallback = 'Unexpected error.') {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const message = record.message ?? record.error_description ?? record.error ?? record.details ?? record.hint ?? record.code;
    if (typeof message === 'string' && message) return message;
  }
  if (typeof error === 'string' && error) return error;
  return fallback;
}

function makeServiceClient() {
  return createClient(getRequiredEnv('SUPABASE_URL'), getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function getUserFromRequest(request: Request, supabase = makeServiceClient()) {
  const authorization = request.headers.get('Authorization') ?? '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('Authentication required.');

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error('Authentication required.');
  return data.user;
}

type ProvisionOwnerBody = {
  requestId?: string;
  notes?: string | null;
};

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function statusForMessage(message: string) {
  if (/authentication|required|admin access/i.test(message)) return 401;
  if (/already registered|separate business email|already belongs|already has|already been reviewed/i.test(message)) return 409;
  if (/not found|no cebspot listing/i.test(message)) return 404;
  return 400;
}

async function authUserExists(email: string, supabase: ReturnType<typeof makeServiceClient>) {
  const pageSize = 1000;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: pageSize });
    if (error) throw error;
    if (data.users.some((user) => normalizeEmail(user.email) === email)) return true;
    if (data.users.length < pageSize) return false;
  }
  throw new Error('Unable to verify whether this business email is already registered.');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  const supabase = makeServiceClient();
  let invitedUserId: string | null = null;

  try {
    const adminUser = await getUserFromRequest(request, supabase);
    const { data: adminProfile, error: adminError } = await supabase
      .from('profiles')
      .select('id,role')
      .eq('id', adminUser.id)
      .maybeSingle();
    if (adminError) throw adminError;
    if (adminProfile?.role !== 'admin') return jsonResponse({ error: 'Admin access required.' }, 403);

    const body = (await request.json().catch(() => ({}))) as ProvisionOwnerBody;
    const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
    if (!requestId) return jsonResponse({ error: 'Owner request ID is required.' }, 400);

    const { data: ownerRequest, error: requestError } = await supabase
      .from('owner_access_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();
    if (requestError) throw requestError;
    if (!ownerRequest) return jsonResponse({ error: 'Owner access request not found.' }, 404);
    if (ownerRequest.status !== 'pending') {
      return jsonResponse({ error: 'This owner access request has already been reviewed.' }, 409);
    }
    if (ownerRequest.requester_id) {
      return jsonResponse(
        { error: 'This request is linked to an existing CebSpot user. Ask for a separate business email.' },
        409,
      );
    }

    const businessEmail = normalizeEmail(ownerRequest.contact_email);
    if (!businessEmail) return jsonResponse({ error: 'The request does not contain a valid business email.' }, 400);

    const { data: existingProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', businessEmail)
      .limit(1)
      .maybeSingle();
    if (profileError) throw profileError;
    if (existingProfile || await authUserExists(businessEmail, supabase)) {
      return jsonResponse(
        { error: 'This email is already registered in CebSpot. A separate business email is required for an owner account.' },
        409,
      );
    }

    const inviteOptions: {
      data: Record<string, unknown>;
      redirectTo?: string;
    } = {
      data: {
        display_name: ownerRequest.contact_name,
        account_type: 'owner',
        dedicated_business_account: true,
        spot_name: ownerRequest.spot_name,
      },
    };
    const redirectTo = Deno.env.get('OWNER_INVITE_REDIRECT_URL')?.trim() || 'cebspot://reset-password';
    if (redirectTo) inviteOptions.redirectTo = redirectTo;

    const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      businessEmail,
      inviteOptions,
    );
    if (inviteError) {
      const inviteMessage = getErrorMessage(inviteError);
      if (/already|registered|exists|duplicate/i.test(inviteMessage)) {
        return jsonResponse(
          { error: 'This email is already registered in CebSpot. A separate business email is required for an owner account.' },
          409,
        );
      }
      throw inviteError;
    }
    invitedUserId = invited.user?.id ?? null;
    if (!invitedUserId) throw new Error('Supabase did not create the dedicated owner account.');

    const { data: result, error: finalizeError } = await supabase.rpc('finalize_dedicated_owner_account', {
      target_request_id: requestId,
      dedicated_owner_id: invitedUserId,
      reviewing_admin_id: adminUser.id,
      notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
    });
    if (finalizeError) throw finalizeError;

    return jsonResponse({
      ...(result ?? {}),
      invited: true,
      businessEmail,
    });
  } catch (error) {
    const message = getErrorMessage(error, 'Unable to provision the dedicated owner account.');
    if (invitedUserId) {
      await supabase.auth.admin.deleteUser(invitedUserId).catch(() => undefined);
    }
    console.error('Dedicated owner provisioning failed:', message);
    return jsonResponse({ error: message }, statusForMessage(message));
  }
});
