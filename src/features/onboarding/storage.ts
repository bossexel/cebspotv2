import AsyncStorage from '@react-native-async-storage/async-storage';
import { onboardingKey, OnboardingStatus, parseStatus } from './model';

// Memory fallback keeps a failed storage operation from repeatedly opening the guide.
// Writes are serialized per account so a slow 'skipped' write cannot overwrite completion.
const memory = new Map<string, OnboardingStatus>();
const writes = new Map<string, Promise<void>>();
export const onboardingStorage = {
  async read(accountId: string): Promise<OnboardingStatus | null> {
    const key = onboardingKey(accountId);
    if (memory.has(key)) return memory.get(key)!;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const raw = await Promise.race([
        AsyncStorage.getItem(key),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Guide restore timed out')), 2000); }),
      ]);
      const status = memory.get(key) ?? parseStatus(raw);
      memory.set(key, status);
      return status;
    } catch {
      // Unknown is not a first visit. Never overwrite a potentially completed
      // guide because device storage is temporarily slow or unavailable.
      return memory.get(key) ?? null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  },
  write(accountId: string, status: Exclude<OnboardingStatus, 'not_started'>) {
    const key = onboardingKey(accountId);
    memory.set(key, status);
    const write = (writes.get(key) ?? Promise.resolve())
      .then(() => AsyncStorage.setItem(key, status))
      .catch(() => { /* The guide must never block the app on local storage failure. */ });
    writes.set(key, write);
    void write.then(() => { if (writes.get(key) === write) writes.delete(key); });
    return write;
  },
};
