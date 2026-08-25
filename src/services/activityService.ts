import { sampleActivities } from '../constants/sampleData';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type { Activity, NewActivity } from '../types';

const localActivities: Activity[] = [...sampleActivities];

export const activityService = {
  async getRecentActivities(limit = 20, userId?: string | null): Promise<Activity[]> {
    if (userId === null) return [];
    if (!hasSupabaseConfig) return localActivities.slice(0, limit);

    let query = supabase
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as Activity[];
  },

  async logActivity(activity: NewActivity): Promise<Activity | null> {
    if (!hasSupabaseConfig) {
      const created: Activity = {
        id: `local-activity-${Date.now()}`,
        created_at: new Date().toISOString(),
        ...activity,
      };
      localActivities.unshift(created);
      return created;
    }

    const { data, error } = await supabase.from('activities').insert(activity).select('*').single();
    if (error) throw error;
    return data as Activity;
  },

  subscribeToActivities(callback: (activities: Activity[]) => void, userId?: string | null) {
    if (userId === null) {
      callback([]);
      return () => undefined;
    }

    if (!hasSupabaseConfig) {
      callback(localActivities);
      return () => undefined;
    }

    const channelName = `activities-feed-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const changeFilter = userId
      ? { event: '*', schema: 'public', table: 'activities', filter: `user_id=eq.${userId}` } as const
      : { event: '*', schema: 'public', table: 'activities' } as const;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', changeFilter, async () => {
        callback(await this.getRecentActivities(20, userId));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
