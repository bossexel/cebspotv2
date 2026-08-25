import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, Award, BadgeCheck, History, Medal, Star, Trophy } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { colors } from '../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../src/constants/design';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/hooks/useTheme';
import { gamificationService } from '../src/services/gamificationService';
import type { GamificationLeaderboard, GamificationSummary, PointTransaction } from '../src/types';

function formatActivityType(activityType: string) {
  return activityType
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function GamificationScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { appColors } = useTheme();
  const [summary, setSummary] = useState<GamificationSummary | null>(null);
  const [leaderboard, setLeaderboard] = useState<GamificationLeaderboard>({ leaders: [], myRank: null });
  const [loading, setLoading] = useState(true);

  async function loadGamification() {
    try {
      setLoading(true);
      const [nextSummary, nextLeaderboard] = await Promise.all([
        gamificationService.getSummary(profile?.id),
        gamificationService.getLeaderboard(20),
      ]);
      setSummary(nextSummary);
      setLeaderboard(nextLeaderboard);
    } catch (error) {
      console.error('Unable to load gamification:', error);
      setSummary(null);
      setLeaderboard({ leaders: [], myRank: null });
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      void loadGamification();
    }, [profile?.id])
  );

  const totalXp = summary?.totalXp ?? profile?.total_xp ?? profile?.points ?? 0;
  const currentLevel = summary?.currentLevel ?? profile?.current_level ?? profile?.level ?? 1;
  const nextLevelXp = summary?.nextLevelXp ?? Math.max(100, currentLevel * 100);
  const progressPercent = Math.min(100, Math.round((totalXp / Math.max(nextLevelXp, 1)) * 100));
  const achievements = summary?.achievements ?? [];
  const unlockedCount = achievements.filter((achievement) => achievement.completed).length;
  const transactions = summary?.recentTransactions ?? [];

  return (
    <ScreenContainer appColors={appColors} showBottomNav scroll>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={[styles.backButton, { backgroundColor: appColors.surfaceLow }]}
          onPress={() => router.back()}
        >
          <ArrowLeft size={20} color={appColors.onSurface} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: appColors.onSurface }]}>CebSpot Rewards</Text>
          <Text style={[styles.subtitle, { color: appColors.onSurfaceVariant }]}>
            Track XP, badges, and contribution rank
          </Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} size="large" style={styles.loader} />
      ) : (
        <>
          <View style={[styles.heroCard, { backgroundColor: appColors.surfaceLow }]}>
            <View style={styles.heroTop}>
              <View style={styles.heroIcon}>
                <Trophy size={26} color={colors.white} fill={colors.white} />
              </View>
              <View style={styles.heroCopy}>
                <Text style={[styles.heroLabel, { color: appColors.onSurfaceVariant }]}>Current Level</Text>
                <Text style={[styles.heroValue, { color: appColors.onSurface }]}>Level {currentLevel}</Text>
              </View>
              <Text style={styles.xpValue}>{totalXp.toLocaleString('en-PH')} XP</Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: appColors.surfaceHighest }]}>
              <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
            </View>
            <Text style={[styles.progressText, { color: appColors.onSurfaceVariant }]}>
              {totalXp.toLocaleString('en-PH')} of {nextLevelXp.toLocaleString('en-PH')} XP toward Level {currentLevel + 1}
            </Text>
          </View>

          <View style={styles.statGrid}>
            <View style={[styles.statCard, { backgroundColor: appColors.surfaceLow }]}>
              <BadgeCheck size={20} color={colors.primary} />
              <Text style={[styles.statValue, { color: appColors.onSurface }]}>{unlockedCount}</Text>
              <Text style={[styles.statLabel, { color: appColors.onSurfaceVariant }]}>Badges</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: appColors.surfaceLow }]}>
              <History size={20} color={colors.primary} />
              <Text style={[styles.statValue, { color: appColors.onSurface }]}>{transactions.length}</Text>
              <Text style={[styles.statLabel, { color: appColors.onSurfaceVariant }]}>Recent Logs</Text>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>Leaderboard</Text>
              {leaderboard.myRank && (
                <Text style={styles.sectionAction}>Rank #{leaderboard.myRank.rank}</Text>
              )}
            </View>
            {leaderboard.leaders.length ? (
              <View style={[styles.listCard, { backgroundColor: appColors.surfaceLow }]}>
                {leaderboard.leaders.map((leader, index) => (
                  <View key={leader.userId}>
                    <View style={styles.leaderRow}>
                      <View style={[styles.rankBadge, leader.rank <= 3 && styles.rankBadgeTop]}>
                        <Text style={[styles.rankText, leader.rank <= 3 && styles.rankTextTop]}>{leader.rank}</Text>
                      </View>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{leader.avatar}</Text>
                      </View>
                      <View style={styles.rowCopy}>
                        <Text style={[styles.rowTitle, { color: appColors.onSurface }]} numberOfLines={1}>
                          {leader.displayName}
                        </Text>
                        <Text style={[styles.rowSub, { color: appColors.onSurfaceVariant }]}>
                          Level {leader.currentLevel} • {leader.achievementsUnlocked} badges
                        </Text>
                      </View>
                      <Text style={styles.rowPoints}>{leader.totalXp.toLocaleString('en-PH')} XP</Text>
                    </View>
                    {index < leaderboard.leaders.length - 1 && (
                      <View style={[styles.divider, { backgroundColor: appColors.outlineVariant }]} />
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <EmptyCard
                icon={<Medal size={24} color={colors.primary} />}
                title="No rankings yet"
                copy="Earn XP from reviews, visits, reports, reservations, and approved spot contributions."
                appColors={appColors}
              />
            )}
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>Badges</Text>
            {achievements.length ? (
              <View style={styles.badgeGrid}>
                {achievements.map((achievement) => {
                  const badgeProgress = Math.min(
                    100,
                    Math.round((achievement.progress / Math.max(achievement.requirementValue, 1)) * 100)
                  );
                  return (
                    <View
                      key={achievement.code}
                      style={[
                        styles.badgeCard,
                        { backgroundColor: appColors.surfaceLow, borderColor: appColors.outlineVariant + '55' },
                        achievement.completed && styles.badgeCardUnlocked,
                      ]}
                    >
                      <View style={styles.badgeTop}>
                        <View style={[styles.badgeIcon, achievement.completed && styles.badgeIconUnlocked]}>
                          <Award
                            size={19}
                            color={achievement.completed ? colors.white : colors.primary}
                            fill={achievement.completed ? colors.primary : 'transparent'}
                          />
                        </View>
                        <Text style={[styles.badgePercent, { color: achievement.completed ? colors.primary : appColors.onSurfaceVariant }]}>
                          {achievement.completed ? 'Done' : `${badgeProgress}%`}
                        </Text>
                      </View>
                      <Text style={[styles.badgeName, { color: appColors.onSurface }]} numberOfLines={1}>
                        {achievement.name}
                      </Text>
                      <Text style={[styles.badgeDescription, { color: appColors.onSurfaceVariant }]} numberOfLines={2}>
                        {achievement.description}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <EmptyCard
                icon={<BadgeCheck size={24} color={colors.primary} />}
                title="Badges will appear here"
                copy="Run the gamification SQL migration, then complete contribution actions to unlock badges."
                appColors={appColors}
              />
            )}
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>XP History</Text>
            {transactions.length ? (
              <View style={[styles.listCard, { backgroundColor: appColors.surfaceLow }]}>
                {transactions.map((transaction, index) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    appColors={appColors}
                    showDivider={index < transactions.length - 1}
                  />
                ))}
              </View>
            ) : (
              <EmptyCard
                icon={<Star size={24} color={colors.primary} fill={colors.primary} />}
                title="No XP yet"
                copy="Write reviews, verify visits, upload media, and complete reservations to start earning."
                appColors={appColors}
              />
            )}
          </View>
        </>
      )}
    </ScreenContainer>
  );
}

function TransactionRow({
  transaction,
  appColors,
  showDivider,
}: {
  transaction: PointTransaction;
  appColors: ReturnType<typeof useTheme>['appColors'];
  showDivider: boolean;
}) {
  return (
    <View>
      <View style={styles.transactionRow}>
        <View style={styles.transactionIcon}>
          <Star size={16} color={colors.primary} fill={colors.primary} />
        </View>
        <View style={styles.rowCopy}>
          <Text style={[styles.rowTitle, { color: appColors.onSurface }]}>{formatActivityType(transaction.activity_type)}</Text>
          <Text style={[styles.rowSub, { color: appColors.onSurfaceVariant }]}>{formatDate(transaction.created_at)}</Text>
        </View>
        <Text style={[styles.rowPoints, transaction.points < 0 && styles.negativePoints]}>
          {transaction.points > 0 ? '+' : ''}{transaction.points} XP
        </Text>
      </View>
      {showDivider && <View style={[styles.divider, { backgroundColor: appColors.outlineVariant }]} />}
    </View>
  );
}

function EmptyCard({
  icon,
  title,
  copy,
  appColors,
}: {
  icon: React.ReactNode;
  title: string;
  copy: string;
  appColors: ReturnType<typeof useTheme>['appColors'];
}) {
  return (
    <View style={[styles.emptyCard, { backgroundColor: appColors.surfaceLow }]}>
      {icon}
      <Text style={[styles.emptyTitle, { color: appColors.onSurface }]}>{title}</Text>
      <Text style={[styles.emptyCopy, { color: appColors.onSurfaceVariant }]}>{copy}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: fontSize.display,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  loader: {
    marginVertical: spacing.xxl,
  },
  heroCard: {
    borderRadius: radius.xxl,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
    ...shadow.card,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  heroLabel: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  heroValue: {
    marginTop: 2,
    fontSize: 28,
    fontWeight: '900',
  },
  xpValue: {
    color: colors.primary,
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  progressTrack: {
    height: 12,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  progressText: {
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  statGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  statCard: {
    flex: 1,
    minHeight: 112,
    borderRadius: radius.xl,
    padding: spacing.md,
    justifyContent: 'space-between',
    ...shadow.card,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '900',
  },
  statLabel: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  section: {
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  sectionAction: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  listCard: {
    borderRadius: radius.xxl,
    padding: spacing.md,
    ...shadow.card,
  },
  leaderRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rankBadge: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '12',
  },
  rankBadgeTop: {
    backgroundColor: colors.primary,
  },
  rankText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  rankTextTop: {
    color: colors.white,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
  },
  avatarText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  rowSub: {
    marginTop: 2,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  rowPoints: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  negativePoints: {
    color: colors.danger,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 48,
    opacity: 0.7,
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  badgeCard: {
    width: '47%',
    minHeight: 148,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.card,
  },
  badgeCardUnlocked: {
    borderColor: colors.primary + '55',
  },
  badgeTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  badgeIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '12',
  },
  badgeIconUnlocked: {
    backgroundColor: colors.primary,
  },
  badgePercent: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  badgeName: {
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  badgeDescription: {
    fontSize: fontSize.xs,
    lineHeight: 16,
    fontWeight: '700',
  },
  transactionRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '12',
  },
  emptyCard: {
    borderRadius: radius.xxl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadow.card,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyCopy: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
});
