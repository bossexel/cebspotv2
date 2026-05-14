import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type { NewSpotSubmission, SpotSubmission } from '../types';
import { activityService } from './activityService';
import { localUpdateService } from './localUpdateService';

function looksLikeSubmissionSchemaGap(error: any) {
  return /column|schema cache|categories|is_reservable|reservation_type|payment_required/i.test(error?.message ?? '');
}

function toLegacySubmission(submission: NewSpotSubmission) {
  const {
    categories: _categories,
    is_reservable: _isReservable,
    reservation_type: _reservationType,
    payment_required: _paymentRequired,
    ...legacySubmission
  } = submission;

  return legacySubmission;
}

export const spotSubmissionService = {
  async createSubmission(submission: NewSpotSubmission, userName: string): Promise<SpotSubmission> {
    if (!hasSupabaseConfig) {
      const created: SpotSubmission = {
        id: `local-submission-${Date.now()}`,
        status: 'pending',
        rejection_reason: null,
        created_at: new Date().toISOString(),
        ...submission,
      };
      await activityService.logActivity({
        user_id: submission.submitter_id,
        user_name: userName || 'Explorer',
        action: 'submitted',
        target_id: created.id,
        target_name: submission.name,
        type: 'submission',
        spot_name: submission.name,
      });
      await localUpdateService.createLocalUpdate({
        user_id: submission.submitter_id,
        user_name: userName || 'Explorer',
        title: submission.name,
        body: submission.description || 'Shared a new spot for the CebSpot community.',
        location_name: submission.address,
        latitude: submission.latitude,
        longitude: submission.longitude,
        image_url: submission.images?.[0] ?? null,
        source_type: 'spot_submission',
        source_id: created.id,
        spot_count: 0,
        comments_count: 0,
      });
      return created;
    }

    let { data, error } = await supabase
      .from('spot_submissions')
      .insert(submission)
      .select('*')
      .single();
    if (error && looksLikeSubmissionSchemaGap(error)) {
      const retry = await supabase
        .from('spot_submissions')
        .insert(toLegacySubmission(submission))
        .select('*')
        .single();
      data = retry.data;
      error = retry.error;
    }
    if (error) throw error;

    await activityService.logActivity({
      user_id: submission.submitter_id,
      user_name: userName || 'Explorer',
      action: 'submitted',
      target_id: data.id,
      target_name: submission.name,
      type: 'submission',
      spot_name: submission.name,
    });

    try {
      await localUpdateService.createLocalUpdate({
        user_id: submission.submitter_id,
        user_name: userName || 'Explorer',
        title: submission.name,
        body: submission.description || 'Shared a new spot for the CebSpot community.',
        location_name: submission.address,
        latitude: submission.latitude,
        longitude: submission.longitude,
        image_url: submission.images?.[0] ?? null,
        source_type: 'spot_submission',
        source_id: data.id,
        spot_count: 0,
        comments_count: 0,
      });
    } catch (localUpdateError) {
      console.error('Unable to publish local update for submitted spot:', localUpdateError);
    }

    return data as SpotSubmission;
  },
};
