const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('self-service reservation changes are available only for free reservations', () => {
  const utility = read('src/utils/reservations.ts');
  const screen = read('app/reservations.tsx');

  assert.match(utility, /function allowsSelfServiceReservationChanges/);
  assert.match(utility, /getSpotReservationType\(reservation\) === 'free'/);
  assert.match(screen, /allowsSelfServiceReservationChanges\(reservation\)/);
  assert.match(screen, /\{canModify && \(/);
});

test('reservation service uses policy-enforcing customer RPCs', () => {
  const service = read('src/services/reservationService.ts');

  assert.match(service, /rpc\('cancel_own_free_reservation'/);
  assert.match(service, /rpc\('reschedule_own_free_reservation'/);
  assert.match(service, /does not allow self-service cancellation/);
  assert.match(service, /does not allow self-service adjustments/);
});

for (const sqlFile of ['supabase-schema.sql', 'supabase-reservation-change-policy.sql']) {
  test(`${sqlFile} enforces ownership and blocks paid reservation changes`, () => {
    const sql = read(sqlFile);

    assert.match(sql, /create or replace function public\.cancel_own_free_reservation/i);
    assert.match(sql, /create or replace function public\.reschedule_own_free_reservation/i);
    assert.match(sql, /and user_id = auth\.uid\(\)/i);
    assert.match(sql, /payment_required or current_reservation\.reservation_type = 'paid'/i);
    assert.match(sql, /grant execute on function public\.cancel_own_free_reservation\(uuid, text\) to authenticated/i);
    assert.match(sql, /grant execute on function public\.reschedule_own_free_reservation\(uuid, date\) to authenticated/i);
  });
}

test('unfinished PayMongo checkout can still release its temporary table hold', () => {
  const confirmation = read('app/confirmed/[id].tsx');

  assert.match(confirmation, /payment_status === 'pending'/);
  assert.match(confirmation, /Cancel Payment & Release Table/);
  assert.match(confirmation, /voidUnpaidReservation/);
});
