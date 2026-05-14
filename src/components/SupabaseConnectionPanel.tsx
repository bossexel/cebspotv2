import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, RefreshCw, Wifi, XCircle } from 'lucide-react-native';
import { colors, type AppColors } from '../constants/colors';
import { fontSize, radius, shadow, spacing } from '../constants/design';
import {
  checkSupabaseHealth,
  type SupabaseHealthResult,
  type SupabaseHealthScope,
} from '../services/supabaseHealthService';

interface SupabaseConnectionPanelProps {
  appColors?: AppColors;
  scope: SupabaseHealthScope;
  userId?: string;
  title?: string;
  subtitle?: string;
}

function formatTime(value?: string) {
  if (!value) return 'Not checked yet';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function SupabaseConnectionPanel({
  appColors = colors,
  scope,
  userId,
  title = 'Live Supabase Check',
  subtitle = 'Reads real tables using the configured project URL and anon key.',
}: SupabaseConnectionPanelProps) {
  const [result, setResult] = useState<SupabaseHealthResult | null>(null);
  const [loading, setLoading] = useState(true);

  const runCheck = useCallback(async () => {
    try {
      setLoading(true);
      setResult(await checkSupabaseHealth(scope, userId));
    } catch (error: any) {
      setResult({
        connected: false,
        checkedAt: new Date().toISOString(),
        latencyMs: 0,
        signedIn: false,
        checks: [
          {
            label: 'Supabase request',
            status: 'error',
            count: null,
            detail: error?.message ?? 'Unable to reach Supabase.',
          },
        ],
        message: 'Supabase check could not complete.',
      });
    } finally {
      setLoading(false);
    }
  }, [scope, userId]);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  const connected = result?.connected;
  const statusColor = connected ? colors.success : colors.danger;

  return (
    <View style={[styles.panel, { backgroundColor: appColors.white }]}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: statusColor + '18' }]}>
          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : connected ? (
            <CheckCircle2 size={22} color={colors.success} />
          ) : (
            <XCircle size={22} color={colors.danger} />
          )}
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: appColors.onSurface }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: appColors.onSurfaceVariant }]}>{subtitle}</Text>
        </View>
        <Pressable style={[styles.refreshButton, { borderColor: appColors.outlineVariant }]} onPress={runCheck}>
          <RefreshCw size={16} color={appColors.onSurface} />
        </Pressable>
      </View>

      <View style={[styles.statusBar, { backgroundColor: statusColor + '12' }]}>
        <Wifi size={16} color={statusColor} />
        <Text style={[styles.statusText, { color: statusColor }]}>
          {loading ? 'Checking live connection...' : result?.message ?? 'Waiting for check'}
        </Text>
      </View>

      <View style={styles.metaRow}>
        <MetaPill label="Scope" value={scope === 'admin' ? 'Admin' : 'Store Owner'} appColors={appColors} />
        <MetaPill label="Session" value={result?.signedIn ? 'Signed in' : 'Anon'} appColors={appColors} />
        <MetaPill label="Latency" value={result ? `${result.latencyMs} ms` : '-'} appColors={appColors} />
        <MetaPill label="Checked" value={formatTime(result?.checkedAt)} appColors={appColors} />
      </View>

      <View style={styles.checkList}>
        {(result?.checks ?? []).map((check) => (
          <View key={check.label} style={[styles.checkRow, { borderColor: appColors.outlineVariant + '66' }]}>
            {check.status === 'ok' ? (
              <CheckCircle2 size={16} color={colors.success} />
            ) : (
              <XCircle size={16} color={colors.danger} />
            )}
            <View style={styles.checkCopy}>
              <Text style={[styles.checkLabel, { color: appColors.onSurface }]}>{check.label}</Text>
              <Text style={[styles.checkDetail, { color: appColors.onSurfaceVariant }]} numberOfLines={2}>
                {check.detail}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function MetaPill({ label, value, appColors }: { label: string; value: string; appColors: AppColors }) {
  return (
    <View style={[styles.metaPill, { backgroundColor: appColors.surfaceLow }]}>
      <Text style={[styles.metaLabel, { color: appColors.onSurfaceVariant }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: appColors.onSurface }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: fontSize.xs,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: 2,
  },
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBar: {
    minHeight: 42,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusText: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metaPill: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 112,
  },
  metaLabel: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  metaValue: {
    fontSize: fontSize.sm,
    fontWeight: '900',
    marginTop: 2,
  },
  checkList: {
    gap: spacing.sm,
  },
  checkRow: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkCopy: {
    flex: 1,
    minWidth: 0,
  },
  checkLabel: {
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  checkDetail: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: 2,
  },
});
