import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { TableBookingPolicy } from '../utils/tableInventory';

export type VenueTableState = 'free' | 'held' | 'due' | 'occupied' | 'cleaning' | 'unavailable';
export type VenueTableAvailability = {
  tableId: string;
  capacity: number;
  bookingPolicy: TableBookingPolicy;
  state: VenueTableState;
  onlineAvailable: boolean;
  policyLocked: boolean;
  walkInVisitId: string | null;
  walkInPartySize: number | null;
};
export const venueTableStateLabels: Record<VenueTableState, string> = {
  free: 'Free', held: 'Held', due: 'Due / reserved', occupied: 'Occupied', cleaning: 'Cleaning', unavailable: 'Unavailable',
};

export function canSeatWalkIn(table: VenueTableAvailability, partySize: number) {
  return Number.isInteger(partySize) && partySize >= 1 && partySize <= 100
    && table.state === 'free' && table.capacity >= partySize;
}

function normalizeAvailability(row: any): VenueTableAvailability {
  if (!row || typeof row.table_id !== 'string' || !Number.isInteger(Number(row.capacity)) || Number(row.capacity) < 1
    || !['online_and_walk_ins', 'walk_in_only'].includes(row.booking_policy)
    || !Object.prototype.hasOwnProperty.call(venueTableStateLabels, row.operational_state)) {
    throw new Error('Live table information could not be verified. Refresh before continuing.');
  }
  return {
    tableId: row.table_id, capacity: Number(row.capacity), bookingPolicy: row.booking_policy,
    state: row.operational_state,
    onlineAvailable: row.online_available === true && row.booking_policy === 'online_and_walk_ins' && row.operational_state === 'free',
    policyLocked: row.policy_locked !== false,
    walkInVisitId: row.walk_in_visit_id ?? null, walkInPartySize: row.walk_in_party_size ?? null,
  };
}

export const venueTableService = {
  async getAvailability(
    spotId: string, date: string | null = null, slotId: string | null = null, client: SupabaseClient = supabase,
  ): Promise<VenueTableAvailability[]> {
    const { data, error } = await client.rpc('get_venue_table_availability', {
      target_spot_id: spotId, target_reservation_date: date, target_slot_id: slotId,
    });
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Live table information could not be verified. Refresh before continuing.');
    return data.map(normalizeAvailability);
  },

  async seatWalkIn(spotId: string, tableId: string, partySize: number, client: SupabaseClient = supabase) {
    const { data, error } = await client.rpc('owner_seat_walk_in', {
      target_spot_id: spotId, target_table_id: tableId, party_size_input: partySize,
    });
    if (error) throw error;
    const visit = Array.isArray(data) ? data[0] : data;
    if (typeof visit?.id !== 'string' || visit.status !== 'checked_in' || visit.table_id !== tableId || visit.party_size !== partySize) {
      throw new Error('Seating was not confirmed. Refresh the tables before trying again.');
    }
    return visit as { id: string; table_id: string; party_size: number; status: 'checked_in' };
  },

  async completeWalkIn(visitId: string, client: SupabaseClient = supabase) {
    const { data, error } = await client.rpc('owner_complete_walk_in', { target_visit_id: visitId });
    if (error) throw error;
    const visit = Array.isArray(data) ? data[0] : data;
    if (visit?.id !== visitId || visit.status !== 'completed') throw new Error('Visit completion was not confirmed. Refresh live tables.');
  },

  async completeReservation(reservationId: string, client: SupabaseClient = supabase) {
    const { data, error } = await client.rpc('owner_complete_reservation_visit', { target_reservation_id: reservationId });
    if (error) throw error;
    const reservation = Array.isArray(data) ? data[0] : data;
    if (reservation?.id !== reservationId || reservation.status !== 'completed') throw new Error('Visit completion was not confirmed. Refresh live tables.');
  },

  async markReady(spotId: string, tableId: string, client: SupabaseClient = supabase) {
    const { data, error } = await client.rpc('owner_mark_table_ready', { target_spot_id: spotId, target_table_id: tableId });
    if (error) throw error;
    const table = Array.isArray(data) ? data[0] : data;
    if (table?.table_id !== tableId || table.state !== 'free') throw new Error('Table readiness was not confirmed. Refresh live tables.');
  },

  subscribe(spotId: string, onChange: () => void, client: SupabaseClient = supabase) {
    const channel = client.channel(`venue-tables-${spotId}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'venue_table_states', filter: `spot_id=eq.${spotId}` }, onChange)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'spots', filter: `id=eq.${spotId}` }, onChange)
      .subscribe();
    return () => { void client.removeChannel(channel); };
  },
};
