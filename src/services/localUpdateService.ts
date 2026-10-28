import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type { LocalUpdate, LocalUpdateComment, NewLocalUpdate, SpotVoteResult, SpotVoteType } from '../types';

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

const localUpdates: LocalUpdate[] = [];
const localComments = new Map<string, LocalUpdateComment[]>();
const localVotes = new Map<string, SpotVoteType>();

export type FeedSort = 'newest' | 'popular' | 'nearest';
export type FeedCursor = { createdAt: string; id: string; rank: number | string; snapshotAt: string };
export type FeedPage = { items: LocalUpdate[]; nextCursor: FeedCursor | null };
export type FeedChange = { eventType: string; id: string; item?: LocalUpdate };
export type SpotPostCursor = { createdAt: string; id: string };
export type SpotPostPage = { items: LocalUpdate[]; nextCursor: SpotPostCursor | null };

const spotPostFields = 'id,user_id,user_name,user_photo_url,title,body,location_name,latitude,longitude,image_url,spot_id,source_type,source_id,spot_count,comments_count,created_at';

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
    parent_comment_id: typeof row.parent_comment_id === 'string' ? row.parent_comment_id : null,
    user_photo_url: typeof row.user_photo_url === 'string' ? row.user_photo_url.trim() || null : null,
  } as LocalUpdateComment;
}

