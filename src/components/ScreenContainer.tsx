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
  showBottomNav?: boolean;
  padded?: boolean;
}

export function ScreenContainer({
  appColors,
  children,
  scroll,
  showBottomNav,
  padded = true,
}: ScreenContainerProps) {
  const contentStyle = [
    padded && styles.padded,
    showBottomNav && { paddingBottom: tabBarHeight + spacing.xl },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: appColors.surface }]}>
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={contentStyle}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, contentStyle]}>{children}</View>
      )}
      {showBottomNav && <BottomNav appColors={appColors} />}
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
