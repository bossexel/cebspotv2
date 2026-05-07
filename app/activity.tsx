import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell, Calendar, CheckCircle2, MapPin, Plus, Trash2, Users } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { colors } from '../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../src/constants/design';
import { sampleActivities } from '../src/constants/sampleData';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/hooks/useTheme';
import { activityService } from '../src/services/activityService';
import { reservationService } from '../src/services/reservationService';
import type { Activity, Reservation } from '../src/types';

export default function ActivityScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { appColors } = useTheme();
  const [activities, setActivities] = useState<Activity[]>(sampleActivities);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeActivities: (() => void) | undefined;
    let unsubscribeReservations: (() => void) | undefined;

    async function load() {
      try {
        setActivities(await activityService.getRecentActivities());
        if (profile?.id) {
          setReservations(await reservationService.getUserReservations(profile.id));
          unsubscribeReservations = reservationService.subscribeToUserReservations(profile.id, setReservations);
        }
        unsubscribeActivities = activityService.subscribeToActivities(setActivities);
      } catch (error) {
        console.error('Unable to load activity:', error);
        setActivities(sampleActivities);
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => {
      unsubscribeActivities?.();
      unsubscribeReservations?.();
    };
  }, [profile?.id]);

  return (
    <ScreenContainer appColors={appColors} showBottomNav scroll>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: appColors.onSurface }]}>Activity</Text>
          <Text style={[styles.subtitle, { color: appColors.onSurfaceVariant }]}>Your urban pulse updates</Text>
        </View>
        <Pressable style={styles.clearButton}>
          <Trash2 size={16} color={appColors.onSurfaceVariant} />
        </Pressable>
      </View>

      {!!reservations[0] && (
        <View style={[styles.upcomingCard, { backgroundColor: appColors.white }]}>
          <View style={styles.upcomingAccent} />
          <Text style={styles.kicker}>Upcoming</Text>
          <Text style={[styles.upcomingTitle, { color: appColors.onSurface }]}>{reservations[0].spot_name}</Text>
          <View style={styles.upcomingMeta}>
            <Calendar size={13} color={colors.primary} />
            <Text style={[styles.metaText, { color: appColors.onSurfaceVariant }]}>
              {reservations[0].reservation_date}, {reservations[0].reservation_time}
            </Text>
            <Users size={13} color={colors.primary} />
            <Text style={[styles.metaText, { color: appColors.onSurfaceVariant }]}>
              {reservations[0].guests}
            </Text>
          </View>
          <Pressable style={styles.viewButton} onPress={() => router.push(`/confirmed/${reservations[0].id}`)}>
            <Text style={styles.viewText}>View Pass</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>Pulse Feed</Text>
        <View style={styles.liveDot} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} size="large" style={styles.loader} />
      ) : (
        <View style={styles.feed}>
          {activities.map((item) => (
            <View key={item.id} style={[styles.activityCard, { backgroundColor: appColors.surfaceLow }]}>
              <View style={styles.activityIcon}>
                {item.type === 'reservation' ? (
                  <Calendar size={18} color={colors.primary} />
                ) : item.type === 'submission' ? (
                  <CheckCircle2 size={18} color={colors.primary} />
                ) : (
                  <MapPin size={18} color={colors.primary} />
                )}
              </View>
              <View style={styles.activityBody}>
                <View style={styles.activityTop}>
                  <Text style={[styles.activityName, { color: appColors.onSurface }]}>{item.user_name}</Text>
                  <Text style={[styles.time, { color: appColors.onSurfaceVariant }]}>
                    {new Date(item.created_at).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={[styles.activityCopy, { color: appColors.onSurfaceVariant }]}>
                  {item.action ?? 'shared'} <Text style={styles.strong}>{item.target_name ?? item.spot_name}</Text>
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <Pressable style={styles.submitCard} onPress={() => router.push('/submit-spot')}>
        <View style={styles.submitIcon}>
          <Plus size={22} color={colors.white} />
        </View>
        <Text style={styles.submitTitle}>Found a New Location?</Text>
        <Text style={styles.submitCopy}>Earn pulse points by sharing it with the network.</Text>
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
  upcomingCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    overflow: 'hidden',
    ...shadow.card,
  },
  upcomingAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: colors.primary,
  },
  kicker: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  upcomingTitle: {
    fontSize: fontSize.xl,
    fontWeight: '900',
    marginTop: spacing.xs,
  },
  upcomingMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  metaText: {
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  viewButton: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  viewText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
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
  activityCard: {
    borderRadius: radius.xl,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.md,
  },
  activityIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '12',
  },
  activityBody: {
    flex: 1,
  },
  activityTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  activityName: {
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  time: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  activityCopy: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    lineHeight: 19,
    fontWeight: '600',
  },
  strong: {
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
