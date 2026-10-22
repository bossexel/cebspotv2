import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Easing, findNodeHandle, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../../constants/colors';
import { fontSize, radius, shadow, spacing } from '../../constants/design';
import { useTheme } from '../../hooks/useTheme';
import type { GuideTarget } from './GuideProvider';
import { GuideArtwork } from './GuideArtwork';
import { GuidePhase, GuideStep, guideTitleFontSize, introduction, Rect, tooltipPlacement, visibleRect, windowRectToOverlay } from './model';

type Props = {
  phase: GuidePhase; steps: GuideStep[]; targets: Map<string, GuideTarget>;
  onPrevious: () => void; onNext: () => void; onSkip: () => void; onFinish: () => void;
};

const headlines = [
  { lead: 'Discover', accent: 'Cebu' },
  { lead: 'Explore Local', accent: 'Favorites' },
  { lead: 'Share With the', accent: 'Community' },
];
const captions = ['01  /  THE CITY IS YOURS', '02  /  FOLLOW YOUR CURIOSITY', '03  /  GOOD PLACES TRAVEL'];
const logo = require('../../../assets/cebspot-logo.png');

function roundedOutline(rect: Rect, width: number, height: number) {
  const x = Math.max(2, rect.x - 4);
  const y = Math.max(2, rect.y - 4);
  const w = Math.max(2, Math.min(width - x - 2, rect.width + 8));
  const h = Math.max(2, Math.min(height - y - 2, rect.height + 8));
  const r = Math.min(18, w / 4, h / 4);
  return `M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`;
}

