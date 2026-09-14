import { sampleActivities } from '../constants/sampleData';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type { Activity, NewActivity, Reservation } from '../types';

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

  async logReservationReminder(reservation: Reservation): Promise<Activity | null> {
    const reminder: NewActivity = {
      user_id: reservation.user_id,
      user_name: 'CebSpot',
      action: 'reminded you about your reservation',
      target_id: reservation.id,
      target_name: reservation.spot_name,
      type: 'reservation_reminder',
      content: `Reminder: your reservation at ${reservation.spot_name} is in 1 hour at ${reservation.reservation_time}.`,
      spot_id: reservation.spot_id,
      spot_name: reservation.spot_name,
    };

    if (!hasSupabaseConfig) {
      const existing = localActivities.find(
        (activity) => activity.type === reminder.type && activity.user_id === reminder.user_id && activity.target_id === reminder.target_id,
      );
      if (existing) return existing;

      const created: Activity = {
        id: `local-activity-${Date.now()}`,
        created_at: new Date().toISOString(),
        ...reminder,
      };
      localActivities.unshift(created);
      return created;
    }

    const { data, error } = await supabase.from('activities').insert(reminder).select('*').maybeSingle();
    if (!error) return (data ?? null) as Activity | null;

    if (error.code === '23505') {
      const { data: existing, error: existingError } = await supabase
        .from('activities')
        .select('*')
        .eq('user_id', reminder.user_id)
        .eq('target_id', reminder.target_id)
        .eq('type', reminder.type)
        .maybeSingle();
      if (existingError) throw existingError;
      return (existing ?? null) as Activity | null;
    }

    throw error;
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
