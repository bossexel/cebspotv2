import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Award,
  BadgeCheck,
  Bell,
  Bookmark,
  Calendar,
  ChevronRight,
  LogOut,
  MapPin,
  Moon,
  Plus,
  Settings,
  ShieldCheck,
  Star,
  Store,
  Sun,
} from 'lucide-react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { colors } from '../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../src/constants/design';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/hooks/useTheme';
import { gamificationService } from '../src/services/gamificationService';
import { reservationService } from '../src/services/reservationService';
import { savedSpotService } from '../src/services/savedSpotService';
import type { GamificationSummary } from '../src/types';

function formatActivityType(activityType: string) {
  return activityType
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default function ProfileScreen() {
  const router = useRouter();
  const { appColors, isDarkMode, toggleDarkMode } = useTheme();
  const { profile, logOut } = useAuth();
  const [reservationCount, setReservationCount] = useState(0);
  const [savedSpotCount, setSavedSpotCount] = useState(0);
  const [gamificationSummary, setGamificationSummary] = useState<GamificationSummary | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  useFocusEffect(
    React.useCallback(() => {
      let mounted = true;

      savedSpotService
        .getSavedSpotIds()
        .then((ids) => {
          if (mounted) setSavedSpotCount(ids.length);
        })
        .catch((error) => {
          console.error('Unable to load saved spot count:', error);
          if (mounted) setSavedSpotCount(0);
        });

      if (profile?.id) {
        gamificationService
          .getSummary(profile.id)
          .then((summary) => {
            if (mounted) setGamificationSummary(summary);
          })
          .catch((error) => {
            console.error('Unable to load gamification summary:', error);
            if (mounted) setGamificationSummary(null);
          });
      }

      return () => {
        mounted = false;
      };
    }, [profile?.id])
  );

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
  const level = gamificationSummary?.currentLevel ?? profile?.current_level ?? profile?.level ?? 1;
  const points = gamificationSummary?.totalXp ?? profile?.total_xp ?? profile?.points ?? 0;
  const nextLevelTarget = gamificationSummary?.nextLevelXp ?? Math.max(100, level * 100);
  const progressPercent = Math.min(100, Math.round((points / nextLevelTarget) * 100));
  const locationLabel = profile?.location?.address || 'Cebu City, Philippines';
  const emailLabel = profile?.email || 'No email linked';
  const unlockedAchievements = (gamificationSummary?.achievements ?? []).filter((achievement) => achievement.completed).slice(0, 3);
  const nextAchievements = (gamificationSummary?.achievements ?? []).filter((achievement) => !achievement.completed).slice(0, 2);
  const recentTransactions = gamificationSummary?.recentTransactions.slice(0, 3) ?? [];

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
                {locationLabel}
              </Text>
            </View>
            <View style={styles.level}>
              <Text style={styles.levelText}>Level {level}</Text>
            </View>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          style={[styles.settings, { backgroundColor: appColors.surfaceLow }]}
          onPress={() => setSettingsOpen(true)}
        >
          <Settings size={20} color={appColors.onSurface} />
        </Pressable>
      </View>

      <View style={[styles.milestone, { backgroundColor: appColors.surfaceLow }]}>
        <View style={styles.milestoneTop}>
          <View>
            <Text style={[styles.cardTitle, { color: appColors.onSurface }]}>Milestone</Text>
            <Text style={[styles.cardSub, { color: appColors.onSurfaceVariant }]}>
              {points} of {nextLevelTarget} points toward Level {level + 1}
            </Text>
          </View>
          <Text style={styles.percent}>{progressPercent}%</Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: appColors.surfaceHighest }]}>
          <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
        </View>
      </View>

      <View style={styles.statsGrid}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open CebSpot rewards"
          style={({ pressed }) => [
            styles.statCard,
            { backgroundColor: appColors.surfaceLow },
            pressed && styles.pressed,
          ]}
          onPress={() => router.push('/gamification')}
        >
          <View style={styles.statIcon}>
            <Star size={20} color={colors.primary} fill={colors.primary} />
          </View>
          <Text style={[styles.statValue, { color: appColors.onSurface }]}>{points}</Text>
          <Text style={[styles.statLabel, { color: appColors.onSurfaceVariant }]}>Spot Points</Text>
          <Text style={[styles.statHint, { color: appColors.onSurfaceVariant }]}>Earned from helpful activity</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.statCard, styles.orangeCard, pressed && styles.pressed]}
          onPress={() => router.push('/reservations')}
        >
          <View style={styles.statIconLight}>
            <Calendar size={20} color={colors.white} />
          </View>
          <Text style={[styles.statValue, { color: colors.white }]}>{reservationCount}</Text>
          <Text style={[styles.statLabel, { color: colors.white }]}>Reservations</Text>
          <Text style={[styles.statHint, { color: colors.white }]}>Bookings you made</Text>
        </Pressable>
      </View>

      {(unlockedAchievements.length > 0 || nextAchievements.length > 0) && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>Badges</Text>
          <View style={styles.badgeGrid}>
            {[...unlockedAchievements, ...nextAchievements].slice(0, 4).map((achievement) => {
              const progressPercent = Math.min(
                100,
                Math.round((achievement.progress / Math.max(achievement.requirementValue, 1)) * 100)
              );
              return (
                <View
                  key={achievement.code}
                  style={[
                    styles.badgeCard,
                    { backgroundColor: appColors.surfaceLow },
                    achievement.completed && styles.badgeCardUnlocked,
                  ]}
                >
                  <View style={styles.badgeIcon}>
                    <BadgeCheck
                      size={19}
                      color={achievement.completed ? colors.white : colors.primary}
                      fill={achievement.completed ? colors.primary : 'transparent'}
                    />
                  </View>
                  <Text style={[styles.badgeName, { color: appColors.onSurface }]} numberOfLines={1}>
                    {achievement.name}
                  </Text>
                  <Text style={[styles.badgeProgress, { color: appColors.onSurfaceVariant }]}>
                    {achievement.completed ? 'Unlocked' : `${progressPercent}%`}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {recentTransactions.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>Recent XP</Text>
          <View style={[styles.accountCard, { backgroundColor: appColors.surfaceLow }]}>
            {recentTransactions.map((transaction, index) => (
              <View key={transaction.id}>
                <View style={styles.accountRow}>
                  <View style={styles.settingIcon}>
                    <Star size={18} color={colors.primary} fill={colors.primary} />
                  </View>
                  <View style={styles.listCopy}>
                    <Text style={[styles.listTitle, { color: appColors.onSurface }]}>
                      {formatActivityType(transaction.activity_type)}
                    </Text>
                    <Text style={[styles.listSub, { color: appColors.onSurfaceVariant }]}>
                      {new Date(transaction.created_at).toLocaleDateString('en-PH', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>
                  <Text style={[styles.transactionPoints, transaction.points < 0 && styles.negativePoints]}>
                    {transaction.points > 0 ? '+' : ''}{transaction.points} XP
                  </Text>
                </View>
                {index < recentTransactions.length - 1 && (
                  <View style={[styles.accountDivider, { backgroundColor: appColors.outlineVariant }]} />
                )}
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>Account</Text>
        <View style={[styles.accountCard, { backgroundColor: appColors.surfaceLow }]}>
          <View style={styles.accountRow}>
            <View style={styles.settingIcon}>
              <ShieldCheck size={20} color={colors.primary} />
            </View>
            <View style={styles.listCopy}>
              <Text style={[styles.listTitle, { color: appColors.onSurface }]}>Signed in as</Text>
              <Text style={[styles.listSub, { color: appColors.onSurfaceVariant }]}>{emailLabel}</Text>
            </View>
          </View>
          <View style={[styles.accountDivider, { backgroundColor: appColors.outlineVariant }]} />
          <View style={styles.accountRow}>
            <View style={styles.settingIcon}>
              <MapPin size={20} color={colors.primary} />
            </View>
            <View style={styles.listCopy}>
              <Text style={[styles.listTitle, { color: appColors.onSurface }]}>Home base</Text>
              <Text style={[styles.listSub, { color: appColors.onSurfaceVariant }]}>{locationLabel}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>Quick Actions</Text>
        <Pressable
          style={({ pressed }) => [styles.listItem, { backgroundColor: appColors.surfaceLow }, pressed && styles.pressed]}
          onPress={() => router.push('/gamification')}
        >
          <View style={styles.settingIcon}>
            <Award size={20} color={colors.primary} />
          </View>
          <View style={styles.listCopy}>
            <Text style={[styles.listTitle, { color: appColors.onSurface }]}>CebSpot Rewards</Text>
            <Text style={[styles.listSub, { color: appColors.onSurfaceVariant }]}>View XP, badges, history, and rank</Text>
          </View>
          <ChevronRight size={20} color={appColors.onSurfaceVariant} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.listItem, { backgroundColor: appColors.surfaceLow }, pressed && styles.pressed]}
          onPress={() => router.push('/saved')}
        >
          <View style={styles.settingIcon}>
            <Bookmark size={20} color={colors.primary} fill={savedSpotCount ? colors.primary : 'transparent'} />
          </View>
          <View style={styles.listCopy}>
            <Text style={[styles.listTitle, { color: appColors.onSurface }]}>Saved Spots</Text>
            <Text style={[styles.listSub, { color: appColors.onSurfaceVariant }]}>
              {savedSpotCount ? `${savedSpotCount} spot${savedSpotCount === 1 ? '' : 's'} saved for later` : 'Bookmark spots to find them here'}
            </Text>
          </View>
          <ChevronRight size={20} color={appColors.onSurfaceVariant} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.listItem, { backgroundColor: appColors.surfaceLow }, pressed && styles.pressed]}
          onPress={() => router.push('/submit-spot')}
        >
          <View style={styles.settingIcon}>
            <Plus size={20} color={colors.primary} />
          </View>
          <View style={styles.listCopy}>
            <Text style={[styles.listTitle, { color: appColors.onSurface }]}>Share a Spot</Text>
            <Text style={[styles.listSub, { color: appColors.onSurfaceVariant }]}>Post a hidden gem for the community</Text>
          </View>
          <ChevronRight size={20} color={appColors.onSurfaceVariant} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.listItem, { backgroundColor: appColors.surfaceLow }, pressed && styles.pressed]}
          onPress={() => router.push('/activity')}
        >
          <View style={styles.settingIcon}>
            <Bell size={20} color={colors.primary} />
          </View>
          <View style={styles.listCopy}>
            <Text style={[styles.listTitle, { color: appColors.onSurface }]}>Activity</Text>
            <Text style={[styles.listSub, { color: appColors.onSurfaceVariant }]}>Check posts, comments, and alerts</Text>
          </View>
          <ChevronRight size={20} color={appColors.onSurfaceVariant} />
        </Pressable>
      </View>

      <Pressable style={styles.logout} onPress={logout}>
        <LogOut size={20} color={colors.white} />
        <Text style={styles.logoutText}>Logout</Text>
      </Pressable>

      <Modal visible={settingsOpen} transparent animationType="fade" onRequestClose={() => setSettingsOpen(false)}>
        <Pressable style={styles.modalScrim} onPress={() => setSettingsOpen(false)}>
          <Pressable
            style={[styles.settingsSheet, { backgroundColor: appColors.surface }]}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>Settings</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close settings"
                style={[styles.sheetClose, { backgroundColor: appColors.surfaceLow }]}
                onPress={() => setSettingsOpen(false)}
              >
                <Text style={[styles.sheetCloseText, { color: appColors.onSurface }]}>×</Text>
              </Pressable>
            </View>
            <Pressable
              style={[styles.listItem, { backgroundColor: appColors.surfaceLow }]}
              onPress={() => {
                setSettingsOpen(false);
                router.push('/owner-dashboard');
              }}
            >
              <View style={styles.settingIcon}>
                <Store size={20} color={colors.primary} />
              </View>
              <View style={styles.listCopy}>
                <Text style={[styles.listTitle, { color: appColors.onSurface }]}>Store Owner Dashboard</Text>
                <Text style={[styles.listSub, { color: appColors.onSurfaceVariant }]}>Test live Supabase owner tools</Text>
              </View>
              <ChevronRight size={20} color={appColors.onSurfaceVariant} />
            </Pressable>
            <Pressable
              style={[styles.listItem, { backgroundColor: appColors.surfaceLow }]}
              onPress={() => {
                setSettingsOpen(false);
                router.push('/owner-access');
              }}
            >
              <View style={styles.settingIcon}>
                <Store size={20} color={colors.primary} />
              </View>
              <View style={styles.listCopy}>
                <Text style={[styles.listTitle, { color: appColors.onSurface }]}>Spot Owner Access</Text>
                <Text style={[styles.listSub, { color: appColors.onSurfaceVariant }]}>Contact CebSpot for reservation tools</Text>
              </View>
              <ChevronRight size={20} color={appColors.onSurfaceVariant} />
            </Pressable>
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
          </Pressable>
        </Pressable>
      </Modal>
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
  modalScrim: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.black + '66',
  },
  settingsSheet: {
    gap: spacing.md,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    ...shadow.card,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseText: {
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 26,
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
  },
  progressTrack: {
    height: 14,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
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
  statHint: {
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 13,
    opacity: 0.72,
  },
  section: {
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  badgeCard: {
    width: '47%',
    minHeight: 112,
    borderRadius: radius.xl,
    padding: spacing.md,
    justifyContent: 'space-between',
    ...shadow.card,
  },
  badgeCardUnlocked: {
    borderWidth: 1,
    borderColor: colors.primary + '44',
  },
  badgeIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '12',
  },
  badgeName: {
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  badgeProgress: {
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  accountCard: {
    borderRadius: radius.xxl,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.card,
  },
  accountRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  accountDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 58,
  },
  listItem: {
    minHeight: 72,
    borderRadius: radius.xl,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  listCopy: {
    flex: 1,
    minWidth: 0,
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
  transactionPoints: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  negativePoints: {
    color: colors.danger,
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
  pressed: {
    transform: [{ scale: 0.98 }],
  },
});
