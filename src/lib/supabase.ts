import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const configuredSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const configuredSupabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const hasSupabaseConfig = !!configuredSupabaseUrl && !!configuredSupabasePublishableKey;
const supabaseUrl = configuredSupabaseUrl || 'https://placeholder.supabase.co';
const supabasePublishableKey = configuredSupabasePublishableKey || 'placeholder-publishable-key';
const projectRef = (() => {
  try {
    return new URL(supabaseUrl).hostname.split('.')[0] || 'local';
  } catch {
    return 'local';
  }
})();

export const supabaseAuthStorageKeys = {
  app: 'cebspot-auth-app',
  admin: 'cebspot-auth-admin',
  owner: 'cebspot-auth-owner',
  legacyDefault: `sb-${projectRef}-auth-token`,
};

if (!hasSupabaseConfig) {
  console.warn(
    'Missing Supabase configuration. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local.'
  );
}

export function createCebspotSupabaseClient(storageKey = supabaseAuthStorageKeys.app) {
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      storage: AsyncStorage,
      storageKey,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

export async function clearSupabaseAuthStorage(storageKeys: string[]) {
  const keys = Array.from(new Set(storageKeys));
  await Promise.all(keys.map((key) => AsyncStorage.removeItem(key).catch(() => undefined)));

  const maybeLocalStorage = globalThis as typeof globalThis & { localStorage?: Storage };
  if (maybeLocalStorage.localStorage) {
    keys.forEach((key) => maybeLocalStorage.localStorage?.removeItem(key));
  }
}

export const supabase = createCebspotSupabaseClient(supabaseAuthStorageKeys.app);
