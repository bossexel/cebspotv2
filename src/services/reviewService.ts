import type { SupabaseClient } from '@supabase/supabase-js';
import { sampleReviews } from '../constants/sampleData';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type { NewReview, NewReviewReply, Review, ReviewReply } from '../types';

const localReviewReplies = new Map<string, ReviewReply[]>();

function normalizeReview(row: any): Review {
  return {
    ...row,
    rating: row.rating == null ? 0 : Number(row.rating),
    likes_count: row.likes_count == null ? 0 : Number(row.likes_count),
    reports_count: row.reports_count == null ? 0 : Number(row.reports_count),
  };
}

function normalizeReviewReply(row: any): ReviewReply {
  return {
    ...row,
    parent_reply_id: typeof row.parent_reply_id === 'string' ? row.parent_reply_id : null,
    user_photo_url: typeof row.user_photo_url === 'string' ? row.user_photo_url.trim() || null : null,
  } as ReviewReply;
}

export const reviewService = {
  async getReviewsForSpot(spotId: string, client: SupabaseClient = supabase): Promise<Review[]> {
    const sample = sampleReviews.filter((review) => review.spot_id === spotId);
    if (!hasSupabaseConfig) return sample;

    const { data, error } = await client
      .from('reviews')
      .select('*')
      .eq('spot_id', spotId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return (data ?? []).map(normalizeReview);
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

  async getHelpfulReviewIds(reviewIds: string[]): Promise<string[]> {
    if (!hasSupabaseConfig || !reviewIds.length) return [];

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return [];

    const { data, error } = await supabase
      .from('review_helpful_votes')
      .select('review_id')
      .in('review_id', reviewIds);
    if (error) {
      if (/review_helpful_votes|schema cache|relation/i.test(error.message ?? '')) return [];
      throw error;
    }

    return (data ?? []).map((row) => row.review_id).filter((reviewId): reviewId is string => Boolean(reviewId));
  },

  async getRepliesForSpot(spotId: string, client: SupabaseClient = supabase): Promise<ReviewReply[]> {
    if (!hasSupabaseConfig) return [...(localReviewReplies.get(spotId) ?? [])];

    const { data, error } = await client
      .from('review_replies')
      .select('*')
      .eq('spot_id', spotId)
      .order('created_at', { ascending: true });
    if (error) {
      if (/review_replies|schema cache|relation/i.test(error.message ?? '')) {
        return [];
      }
      throw error;
    }

    return (data ?? []).map(normalizeReviewReply);
  },

  async createReviewReply(reply: NewReviewReply, client: SupabaseClient = supabase): Promise<ReviewReply> {
    const normalizedBody = reply.body.trim();
    if (!normalizedBody) throw new Error('Write a reply before sending.');
    if (normalizedBody.length > 500) throw new Error('Replies can contain up to 500 characters.');

    if (!hasSupabaseConfig) {
      const created: ReviewReply = {
        ...reply,
        body: normalizedBody,
        id: `local-review-reply-${Date.now()}`,
        created_at: new Date().toISOString(),
      };
      localReviewReplies.set(reply.spot_id, [...(localReviewReplies.get(reply.spot_id) ?? []), created]);
      return created;
    }

    const { data, error } = await client.rpc('add_review_reply', {
      target_review_id: reply.review_id,
      target_spot_id: reply.spot_id,
      reply_body: normalizedBody,
      parent_reply_id: reply.parent_reply_id ?? null,
    });
    if (error) {
      if (/add_review_reply|review_replies|schema cache|relation|parent_reply_id/i.test(error.message ?? '')) {
        throw new Error('Review replies need the updated Supabase review SQL before they can work.');
      }
      throw error;
    }
    return normalizeReviewReply(Array.isArray(data) ? data[0] : data);
  },

  async reportReview(reviewId: string, reporterId: string, reason = 'Reported from mobile app') {
    if (!hasSupabaseConfig) return;

    const { error } = await supabase.from('review_reports').insert({
      review_id: reviewId,
      reporter_id: reporterId,
      reason,
    });
    if (error) {
      if (error.code === '23505') {
        throw new Error('You already reported this review. It is already in the admin moderation queue.');
      }
      throw error;
    }
  },
};
