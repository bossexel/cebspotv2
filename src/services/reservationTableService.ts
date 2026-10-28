import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Spot } from '../types';
import {
  getPhysicalTables,
  hasReservationInventoryVerification,
  isReleaseReservable,
  normalizeStoredTableInventory,
  type TableSlotId,
} from '../utils/tableInventory';
import { venueTableService, type VenueTableAvailability } from './venueTableService';
import { UserFacingError } from '../utils/userError';

export async function getLiveReservationTableAvailability(
  spotId: string,
  date: string,
  slotId: string | null,
  client: SupabaseClient = supabase,
): Promise<VenueTableAvailability[]> {
  if (slotId !== 'sunset' && slotId !== 'prime' && slotId !== 'late') {
    throw new UserFacingError('Please choose a reservation time slot before continuing.');
  }
  // Checkout must re-read stored inventory: the owner may have changed a table
  // since the user opened the booking screen. Select * also supports schemas
  // that predate the inventory-verification columns.
  const { data, error } = await client.from('spots').select('*').eq('id', spotId).maybeSingle();
  if (error) throw error;
  if (!data || data.id !== spotId) {
    throw new UserFacingError('This spot is no longer available. Return to the map and choose another spot.');
  }
  return getReservationTableAvailability(data as Spot, date, slotId, client);
}

export async function getReservationTableAvailability(
  spot: Spot,
  date: string,
  slotId: TableSlotId,
  client: SupabaseClient = supabase,
): Promise<VenueTableAvailability[]> {
  try {
    return await venueTableService.getAvailability(spot.id, date, slotId, client);
  } catch (error) {
    const rpcError = error as { code?: string; message?: string };
    const missingVenueRpc = rpcError?.code === 'PGRST202'
      && /get_venue_table_availability/.test(rpcError.message ?? '');
    if (hasReservationInventoryVerification(spot) || !missingVenueRpc) throw error;
  }

  // Legacy databases expose reserved IDs instead of operational table states.
  // Require that live response; never infer free tables after a failed request.
  const { data, error } = await client.rpc('get_reserved_table_ids', {
    target_spot_id: spot.id,
    target_reservation_date: date,
    target_slot_id: slotId,
  });
  if (error) throw error;
  if (!Array.isArray(data) || data.some(id => typeof id !== 'string' || !id.trim())) {
    throw new Error('Live table availability could not be verified. Refresh before booking.');
  }

  const reservedIds = new Set<string>(data);
  const slotTableIds = new Set(normalizeStoredTableInventory(spot.table_inventory)[slotId].map(table => table.tableId));
  return getPhysicalTables(spot.table_inventory)
    .filter(table => slotTableIds.has(table.tableId))
    .map(table => {
      const state = table.isReserved ? 'unavailable' : reservedIds.has(table.tableId) ? 'due' : 'free';
      const bookingPolicy = table.bookingPolicy ?? 'online_and_walk_ins';
      return {
        tableId: table.tableId,
        capacity: table.capacity,
        bookingPolicy,
        state,
        onlineAvailable: isReleaseReservable(spot) && state === 'free' && bookingPolicy === 'online_and_walk_ins',
        policyLocked: true,
        walkInVisitId: null,
        walkInPartySize: null,
      };
    });
}
