import type { SupabaseClient } from '@supabase/supabase-js';
import { sampleSpots } from '../constants/sampleData';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type { Spot } from '../types';
import { calculateReservationFee, getSpotReservationType, isPaymentRequired } from '../utils/reservations';
import { isReleaseReservable, reservationClientVenueId } from '../utils/tableInventory';

type TableInventoryUpdate = NonNullable<Spot['table_inventory']>;
const discoverySpotLimit = 500;

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
    is_reservable: isReleaseReservable(row),
  };
}

export const spotService = {
  async setTableBookingPolicy(
    spotId: string, tableId: string, policy: 'online_and_walk_ins' | 'walk_in_only', client: SupabaseClient = supabase,
  ): Promise<Spot> {
    const { data, error } = await client.rpc('owner_set_table_booking_policy', {
      target_spot_id: spotId, target_table_id: tableId, booking_policy_input: policy,
    });
    if (error) throw error;
    const saved = Array.isArray(data) ? data[0] : data;
    if (saved?.id !== spotId || !saved.table_inventory || typeof saved.table_inventory !== 'object') {
      throw new Error('The policy could not be saved. Refresh the table list and try again.');
    }
    return normalizeSpot(saved);
  },
  async getSpots(limit = discoverySpotLimit): Promise<Spot[]> {
    if (!hasSupabaseConfig) return sampleSpots.slice(0, limit);

    const { data, error } = await supabase
      .from('spots')
      .select('*')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    const spots = (data ?? []).map(normalizeSpot);
    return spots;
  },

  async getSpotsByIds(ids: string[]): Promise<Spot[]> {
    if (!hasSupabaseConfig) {
      const savedIds = new Set(ids);
      return sampleSpots.filter((spot) => savedIds.has(spot.id));
    }

    const uniqueIds = [...new Set(ids.filter(Boolean))];
    const batches: string[][] = [];
    for (let index = 0; index < uniqueIds.length; index += 100) {
      batches.push(uniqueIds.slice(index, index + 100));
    }
    const results = await Promise.all(batches.map(async (batch) => {
      const { data, error } = await supabase
        .from('spots')
        .select('*')
        .in('id', batch)
        .eq('is_public', true);
      if (error) throw error;
      return (data ?? []).map(normalizeSpot);
    }));
    const spotsById = new Map(results.flat().map((spot) => [spot.id, spot]));
    return uniqueIds.flatMap((id) => {
      const spot = spotsById.get(id);
      return spot ? [spot] : [];
    });
  },

  async getSpotById(id: string, client: SupabaseClient = supabase): Promise<Spot | null> {
    const sample = sampleSpots.find((spot) => spot.id === id || (id === 'cebspot-cafe' && spot.id === '66666666-6666-4666-8666-666666666666'));
    if (!hasSupabaseConfig) return sample ?? null;

    const { data, error } = await client.from('spots').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? normalizeSpot(data) : null;
  },

  subscribeToSpots(callback: (spots: Spot[]) => void, onError?: (error: unknown) => void) {
    if (!hasSupabaseConfig) {
      callback(sampleSpots);
      return () => undefined;
    }

    const channelName = `spots-feed-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spots' }, async () => {
        try {
          callback(await this.getSpots());
        } catch (error) {
          if (onError) onError(error);
          else console.error('Unable to refresh spots after a live update:', error);
        }
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
    const reservationFee = Number(updates.reservationFee);
    if (!Number.isFinite(reservationFee) || reservationFee < 0) {
      throw new Error('Enter a valid reservation amount.');
    }
    const payload = {
      reservation_fee: reservationFee,
      gcash_amount: reservationFee,
      reservation_type: reservationFee > 0 ? 'paid' : 'free',
      payment_required: reservationFee > 0,
      table_inventory: updates.tableInventory,
      is_reservable: false,
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
    if (error) throw error;
    return normalizeSpot(data);
  },

  async confirmReservationInventory(spot: Spot, client: SupabaseClient = supabase): Promise<Spot> {
    if (spot.id !== reservationClientVenueId) throw new Error('This venue is discovery-only.');
    const { data, error } = await client.rpc('confirm_client_venue_inventory', {
      target_spot_id: spot.id, expected_inventory: spot.table_inventory,
    });
    if (error) throw error;
    return normalizeSpot(Array.isArray(data) ? data[0] : data);
  },

  async replaceTableInventory(
    spotId: string,
    tableInventory: TableInventoryUpdate,
    client: SupabaseClient = supabase,
  ): Promise<Spot> {
    if (!hasSupabaseConfig) {
      const sample = sampleSpots.find((spot) => spot.id === spotId);
      if (!sample) throw new Error('Spot not found.');
      return normalizeSpot({ ...sample, table_inventory: tableInventory, updated_at: new Date().toISOString() });
    }

    const { data, error } = await client
      .from('spots')
      .update({ table_inventory: tableInventory, updated_at: new Date().toISOString() })
      .eq('id', spotId)
      .select('*')
      .single();
    if (error) throw error;
    return normalizeSpot(data);
  },
};
