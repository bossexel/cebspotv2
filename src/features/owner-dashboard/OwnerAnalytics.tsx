import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { Reservation } from '../../types';
import type { VenueTableAvailability } from '../../services/venueTableService';
import { buildOwnerAnalytics } from './analytics';
import { formatPeso } from './model';
import { portalColors as c } from './styles';
import { clubTableDisplayName } from '../../constants/clubFloorPlan';

export function OwnerAnalytics({ reservations, spotId, liveTables, liveLoading, liveError, refreshing, onRefresh, onRefreshTables }: {
  reservations: Reservation[]; spotId: string; liveTables: VenueTableAvailability[];
  liveLoading: boolean; liveError: boolean; refreshing: boolean; onRefresh: () => void; onRefreshTables: () => void;
}) {
  const [days, setDays] = useState<7 | 30>(7);
  const { width, fontScale } = useWindowDimensions();
  const wide = width >= 760 && fontScale < 1.3;
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const data = useMemo(() => buildOwnerAnalytics(reservations, spotId, days), [reservations, spotId, days, today]);
  // Six clearly labelled five-day buckets on the 30-day view keep the chart
  // readable on phones, including enlarged system text.
  const step = days === 30 ? 5 : 1;
  const buckets = Array.from({ length: days / step }, (_, i) => {
    const items = data.daily.slice(i * step, (i + 1) * step);
    return { start: items[0].day.slice(5), end: items[items.length - 1].day.slice(5), count: items.reduce((n, d) => n + d.count, 0) };
  });
  const maximum = Math.max(1, ...buckets.map(b => b.count));
  const outcomes = [['Awaiting confirmation', data.status.awaiting], ['Confirmed', data.status.confirmed], ['Attended', data.status.attended], ['Cancelled', data.status.cancelled], ['No-show', data.status.noShow]] as const;
  return <View testID="owner-analytics" style={s.section}>
    <View style={s.heading}>
      <View style={s.headingCopy}><Text style={s.eyebrow}>YOUR VENUE AT A GLANCE</Text><Text accessibilityRole="header" style={s.title}>Venue analytics</Text></View>
      <View style={s.periods}>{([7, 30] as const).map(period => <Pressable key={period} accessibilityRole="button" accessibilityLabel={`Show last ${period} days analytics`} accessibilityState={{ selected: days === period }} onPress={() => setDays(period)} style={[s.period, days === period && s.selected]}><Text style={[s.periodText, days === period && s.selectedText]}>{period} days</Text></Pressable>)}</View>
    </View>
    <Text style={s.copy}>{data.start} to {data.end} · Cebu time</Text>
    <View style={s.heading}>
      <Text style={s.copy}>Based on loaded reservation records. Fees are reservation payments, not total venue sales.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh venue analytics" disabled={refreshing} onPress={onRefresh} style={s.period}>
        <Text style={s.periodText}>{refreshing ? 'Refreshing…' : 'Refresh analytics'}</Text>
      </Pressable>
    </View>
    <View style={s.metrics}>
      {[['Bookings', String(data.bookings), 'By scheduled visit date'], ['Guests booked', String(data.guests), 'Excludes cancellations and no-shows'], ['Paid reservation fees', formatPeso(data.paidFees), `${data.paidCount} recorded ${data.paidCount === 1 ? 'payment' : 'payments'} in this period`], ['Attendance', data.attendanceRate === null ? '—' : `${data.attendanceRate}%`, 'Arrivals out of recorded attendance outcomes']].map(([label, value, detail]) => <View key={label} style={[s.metric, { width: wide ? '48.5%' : '100%' }]}><Text style={s.metricLabel}>{label}</Text><Text style={s.metricValue}>{value}</Text><Text style={s.copy}>{detail}</Text></View>)}
    </View>
    <View style={s.card}>
      <Text accessibilityRole="header" style={s.subtitle}>Booking activity</Text>
      <Text style={s.copy}>{data.bookings ? (days === 30 ? 'Bookings grouped into five-day periods.' : 'Bookings by scheduled visit date.') : 'No reservation activity in this period.'}</Text>
      <View style={s.chart} accessible accessibilityRole="image" accessibilityLabel={buckets.map(b => `${b.start}${b.start !== b.end ? ` to ${b.end}` : ''}: ${b.count} bookings`).join('. ')}>
        {buckets.map((b, index) => <View key={b.start} style={s.barColumn}><Text style={s.barCount}>{b.count}</Text><View style={s.barTrack}><View style={[s.bar, { height: `${b.count / maximum * 100}%`, minHeight: b.count ? 4 : 0 }]} /></View><Text style={s.barLabel}>{fontScale >= 1.3 && index % 2 === 1 ? ' ' : b.start}</Text></View>)}
      </View>
    </View>
    <View style={[s.detailColumns, wide && s.wideColumns]}>
      <View style={[s.card, wide && s.detailCard]}><Text accessibilityRole="header" style={s.subtitle}>Booking outcomes</Text>{outcomes.map(([label, count]) => <View key={label} style={s.row}><Text style={s.rowLabel}>{label}</Text><Text style={s.rowValue}>{count}</Text></View>)}</View>
      <View style={[s.card, wide && s.detailCard]}><Text accessibilityRole="header" style={s.subtitle}>Most booked tables</Text>{data.topTables.length ? data.topTables.map(table => <View key={table.tableId} style={s.row}><Text style={s.rowLabel}>{clubTableDisplayName(table.tableId)}</Text><Text style={s.rowValue}>{table.bookings}</Text></View>) : <Text style={s.copy}>Table activity will appear after reservations are recorded.</Text>}</View>
    </View>
    <View style={s.card}><View style={s.heading}><Text accessibilityRole="header" style={s.subtitle}>Live table overview</Text><Pressable accessibilityRole="button" accessibilityLabel="Refresh analytics table status" onPress={onRefreshTables} disabled={liveLoading} style={s.period}><Text style={s.periodText}>{liveLoading ? 'Checking…' : 'Refresh'}</Text></Pressable></View>
      {liveError || liveLoading ? <Text accessibilityRole={liveError ? 'alert' : undefined} style={s.copy}>{liveError ? 'Live table status is unavailable. Refresh to try again.' : 'Checking current table status…'}</Text> : <View style={s.liveRows}>{[['Free', liveTables.filter(t => t.state === 'free').length], ['Held / reserved', liveTables.filter(t => t.state === 'held' || t.state === 'due').length], ['Occupied', liveTables.filter(t => t.state === 'occupied').length], ['Cleaning', liveTables.filter(t => t.state === 'cleaning').length], ['Unavailable', liveTables.filter(t => t.state === 'unavailable').length]].map(([label, value]) => <View key={label} style={s.liveMetric}><Text style={s.rowValue}>{value}</Text><Text style={s.copy}>{label}</Text></View>)}</View>}
    </View>
    <Text style={s.copy}>Fees use payment dates and exclude refunds and unresolved payments. {data.undatedPayments ? `${data.undatedPayments} older paid entries have no payment date and are excluded.` : ''}</Text>
  </View>;
}

