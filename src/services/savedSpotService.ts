import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasSupabaseConfig, supabase } from '../lib/supabase';

export const savedSpotsStorageKey = 'cebspot_favorite_spot_ids';

async function getScopedStorageKey(expectedUserId?: string) {
  if (expectedUserId && !hasSupabaseConfig) throw new Error('Saved spots are unavailable.');
  if (!hasSupabaseConfig) return `${savedSpotsStorageKey}:guest`;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (expectedUserId !== undefined && data.session?.user.id !== expectedUserId) throw new Error('Your account changed. Reopen Saved Spots.');
  return `${savedSpotsStorageKey}:${data.session?.user.id ?? 'guest'}`;
}

function normalizeIds(value: unknown) {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

export const savedSpotService = {
  async getSavedSpotIds(expectedUserId?: string) {
    const key = await getScopedStorageKey(expectedUserId);
    const saved = await AsyncStorage.getItem(key);
    return normalizeIds(saved ? JSON.parse(saved) : []);
  },

  async saveSavedSpotIds(ids: string[], expectedUserId?: string) {
    const key = await getScopedStorageKey(expectedUserId);
    await AsyncStorage.setItem(key, JSON.stringify([...new Set(ids)]));
  },

  async removeSavedSpotId(spotId: string,expectedUserId?: string) {
    // Resolve once so an account switch during the read cannot redirect the write.
    const key = await getScopedStorageKey(expectedUserId);
    const raw = await AsyncStorage.getItem(key);
    const ids = normalizeIds(raw ? JSON.parse(raw) : []);
    const nextIds = ids.filter((id) => id !== spotId);
    await AsyncStorage.setItem(key,JSON.stringify(nextIds));
    return nextIds;
  },
};
