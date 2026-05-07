import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type { NewSpotSubmission, SpotSubmission } from '../types';
import { activityService } from './activityService';

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
      return created;
    }

    const { data, error } = await supabase
      .from('spot_submissions')
      .insert(submission)
      .select('*')
      .single();
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

    return data as SpotSubmission;
  },
};
