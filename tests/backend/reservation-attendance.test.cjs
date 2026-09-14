const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('owner dashboard exposes confirmed-arrival and no-show decisions with full reservation details', () => {
  const dashboard = read('app/owner-dashboard.tsx');

  assert.match(dashboard, /Guest Email/);
  assert.match(dashboard, /Guest Phone/);
  assert.match(dashboard, /Guest Arrived/);
  assert.match(dashboard, /No Show/);
  assert.match(dashboard, /recordReservationAttendance/);
  assert.match(dashboard, /kind: 'mark-no-show'/);
});

test('attendance updates route through the owner-only database function', () => {
  const service = read('src/services/reservationService.ts');
  const portal = read('public/owner-portal/owner-portal-live.js');

  assert.match(service, /rpc\('owner_record_reservation_attendance'/);
  assert.match(portal, /rpc\("owner_record_reservation_attendance"/);
  assert.match(portal, /dataset\.cebAttendanceStatus = "checked_in"/);
  assert.match(portal, /dataset\.cebAttendanceStatus = "no_show"/);
});

for (const sqlFile of ['supabase-schema.sql', 'supabase-reservation-attendance.sql']) {
  test(`${sqlFile} secures attendance decisions and notifies the guest`, () => {
    const sql = read(sqlFile);

    assert.match(sql, /create or replace function public\.owner_record_reservation_attendance/i);
    assert.match(sql, /spots\.owner_id = auth\.uid\(\) or access\.owner_id = auth\.uid\(\)/i);
    assert.match(sql, /attendance_status not in \('checked_in', 'no_show'\)/i);
    assert.match(sql, /payment_required and current_reservation\.payment_status <> 'paid'/i);
    assert.match(sql, /set status = attendance_status/i);
    assert.match(sql, /'reservation_checked_in'/i);
    assert.match(sql, /'reservation_no_show'/i);
    assert.match(sql, /grant execute on function public\.owner_record_reservation_attendance\(uuid, text\) to authenticated/i);
  });
}

test('checked-in tables remain occupied while no-shows release their table', () => {
  const schema = read('supabase-schema.sql');

  assert.match(schema, /status not in \('cancelled', 'completed', 'no_show'\)/i);
  assert.doesNotMatch(schema, /status not in \('cancelled', 'checked_in', 'completed', 'no_show'\)/i);
});

test('arrival and no-show activities become user notifications linked to reservation details', () => {
  const layout = read('app/_layout.tsx');
  const notifications = read('src/services/userNotificationService.ts');

  assert.match(layout, /'reservation_checked_in'/);
  assert.match(layout, /'reservation_no_show'/);
  assert.match(notifications, /You are checked in/);
  assert.match(notifications, /Reservation marked no show/);
  assert.match(notifications, /routeType: 'reservation'/);
});
