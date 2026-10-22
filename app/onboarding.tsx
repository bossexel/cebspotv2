import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent, ViewToken } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '../src/components/AppButton';
import { colors } from '../src/constants/colors';
import { fontSize, radius, spacing } from '../src/constants/design';
import { useTheme } from '../src/hooks/useTheme';
import { welcomeStorage } from '../src/features/onboarding/welcomeStorage';

const cebspotLogo = require('../assets/cebspot-logo.png');

// ---------------------------------------------------------------------------
// Slide data
// ---------------------------------------------------------------------------
type SlideData = {
  id: string;
  headline: string;
  body: string;
  illustration: 'discover' | 'reserve' | 'community' | 'cta';
};

const slides: SlideData[] = [
  {
    id: 'discover',
    headline: 'Discover Cebu',
    body: 'Find cafés, restaurants, hidden gems, and local favorites across the Queen City of the South.',
    illustration: 'discover',
  },
  {
    id: 'reserve',
    headline: 'Reserve Your Spot',
    body: 'Book tables, secure your seats, and never miss out on the best places in town.',
    illustration: 'reserve',
  },
  {
    id: 'community',
    headline: 'Join the Community',
    body: 'Share your discoveries, read reviews, create Circles with friends, and explore together.',
    illustration: 'community',
  },
  {
    id: 'cta',
    headline: 'Cebu is yours to explore',
    body: 'Your next local favorite starts here. Sign up to unlock the full CebSpot experience.',
    illustration: 'cta',
  },
];

// ---------------------------------------------------------------------------
// SVG Illustrations
// ---------------------------------------------------------------------------
function DiscoverIllustration() {
  return (
    <View style={styles.illustrationWrap}>
      <Svg width={160} height={160} viewBox="0 0 160 160">
        {/* Map background circle */}
        <Circle cx={80} cy={80} r={70} fill={colors.primary + '18'} />
        <Circle cx={80} cy={80} r={50} fill={colors.primary + '12'} />
        {/* Map grid lines */}
        <Line x1={40} y1={80} x2={120} y2={80} stroke={colors.primary + '30'} strokeWidth={1} />
        <Line x1={80} y1={40} x2={80} y2={120} stroke={colors.primary + '30'} strokeWidth={1} />
        <Line x1={50} y1={50} x2={110} y2={110} stroke={colors.primary + '15'} strokeWidth={0.5} />
        <Line x1={110} y1={50} x2={50} y2={110} stroke={colors.primary + '15'} strokeWidth={0.5} />
        {/* Map pin */}
        <G transform="translate(62, 30)">
          <Path
            d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 32 18 32s18-18.5 18-32C36 8.06 27.94 0 18 0z"
            fill={colors.primary}
          />
          <Circle cx={18} cy={18} r={8} fill={colors.white} />
          {/* Coffee cup inside pin */}
          <Rect x={14} y={14} width={8} height={6} rx={1} fill={colors.primary} />
          <Path d="M22 15.5 h2 a2 2 0 0 1 0 4 h-2" stroke={colors.primary} strokeWidth={1.2} fill="none" />
          {/* Steam lines */}
          <Path d="M16 13 q0.5-2 0-4" stroke={colors.primary} strokeWidth={0.8} fill="none" />
          <Path d="M18 12 q0.5-2 0-4" stroke={colors.primary} strokeWidth={0.8} fill="none" />
          <Path d="M20 13 q0.5-2 0-4" stroke={colors.primary} strokeWidth={0.8} fill="none" />
        </G>
        {/* Small dots representing other spots */}
        <Circle cx={45} cy={95} r={4} fill={colors.primary + '60'} />
        <Circle cx={110} cy={70} r={3} fill={colors.primary + '45'} />
        <Circle cx={95} cy={105} r={3.5} fill={colors.primary + '55'} />
        <Circle cx={60} cy={115} r={2.5} fill={colors.primary + '35'} />
      </Svg>
    </View>
  );
}

