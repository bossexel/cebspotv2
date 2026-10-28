import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Spot } from '../types';
import { isReleaseReservable, type TableSlotId } from '../utils/tableInventory';
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
  // since the user opened the booking screen. Missing verification metadata
  // must stop booking; an older schema is not evidence of confirmed inventory.
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
  if (!isReleaseReservable(spot)) {
    throw new UserFacingError('This venue is discovery-only or its active table inventory has not been verified.');
  }
  return venueTableService.getAvailability(spot.id, date, slotId, client);
}
