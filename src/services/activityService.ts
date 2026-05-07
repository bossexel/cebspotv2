import { sampleActivities } from '../constants/sampleData';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type { Activity, NewActivity } from '../types';

const localActivities: Activity[] = [...sampleActivities];

export const activityService = {
  async getRecentActivities(limit = 20): Promise<Activity[]> {
    if (!hasSupabaseConfig) return localActivities.slice(0, limit);

    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data ?? []) as Activity[]).length ? (data as Activity[]) : sampleActivities;
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

  subscribeToActivities(callback: (activities: Activity[]) => void) {
    if (!hasSupabaseConfig) {
      callback(localActivities);
      return () => undefined;
    }

    const channel = supabase
      .channel('activities-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, async () => {
        callback(await this.getRecentActivities());
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
