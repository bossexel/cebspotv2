import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type { SpotSubmission } from '../types';

export type YourSpotPost = Pick<SpotSubmission,
  'id' | 'submitter_id' | 'name' | 'description' | 'category' | 'categories' | 'address' | 'images' | 'status' | 'rejection_reason' | 'created_at'> & {
    postId?: string | null;
  };
export type YourPostsCursor = { createdAt: string; id: string };
export type EditableSpotSubmission = Pick<SpotSubmission,
  'id' | 'submitter_id' | 'name' | 'description' | 'category' | 'categories' | 'address' |
  'latitude' | 'longitude' | 'is_reservable' | 'status' | 'images'>;

function checkCursor(cursor: YourPostsCursor) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor.id)
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(cursor.createdAt)
    || !Number.isFinite(Date.parse(cursor.createdAt))) throw new Error('Invalid posts page.');
}

function ownedSpotImagePath(url: unknown, userId: string): string | null {
  if (typeof url !== 'string') return null;
  const marker = '/storage/v1/object/public/spot-images/';
  const markerIndex = url.indexOf(marker);
  if (markerIndex < 0) return null;
  try {
    const path = decodeURIComponent(url.slice(markerIndex + marker.length).split(/[?#]/, 1)[0]);
    if (!path.startsWith(`${userId}/`) || path.split('/').some(part => part === '..' || !part)) return null;
    return path;
  } catch {
    return null;
  }
}

export const yourPostsService = {
  async getOwnSubmission(userId: string, submissionId: string): Promise<EditableSpotSubmission> {
    if (!userId || !submissionId) throw new Error('Sign in to edit your spot.');
    if (!hasSupabaseConfig) throw new Error('Your posts service is not configured.');
    const { data, error } = await supabase.from('spot_submissions')
      .select('id,submitter_id,name,description,category,categories,address,latitude,longitude,is_reservable,status,images')
      .eq('id', submissionId).eq('submitter_id', userId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Your spot submission could not be found.');
    return data as EditableSpotSubmission;
  },

  async updateOwnSubmission(userId: string, submission: EditableSpotSubmission) {
    if (!userId || submission.submitter_id !== userId) throw new Error('You can only edit your own spot.');
    if (!hasSupabaseConfig) throw new Error('Your posts service is not configured.');
    const { data, error } = await supabase.rpc('update_own_spot_submission', {
      target_submission_id: submission.id,
      new_name: submission.name,
      new_description: submission.description,
      new_category: submission.category,
      new_categories: submission.categories ?? [],
      new_address: submission.address,
      new_latitude: submission.latitude,
      new_longitude: submission.longitude,
      new_is_reservable: submission.is_reservable,
    });
    if (error) throw error;
    return data as { id: string; status: 'pending' };
  },

  async deleteOwnSubmission(userId: string, submissionId: string) {
    if (!userId || !submissionId) throw new Error('Sign in to delete your spot.');
    if (!hasSupabaseConfig) throw new Error('Your posts service is not configured.');
    const { data: ownSubmission, error: readError } = await supabase.from('spot_submissions')
      .select('images').eq('id', submissionId).eq('submitter_id', userId).maybeSingle();
    if (readError) throw readError;
    if (!ownSubmission) throw new Error('Your spot submission was not found.');
    const imagePaths = (ownSubmission.images ?? [])
      .map((url: unknown) => ownedSpotImagePath(url, userId))
      .filter((path: string | null): path is string => Boolean(path));
    const { data, error } = await supabase.rpc('delete_own_spot_submission', {
      target_submission_id: submissionId,
    });
    if (error) throw error;
    if (imagePaths.length) {
      try {
        const cleanup = await supabase.storage.from('spot-images').remove(imagePaths);
        if (cleanup.error) console.warn('Spot submission was deleted; photo cleanup will be retried by storage maintenance.');
      } catch {
        console.warn('Spot submission was deleted; photo cleanup will be retried by storage maintenance.');
      }
    }
    return data as { id: string; deleted: true };
  },

  async getPage(userId: string, cursor?: YourPostsCursor | null): Promise<{ items: YourSpotPost[]; nextCursor: YourPostsCursor | null }> {
    if (!userId) throw new Error('Sign in to see your posts.');
    if (!hasSupabaseConfig) throw new Error('Your posts are unavailable while the service is not configured.');
    if (cursor) checkCursor(cursor);
    const pageSize = 12;
    // Read the author's original submissions, including pending/rejected ones.
    // Never group by place or borrow the canonical listing's author/media.
    let query = supabase.from('spot_submissions')
      .select('id,submitter_id,name,description,category,categories,address,images,status,rejection_reason,created_at')
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
