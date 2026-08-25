import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type { LocalUpdate, LocalUpdateComment, NewLocalUpdate, SpotVoteResult } from '../types';

const fallbackLocalUpdates: LocalUpdate[] = [
  {
    id: 'local-update-1',
    user_id: null,
    user_name: 'Clyde Hans Sadudaquil',
    user_photo_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=160',
    title: 'Nature spot',
    body: 'Kalma nga pahangin!',
    location_name: 'Lahug',
    latitude: 10.339,
    longitude: 123.899,
    image_url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&q=80&w=900',
    spot_count: 1,
    comments_count: 0,
    source_type: 'recommendation',
    source_id: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'local-update-2',
    user_id: null,
    user_name: 'Joshua Eniceta III',
    user_photo_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=160',
    title: 'VIP Club Access',
    body: 'Private tables, bottle service, and kusog nga weekend crowd.',
    location_name: 'IT Park',
    latitude: 10.3308,
    longitude: 123.9075,
    image_url: 'https://images.unsplash.com/photo-1571266028243-d220c9c3a1c8?auto=format&fit=crop&q=80&w=900',
    spot_count: 12,
    comments_count: 0,
    source_type: 'recommendation',
    source_id: null,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
];

const localUpdates: LocalUpdate[] = [...fallbackLocalUpdates];
const localComments = new Map<string, LocalUpdateComment[]>();
const localVotes = new Set<string>();

function isMissingMediaUrlsColumn(error: { message?: string } | null) {
  return /media_urls|schema cache|column/i.test(error?.message ?? '');
}

function normalizeLocalUpdate(row: any): LocalUpdate {
  const imageUrl = typeof row.image_url === 'string' ? row.image_url.trim() : row.image_url;
  const userPhotoUrl = typeof row.user_photo_url === 'string' ? row.user_photo_url.trim() : row.user_photo_url;
  const mediaUrls = Array.isArray(row.media_urls)
    ? row.media_urls.map((url: unknown) => (typeof url === 'string' ? url.trim() : '')).filter(Boolean)
    : [];

  return {
    ...row,
    image_url: imageUrl || null,
    media_urls: mediaUrls.length ? mediaUrls : imageUrl ? [imageUrl] : [],
    user_photo_url: userPhotoUrl || null,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    spot_count: row.spot_count == null ? 0 : Number(row.spot_count),
    comments_count: row.comments_count == null ? 0 : Number(row.comments_count),
  };
}

function createLocalFallback(update: NewLocalUpdate): LocalUpdate {
  const created: LocalUpdate = {
    id: `local-update-${Date.now()}`,
    created_at: new Date().toISOString(),
    spot_count: 0,
    comments_count: 0,
    ...update,
  };
  localUpdates.unshift(created);
  return created;
}

function normalizeComment(row: any): LocalUpdateComment {
  return {
    ...row,
    user_photo_url: typeof row.user_photo_url === 'string' ? row.user_photo_url.trim() || null : null,
  } as LocalUpdateComment;
}

export const localUpdateService = {
  async getLocalUpdates(limit = 20): Promise<LocalUpdate[]> {
    if (!hasSupabaseConfig) return localUpdates.slice(0, limit);

    const { data, error } = await supabase
      .from('local_updates')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.error('Unable to load local updates:', error);
      return localUpdates.slice(0, limit);
    }

    const updates = (data ?? []).map(normalizeLocalUpdate);
    return updates.length ? updates : localUpdates.slice(0, limit);
  },

  async createLocalUpdate(update: NewLocalUpdate): Promise<LocalUpdate> {
    if (!hasSupabaseConfig) {
      return createLocalFallback(update);
    }

    const { media_urls: mediaUrls, ...legacyUpdate } = update;
    const insertableUpdate = {
      ...legacyUpdate,
      ...(mediaUrls?.length ? { media_urls: mediaUrls } : {}),
    };
    let { data, error } = await supabase.from('local_updates').insert(insertableUpdate).select('*').single();
    if (error && isMissingMediaUrlsColumn(error)) {
      const retry = await supabase.from('local_updates').insert(legacyUpdate).select('*').single();
      data = retry.data;
      error = retry.error;
    }
    if (error) {
      console.error('Unable to create Supabase local update:', error);
      return createLocalFallback(update);
    }
    return normalizeLocalUpdate(data);
  },

  async getPostMedia(update: LocalUpdate): Promise<string[]> {
    const fallbackMedia = [
      ...(Array.isArray(update.media_urls) ? update.media_urls : []),
      update.image_url,
    ]
      .map((url) => (typeof url === 'string' ? url.trim() : ''))
      .filter((url, index, urls): url is string => Boolean(url) && urls.indexOf(url) === index);

    if (!hasSupabaseConfig || update.source_type !== 'spot_submission' || !update.source_id) {
      return fallbackMedia;
    }

    const { data, error } = await supabase
      .from('spot_submissions')
      .select('images')
      .eq('id', update.source_id)
      .maybeSingle();

    if (error) {
      console.error('Unable to load post media:', error);
      return fallbackMedia;
    }

    const submissionMedia = Array.isArray(data?.images)
      ? data.images.map((url: unknown) => (typeof url === 'string' ? url.trim() : '')).filter(Boolean)
      : [];

    return submissionMedia.length ? [...new Set(submissionMedia)] : fallbackMedia;
  },

  async toggleSpotSubmissionVote(submissionId: string): Promise<SpotVoteResult> {
    if (!hasSupabaseConfig) {
      const update = localUpdates.find((item) => item.source_type === 'spot_submission' && item.source_id === submissionId);
      if (!update) return { vote_count: 0, voted: false };
      const voted = !localVotes.has(submissionId);
      if (voted) localVotes.add(submissionId);
      else localVotes.delete(submissionId);
      update.spot_count = Math.max(0, update.spot_count + (voted ? 1 : -1));
      return { vote_count: update.spot_count, voted };
    }

    const { data, error } = await supabase.rpc('toggle_spot_submission_vote', {
      target_submission_id: submissionId,
    });
    if (error) throw error;
    const result = (Array.isArray(data) ? data[0] : data) as SpotVoteResult | null;
    if (!result) throw new Error('Unable to update this vote.');
    return { vote_count: Number(result.vote_count ?? 0), voted: Boolean(result.voted) };
  },

  async getVotedSubmissionIds(userId: string): Promise<string[]> {
    if (!hasSupabaseConfig) return Array.from(localVotes);

    const { data, error } = await supabase
      .from('spot_submission_votes')
      .select('submission_id')
      .eq('user_id', userId);
    if (error) {
      console.error('Unable to load spot submission votes:', error);
      return [];
    }

    return (data ?? [])
      .map((row) => row.submission_id)
      .filter((id): id is string => typeof id === 'string');
  },

  async getComments(localUpdateId: string, limit = 100): Promise<LocalUpdateComment[]> {
    if (!hasSupabaseConfig || localUpdateId.startsWith('local-update-')) {
      return [...(localComments.get(localUpdateId) ?? [])].slice(0, limit);
    }

    const { data, error } = await supabase
      .from('local_update_comments')
      .select('*')
      .eq('local_update_id', localUpdateId)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(normalizeComment);
  },

  async addComment(
    localUpdateId: string,
    body: string,
    fallbackAuthor: { id: string; name: string; photoUrl?: string | null }
  ): Promise<LocalUpdateComment> {
    const normalizedBody = body.trim();
    if (!normalizedBody) throw new Error('Write a comment before sending.');
    if (normalizedBody.length > 500) throw new Error('Comments can contain up to 500 characters.');

    if (!hasSupabaseConfig || localUpdateId.startsWith('local-update-')) {
      const comment: LocalUpdateComment = {
        id: `local-comment-${Date.now()}`,
        local_update_id: localUpdateId,
        user_id: fallbackAuthor.id,
        user_name: fallbackAuthor.name,
        user_photo_url: fallbackAuthor.photoUrl ?? null,
        body: normalizedBody,
        created_at: new Date().toISOString(),
      };
      const nextComments = [...(localComments.get(localUpdateId) ?? []), comment];
      localComments.set(localUpdateId, nextComments);
      const update = localUpdates.find((item) => item.id === localUpdateId);
      if (update) update.comments_count = nextComments.length;
      return comment;
    }

    const { data, error } = await supabase.rpc('add_local_update_comment', {
      target_local_update_id: localUpdateId,
      comment_body: normalizedBody,
    });
    if (error) throw error;
    const comment = (Array.isArray(data) ? data[0] : data) as LocalUpdateComment | null;
    if (!comment) throw new Error('Unable to post this comment.');
    return normalizeComment(comment);
  },

  subscribeToLocalUpdates(callback: (updates: LocalUpdate[]) => void) {
    if (!hasSupabaseConfig) {
      callback(localUpdates);
      return () => undefined;
    }

    const channelName = `local-updates-feed-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'local_updates' }, async () => {
        callback(await this.getLocalUpdates());
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  subscribeToComments(localUpdateId: string, callback: (comments: LocalUpdateComment[]) => void) {
    if (!hasSupabaseConfig || localUpdateId.startsWith('local-update-')) {
      callback([...(localComments.get(localUpdateId) ?? [])]);
      return () => undefined;
    }

    const channelName = `local-update-comments-${localUpdateId}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'local_update_comments', filter: `local_update_id=eq.${localUpdateId}` },
        async () => callback(await this.getComments(localUpdateId))
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  subscribeToVotes(userId: string, callback: (submissionIds: string[]) => void) {
    if (!hasSupabaseConfig) {
      callback(Array.from(localVotes));
      return () => undefined;
    }

    const channelName = `spot-votes-${userId}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'spot_submission_votes', filter: `user_id=eq.${userId}` },
        async () => callback(await this.getVotedSubmissionIds(userId))
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