function ReserveIllustration() {
  return (
    <View style={styles.illustrationWrap}>
      <Svg width={160} height={160} viewBox="0 0 160 160">
        {/* Background circle */}
        <Circle cx={80} cy={80} r={70} fill={colors.primary + '18'} />
        {/* Calendar body */}
        <G transform="translate(40, 35)">
          <Rect x={0} y={12} width={80} height={70} rx={8} fill={colors.white} stroke={colors.primary + '40'} strokeWidth={1.5} />
          {/* Calendar top bar */}
          <Rect x={0} y={12} width={80} height={20} rx={8} fill={colors.primary} />
          <Rect x={0} y={24} width={80} height={8} fill={colors.primary} />
          {/* Calendar rings */}
          <Rect x={20} y={6} width={4} height={16} rx={2} fill={colors.primary} />
          <Rect x={56} y={6} width={4} height={16} rx={2} fill={colors.primary} />
          {/* Calendar grid */}
          <G fill={colors.primary + '25'}>
            <Rect x={10} y={40} width={12} height={10} rx={2} />
            <Rect x={26} y={40} width={12} height={10} rx={2} />
            <Rect x={42} y={40} width={12} height={10} rx={2} />
            <Rect x={58} y={40} width={12} height={10} rx={2} />
            <Rect x={10} y={55} width={12} height={10} rx={2} />
            <Rect x={26} y={55} width={12} height={10} rx={2} />
            <Rect x={58} y={55} width={12} height={10} rx={2} />
          </G>
          {/* Highlighted date */}
          <Rect x={42} y={55} width={12} height={10} rx={2} fill={colors.primary} />
          {/* Checkmark on highlighted date */}
          <Path d="M45 60.5 l2.5 2.5 l4-4" stroke={colors.white} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </G>
        {/* Clock accent */}
        <G transform="translate(100, 90)">
          <Circle cx={0} cy={0} r={16} fill={colors.primary + '20'} stroke={colors.primary} strokeWidth={1.5} />
          <Line x1={0} y1={0} x2={0} y2={-8} stroke={colors.primary} strokeWidth={2} strokeLinecap="round" />
          <Line x1={0} y1={0} x2={6} y2={0} stroke={colors.primary} strokeWidth={2} strokeLinecap="round" />
          <Circle cx={0} cy={0} r={1.5} fill={colors.primary} />
        </G>
      </Svg>
    </View>
  );
}

