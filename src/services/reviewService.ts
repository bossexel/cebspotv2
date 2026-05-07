import { sampleReviews } from '../constants/sampleData';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type { NewReview, Review } from '../types';

function normalizeReview(row: any): Review {
  return {
    ...row,
    rating: row.rating == null ? 0 : Number(row.rating),
    likes_count: row.likes_count == null ? 0 : Number(row.likes_count),
    reports_count: row.reports_count == null ? 0 : Number(row.reports_count),
  };
}

export const reviewService = {
  async getReviewsForSpot(spotId: string): Promise<Review[]> {
    const sample = sampleReviews.filter((review) => review.spot_id === spotId);
    if (!hasSupabaseConfig) return sample;

    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('spot_id', spotId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const reviews = (data ?? []).map(normalizeReview);
    return reviews.length ? reviews : sample;
  },

  async createReview(review: NewReview): Promise<Review> {
    if (!hasSupabaseConfig) {
      return {
        ...review,
        id: `local-review-${Date.now()}`,
        likes_count: 0,
        reports_count: 0,
        created_at: new Date().toISOString(),
      };
    }

    const { data, error } = await supabase.from('reviews').insert(review).select('*').single();
    if (error) throw error;
    return normalizeReview(data);
  },

  async reportReview(reviewId: string, reporterId: string, reason = 'Reported from mobile app') {
    if (!hasSupabaseConfig) return;

    const { error } = await supabase.from('review_reports').insert({
      review_id: reviewId,
      reporter_id: reporterId,
      reason,
    });
    if (error) throw error;
  },
};
