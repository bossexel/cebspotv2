import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Award, Calendar, ChevronRight, LogOut, MapPin, Moon, Settings, Star, Sun } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { colors } from '../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../src/constants/design';
import { sampleCircles } from '../src/constants/sampleData';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/hooks/useTheme';
import { reservationService } from '../src/services/reservationService';

export default function ProfileScreen() {
  const router = useRouter();
  const { appColors, isDarkMode, toggleDarkMode } = useTheme();
  const { profile, logOut } = useAuth();
  const [reservationCount, setReservationCount] = useState(0);

  useEffect(() => {
    async function loadStats() {
      if (!profile?.id) return;
      try {
        const reservations = await reservationService.getUserReservations(profile.id);
        setReservationCount(reservations.length);
      } catch (error) {
        console.error('Unable to load reservation count:', error);
      }
    }

    loadStats();
  }, [profile?.id]);

  async function logout() {
    try {
      await logOut();
      router.replace('/login');
    } catch (error: any) {
      Alert.alert('Logout failed', error.message ?? 'Please try again.');
    }
  }

  const name = profile?.display_name || 'Explorer';
  const initial = name.charAt(0).toUpperCase();

  return (
    <ScreenContainer appColors={appColors} showBottomNav scroll>
      <View style={styles.header}>
        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
            <View style={styles.award}>
              <Award size={15} color={colors.white} fill={colors.white} />
            </View>
          </View>
          <View style={styles.nameBlock}>
            <Text style={[styles.name, { color: appColors.onSurface }]}>{name}</Text>
            <View style={styles.location}>
              <MapPin size={14} color={colors.primary} />
              <Text style={[styles.locationText, { color: appColors.onSurfaceVariant }]}>
                Cebu City, Philippines
              </Text>
            </View>
            <View style={styles.level}>
              <Text style={styles.levelText}>Level {profile?.level ?? 1}</Text>
            </View>
          </View>
        </View>
        <Pressable style={[styles.settings, { backgroundColor: appColors.surfaceLow }]}>
          <Settings size={20} color={appColors.onSurface} />
        </Pressable>
      </View>

      <View style={[styles.milestone, { backgroundColor: appColors.surfaceLow }]}>
        <View style={styles.milestoneTop}>
          <View>
            <Text style={[styles.cardTitle, { color: appColors.onSurface }]}>Milestone</Text>
            <Text style={[styles.cardSub, { color: appColors.onSurfaceVariant }]}>
              42 of 50 local spots visited
            </Text>
          </View>
          <Text style={styles.percent}>84%</Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: appColors.surfaceHighest }]}>
          <View style={styles.progressFill} />
        </View>
      </View>

      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { backgroundColor: appColors.surfaceLow }]}>
          <View style={styles.statIcon}>
            <Star size={20} color={colors.primary} fill={colors.primary} />
          </View>
          <Text style={[styles.statValue, { color: appColors.onSurface }]}>{profile?.points ?? 0}</Text>
          <Text style={[styles.statLabel, { color: appColors.onSurfaceVariant }]}>Points</Text>
        </View>
        <View style={[styles.statCard, styles.orangeCard]}>
          <View style={styles.statIconLight}>
            <Calendar size={20} color={colors.white} />
          </View>
          <Text style={[styles.statValue, { color: colors.white }]}>{reservationCount}</Text>
          <Text style={[styles.statLabel, { color: colors.white }]}>Reservations</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>My Circles</Text>
        {sampleCircles.map((circle) => (
          <View key={circle.id} style={[styles.listItem, { backgroundColor: appColors.surfaceLow }]}>
            <View style={styles.circleAvatar}>
              <Text style={styles.circleAvatarText}>{circle.name.charAt(0)}</Text>
            </View>
            <View style={styles.listCopy}>
              <Text style={[styles.listTitle, { color: appColors.onSurface }]}>{circle.name}</Text>
              <Text style={[styles.listSub, { color: appColors.onSurfaceVariant }]}>
                {circle.members.length} members
              </Text>
            </View>
            <ChevronRight size={20} color={appColors.onSurfaceVariant} />
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>Settings</Text>
        <Pressable style={[styles.listItem, { backgroundColor: appColors.surfaceLow }]} onPress={toggleDarkMode}>
          <View style={styles.settingIcon}>
            {isDarkMode ? <Moon size={20} color={colors.primary} /> : <Sun size={20} color={colors.primary} />}
          </View>
          <View style={styles.listCopy}>
            <Text style={[styles.listTitle, { color: appColors.onSurface }]}>Dark Mode</Text>
            <Text style={[styles.listSub, { color: appColors.onSurfaceVariant }]}>Preserve your preferred vibe</Text>
          </View>
          <View style={[styles.switchTrack, { backgroundColor: isDarkMode ? colors.primary : appColors.outlineVariant }]}>
            <View style={[styles.switchThumb, isDarkMode && styles.switchOn]} />
          </View>
        </Pressable>
      </View>

      <Pressable style={styles.logout} onPress={logout}>
        <LogOut size={20} color={colors.white} />
        <Text style={styles.logoutText}>Logout</Text>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xl,
  },
  profileRow: {
    flexDirection: 'row',
    gap: spacing.md,
    flex: 1,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    ...shadow.card,
  },
  avatarText: {
    color: colors.white,
    fontSize: fontSize.display,
    fontWeight: '900',
  },
  award: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 30,
    height: 30,
    borderRadius: radius.md,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameBlock: {
    flex: 1,
  },
  name: {
    fontSize: 28,
    fontWeight: '900',
    fontStyle: 'italic',
  },
  location: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  locationText: {
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  level: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primary + '12',
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  levelText: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  settings: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestone: {
    borderRadius: radius.xxl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  milestoneTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  cardSub: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: 3,
  },
  percent: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: '900',
    fontStyle: 'italic',
  },
  progressTrack: {
    height: 14,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    width: '84%',
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  statCard: {
    flex: 1,
    height: 140,
    borderRadius: radius.xxl,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  orangeCard: {
    backgroundColor: colors.primary,
    ...shadow.card,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '12',
  },
  statIconLight: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white + '22',
  },
  statValue: {
    fontSize: 30,
    fontWeight: '900',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  section: {
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  listItem: {
    minHeight: 72,
    borderRadius: radius.xl,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  circleAvatar: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
  },
  circleAvatarText: {
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  listCopy: {
    flex: 1,
  },
  listTitle: {
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  listSub: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: 3,
  },
  settingIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '12',
  },
  switchTrack: {
    width: 50,
    height: 28,
    borderRadius: radius.pill,
    padding: 2,
  },
  switchThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  switchOn: {
    transform: [{ translateX: 22 }],
  },
  logout: {
    minHeight: 56,
    borderRadius: radius.xl,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    ...shadow.card,
  },
  logoutText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
});
