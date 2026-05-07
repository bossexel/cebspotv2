import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell, Compass, LucideIcon, User, Users } from 'lucide-react-native';
import { usePathname, useRouter } from 'expo-router';
import { AppColors, colors } from '../constants/colors';
import { fontSize, radius, shadow, spacing } from '../constants/design';

interface TabItem {
  label: string;
  href: '/' | '/circle' | '/activity' | '/profile';
  icon: LucideIcon;
}

const tabs: TabItem[] = [
  { label: 'Explore', href: '/', icon: Compass },
  { label: 'Circle', href: '/circle', icon: Users },
  { label: 'Activity', href: '/activity', icon: Bell },
  { label: 'Profile', href: '/profile', icon: User },
];

export function BottomNav({ appColors }: { appColors: AppColors }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View style={[styles.bar, { backgroundColor: appColors.surfaceLow }]}>
        {tabs.map((tab) => {
          const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Pressable
              key={tab.href}
              onPress={() => router.replace(tab.href)}
              style={({ pressed }) => [styles.item, active && styles.activeItem, pressed && styles.pressed]}
            >
              <Icon
                size={20}
                color={active ? colors.primary : appColors.onSurfaceVariant}
                strokeWidth={tab.href === '/' ? 2.7 : 2.2}
              />
              <Text style={[styles.label, { color: active ? colors.primary : appColors.onSurfaceVariant }]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.md,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  bar: {
    width: '100%',
    maxWidth: 390,
    minHeight: 74,
    borderRadius: radius.xxl,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: colors.white + '66',
    ...shadow.lifted,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.xl,
    paddingVertical: spacing.sm,
  },
  activeItem: {
    backgroundColor: colors.primary + '12',
  },
  pressed: {
    transform: [{ scale: 0.95 }],
  },
  label: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
});
