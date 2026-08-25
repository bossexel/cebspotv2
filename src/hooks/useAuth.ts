import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { getPrototypeRoleForEmail } from '../constants/authRoles';
import { clearSupabaseAuthStorage, hasSupabaseConfig, supabase, supabaseAuthStorageKeys } from '../lib/supabase';
import { profileService } from '../services/profileService';
import type { UserProfile } from '../types';
import { getAuthErrorMessage, normalizeEmail } from '../utils/auth';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  isSignedIn: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  logOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

WebBrowser.maybeCompleteAuthSession();

function createAuthRedirectUrl(path: string) {
  if (Platform.OS === 'web') return Linking.createURL(path);
  return `cebspot://${path.replace(/^\/+/, '')}`;
}

function makeDemoUser(email: string, displayName: string): User {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    email,
    app_metadata: {},
    user_metadata: { display_name: displayName },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  } as User;
}

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

function makeFallbackProfile(user: User): UserProfile {
  const email = user.email ?? '';
  return {
    id: user.id,
    email,
    role: getPrototypeRoleForEmail(email),
    display_name:
      (user.user_metadata?.display_name as string | undefined) ??
      (user.user_metadata?.full_name as string | undefined) ??
      null,
    photo_url: (user.user_metadata?.avatar_url as string | undefined) ?? null,
    level: 1,
    points: 0,
    friends: [],
  };
}

function getSupabaseAuthParams(url: string) {
  const parsed = Linking.parse(url);
  const queryParams = parsed.queryParams ?? {};
  const hashParams = Object.fromEntries(new URLSearchParams(url.split('#')[1] ?? ''));

  return {
    accessToken: String(queryParams.access_token ?? hashParams.access_token ?? ''),
    refreshToken: String(queryParams.refresh_token ?? hashParams.refresh_token ?? ''),
    code: String(queryParams.code ?? hashParams.code ?? ''),
    type: String(queryParams.type ?? hashParams.type ?? ''),
  };
}

async function createSessionFromAuthUrl(url: string) {
  const params = getSupabaseAuthParams(url);

  if (params.accessToken && params.refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: params.accessToken,
      refresh_token: params.refreshToken,
    });
    if (error) throw error;
    return data.session;
  }

  if (params.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) throw error;
    return data.session;
  }

  throw new Error('Google sign-in did not return a valid session.');
}

