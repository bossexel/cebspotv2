import { sampleSpots } from '../constants/sampleData';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type { Spot } from '../types';
import { calculateReservationFee, getSpotReservationType, isPaymentRequired } from '../utils/reservations';

function normalizeSpot(row: any): Spot {
  const reservationFee = calculateReservationFee(row);
  const reservationType = getSpotReservationType({
    reservation_fee: reservationFee,
    reservation_type: row.reservation_type,
    payment_required: row.payment_required,
  });

  return {
    ...row,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    rating: row.rating == null ? null : Number(row.rating),
    review_count: row.review_count == null ? 0 : Number(row.review_count),
    reservation_type: reservationType,
    reservation_fee: reservationType === 'paid' ? reservationFee : 0,
    payment_required: isPaymentRequired({
      reservation_fee: reservationFee,
      reservation_type: reservationType,
      payment_required: row.payment_required,
    }),
    is_public: Boolean(row.is_public),
    is_reservable: Boolean(row.is_reservable),
  };
}

function withLocalTestSpots(spots: Spot[]) {
  const cebspotCafe = sampleSpots.find((spot) => spot.id === 'cebspot-cafe');
  if (!cebspotCafe || spots.some((spot) => spot.id === cebspotCafe.id || spot.name === cebspotCafe.name)) {
    return spots;
  }
  return [cebspotCafe, ...spots];
}

export const spotService = {
  async getSpots(limit = 75): Promise<Spot[]> {
    if (!hasSupabaseConfig) return sampleSpots.slice(0, limit);

    const { data, error } = await supabase
      .from('spots')
      .select('*')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    const spots = (data ?? []).map(normalizeSpot);
    return spots.length ? withLocalTestSpots(spots).slice(0, limit) : sampleSpots;
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

    const channelName = `spots-feed-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spots' }, async () => {
        callback(await this.getSpots());
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
