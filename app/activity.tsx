import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowUpCircle, Bell, MapPin, MessageCircle, MoreVertical, Plus, Trash2, User } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { colors } from '../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../src/constants/design';
import { useTheme } from '../src/hooks/useTheme';
import { localUpdateService } from '../src/services/localUpdateService';
import type { LocalUpdate } from '../src/types';

function formatUpdateTime(createdAt: string) {
  const elapsedMs = Date.now() - new Date(createdAt).getTime();
  const elapsedMinutes = Math.max(0, Math.floor(elapsedMs / 60000));
  if (elapsedMinutes < 1) return 'Just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  return `${Math.floor(elapsedHours / 24)}d ago`;
}

export default function ActivityScreen() {
  const router = useRouter();
  const { appColors } = useTheme();
  const [localUpdates, setLocalUpdates] = useState<LocalUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    async function loadLocalUpdates() {
      try {
        const updates = await localUpdateService.getLocalUpdates();
        setLocalUpdates(updates);
        unsubscribe = localUpdateService.subscribeToLocalUpdates(setLocalUpdates);
      } finally {
        setLoading(false);
      }
    }

    loadLocalUpdates();
    return () => unsubscribe?.();
  }, []);

  return (
    <ScreenContainer appColors={appColors} showBottomNav scroll>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: appColors.onSurface }]}>Activity</Text>
          <Text style={[styles.subtitle, { color: appColors.onSurfaceVariant }]}>Notifications and local updates</Text>
        </View>
        <Pressable style={styles.clearButton}>
          <Trash2 size={16} color={appColors.onSurfaceVariant} />
        </Pressable>
      </View>

      <View style={[styles.noticeCard, { backgroundColor: appColors.surfaceLow }]}>
        <View style={styles.noticeIcon}>
          <Bell size={20} color={colors.primary} />
        </View>
        <View style={styles.noticeCopy}>
          <Text style={[styles.noticeTitle, { color: appColors.onSurface }]}>Notifications</Text>
          <Text style={[styles.noticeText, { color: appColors.onSurfaceVariant }]}>
            Reservation updates now live in your Reservations screen. This space is for alerts, circle activity, and spot updates.
          </Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>Local Updates</Text>
        <View style={styles.liveDot} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} size="large" style={styles.loader} />
      ) : (
        <View style={styles.feed}>
          {localUpdates.map((item) => (
            <View key={item.id} style={[styles.updateCard, { backgroundColor: appColors.surfaceLow }]}>
              <View style={styles.updateHeader}>
                {item.user_photo_url ? (
                  <Image source={{ uri: item.user_photo_url }} style={styles.avatarImage} />
                ) : (
                  <View style={[styles.avatarFallback, { backgroundColor: appColors.surfaceHighest }]}>
                    <User size={20} color={appColors.onSurfaceVariant} />
                  </View>
                )}
                <View style={styles.authorBlock}>
                  <Text style={[styles.authorName, { color: appColors.onSurface }]} numberOfLines={1}>
                    {item.user_name}
                  </Text>
                  <Text style={[styles.updateTime, { color: appColors.onSurfaceVariant }]}>
                    {formatUpdateTime(item.created_at)}
                  </Text>
                </View>
                <Pressable style={styles.moreButton}>
                  <MoreVertical size={18} color={appColors.onSurfaceVariant} />
                </Pressable>
              </View>

              <View style={styles.updateCopy}>
                <Text style={styles.updateTitle}>{item.title}</Text>
                <Text style={[styles.updateBody, { color: appColors.onSurfaceVariant }]}>{item.body}</Text>
                <View style={styles.locationRow}>
                  <MapPin size={15} color={appColors.onSurfaceVariant} fill={appColors.onSurfaceVariant} />
                  <Text style={[styles.locationText, { color: appColors.onSurfaceVariant }]}>{item.location_name}</Text>
                </View>
              </View>

              {item.image_url && <Image source={{ uri: item.image_url }} style={styles.updateImage} />}

              <View style={styles.updateActions}>
                <Pressable style={styles.urgencyButton}>
                  <ArrowUpCircle size={25} color={colors.primary} fill={colors.primary} />
                  <Text style={[styles.actionText, { color: appColors.onSurface }]}>+{item.spot_count} Spot</Text>
                </Pressable>
                <View style={styles.actionSpacer} />
                <Pressable style={styles.discussButton}>
                  <MessageCircle size={22} color={appColors.onSurfaceVariant} />
                  <Text style={[styles.actionText, { color: appColors.onSurfaceVariant }]}>
                    {item.comments_count} Comments
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      <Pressable style={styles.submitCard} onPress={() => router.push('/submit-spot')}>
        <View style={styles.submitIcon}>
          <Plus size={22} color={colors.white} />
        </View>
        <Text style={styles.submitTitle}>Found a New Spot?</Text>
        <Text style={styles.submitCopy}>Earn spot points by sharing it with the network.</Text>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: fontSize.display,
    fontWeight: '900',
    fontStyle: 'italic',
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  clearButton: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeCard: {
    borderRadius: radius.xl,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
    ...shadow.card,
  },
  noticeIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '12',
  },
  noticeCopy: {
    flex: 1,
  },
  noticeTitle: {
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  noticeText: {
    marginTop: 3,
    fontSize: fontSize.xs,
    lineHeight: 17,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  loader: {
    marginVertical: spacing.xxl,
  },
  feed: {
    gap: spacing.md,
  },
  updateCard: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadow.card,
  },
  updateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  avatarImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorBlock: {
    flex: 1,
    minWidth: 0,
  },
  authorName: {
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  updateTime: {
    marginTop: 2,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  moreButton: {
    width: 28,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateCopy: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  updateTitle: {
    color: colors.success,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  updateBody: {
    marginTop: spacing.xs,
    fontSize: fontSize.md,
    lineHeight: 22,
    fontWeight: '800',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  locationText: {
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  updateImage: {
    width: '100%',
    height: 250,
  },
  updateActions: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.black + '10',
  },
  urgencyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionSpacer: {
    flex: 1,
  },
  discussButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionText: {
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  submitCard: {
    marginTop: spacing.xl,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    backgroundColor: colors.primary,
    ...shadow.card,
  },
  submitIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white + '24',
    marginBottom: spacing.md,
  },
  submitTitle: {
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: '900',
    fontStyle: 'italic',
    textTransform: 'uppercase',
  },
  submitCopy: {
    color: colors.white,
    opacity: 0.78,
    fontSize: fontSize.xs,
    fontWeight: '800',
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
