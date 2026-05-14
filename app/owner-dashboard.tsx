import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, CalendarDays, CreditCard, MessageSquareText, Store, Table2 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { SupabaseConnectionPanel } from '../src/components/SupabaseConnectionPanel';
import { colors } from '../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../src/constants/design';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/hooks/useTheme';

const ownerStats = [
  { label: "Tonight's Bookings", value: '8', helper: 'Live reservation feed', icon: CalendarDays },
  { label: 'Down Payments', value: 'PHP 3,500', helper: 'Pending owner review', icon: CreditCard },
  { label: 'Tables', value: '12', helper: 'Reservable inventory', icon: Table2 },
];

export default function OwnerDashboardScreen() {
  const router = useRouter();
  const { appColors } = useTheme();
  const { profile } = useAuth();

  return (
    <ScreenContainer appColors={appColors} scroll>
      <View style={styles.header}>
        <Pressable style={[styles.backButton, { backgroundColor: appColors.surfaceLow }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={appColors.onSurface} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>Store Owner</Text>
          <Text style={[styles.title, { color: appColors.onSurface }]}>Dashboard</Text>
          <Text style={[styles.subtitle, { color: appColors.onSurfaceVariant }]}>
            Test live Supabase access for owner records, reservations, and venue operations.
          </Text>
        </View>
      </View>

      <SupabaseConnectionPanel
        appColors={appColors}
        scope="owner"
        userId={profile?.id}
        title="Store Owner Supabase Connectivity"
        subtitle="Checks auth, public spots, owner-linked spots, and owner access requests."
      />

      <View style={styles.statsGrid}>
        {ownerStats.map((item) => {
          const Icon = item.icon;
          return (
            <View key={item.label} style={[styles.statCard, { backgroundColor: appColors.surfaceLow }]}>
              <View style={styles.statIcon}>
                <Icon size={20} color={colors.primary} />
              </View>
              <Text style={[styles.statValue, { color: appColors.onSurface }]}>{item.value}</Text>
              <Text style={[styles.statLabel, { color: appColors.onSurfaceVariant }]}>{item.label}</Text>
              <Text style={[styles.statHelper, { color: appColors.onSurfaceVariant }]}>{item.helper}</Text>
            </View>
          );
        })}
      </View>

      <View style={[styles.panel, { backgroundColor: appColors.surfaceLow }]}>
        <View style={styles.panelIcon}>
          <Store size={21} color={colors.white} />
        </View>
        <View style={styles.panelCopy}>
          <Text style={[styles.panelTitle, { color: appColors.onSurface }]}>Owner Portal Readiness</Text>
          <Text style={[styles.panelText, { color: appColors.onSurfaceVariant }]}>
            Use this dashboard to confirm Supabase is reachable before enabling owner workflows. Request access if this
            account still has no owned spots.
          </Text>
        </View>
        <Pressable style={styles.requestButton} onPress={() => router.push('/owner-access')}>
          <MessageSquareText size={16} color={colors.white} />
          <Text style={styles.requestText}>Request Access</Text>
        </Pressable>
      </View>

      <View style={[styles.tablePanel, { backgroundColor: appColors.surfaceLow }]}>
        <View style={styles.tableHeader}>
          <Text style={[styles.panelTitle, { color: appColors.onSurface }]}>Reservation Feed Preview</Text>
          <Text style={styles.liveText}>Live ready</Text>
        </View>
        {[
          ['JD', 'Juan Dela Cruz', 'Table T-04', 'Confirmed'],
          ['AL', 'Aly Lim', 'VIP Table V-01', 'Pending'],
          ['RT', 'Rico Tan', 'Table T-12', 'Rescheduled'],
        ].map((row) => (
          <View key={row[1]} style={[styles.tableRow, { borderColor: appColors.outlineVariant + '55' }]}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{row[0]}</Text>
            </View>
            <View style={styles.rowCopy}>
              <Text style={[styles.rowName, { color: appColors.onSurface }]}>{row[1]}</Text>
              <Text style={[styles.rowMeta, { color: appColors.onSurfaceVariant }]}>{row[2]}</Text>
            </View>
            <Text style={styles.rowStatus}>{row[3]}</Text>
          </View>
        ))}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
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
  },
  kicker: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  title: {
    fontSize: fontSize.display,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    lineHeight: 19,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  statCard: {
    flexGrow: 1,
    flexBasis: 190,
    minHeight: 154,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.card,
  },
  statIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    backgroundColor: colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 26,
    fontWeight: '900',
  },
  statLabel: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  statHelper: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  panel: {
    marginTop: spacing.xl,
    borderRadius: radius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    ...shadow.card,
  },
  panelIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelCopy: {
    flex: 1,
    minWidth: 0,
  },
  panelTitle: {
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  panelText: {
    marginTop: 3,
    fontSize: fontSize.xs,
    lineHeight: 18,
    fontWeight: '700',
  },
  requestButton: {
    minHeight: 42,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  requestText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  tablePanel: {
    marginTop: spacing.xl,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  liveText: {
    color: colors.success,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  tableRow: {
    borderTopWidth: 1,
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.primary + '16',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  rowMeta: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  rowStatus: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
});
