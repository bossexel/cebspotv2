import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasSupabaseConfig, supabase } from '../lib/supabase';

export const savedSpotsStorageKey = 'cebspot_favorite_spot_ids';

async function getScopedStorageKey() {
  if (!hasSupabaseConfig) return `${savedSpotsStorageKey}:guest`;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return `${savedSpotsStorageKey}:${data.session?.user.id ?? 'guest'}`;
}

function normalizeIds(value: unknown) {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

export const savedSpotService = {
  async getSavedSpotIds() {
    const key = await getScopedStorageKey();
    const saved = await AsyncStorage.getItem(key);
    return normalizeIds(saved ? JSON.parse(saved) : []);
  },

  async saveSavedSpotIds(ids: string[]) {
    const key = await getScopedStorageKey();
    await AsyncStorage.setItem(key, JSON.stringify([...new Set(ids)]));
  },

  async removeSavedSpotId(spotId: string) {
    const ids = await this.getSavedSpotIds();
    const nextIds = ids.filter((id) => id !== spotId);
    await this.saveSavedSpotIds(nextIds);
    return nextIds;
  },
};