export const localUpdateService = {
  async getPostsForSpot(spotId: string, cursor?: SpotPostCursor | null): Promise<SpotPostPage> {
    if (!hasSupabaseConfig) throw new Error('Local updates service is not configured.');
    const pageSize = 6;
    let query = supabase.from('local_updates').select(spotPostFields)
      .eq('spot_id', spotId).in('source_type', ['spot_submission', 'community'])
      .order('created_at', { ascending: false }).order('id', { ascending: false });
    if (cursor) {
      // These values enter a PostgREST filter expression, so validate them
      // before interpolation. Place identity itself always uses a bound eq.
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor.id)
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(cursor.createdAt)
        || !Number.isFinite(Date.parse(cursor.createdAt))) throw new Error('Invalid post cursor.');
      // Keep PostgreSQL's microseconds; Date.toISOString would truncate them
      // and skip older posts sharing that millisecond.
      const createdAt = cursor.createdAt;
      query = query.or(`created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${cursor.id})`);
    }
    const { data, error } = await query.limit(pageSize + 1);
    if (error) throw error;
    const items = (data ?? []).slice(0, pageSize).map(normalizeLocalUpdate);
    const last = items[items.length - 1];
    return { items, nextCursor: data && data.length > pageSize && last
      ? { createdAt: last.created_at, id: last.id } : null };
  },

  async getLocalUpdateById(postId: string): Promise<LocalUpdate | null> {
    if (!hasSupabaseConfig) throw new Error('Local updates service is not configured.');
    const { data, error } = await supabase.from('local_updates').select('*').eq('id', postId).maybeSingle();
    if (error) throw error;
    return data ? normalizeLocalUpdate(data) : null;
  },

  async getLocalUpdatesPage(options: {
    cursor?: FeedCursor | null; sort?: FeedSort;
    location?: { latitude: number; longitude: number } | null;
  } = {}): Promise<FeedPage> {
    if (!hasSupabaseConfig) throw new Error('Local updates service is not configured.');
    const pageSize = 12;
    // The database supplies the initial snapshot; a phone's clock may be wrong.
    const snapshotAt = options.cursor?.snapshotAt ?? null;
    const { data, error } = await supabase.rpc('get_local_updates_page', {
      page_size: pageSize, sort_mode: options.sort ?? 'newest',
      cursor_created_at: options.cursor?.createdAt ?? null, cursor_id: options.cursor?.id ?? null,
      cursor_rank: options.cursor?.rank ?? null,
      user_latitude: options.location?.latitude ?? null, user_longitude: options.location?.longitude ?? null,
      snapshot_at: snapshotAt,
    });
    if (error) throw error;
    const rows = data ?? [];
    const items = rows.slice(0, pageSize).map(normalizeLocalUpdate);
    const last = rows[pageSize - 1];
    return { items, nextCursor: rows.length > pageSize && last ? {
      createdAt: last.created_at, id: last.id, rank: last.feed_rank, snapshotAt: last.feed_snapshot_at,
    } : null };
  },

  subscribeToFeedChanges(callback: (changes: FeedChange[]) => void, onError: () => void, onConnected?: () => void) {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = new Map<string, FeedChange>();
    const channel = supabase.channel(`activity-pages-${Date.now()}-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'local_updates' }, (payload) => {
        if (!active) return;
        const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as any;
        if (!row?.id) return;
        pending.set(row.id, { eventType: payload.eventType, id: row.id,
          item: payload.eventType === 'DELETE' ? undefined : normalizeLocalUpdate(row) });
        if (!timer) timer = setTimeout(() => {
          timer = undefined;
          if (active) callback([...pending.values()]);
          pending.clear();
        }, 500);
      }).subscribe((status) => {
        if (active && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) onError();
        if (active && status === 'SUBSCRIBED') onConnected?.();
      });
    return () => { active = false; clearTimeout(timer); pending.clear(); void supabase.removeChannel(channel); };
  },

  async getLocalUpdates(limit = 20): Promise<LocalUpdate[]> {
    if (!hasSupabaseConfig) throw new Error('Local updates service is not configured.');

    const { data, error } = await supabase
      .from('local_updates')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    const updates = (data ?? []).map(normalizeLocalUpdate);
    return updates;
  },

  async getLocalUpdateForSpotSubmission(submissionId: string): Promise<LocalUpdate | null> {
    if (!hasSupabaseConfig) {
      return localUpdates.find((item) => item.source_type === 'spot_submission' && item.source_id === submissionId) ?? null;
    }

    const { data, error } = await supabase
      .from('local_updates')
      .select('*')
      .in('source_type', ['spot_submission', 'community'])
      .eq('source_id', submissionId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error('Unable to load spot submission post:', error);
      return null;
    }

    return data ? normalizeLocalUpdate(data) : null;
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

    if (!hasSupabaseConfig) {
      return fallbackMedia;
    }

    const { data, error } = await supabase
      .from('local_updates')
      .select('media_urls,image_url')
      .eq('id', update.id)
      .maybeSingle();

    if (error) {
      console.error('Unable to load post media:', error);
      return fallbackMedia;
    }

    const postMedia = Array.isArray(data?.media_urls)
      ? data.media_urls.map((url: unknown) => (typeof url === 'string' ? url.trim() : '')).filter(Boolean)
      : [];

    return postMedia.length ? [...new Set(postMedia)] : fallbackMedia;
  },

  async getLinkedSpotId(updateId: string): Promise<string | null> {
    const { data, error } = await supabase.from('local_updates').select('spot_id').eq('id', updateId).maybeSingle();
    if (error) throw error;
    return data?.spot_id ?? null;
  },

  async voteOnSpotSubmission(submissionId: string, voteType: SpotVoteType): Promise<SpotVoteResult> {
    if (!hasSupabaseConfig) {
      const update = localUpdates.find((item) => item.source_type === 'spot_submission' && item.source_id === submissionId);
      if (!update) return { vote_count: 0, vote_type: null, voted: false };
      const previousVote = localVotes.get(submissionId) ?? null;
      const nextVote = previousVote === voteType ? null : voteType;
      const previousScore = previousVote === 'up' ? 1 : previousVote === 'down' ? -1 : 0;
      const nextScore = nextVote === 'up' ? 1 : nextVote === 'down' ? -1 : 0;
      update.spot_count += nextScore - previousScore;
      if (nextVote) localVotes.set(submissionId, nextVote);
      else localVotes.delete(submissionId);
      return {
        vote_count: update.spot_count,
        vote_type: nextVote,
        voted: Boolean(nextVote),
      };
    }

    const { data, error } = await supabase.rpc('vote_on_spot_submission', {
      target_submission_id: submissionId,
      next_vote_type: voteType,
    });
    if (error) {
      const missingVoteRpc = /vote_on_spot_submission|schema cache|function/i.test(error.message ?? '');
      if (voteType === 'up' && missingVoteRpc) {
        const fallback = await supabase.rpc('toggle_spot_submission_vote', {
          target_submission_id: submissionId,
        });
        if (fallback.error) throw fallback.error;
        const fallbackResult = (Array.isArray(fallback.data) ? fallback.data[0] : fallback.data) as SpotVoteResult | null;
        if (!fallbackResult) throw new Error('Unable to update this vote.');
        return {
          vote_count: Number(fallbackResult.vote_count ?? 0),
          vote_type: fallbackResult.voted ? 'up' : null,
          voted: Boolean(fallbackResult.voted),
        };
      }
      if (missingVoteRpc) {
        throw new Error('Downvotes need the updated Supabase voting SQL before they can work.');
      }
      throw error;
    }
    const result = (Array.isArray(data) ? data[0] : data) as SpotVoteResult | null;
    if (!result) throw new Error('Unable to update this vote.');
    const nextVoteType = result.vote_type === 'up' || result.vote_type === 'down' ? result.vote_type : null;
    return {
      vote_count: Number(result.vote_count ?? 0),
      up_count: result.up_count == null ? undefined : Number(result.up_count),
      down_count: result.down_count == null ? undefined : Number(result.down_count),
      vote_type: nextVoteType,
      voted: Boolean(result.voted ?? nextVoteType),
    };
  },

  async toggleSpotSubmissionVote(submissionId: string): Promise<SpotVoteResult> {
    return this.voteOnSpotSubmission(submissionId, 'up');
  },

  async getSubmissionVotes(userId: string): Promise<Record<string, SpotVoteType>> {
    if (!hasSupabaseConfig) return Object.fromEntries(localVotes);

    const { data, error } = await supabase
      .from('spot_submission_votes')
      .select('submission_id, vote_type')
      .eq('user_id', userId);
    if (error) {
      console.error('Unable to load spot submission votes:', error);
      return {};
    }

    return Object.fromEntries(
      (data ?? [])
        .map((row) => {
          const voteType = row.vote_type === 'up' || row.vote_type === 'down' ? row.vote_type : null;
          return typeof row.submission_id === 'string' && voteType ? [row.submission_id, voteType] : null;
        })
        .filter((entry): entry is [string, SpotVoteType] => Boolean(entry))
    );
  },

  async getVotedSubmissionIds(userId: string): Promise<string[]> {
    if (!hasSupabaseConfig) {
      return Array.from(localVotes.entries())
        .filter(([, voteType]) => voteType === 'up')
        .map(([submissionId]) => submissionId);
    }

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
    fallbackAuthor: { id: string; name: string; photoUrl?: string | null },
    parentCommentId?: string | null
  ): Promise<LocalUpdateComment> {
    const normalizedBody = body.trim();
    if (!normalizedBody) throw new Error('Write a comment before sending.');
    if (normalizedBody.length > 500) throw new Error('Comments can contain up to 500 characters.');

    if (!hasSupabaseConfig || localUpdateId.startsWith('local-update-')) {
      const comment: LocalUpdateComment = {
        id: `local-comment-${Date.now()}`,
        local_update_id: localUpdateId,
        parent_comment_id: parentCommentId ?? null,
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
      parent_comment_id: parentCommentId ?? null,
    });
    if (error) {
      const missingThreadedCommentRpc = /add_local_update_comment|schema cache|function|parent_comment_id/i.test(error.message ?? '');
      if (!parentCommentId && missingThreadedCommentRpc) {
        const fallback = await supabase.rpc('add_local_update_comment', {
          target_local_update_id: localUpdateId,
          comment_body: normalizedBody,
        });
        if (fallback.error) throw fallback.error;
        const fallbackComment = (Array.isArray(fallback.data) ? fallback.data[0] : fallback.data) as LocalUpdateComment | null;
        if (!fallbackComment) throw new Error('Unable to post this comment.');
        return normalizeComment(fallbackComment);
      }
      if (missingThreadedCommentRpc) {
        throw new Error('Replies need the updated Supabase comments SQL before they can work.');
      }
      throw error;
    }
    const comment = (Array.isArray(data) ? data[0] : data) as LocalUpdateComment | null;
    if (!comment) throw new Error('Unable to post this comment.');
    return normalizeComment(comment);
  },

  subscribeToLocalUpdates(callback: (updates: LocalUpdate[]) => void, onError?: (error: unknown) => void) {
    if (!hasSupabaseConfig) {
      onError?.(new Error('Local updates service is not configured.'));
      return () => undefined;
    }

    const channelName = `local-updates-feed-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'local_updates' }, async () => {
        try { callback(await this.getLocalUpdates()); } catch (error) { onError?.(error); }
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
      callback(
        Array.from(localVotes.entries())
          .filter(([, voteType]) => voteType === 'up')
          .map(([submissionId]) => submissionId)
      );
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

  subscribeToSubmissionVotes(userId: string, callback: (votesBySubmissionId: Record<string, SpotVoteType>) => void) {
    if (!hasSupabaseConfig) {
      callback(Object.fromEntries(localVotes));
      return () => undefined;
    }

    const channelName = `spot-vote-map-${userId}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'spot_submission_votes', filter: `user_id=eq.${userId}` },
        async () => callback(await this.getSubmissionVotes(userId))
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
