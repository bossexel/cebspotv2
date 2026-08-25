import type { SupabaseClient } from '@supabase/supabase-js';
import { sampleSpots } from '../constants/sampleData';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type { Spot } from '../types';
import { calculateReservationFee, getSpotReservationType, isPaymentRequired } from '../utils/reservations';

type TableInventoryUpdate = Record<string, Array<{ tableId: string; capacity: number; isReserved?: boolean }>>;

function normalizeSpot(row: any): Spot {
  const reservationFee = calculateReservationFee(row);
  const reservationType = getSpotReservationType({
    id: row.id,
    name: row.name,
    reservation_fee: reservationFee,
    reservation_type: row.reservation_type,
    payment_required: row.payment_required,
    gcash_amount: row.gcash_amount,
    gcash_wallet_name: row.gcash_wallet_name,
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
      id: row.id,
      name: row.name,
      reservation_fee: reservationFee,
      reservation_type: reservationType,
      payment_required: row.payment_required,
      gcash_amount: row.gcash_amount,
      gcash_wallet_name: row.gcash_wallet_name,
    }),
    gcash_wallet_number: row.gcash_wallet_number ?? null,
    gcash_wallet_name: row.gcash_wallet_name ?? null,
    gcash_qr_url: row.gcash_qr_url ?? null,
    gcash_amount: row.gcash_amount == null ? null : Number(row.gcash_amount),
    table_inventory: row.table_inventory && typeof row.table_inventory === 'object' ? row.table_inventory : null,
    is_public: Boolean(row.is_public),
    is_reservable: Boolean(row.is_reservable),
  };
}

function withLocalTestSpots(spots: Spot[]) {
  const testCebspotRestaurant = sampleSpots.find((spot) => spot.id === '66666666-6666-4666-8666-666666666666');
  if (
    !testCebspotRestaurant ||
    spots.some((spot) => spot.id === testCebspotRestaurant.id || spot.name === testCebspotRestaurant.name)
  ) {
    return spots;
  }
  return [testCebspotRestaurant, ...spots];
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

  async getSpotById(id: string, client: SupabaseClient = supabase): Promise<Spot | null> {
    const sample = sampleSpots.find((spot) => spot.id === id || (id === 'cebspot-cafe' && spot.id === '66666666-6666-4666-8666-666666666666'));
    if (!hasSupabaseConfig) return sample ?? null;

    const { data, error } = await client.from('spots').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? normalizeSpot(data) : sample ?? null;
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

  subscribeToSpotById(spotId: string, callback: (spot: Spot | null) => void, client: SupabaseClient = supabase) {
    if (!hasSupabaseConfig) {
      this.getSpotById(spotId, client).then(callback).catch(() => callback(null));
      return () => undefined;
    }

    const channelName = `spot-${spotId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = client
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spots', filter: `id=eq.${spotId}` }, async () => {
        callback(await this.getSpotById(spotId, client));
      })
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  },

  async updateReservationSettings(
    spotId: string,
    updates: { reservationFee: number; tableInventory: TableInventoryUpdate },
    client: SupabaseClient = supabase,
  ): Promise<Spot> {
    const reservationFee = Math.max(0, Number(updates.reservationFee) || 0);
    const payload = {
      reservation_fee: reservationFee,
      gcash_amount: reservationFee,
      reservation_type: reservationFee > 0 ? 'paid' : 'free',
      payment_required: reservationFee > 0,
      table_inventory: updates.tableInventory,
      is_reservable: true,
      updated_at: new Date().toISOString(),
    };

    if (!hasSupabaseConfig) {
      const sample = sampleSpots.find((spot) => spot.id === spotId);
      if (!sample) throw new Error('Spot not found.');
      return normalizeSpot({ ...sample, ...payload });
    }

    const { data, error } = await client
      .from('spots')
      .update(payload)
      .eq('id', spotId)
      .select('*')
      .single();
    if (error) {
      const missingTableInventoryColumn = /table_inventory|schema cache|column/i.test(error.message ?? '');
      if (!missingTableInventoryColumn) throw error;

      const { table_inventory: _tableInventory, ...pricingPayload } = payload;
      const { data: pricingData, error: pricingError } = await client
        .from('spots')
        .update(pricingPayload)
        .eq('id', spotId)
        .select('*')
        .single();

      if (pricingError) throw pricingError;
      return normalizeSpot({ ...pricingData, table_inventory: updates.tableInventory });
    }
    return normalizeSpot(data);
  },
};
