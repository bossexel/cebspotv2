import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type { LocalUpdate, NewLocalUpdate } from '../types';

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
    comments_count: 8,
    source_type: 'recommendation',
    source_id: null,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
];

const localUpdates: LocalUpdate[] = [...fallbackLocalUpdates];

function normalizeLocalUpdate(row: any): LocalUpdate {
  return {
    ...row,
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

    const { data, error } = await supabase.from('local_updates').insert(update).select('*').single();
    if (error) {
      console.error('Unable to create Supabase local update:', error);
      return createLocalFallback(update);
    }
    return normalizeLocalUpdate(data);
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
};
