import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CheckCircle2, CircleAlert, RefreshCw, Server, WifiOff } from 'lucide-react-native';
import { checkAdminSystemHealth, type AdminServiceHealthStatus, type AdminSystemHealthResult } from '../services/adminSystemHealthService';
import { adminFontFamily, adminPalette } from '../features/admin-dashboard/styles';

function statusColor(status: AdminServiceHealthStatus) {
  if (status === 'online') return adminPalette.success;
  if (status === 'degraded' || status === 'not_configured') return '#8a5600';
  return adminPalette.error;
}

function statusLabel(status: AdminServiceHealthStatus) {
  if (status === 'not_configured') return 'Not configured';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function AdminSystemHealthPanel({ client }: { client: SupabaseClient }) {
  const [result, setResult] = useState<AdminSystemHealthResult | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await checkAdminSystemHealth(client));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { void refresh(); }, [refresh]);

  const onlineCount = result?.checks.filter((check) => check.status === 'online').length ?? 0;
  return <View style={styles.panel}>
    <View style={styles.header}>
      <View style={styles.headerIcon}><Server size={21} color={adminPalette.primary} /></View>
      <View style={styles.headerCopy}>
        <Text style={styles.title}>Backend API health</Text>
        <Text style={styles.subtitle}>Live connectivity from this admin session to CebSpot services.</Text>
      </View>
      <View style={[styles.summary, { backgroundColor: result?.online ? adminPalette.successContainer : adminPalette.errorContainer + '18' }]}>
        <Text style={[styles.summaryText, { color: result?.online ? adminPalette.success : adminPalette.error }]}>
          {loading ? 'Checking' : `${onlineCount}/${result?.checks.length ?? 0} online`}
        </Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh backend API health" disabled={loading} onPress={() => void refresh()} style={styles.refresh}>
        {loading ? <ActivityIndicator size="small" color={adminPalette.primary} /> : <RefreshCw size={16} color={adminPalette.primary} />}
      </Pressable>
    </View>
    <View style={styles.grid}>
      {(result?.checks ?? []).map((check) => {
        const color = statusColor(check.status);
        return <View key={check.id} style={styles.check}>
          <View style={[styles.checkIcon, { backgroundColor: color + '14' }]}>
            {check.status === 'online' ? <CheckCircle2 size={18} color={color} /> : check.status === 'offline' ? <WifiOff size={18} color={color} /> : <CircleAlert size={18} color={color} />}
          </View>
          <View style={styles.checkCopy}>
            <View style={styles.checkTopline}>
              <Text style={styles.checkLabel}>{check.label}</Text>
              <Text style={[styles.checkStatus, { color }]}>{statusLabel(check.status)}</Text>
            </View>
            <Text style={styles.checkDetail}>{check.detail}</Text>
            <Text style={styles.checkLatency}>{check.latencyMs == null ? 'No request made' : `${check.latencyMs} ms response`}</Text>
          </View>
        </View>;
      })}
      {loading && !result && <View style={styles.loading}><ActivityIndicator color={adminPalette.primary} /><Text style={styles.loadingText}>Checking backend services…</Text></View>}
    </View>
    {!!result && <Text style={styles.checked}>Last checked {new Date(result.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  panel: { borderRadius: 16, borderWidth: 1, borderColor: adminPalette.outlineVariant + '75', backgroundColor: adminPalette.surfaceLowest, padding: 20, gap: 16 },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  headerIcon: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: adminPalette.primary + '12' },
  headerCopy: { flex: 1, minWidth: 210 },
  title: { color: adminPalette.onSurface, fontFamily: adminFontFamily, fontSize: 16, fontWeight: '900' },
  subtitle: { color: adminPalette.onSurfaceVariant, fontFamily: adminFontFamily, fontSize: 10, lineHeight: 16, fontWeight: '700', marginTop: 2 },
  summary: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  summaryText: { fontFamily: adminFontFamily, fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  refresh: { width: 38, height: 38, borderRadius: 9, borderWidth: 1, borderColor: adminPalette.primary + '44', alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  check: { flexGrow: 1, flexBasis: 280, minWidth: 230, borderRadius: 12, borderWidth: 1, borderColor: adminPalette.outlineVariant + '55', backgroundColor: adminPalette.surfaceBright, padding: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkIcon: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  checkCopy: { flex: 1, minWidth: 0 },
  checkTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  checkLabel: { flex: 1, color: adminPalette.onSurface, fontFamily: adminFontFamily, fontSize: 11, fontWeight: '900' },
  checkStatus: { fontFamily: adminFontFamily, fontSize: 8, fontWeight: '900', textTransform: 'uppercase' },
  checkDetail: { color: adminPalette.onSurfaceVariant, fontFamily: adminFontFamily, fontSize: 9, lineHeight: 14, fontWeight: '600', marginTop: 4 },
  checkLatency: { color: adminPalette.outline, fontFamily: adminFontFamily, fontSize: 8, fontWeight: '700', marginTop: 5 },
  loading: { minHeight: 100, flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadingText: { color: adminPalette.onSurfaceVariant, fontFamily: adminFontFamily, fontSize: 10, fontWeight: '700' },
  checked: { color: adminPalette.outline, fontFamily: adminFontFamily, fontSize: 8, fontWeight: '700', textAlign: 'right' },
});
