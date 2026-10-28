import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Keyboard, Platform, StyleSheet, View } from 'react-native';
import { useGlobalSearchParams, usePathname, useRootNavigationState, useRouter } from 'expo-router';
import { getAppRole } from '../../constants/authRoles';
import { useAuth } from '../../hooks/useAuth';
import { GuideOverlay } from './GuideOverlay';
import { advanceGuide, canOfferGuide, detailSteps, GuidePhase, GuideStep, homeSteps, OnboardingStatus, sessionIsActive, shouldStartHomeGuide } from './model';
import { onboardingStorage } from './storage';

export type GuideTarget = { node: View; reveal?: () => void; owner: object };
type Session = { account: string; path: string; kind: 'home' | 'detail'; phase: GuidePhase; steps: GuideStep[] };
type GuideContextValue = {
  register: (id: string, owner: object, node: View | null, reveal?: () => void) => void;
  setHomeReady: (readiness: { ready: boolean; settled: boolean }) => void;
  startDetails: () => void;
};
const GuideContext = createContext<GuideContextValue | null>(null);

export function GuideProvider({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  const { user, profile, isSignedIn } = useAuth();
  const pathname = usePathname();
  const navigation = useRootNavigationState();
  const params = useGlobalSearchParams<{ appGuide?: string; focusSpotId?: string; openSpot?: string }>();
  const router = useRouter();
  const account = user?.id;
  const eligible = Platform.OS !== 'web' && canOfferGuide(ready && Boolean(navigation?.key), isSignedIn, account, profile?.id, profile ? getAppRole(profile) : null);
  const targets = useRef(new Map<string, GuideTarget>()).current;
  const registrations = useRef(new Map<string, Map<object, GuideTarget>>()).current;
  const offered = useRef(new Set<string>());
  const consumedReplay = useRef<string>();
  const tapTime = useRef(0);
  const [homeReadiness, setHomeReady] = useState({ ready: false, settled: false });
  const [stored, setStored] = useState<{ account: string; status: OnboardingStatus | null } | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const sessionAllowed = eligible && !(session?.kind === 'home' && (params.focusSpotId || params.openSpot));

  useEffect(() => {
    let cancelled = false;
    if (eligible && account) {
      void onboardingStorage.read(account).then((status) => {
        if (!cancelled) setStored({ account, status });
      });
    }
    return () => { cancelled = true; };
  }, [account, eligible]);

  const register = useCallback<GuideContextValue['register']>((id, owner, node, reveal) => {
    const entries = registrations.get(id) ?? new Map<object, GuideTarget>();
    if (node) entries.set(owner, { owner, node, reveal });
    else entries.delete(owner);
    const latest = Array.from(entries.values()).pop();
    if (latest) {
      registrations.set(id, entries);
      targets.set(id, latest);
    } else {
      registrations.delete(id);
      targets.delete(id);
    }
  }, [registrations, targets]);

  useEffect(() => {
    const replay = params.appGuide ? `${account}:${params.appGuide}` : undefined;
    const requested = Boolean(replay && replay !== consumedReplay.current);
    if (!account || !shouldStartHomeGuide({
      eligible, account, path: pathname, homeReady: homeReadiness.ready && (homeReadiness.settled || requested), active: Boolean(session),
      deepLink: Boolean(params.focusSpotId || params.openSpot), requested,
      storedAccount: stored?.account, status: stored?.status, offered: offered.current.has(account),
    })) return;
    consumedReplay.current = replay;
    offered.current.add(account);
    Keyboard.dismiss();
    // An interrupted attempt is treated as skipped, so process death cannot trap users in onboarding.
    void onboardingStorage.write(account, 'skipped');
    setStored({ account, status: 'skipped' });
    setSession({ account, path: '/', kind: 'home', phase: { stage: 'intro', index: 0 }, steps: homeSteps });
    if (requested) router.setParams({ appGuide: undefined });
  }, [account, eligible, homeReadiness, params.appGuide, params.focusSpotId, params.openSpot, pathname, router, session, stored]);

  useEffect(() => {
    if (session && !sessionIsActive(session, sessionAllowed, account, pathname)) setSession(null);
  }, [account, sessionAllowed, pathname, session]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') setSession(null);
    });
    return () => subscription.remove();
  }, []);

  const startDetails = useCallback(() => {
    if (!eligible || !account || !pathname.startsWith('/spot/')) return;
    Keyboard.dismiss();
    setSession({ account, path: pathname, kind: 'detail', phase: { stage: 'tour', index: 0 }, steps: detailSteps });
  }, [account, eligible, pathname]);

  const value = useMemo(() => ({ register, setHomeReady, startDetails }), [register, startDetails]);
  const active = sessionIsActive(session, sessionAllowed, account, pathname) ? session : null;
  const end = (completed: boolean) => {
    if (!active) return;
    if (active.kind === 'home') {
      const status = completed || active.phase.stage === 'welcome' ? 'completed' : 'skipped';
      void onboardingStorage.write(active.account, status);
      setStored({ account: active.account, status });
    }
    setSession(null);
  };
  const move = (direction: 1 | -1) => {
    const now = Date.now();
    if (now - tapTime.current < 400) return;
    tapTime.current = now;
    if (direction === 1 && active?.kind === 'detail' && active.phase.stage === 'tour' && active.phase.index === active.steps.length - 1) {
      end(true);
      return;
    }
    if (direction === 1 && active?.kind === 'home' && active.phase.stage === 'tour' && active.phase.index === active.steps.length - 1) {
      void onboardingStorage.write(active.account, 'completed');
      setStored({ account: active.account, status: 'completed' });
    }
    setSession((current) => {
      if (!current) return current;
      const steps = current.kind === 'home' && current.phase.stage === 'intro'
        ? homeSteps.filter((step) => !step.optional || targets.has(step.target)) : current.steps;
      return { ...current, steps, phase: advanceGuide(current.phase, direction, steps.length) };
    });
  };

  return <GuideContext.Provider value={value}>
    <View style={styles.host}>
      {children}
      {active && <GuideOverlay phase={active.phase} steps={active.steps} targets={targets}
        onPrevious={() => move(-1)} onNext={() => move(1)} onSkip={() => end(false)} onFinish={() => end(true)} />}
    </View>
  </GuideContext.Provider>;
}

const styles = StyleSheet.create({ host: { flex: 1 } });

// Attach to existing native Views/Pressables; no extra layout wrapper is introduced.
export function useGuideTarget(id: string, enabled = true, reveal?: () => void) {
  const context = useContext(GuideContext);
  const register = context?.register;
  const owner = useRef({}).current;
  const revealRef = useRef(reveal);
  revealRef.current = reveal;
  return useCallback((node: View | null) => {
    if (enabled) register?.(id, owner, node, () => revealRef.current?.());
  }, [enabled, id, owner, register]);
}

export function HomeGuideReady({ ready, settled }: { ready: boolean; settled: boolean }) {
  const setReady = useContext(GuideContext)?.setHomeReady;
  useEffect(() => {
    setReady?.({ ready, settled });
    return () => setReady?.({ ready: false, settled: false });
  }, [ready, settled, setReady]);
  return null;
}

export function useSpotGuide() {
  return useContext(GuideContext)?.startDetails ?? (() => undefined);
}
