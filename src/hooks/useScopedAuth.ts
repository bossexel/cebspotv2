import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getPrototypeRoleForEmail } from '../constants/authRoles';
import {
  clearSupabaseAuthStorage,
  createCebspotSupabaseClient,
  hasSupabaseConfig,
  supabaseAuthStorageKeys,
} from '../lib/supabase';
import type { UserProfile } from '../types';
import { getAuthErrorMessage, normalizeEmail } from '../utils/auth';

type AuthScope = 'admin' | 'owner';

const scopeStorageKey: Record<AuthScope, string> = {
  admin: supabaseAuthStorageKeys.admin,
  owner: supabaseAuthStorageKeys.owner,
};

function isInvalidRefreshToken(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes('invalid refresh token');
}

function isEmailConfirmed(user: User) {
  return Boolean(user.email_confirmed_at || user.confirmed_at);
}

async function withTimeout<T>(task: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out.`)), timeoutMs);
  });

  try {
    return await Promise.race([task, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function ensureScopedProfile(client: SupabaseClient, user: User): Promise<UserProfile> {
  const email = user.email ?? '';
  const role = getPrototypeRoleForEmail(email);
  const displayName =
    (user.user_metadata?.display_name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    null;
  const photoUrl = (user.user_metadata?.avatar_url as string | undefined) ?? null;

  const { data: existing, error: fetchError } = await client
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (existing) return existing as UserProfile;

  const { data, error } = await client
    .from('profiles')
    .insert({
      id: user.id,
      email,
      role,
      display_name: displayName,
      photo_url: photoUrl,
      level: 1,
      points: 0,
      friends: [],
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as UserProfile;
}

export function useScopedAuth(scope: AuthScope) {
  const storageKey = scopeStorageKey[scope];
  const client = useMemo(() => createCebspotSupabaseClient(storageKey), [storageKey]);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(
    async (user: User) => {
      const profileData = await ensureScopedProfile(client, user);
      setProfile(profileData);
    },
    [client],
  );

  const clearState = useCallback(() => {
    setSession(null);
    setProfile(null);
  }, []);

  useEffect(() => {
    let mounted = true;
    const startupTimeout = setTimeout(() => {
      if (!mounted) return;
      console.warn(`${scope} session restore timed out. Showing the login gate.`);
      clearState();
      setLoading(false);
    }, 15000);

    if (!hasSupabaseConfig) {
      clearTimeout(startupTimeout);
      setLoading(false);
      return () => undefined;
    }

    withTimeout(client.auth.getSession(), 7000, `${scope} session restore`)
      .then(async ({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        if (data.session?.user && isEmailConfirmed(data.session.user)) {
          await withTimeout(loadProfile(data.session.user), 7000, `${scope} profile load`);
        } else if (data.session?.user) {
          await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
          await clearSupabaseAuthStorage([storageKey]);
          clearState();
        } else {
          setProfile(null);
        }
      })
      .catch(async (error) => {
        if (!mounted) return;
        if (isInvalidRefreshToken(error)) {
          await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
          await clearSupabaseAuthStorage([storageKey]);
        }
        console.warn(`Unable to restore ${scope} session:`, error);
        clearState();
      })
      .finally(() => {
        clearTimeout(startupTimeout);
        if (mounted) setLoading(false);
      });

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession?.user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      if (!isEmailConfirmed(nextSession.user)) {
        client.auth.signOut({ scope: 'local' }).catch(() => undefined);
        clearSupabaseAuthStorage([storageKey]).catch(() => undefined);
        clearState();
        setLoading(false);
        return;
      }

      setTimeout(() => {
        withTimeout(loadProfile(nextSession.user), 7000, `${scope} profile load`)
          .catch((error) => {
            console.warn(`Unable to load ${scope} profile after auth change:`, error);
            clearState();
          })
          .finally(() => setLoading(false));
      }, 0);
    });

    return () => {
      mounted = false;
      clearTimeout(startupTimeout);
      data.subscription.unsubscribe();
    };
  }, [clearState, client, loadProfile, scope, storageKey]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await client.auth.signInWithPassword({ email: normalizeEmail(email), password });
      if (error) throw new Error(getAuthErrorMessage(error));
      if (data.user && !isEmailConfirmed(data.user)) {
        await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
        await clearSupabaseAuthStorage([storageKey]);
        throw new Error('Please verify your email before signing in.');
      }
    },
    [client, storageKey],
  );

  const logOut = useCallback(async () => {
    clearState();
    if (!hasSupabaseConfig) return;

    const signOutResult = await Promise.race([
      client.auth.signOut({ scope: 'local' }),
      new Promise<{ error: null }>((resolve) => {
        setTimeout(() => resolve({ error: null }), 1500);
      }),
    ]);

    await clearSupabaseAuthStorage([storageKey]);

    if (signOutResult.error) {
      console.warn(`${scope} local sign out did not complete cleanly:`, signOutResult.error.message);
    }
  }, [clearState, client, scope, storageKey]);

  return {
    client,
    session,
    profile,
    loading,
    isSignedIn: Boolean(session?.user),
    signIn,
    logOut,
  };
}
