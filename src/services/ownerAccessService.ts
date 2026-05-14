import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type { NewOwnerAccessRequest, OwnerAccessRequest } from '../types';
import { activityService } from './activityService';
import { spotSubmissionService } from './spotSubmissionService';

const localOwnerAccessRequests: OwnerAccessRequest[] = [];

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

    const { data, error } = await supabase
      .from('owner_access_requests')
      .insert(request)
      .select('*')
      .single();

    if (error) {
      if (!looksLikeMissingTable(error)) throw error;

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
