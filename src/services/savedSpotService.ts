import AsyncStorage from '@react-native-async-storage/async-storage';

export const savedSpotsStorageKey = 'cebspot_favorite_spot_ids';

function normalizeIds(value: unknown) {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

export const savedSpotService = {
  async getSavedSpotIds() {
    const saved = await AsyncStorage.getItem(savedSpotsStorageKey);
    return normalizeIds(saved ? JSON.parse(saved) : []);
  },

  async saveSavedSpotIds(ids: string[]) {
    await AsyncStorage.setItem(savedSpotsStorageKey, JSON.stringify([...new Set(ids)]));
  },

  async removeSavedSpotId(spotId: string) {
    const ids = await this.getSavedSpotIds();
    const nextIds = ids.filter((id) => id !== spotId);
    await this.saveSavedSpotIds(nextIds);
    return nextIds;
  },
};
