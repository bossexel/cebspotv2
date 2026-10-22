import AsyncStorage from '@react-native-async-storage/async-storage';

const WELCOME_KEY = 'cebspot_welcome_completed';

// Memory cache prevents repeated storage reads and keeps the app functional
// when AsyncStorage is slow or unavailable.
let memoryCache: boolean | null = null;

export const welcomeStorage = {
  async hasCompleted(): Promise<boolean> {
    if (memoryCache !== null) return memoryCache;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const raw = await Promise.race([
        AsyncStorage.getItem(WELCOME_KEY),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), 2000);
        }),
      ]);
      const completed = raw === 'true';
      memoryCache = completed;
      return completed;
    } catch {
      return memoryCache ?? false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  },
  async markCompleted(): Promise<void> {
    memoryCache = true;
    try {
      await AsyncStorage.setItem(WELCOME_KEY, 'true');
    } catch {
      // Welcome must never block the app on storage failure.
    }
  },
};