export function GuideOverlay({ phase, steps, targets, onPrevious, onNext, onSkip, onFinish }: Props) {
  const { appColors, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const overlayRoot = useRef<View>(null);
  const heading = useRef<Text>(null);
  const scroll = useRef<ScrollView>(null);
  const entrance = useRef(new Animated.Value(0)).current;
  const halo = useRef(new Animated.Value(0)).current;
  const [viewport, setViewport] = useState({ width: window.width, height: window.height });
  const [measured, setMeasured] = useState<{ key: string; rects: Rect[] } | null>(null);
  const [waiting, setWaiting] = useState(true);
  const [shown, setShown] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const step = phase.stage === 'tour' ? steps[phase.index] : null;
  const stepKey = `${phase.stage}:${phase.index}:${step?.target ?? ''}:${viewport.width}x${viewport.height}`;
  const rects = measured?.key === stepKey ? measured.rects : [];
  const rect = rects[0] ?? null;
  const content = phase.stage === 'intro' ? introduction[phase.index] : step;
  const intro = phase.stage === 'intro';
  const welcome = phase.stage === 'welcome';
  const waitingForStep = Boolean(step) && (measured?.key !== stepKey || waiting);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (welcome) onFinish();
      else onSkip();
      return true;
    });
    return () => subscription.remove();
  }, [onFinish, onSkip, welcome]);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { if (mounted) setReducedMotion(enabled); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (!shown) return;
    entrance.stopAnimation();
    entrance.setValue(reducedMotion ? 1 : 0);
    if (reducedMotion) return;
    const animation = Animated.timing(entrance, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [entrance, phase.index, phase.stage, reducedMotion, shown]);

  useEffect(() => {
    if (!shown || !rect || reducedMotion) return;
    halo.setValue(0);
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(halo, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(halo, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [halo, Boolean(rect), reducedMotion, shown, step?.target]);

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => {
      scroll.current?.scrollTo({ y: 0, animated: false });
      const node = findNodeHandle(heading.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 390);
    return () => clearTimeout(timer);
  }, [phase.index, phase.stage, shown]);

  useEffect(() => {
    setMeasured({ key: stepKey, rects: [] });
    setWaiting(Boolean(step));
    if (!step || !shown) return;
    let cancelled = false;
    let request = 0;
    let lastApplied = 0;
    const revealed = new Map<string, GuideTarget>();
    const deadline = Date.now() + 2400;
    const measure = () => {
      const sequence = ++request;
      const ids = [step.target, ...(step.alsoTargets ?? [])];
      const measured = new Map<string, Rect>();
      let pending = ids.length;
      const finish = () => {
        pending -= 1;
        if (pending || cancelled) return;
        if (sequence < lastApplied) return;
        lastApplied = sequence;
        const next = ids.flatMap((id) => measured.has(id) ? [measured.get(id)!] : []);
        setMeasured((previous) => previous?.key === stepKey && JSON.stringify(previous.rects) === JSON.stringify(next)
          ? previous : { key: stepKey, rects: next });
        if (next.length || Date.now() >= deadline) setWaiting(false);
      };
      ids.forEach((id) => {
        const target = targets.get(id);
        if (!target) { finish(); return; }
        if (revealed.get(id) !== target) {
          revealed.set(id, target);
          target.reveal?.();
        }
        
        overlayRoot.current?.measureInWindow((originX, originY) => {
          if (cancelled || targets.get(id) !== target) { finish(); return; }
          target.node.measureInWindow((x, y, width, height) => {
            if (!cancelled && targets.get(id) === target) {
              const next = visibleRect(
                windowRectToOverlay({ x, y, width, height }, { x: originX, y: originY }),
                viewport.width, viewport.height,
              );
              if (next) measured.set(id, next);
            }
            finish();
          });
        });
      });
    };
    const timeout = setTimeout(() => { if (!cancelled) setWaiting(false); }, 2500);
    const interval = setInterval(measure, 100);
    measure();
    return () => { cancelled = true; clearInterval(interval); clearTimeout(timeout); };
  }, [shown, step, stepKey, targets, viewport.height, viewport.width, window.fontScale, window.height, window.width]);

  const focusBounds = rects.length ? {
    x: Math.min(...rects.map((item) => item.x)),
    y: Math.min(...rects.map((item) => item.y)),
    width: Math.max(...rects.map((item) => item.x + item.width)) - Math.min(...rects.map((item) => item.x)),
    height: Math.max(...rects.map((item) => item.y + item.height)) - Math.min(...rects.map((item) => item.y)),
  } : null;
  const placement = tooltipPlacement(focusBounds, viewport.width, viewport.height, insets.top, insets.bottom);
  const outlines = rects.map((item) => roundedOutline(item, viewport.width, viewport.height));
  const mask = `M0 0 H${viewport.width} V${viewport.height} H0 Z ${outlines.join(' ')}`;
  const rise = { opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] };

  return <View ref={overlayRoot} collapsable={false} style={styles.overlay}
      accessibilityViewIsModal importantForAccessibility="yes"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width > 0 && height > 0) {
          setViewport((previous) => previous.width === width && previous.height === height ? previous : { width, height });
          setShown(true);
        }
      }}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => undefined} accessible={false} />
      {intro || welcome ? <Animated.View style={[styles.fullScreen, { backgroundColor: appColors.surface }, rise]}>
        <ScrollView ref={scroll} style={styles.pageScroll} showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.pageContent, { paddingTop: insets.top + spacing.lg }]}>
          <View style={styles.brandRow}>
            <View style={styles.brandName}><Image source={logo} style={styles.brandLogo} resizeMode="contain" /><Text style={[styles.brandText, { color: appColors.onSurface }]}>CEBSPOT</Text></View>
            {!welcome && <Pressable accessibilityRole="button" accessibilityLabel="Skip introduction and tour" hitSlop={10} onPress={onSkip} style={styles.skipTop}><Text style={[styles.skipTopText, { color: appColors.onSurfaceVariant }]}>SKIP</Text><ArrowRight size={15} color={appColors.onSurfaceVariant} /></Pressable>}
          </View>
          <View style={styles.artworkWrap}>
            <GuideArtwork scene={welcome ? 0 : phase.index} height={Math.min(344, Math.max(205, viewport.height * 0.38))} reducedMotion={reducedMotion} />
            <View style={[styles.artworkNumber, { backgroundColor: appColors.surfaceRaised }]}><Text style={[styles.artworkNumberText, { color: appColors.onSurface }]}>{welcome ? '✓' : `0${phase.index + 1}`}</Text></View>
          </View>
          <View style={styles.introCopy}>
            <Text style={[styles.caption, { color: isDarkMode ? '#FF9A62' : '#A43D00' }]}>{welcome ? 'YOUR CITY. YOUR NEXT STORY.' : captions[phase.index]}</Text>
            <Text ref={heading} accessible accessibilityRole="header" style={[styles.introTitle, { color: appColors.onSurface, fontSize: guideTitleFontSize(viewport.width) }]}>
              {welcome ? 'Cebu is yours to ' : `${headlines[phase.index].lead} `}<Text style={{ color: colors.primary }}>{welcome ? 'explore.' : headlines[phase.index].accent}</Text>
            </Text>
            <Text style={[styles.introBody, { color: appColors.onSurfaceVariant }]}>
              {welcome ? 'You know your way around. Find a place worth visiting, and make it your own.' : content?.body}
            </Text>
          </View>
        </ScrollView>
        <View style={[styles.pageFooter, { paddingBottom: insets.bottom + spacing.lg, borderTopColor: appColors.outlineVariant + '66', backgroundColor: appColors.surface }]}>
          <View style={styles.progressRow}>
            <Text style={[styles.progressLabel, { color: appColors.onSurfaceVariant }]}>{welcome ? 'READY TO GO' : `INTRODUCTION  /  ${phase.index + 1} OF ${introduction.length}`}</Text>
            <View style={styles.progressBars}>{introduction.map((_, index) => <View key={index} style={[styles.progressBar, { backgroundColor: welcome || index <= phase.index ? colors.primary : appColors.outlineVariant }]} />)}</View>
          </View>
          <View style={styles.footerButtons}>
            {(phase.index > 0 || welcome) && <Pressable accessibilityRole="button" accessibilityLabel="Previous guide step" onPress={onPrevious} style={[styles.backButton, { borderColor: appColors.outlineVariant }]}><ArrowLeft size={21} color={appColors.onSurface} /></Pressable>}
            <Pressable accessibilityRole="button" accessibilityLabel={welcome ? 'Start exploring' : phase.index === introduction.length - 1 ? 'Get Started' : 'Next'} onPress={welcome ? onFinish : onNext} style={({ pressed }) => [styles.mainButton, pressed && styles.buttonPressed]}>
              <Text style={styles.mainButtonText}>{welcome ? 'Start exploring' : phase.index === introduction.length - 1 ? 'Get Started' : 'Next'}</Text><View style={styles.mainButtonArrow}><ArrowRight size={20} color={colors.primary} /></View>
            </Pressable>
          </View>
        </View>
      </Animated.View> : <>
        <Svg pointerEvents="none" width={viewport.width} height={viewport.height} style={StyleSheet.absoluteFill}>
          <Path d={mask} fill={isDarkMode ? colors.black + 'C8' : colors.secondary + 'B8'} fillRule="evenodd" />
          {outlines.map((outline, index) => <Path key={index} d={outline} fill="none" stroke={colors.white} strokeWidth={3} />)}
        </Svg>
        {rect && !reducedMotion && <Animated.View pointerEvents="none" style={[styles.focusHalo, { left: rect.x - 8, top: rect.y - 8, width: rect.width + 16, height: rect.height + 16, borderColor: colors.primary,
          opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0.2] }),
          transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] }) }],
        }]} />}
        <Animated.View style={[styles.tourCard, placement, rise, { width: Math.min(408, viewport.width - 24), backgroundColor: isDarkMode ? appColors.surfaceRaised : colors.secondary, borderColor: isDarkMode ? appColors.outlineVariant : '#FFFFFF30' }]}>
          <View style={styles.tourTopline}><View style={styles.tourBrand}><View style={styles.brandMark} /><Text style={styles.tourBrandText}>CEBSPOT GUIDE</Text></View><Text style={styles.tourCount}>{String(phase.index + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}</Text></View>
          <View style={styles.tourProgress}>{steps.map((item, index) => <View key={item.target} style={[styles.tourProgressBar, { backgroundColor: index <= phase.index ? colors.primary : '#FFFFFF3D' }]} />)}</View>
          <ScrollView ref={scroll} style={styles.tourBodyScroll} contentContainerStyle={styles.tourBody} showsVerticalScrollIndicator={false}>
            <Text ref={heading} accessible accessibilityRole="header" style={styles.tourTitle}>{step?.title}</Text>
            <Text style={styles.tourDescription}>{step?.body}</Text>
            {step && !rect && <Text accessibilityLiveRegion="polite" style={styles.tourNotice}>{waitingForStep ? 'Finding this part of the screen…' : 'This control is unavailable right now. Continue or skip the guide.'}</Text>}
          </ScrollView>
          <View style={styles.tourActions}>
            {phase.index > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Previous guide step" onPress={onPrevious} style={styles.tourTextButton}><Text style={styles.tourTextButtonLabel}>BACK</Text></Pressable>}
            <Pressable accessibilityRole="button" accessibilityLabel="Skip guide" onPress={onSkip} style={styles.tourTextButton}><Text style={styles.tourTextButtonLabel}>SKIP</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={phase.index === steps.length - 1 ? 'Finish guide' : 'Next guide step'} disabled={waitingForStep} onPress={onNext}
              style={({ pressed }) => [styles.tourNext, waitingForStep && styles.tourNextDisabled, pressed && styles.buttonPressed]}><Text style={styles.tourNextLabel}>{phase.index === steps.length - 1 ? 'FINISH' : 'NEXT'}</Text><ArrowRight size={17} color={colors.secondary} /></Pressable>
          </View>
        </Animated.View>
      </>}
  </View>;
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 1000, elevation: 1000 },
  fullScreen: { flex: 1 },
  pageScroll: { flex: 1 },
  pageContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, flexGrow: 1 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  brandName: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandLogo: { width: 31, height: 37 },
  brandText: { fontFamily: 'Montserrat_900Black', fontSize: 15, letterSpacing: 2.2 },
  skipTop: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.sm },
  skipTopText: { fontFamily: 'Montserrat_800ExtraBold', fontSize: 11, letterSpacing: 1.1 },
  artworkWrap: { marginTop: spacing.xl, position: 'relative' },
  artworkNumber: { position: 'absolute', right: -8, top: -10, width: 45, height: 45, borderRadius: 16, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  artworkNumberText: { fontFamily: 'Montserrat_900Black', fontSize: 15 },
  introCopy: { marginTop: spacing.xl, maxWidth: 440, paddingBottom: 12 },
  caption: { fontFamily: 'Montserrat_800ExtraBold', fontSize: 10, letterSpacing: 1.35, marginBottom: 11 },
  introTitle: { fontFamily: 'Montserrat_900Black', letterSpacing: -1.8 },
  introBody: { fontFamily: 'Montserrat_400Regular', fontSize: 16, lineHeight: 26, marginTop: 12 },
  pageFooter: { borderTopWidth: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.md },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  progressLabel: { fontFamily: 'Montserrat_700Bold', fontSize: 10, letterSpacing: 1, flexShrink: 1 },
  progressBars: { flexDirection: 'row', gap: 5 },
  progressBar: { width: 22, height: 4, borderRadius: 2 },
  footerButtons: { flexDirection: 'row', gap: spacing.sm },
  backButton: { borderWidth: 1, borderRadius: radius.lg, width: 56, minHeight: 58, alignItems: 'center', justifyContent: 'center' },
  mainButton: { flex: 1, minHeight: 58, backgroundColor: colors.primary, borderRadius: radius.lg, paddingLeft: spacing.lg, paddingRight: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...shadow.card },
  mainButtonText: { color: colors.secondary, fontFamily: 'Montserrat_800ExtraBold', fontSize: 14 },
  mainButtonArrow: { width: 43, height: 43, borderRadius: 13, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  buttonPressed: { opacity: 0.84, transform: [{ scale: 0.98 }] },
  focusHalo: { position: 'absolute', borderWidth: 2, borderRadius: radius.lg },
  tourCard: { position: 'absolute', borderRadius: radius.xl, borderWidth: 1, overflow: 'hidden', paddingTop: spacing.lg, ...shadow.lifted },
  tourTopline: { paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tourBrand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brandMark: { width: 9, height: 9, borderRadius: 3, transform: [{ rotate: '45deg' }], backgroundColor: colors.primary },
  tourBrandText: { color: colors.white, fontFamily: 'Montserrat_800ExtraBold', fontSize: 10, letterSpacing: 1.25 },
  tourCount: { color: colors.white, fontFamily: 'Montserrat_800ExtraBold', fontSize: 11, letterSpacing: 1.1 },
  tourProgress: { flexDirection: 'row', gap: 4, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  tourProgressBar: { flex: 1, height: 3, borderRadius: 2 },
  tourBodyScroll: { flexShrink: 1 },
  tourBody: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
  tourTitle: { color: colors.white, fontFamily: 'Montserrat_900Black', fontSize: 23, lineHeight: 28, letterSpacing: -0.7 },
  tourDescription: { color: '#E0E8EC', fontFamily: 'Montserrat_400Regular', fontSize: fontSize.md, lineHeight: 22, marginTop: 9 },
  tourNotice: { color: '#FFCDAD', fontFamily: 'Montserrat_700Bold', fontSize: 12, lineHeight: 18, marginTop: 12 },
  tourActions: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  tourTextButton: { minHeight: 45, minWidth: 50, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  tourTextButtonLabel: { color: '#E0E8EC', fontFamily: 'Montserrat_800ExtraBold', fontSize: 10, letterSpacing: 1 },
  tourNext: { minHeight: 45, borderRadius: radius.md, backgroundColor: colors.primary, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 6 },
  tourNextDisabled: { opacity: 0.55 },
  tourNextLabel: { color: colors.secondary, fontFamily: 'Montserrat_800ExtraBold', fontSize: 11, letterSpacing: 0.8 },
});
