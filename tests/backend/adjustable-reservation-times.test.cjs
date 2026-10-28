const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function load(relativePath, imports) {
  const exports = {};
  const source = fs.readFileSync(path.resolve(__dirname, '../..', relativePath), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  });
  vm.runInNewContext(outputText, { exports, require: (id) => {
    if (!(id in imports)) throw new Error(`Unexpected import: ${id}`);
    return imports[id];
  }, console: { warn() {} } });
  return exports;
}

const react = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }), Fragment: 'Fragment' };
const picker = load('src/components/AdjustableTimePicker.tsx', {
  react,
  'react-native': { Pressable: 'Pressable', View: 'View', Text: 'Text', StyleSheet: { create: (value) => value } },
  'lucide-react-native': { ChevronDown: 'ChevronDown', ChevronUp: 'ChevronUp' },
  '../constants/colors': { colors: { primary: '#FA5F00', white: '#FFFFFF' } },
});

function find(node, label) {
  if (!node || typeof node !== 'object') return;
  if (node.props?.accessibilityLabel === label) return node;
  for (const child of (node.children || []).flat(Infinity)) {
    const match = find(child, label);
    if (match) return match;
  }
}

function press(value, label) {
  let result;
  const tree = picker.AdjustableTimePicker({ value, onChange: (time) => result = time, appColors: {} });
  const control = find(tree, label);
  assert.ok(control, `Missing ${label}`);
  control.props.onPress();
  return result;
}

test('minute and hour arrows carry through noon and midnight', () => {
  assert.equal(press('11:59', 'Increase minute'), '12:00');
  assert.equal(press('23:59', 'Increase minute'), '00:00');
  assert.equal(press('00:00', 'Decrease minute'), '23:59');
  assert.equal(press('23:25', 'Increase hour'), '00:25');
  assert.equal(press('00:25', 'Decrease hour'), '23:25');
});

test('AM/PM toggles preserve minutes and display noon/midnight correctly', () => {
  assert.equal(press('04:25', 'Switch to PM'), '16:25');
  assert.equal(press('16:25', 'Switch to AM'), '04:25');
  assert.equal(picker.formatPickerTime('00:00'), '12:00 AM');
  assert.equal(picker.formatPickerTime('12:00'), '12:00 PM');
});

test('manual arrival times keep existing inventory keys without rounding the chosen minute', () => {
  const { getReservationTimeSlot } = load('src/utils/reservationTimeSlot.ts', {});
  assert.equal(getReservationTimeSlot('21:10', true), 'sunset');
  assert.equal(getReservationTimeSlot('23:10', true), 'prime');
  assert.equal(getReservationTimeSlot('00:10', true), 'prime');
  assert.equal(getReservationTimeSlot('02:10', true), 'late');
  assert.equal(getReservationTimeSlot('21:10', false), 'prime');
  assert.equal(getReservationTimeSlot('18:10', false), 'sunset');
  assert.equal(getReservationTimeSlot('23:10', false), 'late');
  assert.equal(picker.formatPickerTime('21:10'), '09:10 PM');
});

function availability(result = { data: [], error: null }) {
  const calls = [];
  const utils = load('src/utils/reservations.ts', {
    './userError': require('../remediation/load-client.cjs')('src/utils/userError.ts'),
    '../lib/supabase': { hasSupabaseConfig: true, supabase: { rpc: async (name, args) => {
      calls.push({ name, args });
      return result;
    } } },
  });
  return { ...utils, calls };
}

const booking = { spotId: 'spot', reservationDate: '2030-01-01', slotId: 'prime' };
test('manual-time availability uses the existing backend without range functions', async () => {
  const api = availability({ data: ['vip-1'], error: null });
  assert.equal((await api.getReservedTableIds(booking))[0], 'vip-1');
  assert.equal(api.calls[0].name, 'get_reserved_table_ids');
  assert.equal(api.calls[0].args.target_slot_id, 'prime');
  assert.equal(api.calls[0].args.target_time_end, undefined);
});

test('booking checks use the physical table and pass reschedule exclusions', async () => {
  const api = availability({ data: false, error: null });
  assert.equal(await api.checkReservationAvailability({ ...booking, tableId: 'vip-1', excludeReservationId: 'old' }), false);
  assert.equal(api.calls[0].name, 'check_reservation_slot_available');
  assert.equal(api.calls[0].args.target_table_id, 'vip-1');
  assert.equal(api.calls[0].args.excluded_reservation_id, 'old');
});

test('unavailable database functions still block booking', async () => {
  const api = availability({ data: null, error: { message: 'function missing' } });
  await assert.rejects(api.getReservedTableIds(booking), /availability is unavailable/);
  await assert.rejects(api.checkReservationAvailability({ ...booking, tableId: 'vip-1' }), /could not be verified/);
});

test('legacy slot requests keep using the existing API', async () => {
  const api = availability({ data: true, error: null });
  assert.equal(await api.checkReservationAvailability({ spotId: 'spot', reservationDate: '2030-01-01', slotId: 'prime', tableId: 'vip-1' }), true);
  assert.equal(api.calls[0].name, 'check_reservation_slot_available');
});

test('owner-configured free pricing overrides the legacy test-club fee', () => {
  const api = availability();
  const free = { id:api.testCebspotSpotId, reservation_type:'free', payment_required:false, reservation_fee:0, gcash_amount:0 };
  assert.equal(api.calculateReservationFee(free), 0);
  assert.equal(api.getSpotReservationType(free), 'free');
  assert.equal(api.isPaymentRequired(free), false);
  assert.equal(api.calculateReservationFee({ ...free, reservation_type:'paid', reservation_fee:1, gcash_amount:1 }), 1);
});
