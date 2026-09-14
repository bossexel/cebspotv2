import type { SupabaseClient } from '@supabase/supabase-js';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type { NewOwnerAccessRequest, OwnerAccessRequest } from '../types';
import { activityService } from './activityService';
import { spotSubmissionService } from './spotSubmissionService';

const localOwnerAccessRequests: OwnerAccessRequest[] = [];

export type SpotClaimStatus = {
  spotId: string;
  spotName: string;
  managed: boolean;
  ownerHint: string | null;
  hasAccess: boolean;
};

export type OwnerBusinessEmailStatus = 'available' | 'registered' | 'pending' | 'invalid' | 'unknown';

function looksLikeMissingTable(error: any) {
  return /owner_access_requests|relation|schema cache|does not exist/i.test(error?.message ?? '');
}

function buildFallbackDescription(request: NewOwnerAccessRequest) {
  return [
    'Owner access request for CebSpot reservations.',
    `Contact: ${request.contact_name} <${request.contact_email}>`,
    request.contact_phone ? `Phone: ${request.contact_phone}` : null,
    `Needs: ${request.access_needs.join(', ')}`,
    request.message ? `Message: ${request.message}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function normalizeOwnerAccessRequest(row: any): OwnerAccessRequest {
  return {
    ...row,
    access_needs: Array.isArray(row.access_needs) ? row.access_needs : [],
    status: row.status ?? 'pending',
  };
}

export const ownerAccessService = {
  async getBusinessEmailStatus(
    email: string,
    client: SupabaseClient = supabase,
  ): Promise<OwnerBusinessEmailStatus> {
    if (!hasSupabaseConfig) return 'available';

    const { data, error } = await client.rpc('get_owner_business_email_status', {
      candidate_email: email.trim().toLowerCase(),
    });
    if (error) {
      const missingRpc = /get_owner_business_email_status|schema cache|could not find the function|pgrst202/i.test(
        error.message ?? '',
      );
      if (missingRpc) return 'unknown';
      throw error;
    }

    return ['available', 'registered', 'pending', 'invalid'].includes(String(data))
      ? data as OwnerBusinessEmailStatus
      : 'unknown';
  },

  async getSpotClaimStatus(spotId: string, client: SupabaseClient = supabase): Promise<SpotClaimStatus> {
    if (!hasSupabaseConfig) {
      return { spotId, spotName: 'This spot', managed: false, ownerHint: null, hasAccess: false };
    }

    const { data, error } = await client.rpc('get_spot_claim_status', {
      target_spot_id: spotId,
    });
    if (error) {
      const missingRpc = /get_spot_claim_status|schema cache|could not find the function|pgrst202/i.test(
        error.message ?? '',
      );
      if (missingRpc) {
        const { data: spot, error: spotError } = await client
          .from('spots')
          .select('id,name,owner_id')
          .eq('id', spotId)
          .maybeSingle();
        if (spotError) throw spotError;
        if (!spot) throw new Error('Spot not found.');
        const { data: authData } = await client.auth.getUser();
        const { data: existingAccess } = authData.user
          ? await client
              .from('owner_spot_access')
              .select('id')
              .eq('spot_id', spotId)
              .eq('owner_id', authData.user.id)
              .limit(1)
          : { data: null };
        return {
          spotId: spot.id,
          spotName: spot.name,
          managed: Boolean(spot.owner_id),
          ownerHint: spot.owner_id ? 'another verified account' : null,
          hasAccess: Boolean(
            authData.user && (spot.owner_id === authData.user.id || existingAccess?.length),
          ),
        };
      }
      throw error;
    }

    const result = (data ?? {}) as Record<string, unknown>;
    return {
      spotId: String(result.spotId ?? spotId),
      spotName: String(result.spotName ?? 'This spot'),
      managed: Boolean(result.managed),
      ownerHint: typeof result.ownerHint === 'string' ? result.ownerHint : null,
      hasAccess: Boolean(result.hasAccess),
    };
  },

  async getPrimaryManagedSpotId(client: SupabaseClient = supabase): Promise<string | null> {
    if (!hasSupabaseConfig) return null;

    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    if (!authData.user) return null;

    const { data: accessRows, error: accessError } = await client
      .from('owner_spot_access')
      .select('spot_id,role,created_at')
      .eq('owner_id', authData.user.id)
      .order('created_at', { ascending: true });
    if (accessError) throw accessError;

    const primaryAccess = (accessRows ?? []).find((row) => row.role === 'owner') ?? accessRows?.[0];
    if (primaryAccess?.spot_id) return String(primaryAccess.spot_id);

    const { data: ownedSpot, error: spotError } = await client
      .from('spots')
      .select('id')
      .eq('owner_id', authData.user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (spotError) throw spotError;
    return ownedSpot?.id ? String(ownedSpot.id) : null;
  },

  async createRequest(request: NewOwnerAccessRequest, userName: string): Promise<OwnerAccessRequest> {
    if (!hasSupabaseConfig) {
      const created: OwnerAccessRequest = {
        id: `local-owner-access-${Date.now()}`,
        status: 'pending',
        admin_notes: null,
        created_at: new Date().toISOString(),
        ...request,
      };
      localOwnerAccessRequests.unshift(created);
      return created;
    }

    if (!request.requester_id) {
      const { error } = await supabase.from('owner_access_requests').insert(request);
      if (error) {
        if (!looksLikeMissingTable(error)) throw error;
        throw new Error('Owner access requests are temporarily unavailable. Please try again later.');
      }

      return normalizeOwnerAccessRequest({
        ...request,
        id: `submitted-owner-access-${Date.now()}`,
        status: 'pending',
        admin_notes: null,
        created_at: new Date().toISOString(),
      });
    }

    const { data, error } = await supabase
      .from('owner_access_requests')
      .insert(request)
      .select('*')
      .single();

    if (error) {
      if (!looksLikeMissingTable(error)) throw error;

      if (!request.requester_id) {
        throw new Error('Owner access requests are temporarily unavailable. Please try again later.');
      }

      const fallback = await spotSubmissionService.createSubmission(
        {
          name: request.spot_name,
          description: buildFallbackDescription(request),
          address: request.spot_address,
          category: request.category,
          latitude: 10.3157,
          longitude: 123.8854,
          images: [],
          reservation_fee: 0,
          submitter_id: request.requester_id,
        },
        userName,
      );

      return {
        id: `fallback-${fallback.id}`,
        status: 'pending',
        admin_notes: null,
        created_at: fallback.created_at,
        updated_at: fallback.updated_at,
        ...request,
      };
    }

    const created = normalizeOwnerAccessRequest(data);

    if (!request.requester_id) return created;

    try {
      await activityService.logActivity({
        user_id: request.requester_id,
        user_name: userName || request.contact_name,
        action: 'requested_owner_access',
        target_id: created.id,
        target_name: request.spot_name,
        type: 'owner_access',
        spot_name: request.spot_name,
      });
    } catch (activityError) {
      console.warn('Owner access activity log failed:', activityError);
    }

    return created;
  },
};
