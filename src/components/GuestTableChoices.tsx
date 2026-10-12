import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { radius, spacing, fontSize } from '../constants/design';
import { clubTableDisplayName } from '../constants/clubFloorPlan';
import { venueTableStateLabels, type VenueTableAvailability } from '../services/venueTableService';

export function GuestTableChoices({ tables, partySize, selectedId, loading, onSelect }: {
  tables: VenueTableAvailability[]; partySize: number; selectedId: string | null;
  loading: boolean; onSelect: (tableId: string) => void;
}) {
  const { appColors } = useTheme();
  return <View style={styles.stack}>
    <Text style={[styles.title, { color: appColors.onSurface }]}>Tables</Text>
    {!loading && !tables.length && <Text style={{ color: appColors.onSurfaceVariant }}>No tables are configured for this time.</Text>}
    <View style={styles.grid}>{tables.map(table => {
      const disabled = loading || !table.onlineAvailable || table.capacity < partySize || table.bookingPolicy === 'walk_in_only';
      const label = table.bookingPolicy === 'walk_in_only' ? 'Walk-ins only'
        : table.capacity < partySize ? 'Too small for your party'
          : table.onlineAvailable ? 'Available online' : venueTableStateLabels[table.state];
      return <Pressable key={table.tableId} accessibilityRole="button"
        accessibilityLabel={`${clubTableDisplayName(table.tableId)}, ${table.capacity} seats, ${label}`}
        accessibilityState={{ disabled, selected: !disabled && selectedId === table.tableId }}
        disabled={disabled} onPress={() => onSelect(table.tableId)}
        style={[styles.table, { backgroundColor: appColors.surfaceRaised,
          borderColor: !disabled && selectedId === table.tableId ? appColors.primary : appColors.outlineVariant }]}>
        <Text style={[styles.name, { color: appColors.onSurface }]}>{clubTableDisplayName(table.tableId)}</Text>
        <Text style={[styles.copy, { color: appColors.onSurfaceVariant }]}>{table.capacity} seats</Text>
        <Text style={[styles.name, { color: disabled ? appColors.onSurfaceVariant : appColors.primary }]}>{loading && table.bookingPolicy !== 'walk_in_only' ? 'Checking availability...' : label}</Text>
        {table.bookingPolicy === 'walk_in_only' && table.state !== 'free' && <Text style={[styles.copy, { color: appColors.onSurfaceVariant }]}>{venueTableStateLabels[table.state]}</Text>}
      </Pressable>;
    })}</View>
  </View>;
}
const styles = StyleSheet.create({
  stack: { gap: spacing.md }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  title: { fontSize: fontSize.lg, fontWeight: '800' },
  table: { flexGrow: 1, flexBasis: '45%', minWidth: 120, minHeight: 96, borderWidth: 2, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  name: { fontSize: fontSize.sm, fontWeight: '700', flexShrink: 1 }, copy: { fontSize: fontSize.sm },
});