function CommunityIllustration() {
  return (
    <View style={styles.illustrationWrap}>
      <Svg width={160} height={160} viewBox="0 0 160 160">
        {/* Background circle */}
        <Circle cx={80} cy={80} r={70} fill={colors.primary + '18'} />
        {/* Center person */}
        <G transform="translate(80, 55)">
          <Circle cx={0} cy={0} r={14} fill={colors.primary} />
          <Path d="M-18 40 a18 18 0 0 1 36 0" fill={colors.primary} />
        </G>
        {/* Left person */}
        <G transform="translate(42, 65)">
          <Circle cx={0} cy={0} r={11} fill={colors.primary + '70'} />
          <Path d="M-14 32 a14 14 0 0 1 28 0" fill={colors.primary + '70'} />
        </G>
        {/* Right person */}
        <G transform="translate(118, 65)">
          <Circle cx={0} cy={0} r={11} fill={colors.primary + '70'} />
          <Path d="M-14 32 a14 14 0 0 1 28 0" fill={colors.primary + '70'} />
        </G>
        {/* Connection lines */}
        <Line x1={55} y1={70} x2={70} y2={60} stroke={colors.primary + '35'} strokeWidth={1.5} strokeDasharray="3,3" />
        <Line x1={105} y1={70} x2={90} y2={60} stroke={colors.primary + '35'} strokeWidth={1.5} strokeDasharray="3,3" />
        <Line x1={55} y1={85} x2={105} y2={85} stroke={colors.primary + '20'} strokeWidth={1} strokeDasharray="3,3" />
        {/* Heart accent */}
        <G transform="translate(80, 30)">
          <Path
            d="M0 4 C0 -2, -8 -4, -8 2 C-8 6, 0 12, 0 12 C0 12, 8 6, 8 2 C8 -4, 0 -2, 0 4z"
            fill={colors.primary + '50'}
          />
        </G>
        {/* Star accent */}
        <G transform="translate(130, 45)">
          <Path
            d="M0-6 L1.8-1.8 L6.6-1.8 L2.8 1.2 L4 6 L0 3.2 L-4 6 L-2.8 1.2 L-6.6-1.8 L-1.8-1.8z"
            fill={colors.primary + '40'}
          />
        </G>
        {/* Chat bubble accent */}
        <G transform="translate(30, 45)">
          <Path
            d="M-8-6 h16 a4 4 0 0 1 4 4 v8 a4 4 0 0 1-4 4 h-8 l-4 4 v-4 h-4 a4 4 0 0 1-4-4 v-8 a4 4 0 0 1 4-4z"
            fill={colors.primary + '30'}
          />
          <Circle cx={-3} cy={1} r={1.2} fill={colors.primary + '60'} />
          <Circle cx={2} cy={1} r={1.2} fill={colors.primary + '60'} />
          <Circle cx={7} cy={1} r={1.2} fill={colors.primary + '60'} />
        </G>
      </Svg>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Onboarding Screen
// ---------------------------------------------------------------------------
export default function OnboardingScreen() {
  const { appColors, isDarkMode } = useTheme();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const flatListRef = useRef<FlatList<SlideData>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [activeIndex, setActiveIndex] = useState(0);

  const isLastSlide = activeIndex === slides.length - 1;

  const finish = useCallback(() => {
    void welcomeStorage.markCompleted();
    router.replace('/login');
  }, [router]);

  const goNext = useCallback(() => {
    if (isLastSlide) {
      finish();
      return;
    }
    flatListRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
  }, [activeIndex, finish, isLastSlide]);

  const handleViewableChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<SlideData>[] }) => {
      const visible = viewableItems.find((item) => item.isViewable && item.index != null);
      if (visible?.index != null) setActiveIndex(visible.index);
    },
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
    minimumViewTime: 50,
  }).current;

  const renderSlide = useCallback(
    ({ item }: { item: SlideData }) => (
      <View style={[styles.slide, { width }]}>
        <View style={styles.slideContent}>
          {item.illustration === 'discover' && <DiscoverIllustration />}
          {item.illustration === 'reserve' && <ReserveIllustration />}
          {item.illustration === 'community' && <CommunityIllustration />}
          {item.illustration === 'cta' && (
            <Image
              accessible={false}
              source={cebspotLogo}
              style={styles.ctaLogo}
              resizeMode="contain"
            />
          )}

          <Text
            accessibilityRole="header"
            style={[styles.headline, { color: appColors.onSurface }]}
          >
            {item.headline}
          </Text>
          <Text style={[styles.body, { color: appColors.onSurfaceVariant }]}>
            {item.body}
          </Text>

          {item.illustration === 'cta' && (
            <View style={styles.ctaButtons}>
              <AppButton label="Get Started" onPress={finish} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Already have an account? Sign in"
                onPress={finish}
                style={styles.signInLink}
              >
                <Text style={[styles.signInText, { color: appColors.onSurfaceVariant }]}>
                  Already have an account?{' '}
                  <Text style={styles.signInAccent}>Sign in</Text>
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    ),
    [appColors, finish, width],
  );

  const keyExtractor = useCallback((item: SlideData) => item.id, []);

  const getItemLayout = useCallback(
    (_: ArrayLike<SlideData> | null | undefined, index: number) => ({
      length: width,
      offset: width * index,
      index,
    }),
    [width],
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: appColors.surface }]}>
      {/* Skip button — visible on all slides except the last */}
      {!isLastSlide && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
          onPress={finish}
          style={styles.skipButton}
        >
          <Text style={[styles.skipText, { color: appColors.onSurfaceVariant }]}>Skip</Text>
        </Pressable>
      )}

      {/* Slide carousel */}
      <Animated.FlatList
        ref={flatListRef}
        data={slides}
        keyExtractor={keyExtractor}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        getItemLayout={getItemLayout}
        onViewableItemsChanged={handleViewableChanged}
        viewabilityConfig={viewabilityConfig}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false },
        )}
        scrollEventThrottle={16}
        renderItem={renderSlide}
      />

      {/* Bottom controls */}
      <View style={styles.bottomControls}>
        {/* Dot indicators */}
        <View style={styles.dots}>
          {slides.map((slide, index) => {
            const inputRange = [
              (index - 1) * width,
              index * width,
              (index + 1) * width,
            ];
            const dotWidth = scrollX.interpolate({
              inputRange,
              outputRange: [8, 24, 8],
              extrapolate: 'clamp',
            });
            const dotOpacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.3, 1, 0.3],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={slide.id}
                style={[
                  styles.dot,
                  {
                    width: dotWidth,
                    opacity: dotOpacity,
                    backgroundColor: colors.primary,
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Next / Get Started button (hidden on CTA slide since it has its own buttons) */}
        {!isLastSlide && (
          <View style={styles.nextButtonWrap}>
            <AppButton
              label={activeIndex === slides.length - 2 ? 'Get Started' : 'Next'}
              onPress={goNext}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  skipButton: {
    position: 'absolute',
    top: Platform.OS === 'android' ? spacing.xxl + spacing.lg : spacing.lg,
    right: spacing.xl,
    zIndex: 10,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  skipText: {
    fontFamily: 'Montserrat_700Bold',
    fontSize: fontSize.md,
    letterSpacing: 0.5,
  },
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slideContent: {
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    maxWidth: 400,
  },
  illustrationWrap: {
    marginBottom: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    width: 200,
    height: 200,
  },
  ctaLogo: {
    width: 120,
    height: 140,
    marginBottom: spacing.xl,
  },
  headline: {
    fontFamily: 'Montserrat_800ExtraBold',
    fontSize: fontSize.display,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  body: {
    fontFamily: 'Montserrat_400Regular',
    fontSize: fontSize.lg,
    textAlign: 'center',
    lineHeight: 25,
    paddingHorizontal: spacing.sm,
  },
  ctaButtons: {
    width: '100%',
    marginTop: spacing.xxl,
    gap: spacing.lg,
  },
  signInLink: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
  },
  signInText: {
    fontFamily: 'Montserrat_400Regular',
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  signInAccent: {
    fontFamily: 'Montserrat_700Bold',
    color: colors.primary,
  },
  bottomControls: {
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    height: 8,
    borderRadius: radius.pill,
  },
  nextButtonWrap: {
    paddingHorizontal: spacing.xl,
  },
});
