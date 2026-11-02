import type { Reservation } from '../../types';

const dayMs = 86400000;
function cebuDay(time: number) { return new Date(time + 8 * 3600000).toISOString().slice(0, 10); }
function validDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z'))
    && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}

export function getOwnerTableColumns(width: number, fontScale = 1) {
  const available = Math.max(0, Math.min(width, 1040) - 32);
  return Math.max(1, Math.min(3, Math.floor((available + 16) / (320 * Math.max(1, fontScale) + 16))));
}

export function buildOwnerAnalytics(rows: Reservation[], spotId: string, days: 7 | 30, now = new Date()) {
  const today = cebuDay(now.getTime());
  const end = Date.parse(today + 'T00:00:00Z');
  const start = new Date(end - (days - 1) * dayMs).toISOString().slice(0, 10);
  const seen = new Set<string>();
  const scoped = rows.filter(row => {
    if (row.spot_id !== spotId || seen.has(row.id)) return false;
    seen.add(row.id); return true;
  });
  const selected = scoped.filter(row => validDay(row.reservation_date) && row.reservation_date >= start && row.reservation_date <= today);
  const daily = Array.from({ length: days }, (_, i) => ({ day: new Date(end - (days - 1 - i) * dayMs).toISOString().slice(0, 10), count: 0 }));
  const status = { awaiting: 0, confirmed: 0, attended: 0, cancelled: 0, noShow: 0 };
  const tableCounts = new Map<string, number>();
  let guests = 0;
  for (const row of selected) {
    daily.find(day => day.day === row.reservation_date)!.count++;
    if (row.status === 'cancelled') status.cancelled++;
    else if (row.status === 'no_show') status.noShow++;
    else if (row.status === 'checked_in' || row.status === 'completed') status.attended++;
    else if (row.status === 'confirmed') status.confirmed++;
    else status.awaiting++;
    if (row.status !== 'cancelled' && row.status !== 'no_show') {
      const count = Number(row.guest_count ?? row.guests);
      if (Number.isFinite(count) && count > 0) guests += Math.floor(count);
    }
    if (row.status !== 'cancelled' && row.table_id) tableCounts.set(row.table_id, (tableCounts.get(row.table_id) ?? 0) + 1);
  }
  let paidFees = 0; let paidCount = 0; let undatedPayments = 0;
  for (const row of scoped) {
    if (row.payment_status !== 'paid' || row.financial_resolution === 'resolution_required'
      || ['pending_review', 'approved', 'completed'].includes(row.refund_status ?? '')) continue;
    const timestamp = row.paid_at && /(?:Z|[+-]\d{2}:\d{2})$/.test(row.paid_at) ? Date.parse(row.paid_at) : NaN;
    if (!Number.isFinite(timestamp)) { undatedPayments++; continue; }
    const date = cebuDay(timestamp);
    if (date < start || date > today) continue;
    const amount = Number(row.reservation_fee ?? row.fee);
    if (!Number.isFinite(amount) || amount < 0) continue;
    paidFees += Math.round(amount * 100); paidCount++;
  }
  const outcomes = status.attended + status.noShow;
  return { days, start, end: today, bookings: selected.length, guests, paidFees: paidFees / 100, paidCount, undatedPayments,
    attendanceRate: outcomes ? Math.round(status.attended * 100 / outcomes) : null, status, daily,
    topTables: [...tableCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([tableId, bookings]) => ({ tableId, bookings })) };
}
