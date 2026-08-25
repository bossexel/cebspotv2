import { supabase } from '../lib/supabase';
import { getPrototypeRoleForEmail } from '../constants/authRoles';
import type { UserProfile } from '../types';

interface EnsureProfileInput {
  id: string;
  email: string;
  display_name: string | null;
  photo_url: string | null;
}

export const profileService = {
  async getProfile(userId: string): Promise<UserProfile | null> {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) throw error;
    return data as UserProfile | null;
  },

  async ensureProfile(input: EnsureProfileInput): Promise<UserProfile> {
    const existing = await this.getProfile(input.id);
    const role = getPrototypeRoleForEmail(input.email);
    if (existing) {
      if (existing.role === role) return existing;
      const { data, error } = await supabase
        .from('profiles')
        .update({ role, updated_at: new Date().toISOString() })
        .eq('id', input.id)
        .select('*')
        .single();
      if (error) throw error;
      return data as UserProfile;
    }

    const profile = {
      id: input.id,
      email: input.email,
      role,
      display_name: input.display_name,
      photo_url: input.photo_url,
      level: 1,
      points: 0,
      friends: [],
    };

    const { data, error } = await supabase.from('profiles').insert(profile).select('*').single();
    if (error) throw error;
    return data as UserProfile;
  },

  async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile> {
    const { role: _ignoredRole, ...profileUpdates } = updates;
    const { data, error } = await supabase
      .from('profiles')
      .update({ ...profileUpdates, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select('*')
      .single();
    if (error) throw error;
    return data as UserProfile;
  },

  subscribeToProfile(userId: string, callback: (profile: UserProfile) => void) {
    const channelName = `profile-${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload) => callback(payload.new as UserProfile)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
