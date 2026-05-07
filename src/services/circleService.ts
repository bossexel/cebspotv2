import { sampleCircles } from '../constants/sampleData';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type { Circle } from '../types';

export const circleService = {
  async getUserCircles(userId: string): Promise<Circle[]> {
    if (!hasSupabaseConfig) return sampleCircles;

    const { data, error } = await supabase.from('circles').select('*').contains('members', [userId]);
    if (error) throw error;
    const circles = (data ?? []) as Circle[];
    return circles.length ? circles : sampleCircles;
  },
};
