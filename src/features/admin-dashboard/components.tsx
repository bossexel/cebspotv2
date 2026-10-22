import React from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { CheckCircle2, TriangleAlert } from 'lucide-react-native';
import { adminPalette, styles } from './styles';
import { getStatusBadgeTone } from './presentation';

const statusBadgeColors = {
  danger: { background: adminPalette.errorContainer, foreground: adminPalette.error },
  warning: { background: adminPalette.tertiaryContainer, foreground: '#593900' },
  owner: { background: adminPalette.primaryContainer, foreground: '#431200' },
  pending: { background: adminPalette.secondaryContainer, foreground: '#763400' },
  success: { background: adminPalette.successContainer, foreground: '#166534' },
  default: { background: adminPalette.surfaceContainer, foreground: adminPalette.onSurfaceVariant },
};

export type TableColumn<T> = {
  key: string;
  label: string;
  flex?: number;
  align?: 'left' | 'right';
  render: (item: T) => React.ReactNode;
};

export function DataPanel({
  title,
  right,
  children,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.dataPanel}>
      {!!title && (
        <View style={styles.dataPanelHeader}>
          <Text style={styles.dataPanelTitle}>{title}</Text>
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  emptyCopy = 'No rows to show yet.',
}: {
  columns: TableColumn<T>[];
  data: T[];
  emptyCopy?: string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.tableScrollContainer}>
    <View style={styles.tableScrollContent}>
      <View style={styles.tableHead}>
        {columns.map((column) => (
          <Text
            key={column.key}
            style={[
              styles.tableHeadText,
              { flex: column.flex ?? 1, textAlign: column.align ?? 'left' },
            ]}
          >
            {column.label}
          </Text>
        ))}
      </View>
      {data.map((item) => (
        <View key={item.id} style={styles.tableRow}>
          {columns.map((column) => (
            <View key={column.key} style={{ flex: column.flex ?? 1, alignItems: column.align === 'right' ? 'flex-end' : 'flex-start' }}>
              {column.render(item)}
            </View>
          ))}
        </View>
      ))}
      {!data.length && <EmptyState title="Nothing here yet" copy={emptyCopy} compact />}
    </View>
    </ScrollView>
  );
}

export function StatusBadge({
  label,
  danger,
  warning,
}: {
  label: string;
  danger?: boolean;
  warning?: boolean;
}) {
  const { background, foreground } = statusBadgeColors[getStatusBadgeTone(label, danger, warning)];
  return (
    <View style={[styles.statusBadge, { backgroundColor: background }]}>
      <Text style={[styles.statusBadgeText, { color: foreground }]}>{label}</Text>
    </View>
  );
}

export function LoadingPanel() {
  return (
    <View style={styles.loadingPanel}>
      <ActivityIndicator color={adminPalette.primary} />
      <Text style={styles.loadingTitle}>Loading live admin data</Text>
      <Text style={styles.loadingCopy}>Reading Supabase metrics, queues, and recent platform activity.</Text>
    </View>
  );
}

export function InlineNotice({
  title,
  copy,
  tone = 'error',
}: {
  title: string;
  copy: string;
  tone?: 'error' | 'success';
}) {
  const toneColor = tone === 'success' ? adminPalette.success : adminPalette.error;
  const toneBackground = tone === 'success' ? adminPalette.successContainer + '66' : adminPalette.errorContainer + '12';
  const toneBorder = tone === 'success' ? adminPalette.success + '33' : adminPalette.errorContainer + '55';
  return (
    <View style={[styles.inlineNotice, { borderColor: toneBorder, backgroundColor: toneBackground }]}>
      {tone === 'success' ? <CheckCircle2 size={18} color={toneColor} /> : <TriangleAlert size={18} color={toneColor} />}
      <View style={styles.inlineNoticeCopy}>
        <Text style={[styles.inlineNoticeTitle, { color: toneColor }]}>{title}</Text>
        <Text style={styles.inlineNoticeText}>{copy}</Text>
      </View>
    </View>
  );
}

export function EmptyState({ title, copy, compact }: { title: string; copy: string; compact?: boolean }) {
  return (
    <View style={[styles.emptyState, compact && styles.emptyStateCompact]}>
      <Text style={styles.emptyStateTitle}>{title}</Text>
      <Text style={styles.emptyStateCopy}>{copy}</Text>
    </View>
  );
}
