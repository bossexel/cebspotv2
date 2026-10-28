import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type { SpotSubmission } from '../types';

export type YourSpotPost = Pick<SpotSubmission,
  'id' | 'submitter_id' | 'name' | 'description' | 'address' | 'images' | 'status' | 'rejection_reason' | 'created_at'> & {
    postId?: string | null;
  };
export type YourPostsCursor = { createdAt: string; id: string };

function checkCursor(cursor: YourPostsCursor) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor.id)
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(cursor.createdAt)
    || !Number.isFinite(Date.parse(cursor.createdAt))) throw new Error('Invalid posts page.');
}

export const yourPostsService = {
  async getPage(userId: string, cursor?: YourPostsCursor | null): Promise<{ items: YourSpotPost[]; nextCursor: YourPostsCursor | null }> {
    if (!userId) throw new Error('Sign in to see your posts.');
    if (!hasSupabaseConfig) throw new Error('Your posts are unavailable while the service is not configured.');
    if (cursor) checkCursor(cursor);
    const pageSize = 12;
    // Read the author's original submissions, including pending/rejected ones.
    // Never group by place or borrow the canonical listing's author/media.
    let query = supabase.from('spot_submissions')
      .select('id,submitter_id,name,description,address,images,status,rejection_reason,created_at')
      .eq('submitter_id', userId)
      .order('created_at', { ascending: false }).order('id', { ascending: false });
    // Seek from the last row instead of scanning an ever-growing offset.
    // Preserve PostgreSQL timestamp precision for posts created together.
    if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    const { data, error } = await query.limit(pageSize + 1);
    if (error) throw error;
    const items: YourSpotPost[] = (data ?? []).slice(0, pageSize);
    if (items.length) {
      // One small lookup per page, rather than downloading a complete post
      // for every tap. RLS and author identity still govern post visibility.
      const links = await supabase.from('local_updates').select('id,source_id')
        .eq('user_id', userId).in('source_type', ['spot_submission', 'community'])
        .in('source_id', items.map(item => item.id))
        .then(result => result, () => ({ data: null, error: new Error('Post links unavailable') }));
      if (!links.error) {
        for (const item of items) {
          const matches = (links.data ?? []).filter(post => post.source_id === item.id);
          // Ambiguous historical posts must not open another thread by guessing.
          item.postId = matches.length === 1 ? matches[0].id : null;
        }
      }
      // If link lookup failed, preserve the submissions and retry only the
      // selected post when tapped. Do not cache an outage as an absent post.
    }
    const last = items[items.length - 1];
    return { items, nextCursor: data && data.length > pageSize && last
      ? { createdAt: last.created_at, id: last.id } : null };
  },

  async getPostId(userId: string, submissionId: string): Promise<string | null> {
    if (!userId || !submissionId) throw new Error('Sign in to open your post.');
    if (!hasSupabaseConfig) throw new Error('Posts service is not configured.');
    const { data, error } = await supabase.from('local_updates').select('id')
      .eq('user_id', userId).eq('source_id', submissionId)
      .in('source_type', ['spot_submission', 'community']).limit(2);
    if (error) throw error;
    return data?.length === 1 ? data[0].id : null;
  },
};