const s = StyleSheet.create({
  section: { gap: 16 }, heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, headingCopy: { flexGrow: 1 },
  eyebrow: { color: c.primaryDark, fontSize: 10, fontWeight: '800', letterSpacing: 1 }, title: { color: c.ink, fontSize: 24, fontWeight: '900', marginTop: 4 },
  periods: { flexDirection: 'row', gap: 8 }, period: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: c.line, justifyContent: 'center' }, selected: { backgroundColor: c.orangeSoft, borderColor: c.primary }, periodText: { color: c.ink, fontSize: 13, fontWeight: '700' }, selectedText: { color: c.primaryDark },
  copy: { color: '#5D6879', fontSize: 13, lineHeight: 20, flexShrink: 1 }, metrics: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  metric: { borderRadius: 20, backgroundColor: c.surface, padding: 20, borderWidth: 1, borderColor: c.line, gap: 8 }, metricLabel: { color: '#5D6879', fontSize: 13, fontWeight: '700' }, metricValue: { color: c.ink, fontSize: 28, fontWeight: '900' },
  card: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 20, padding: 18, gap: 14 }, subtitle: { color: c.ink, fontSize: 16, fontWeight: '800', flexShrink: 1 },
  chart: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', paddingTop: 8 }, barColumn: { flex: 1, minWidth: 0, gap: 8, alignItems: 'center' }, barTrack: { height: 90, width: '100%', backgroundColor: c.surfaceLow, borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden' }, bar: { backgroundColor: c.primary, width: '100%', borderRadius: 6 }, barCount: { color: c.ink, fontSize: 12, fontWeight: '800' }, barLabel: { color: '#5D6879', fontSize: 10 },
  detailColumns: { gap: 16 }, wideColumns: { flexDirection: 'row', alignItems: 'stretch' }, detailCard: { flexGrow: 1, flexBasis: 0 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 }, rowLabel: { color: '#5D6879', fontSize: 14, flex: 1 }, rowValue: { color: c.ink, fontSize: 16, fontWeight: '800' },
  liveRows: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 }, liveMetric: { minWidth: 64, gap: 4 },
});
