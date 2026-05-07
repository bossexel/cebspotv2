import { sampleSpots } from '../constants/sampleData';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type { Spot } from '../types';

function normalizeSpot(row: any): Spot {
  return {
    ...row,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    rating: row.rating == null ? null : Number(row.rating),
    review_count: row.review_count == null ? 0 : Number(row.review_count),
    reservation_fee: row.reservation_fee == null ? 0 : Number(row.reservation_fee),
    is_public: Boolean(row.is_public),
    is_reservable: Boolean(row.is_reservable),
  };
}

export const spotService = {
  async getSpots(limit = 50): Promise<Spot[]> {
    if (!hasSupabaseConfig) return sampleSpots.slice(0, limit);

    const { data, error } = await supabase
      .from('spots')
      .select('*')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    const spots = (data ?? []).map(normalizeSpot);
    return spots.length ? spots : sampleSpots;
  },

  async getSpotById(id: string): Promise<Spot | null> {
    const sample = sampleSpots.find((spot) => spot.id === id);
    if (sample) return sample;
    if (!hasSupabaseConfig) return null;

    const { data, error } = await supabase.from('spots').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? normalizeSpot(data) : null;
  },

  subscribeToSpots(callback: (spots: Spot[]) => void) {
    if (!hasSupabaseConfig) {
      callback(sampleSpots);
      return () => undefined;
    }

    const channel = supabase
      .channel('spots-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spots' }, async () => {
        callback(await this.getSpots());
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