async function clearAppSession() {
  await clearSupabaseAuthStorage([supabaseAuthStorageKeys.app, supabaseAuthStorageKeys.legacyDefault]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [demoUser, setDemoUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (user: User) => {
    return profileService.ensureProfile({
      id: user.id,
      email: user.email ?? '',
      display_name:
        (user.user_metadata?.display_name as string | undefined) ??
        (user.user_metadata?.full_name as string | undefined) ??
        null,
      photo_url: (user.user_metadata?.avatar_url as string | undefined) ?? null,
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    let activeUserId: string | null = null;

    async function applySession(nextSession: Session | null, shouldRefreshProfile = true) {
      if (!mounted) return;

      const nextUser = nextSession?.user ?? null;
      if (!nextUser) {
        activeUserId = null;
        setSession(null);
        setProfile(null);
        return;
      }

      if (!isEmailConfirmed(nextUser)) {
        activeUserId = null;
        setSession(null);
        setProfile(null);
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
        await clearAppSession();
        return;
      }

      const userChanged = activeUserId !== nextUser.id;
      activeUserId = nextUser.id;
      setSession(nextSession);
      if (userChanged) setProfile(makeFallbackProfile(nextUser));
      if (!shouldRefreshProfile) return;

      try {
        const profileData = await withTimeout(fetchProfile(nextUser), 12000, 'Profile load');
        if (mounted && activeUserId === nextUser.id) setProfile(profileData);
      } catch (error) {
        if (!mounted || activeUserId !== nextUser.id) return;
        if (isInvalidRefreshToken(error)) {
          console.warn('Stored Supabase session expired. Please sign in again.');
          await clearAppSession();
        } else {
          console.warn('Session restored, but the profile could not be refreshed:', error);
        }
      }
    }

    const startupTimeout = setTimeout(() => {
      if (!mounted) return;
      console.warn('Supabase auth initialization is taking longer than expected.');
      setLoading(false);
    }, 15000);

    if (!hasSupabaseConfig) {
      clearTimeout(startupTimeout);
      setLoading(false);
      return;
    }

    withTimeout(supabase.auth.getSession(), 10000, 'Session restore')
      .then(async ({ data, error }) => {
        if (error) throw error;
        await applySession(data.session);
      })
      .catch(async (error) => {
        if (!mounted) return;
        if (isInvalidRefreshToken(error)) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
          await clearAppSession();
        }
        console.warn('Unable to restore Supabase session:', error);
        setSession(null);
        setProfile(null);
      })
      .finally(() => {
        clearTimeout(startupTimeout);
        if (mounted) setLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setTimeout(() => {
        applySession(nextSession, event !== 'TOKEN_REFRESHED')
          .catch((error) => {
            console.warn('Unable to apply auth state:', error);
          })
          .finally(() => {
            if (mounted) setLoading(false);
          });
      }, 0);
    });

    return () => {
      mounted = false;
      clearTimeout(startupTimeout);
      data.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  useEffect(() => {
    if (!hasSupabaseConfig) return;

    async function handleRecoveryUrl(url: string | null) {
      if (!url) return;
      const params = getSupabaseAuthParams(url);
      const isSupabaseAuthLink = Boolean(params.code || (params.accessToken && params.refreshToken));
      if (!isSupabaseAuthLink) return;

      try {
        const nextSession = await createSessionFromAuthUrl(url);
        setSession(nextSession);
        if (nextSession?.user) setProfile(await fetchProfile(nextSession.user));
      } catch (error) {
        console.error('Unable to open Supabase auth link:', error);
      }
    }

    Linking.getInitialURL().then(handleRecoveryUrl).catch(() => undefined);
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleRecoveryUrl(url);
    });

    return () => {
      subscription.remove();
    };
  }, [fetchProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const normalizedEmail = normalizeEmail(email);
    if (!hasSupabaseConfig) {
      const fakeUser = makeDemoUser(normalizedEmail, 'Demo Explorer');
      setDemoUser(fakeUser);
      setProfile({
        id: fakeUser.id,
        email: normalizedEmail,
        role: getPrototypeRoleForEmail(normalizedEmail),
        display_name: 'Demo Explorer',
        photo_url: null,
        level: 3,
        points: 420,
        friends: [],
      });
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    if (error) throw new Error(getAuthErrorMessage(error));
    if (data.user && !isEmailConfirmed(data.user)) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      await clearAppSession();
      throw new Error('Please verify your email before signing in.');
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!hasSupabaseConfig) {
      throw new Error('Google sign-in requires Supabase configuration.');
    }

    const redirectTo = createAuthRedirectUrl('/auth/callback');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error) throw new Error(getAuthErrorMessage(error));
    if (!data.url) throw new Error('Google sign-in could not be started.');

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return;

    try {
      await createSessionFromAuthUrl(result.url);
    } catch (authError) {
      throw new Error(getAuthErrorMessage(authError));
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, firstName: string, lastName: string) => {
    const normalizedEmail = normalizeEmail(email);
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const displayName = `${trimmedFirstName} ${trimmedLastName}`.trim();

    if (!hasSupabaseConfig) {
      const fakeUser = makeDemoUser(normalizedEmail, displayName);
      setDemoUser(fakeUser);
      setProfile({
        id: fakeUser.id,
        email: normalizedEmail,
        role: getPrototypeRoleForEmail(normalizedEmail),
        display_name: displayName,
        photo_url: null,
        level: 1,
        points: 0,
        friends: [],
      });
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: createAuthRedirectUrl('/auth/callback'),
        data: {
          first_name: trimmedFirstName,
          last_name: trimmedLastName,
          role: 'user',
          display_name: displayName,
        },
      },
    });
    if (error) throw new Error(getAuthErrorMessage(error));

    if (data.user && !isEmailConfirmed(data.user)) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      await clearAppSession();
      setSession(null);
      setProfile(null);
      return;
    }

    if (data.session?.user) {
      await profileService.ensureProfile({
        id: data.session.user.id,
        email: normalizedEmail,
        display_name: displayName,
        photo_url: null,
      });
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    if (!hasSupabaseConfig) return;

    const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
      redirectTo: createAuthRedirectUrl('/reset-password'),
    });
    if (error) throw new Error(getAuthErrorMessage(error));
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!hasSupabaseConfig) return;

    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(getAuthErrorMessage(error));
  }, []);

  const logOut = useCallback(async () => {
    setDemoUser(null);
    setSession(null);
    setProfile(null);

    if (!hasSupabaseConfig) {
      return;
    }

    const signOutResult = await Promise.race([
      supabase.auth.signOut({ scope: 'local' }),
      new Promise<{ error: null }>((resolve) => {
        setTimeout(() => resolve({ error: null }), 1500);
      }),
    ]);

    await clearAppSession();

    if (signOutResult.error && !isInvalidRefreshToken(signOutResult.error)) {
      console.warn('Supabase local sign out did not complete cleanly:', signOutResult.error.message);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) {
      setProfile(await fetchProfile(session.user));
    }
  }, [fetchProfile, session?.user]);

  const value = useMemo(
    () => ({
      user: session?.user ?? demoUser,
      session,
      profile,
      loading,
      isSignedIn: !!session?.user || !!demoUser,
      signIn,
      signInWithGoogle,
      signUp,
      resetPassword,
      updatePassword,
      signOut: logOut,
      logOut,
      refreshProfile,
    }),
    [
      demoUser,
      loading,
      logOut,
      profile,
      refreshProfile,
      resetPassword,
      session,
      signIn,
      signInWithGoogle,
      signUp,
      updatePassword,
    ]
  );

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
