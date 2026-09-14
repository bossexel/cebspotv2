import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppColors } from '../constants/colors';
import { spacing, tabBarHeight } from '../constants/design';
import { BottomNav } from './BottomNav';

interface ScreenContainerProps {
  appColors: AppColors;
  children: React.ReactNode;
  scroll?: boolean;
  scrollRef?: React.RefObject<ScrollView>;
  scrollEnabled?: boolean;
  showBottomNav?: boolean;
  bottomNavOverlay?: boolean;
  onBottomNavHeightChange?: (height: number) => void;
  padded?: boolean;
}

export function ScreenContainer({
  appColors,
  children,
  scroll,
  scrollRef,
  scrollEnabled = true,
  showBottomNav,
  bottomNavOverlay = false,
  onBottomNavHeightChange,
  padded = true,
}: ScreenContainerProps) {
  const contentStyle = [
    padded && styles.padded,
    showBottomNav && !bottomNavOverlay && { paddingBottom: tabBarHeight + spacing.xl },
  ];

  return (
    <SafeAreaView testID="screen-safe-area" style={[styles.safe, { backgroundColor: appColors.surface }]}>
      <View style={styles.flex}>
        {scroll ? (
          <ScrollView
            ref={scrollRef}
            testID="screen-scroll-view"
            style={styles.flex}
            contentContainerStyle={contentStyle}
            scrollEnabled={scrollEnabled}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, contentStyle]}>{children}</View>
        )}
        {showBottomNav && <BottomNav appColors={appColors} onHeightChange={onBottomNavHeightChange} />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
});
