import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type SpotMatch = { id: string; name: string; address: string; latitude: number; longitude: number; distance_m: number };

export async function findMatchingSpots(name: string, latitude: number, longitude: number, client: SupabaseClient = supabase): Promise<SpotMatch[]> {
  if (name.trim().length < 2) return [];
  const { data, error } = await client.rpc('find_matching_spots', {
    spot_name: name.trim(), spot_latitude: latitude, spot_longitude: longitude,
  });
  if (error) throw error;
  return data ?? [];
}
