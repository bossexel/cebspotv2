import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DataPanel, DataTable, StatusBadge } from './components';
import { adminPalette, styles } from './styles';
import { approvalPageSize, getApprovalHistory, type ApprovalHistoryRow, type ApprovalSort, type ApprovalStatus } from './approvalHistory';

const statusOptions: { value: ApprovalStatus; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' },
];
const sortOptions: { value: ApprovalSort; label: string }[] = [
  { value: 'latest-approved', label: 'Latest approved' },
  { value: 'newest', label: 'Newest submitted' }, { value: 'oldest', label: 'Oldest submitted' },
];
function dateLabel(value: string | null) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString();
}

export function SpotApprovalHistory({ client, search = '', refreshKey = '' }: { client: SupabaseClient; search?: string; refreshKey?: string }) {
  const [status, setStatus] = useState<ApprovalStatus>('approved');
  const [sort, setSort] = useState<ApprovalSort>('latest-approved');
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{ key: string; rows: ApprovalHistoryRow[]; hasMore: boolean; error: string }>({ key: '', rows: [], hasMore: false, error: '' });
  const key = JSON.stringify([status, sort, offset, search, refresh, refreshKey]);
  const busy = result.key !== key;

  useEffect(() => {
    const controller = new AbortController();
    getApprovalHistory(client, { status, sort, offset, search }, controller.signal).then(
      page => { if (!controller.signal.aborted) setResult({ key, ...page, error: '' }); },
      () => { if (!controller.signal.aborted) setResult({ key, rows: [], hasMore: false, error: 'Unable to load approval history. Refresh to try again.' }); },
    );
    return () => controller.abort();
  }, [client, key, offset, search, sort, status]);

  return <DataPanel title="Spot approval history" right={
    <Pressable accessibilityRole="button" onPress={() => setRefresh(value => value + 1)}><Text style={styles.exportLink}>Refresh history</Text></Pressable>
  }>
    <ScrollView horizontal contentContainerStyle={localStyles.controls}>
      {statusOptions.map(option => <Pressable key={option.value} accessibilityRole="button"
        accessibilityLabel={`Show ${option.label.toLowerCase()} spot submissions`}
        accessibilityState={{ selected: status === option.value }}
        onPress={() => { setStatus(option.value); setOffset(0); if (option.value !== 'approved' && sort === 'latest-approved') setSort('newest'); }}
        style={[localStyles.chip, status === option.value && localStyles.selected]}>
        <Text style={styles.tableStrong}>{option.label}</Text>
      </Pressable>)}
    </ScrollView>
    <ScrollView horizontal contentContainerStyle={localStyles.controls}>
      {sortOptions.map(option => <Pressable key={option.value} accessibilityRole="button"
        accessibilityLabel={`Sort spot submissions by ${option.label.toLowerCase()}`}
        accessibilityState={{ selected: sort === option.value }}
        onPress={() => { setSort(option.value); setOffset(0); if (option.value === 'latest-approved') setStatus('approved'); }}
        style={[localStyles.chip, sort === option.value && localStyles.selected]}>
        <Text style={styles.tableStrong}>{option.label}</Text>
      </Pressable>)}
    </ScrollView>
    <Text style={[styles.tableMuted, localStyles.note]}>Older approvals without a recorded approval time appear last. Search filters spot names.</Text>
    <DataTable<ApprovalHistoryRow> columns={[
      { key: 'name', label: 'Spot', flex: 1.8, render: row => <Text style={styles.tableStrong}>{row.name}</Text> },
      { key: 'category', label: 'Category', render: row => <Text style={styles.tableMuted}>{row.category}</Text> },
      { key: 'status', label: 'Status', render: row => <StatusBadge label={row.status} /> },
      { key: 'created_at', label: 'Submitted', render: row => <Text style={styles.tableMuted}>{dateLabel(row.created_at)}</Text> },
      { key: 'approved_at', label: 'Approved', render: row => <Text style={styles.tableMuted}>{row.status === 'approved' ? dateLabel(row.approved_at) : '—'}</Text> },
    ]} data={busy ? [] : result.rows} emptyCopy={busy ? 'Loading approval history…' : result.error || 'No submissions match these filters.'} />
    <View style={localStyles.controls}>
      <Pressable accessibilityRole="button" disabled={busy || offset === 0} onPress={() => setOffset(value => Math.max(0, value - approvalPageSize))} style={[localStyles.chip, (busy || offset === 0) && localStyles.disabled]}><Text style={styles.tableStrong}>Previous</Text></Pressable>
      <Text style={styles.tableMuted}>Page {Math.floor(offset / approvalPageSize) + 1}</Text>
      <Pressable accessibilityRole="button" disabled={busy || !result.hasMore} onPress={() => setOffset(value => value + approvalPageSize)} style={[localStyles.chip, (busy || !result.hasMore) && localStyles.disabled]}><Text style={styles.tableStrong}>Next</Text></Pressable>
    </View>
  </DataPanel>;
}

const localStyles = StyleSheet.create({
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderWidth: 1, borderColor: adminPalette.outlineVariant },
  selected: { backgroundColor: adminPalette.primaryContainer, borderColor: adminPalette.primary },
  disabled: { opacity: 0.4 },
  note: { paddingHorizontal: 20, paddingVertical: 8 },
});
