import type { Session, User } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import { profileService } from '../services/profileService';
import type { UserProfile } from '../types';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  isSignedIn: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  logOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [demoUser, setDemoUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (user: User) => {
    const profileData = await profileService.ensureProfile({
      id: user.id,
      email: user.email ?? '',
      display_name:
        (user.user_metadata?.display_name as string | undefined) ??
        (user.user_metadata?.full_name as string | undefined) ??
        null,
      photo_url: (user.user_metadata?.avatar_url as string | undefined) ?? null,
    });
    setProfile(profileData);
  }, []);

  useEffect(() => {
    let mounted = true;

    if (!hasSupabaseConfig) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        await loadProfile(data.session.user);
      }
      if (mounted) setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        await loadProfile(nextSession.user);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!hasSupabaseConfig) {
      const fakeUser = makeDemoUser(email, 'Demo Explorer');
      setDemoUser(fakeUser);
      setProfile({
        id: fakeUser.id,
        email,
        display_name: 'Demo Explorer',
        photo_url: null,
        level: 3,
        points: 420,
        friends: [],
      });
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    if (!hasSupabaseConfig) {
      const fakeUser = makeDemoUser(email, displayName);
      setDemoUser(fakeUser);
      setProfile({
        id: fakeUser.id,
        email,
        display_name: displayName,
        photo_url: null,
        level: 1,
        points: 0,
        friends: [],
      });
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
        },
      },
    });
    if (error) throw error;

    if (data.session?.user) {
      await profileService.ensureProfile({
        id: data.session.user.id,
        email,
        display_name: displayName,
        photo_url: null,
      });
    }
  }, []);

  const logOut = useCallback(async () => {
    if (!hasSupabaseConfig) {
      setDemoUser(null);
      setProfile(null);
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) {
      await loadProfile(session.user);
    }
  }, [loadProfile, session?.user]);

  const value = useMemo(
    () => ({
      user: session?.user ?? demoUser,
      session,
      profile,
      loading,
      isSignedIn: !!session?.user || !!demoUser,
      signIn,
      signUp,
      logOut,
      refreshProfile,
    }),
    [demoUser, loading, logOut, profile, refreshProfile, session, signIn, signUp]
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
