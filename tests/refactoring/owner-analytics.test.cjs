const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('../remediation/load-client.cjs');
const {buildOwnerAnalytics,getOwnerTableColumns}=load('src/features/owner-dashboard/analytics.ts');
const now=new Date('2026-11-02T16:05:00Z'); // November 3 in Cebu.
const row=(id,extra={})=>({id,spot_id:'synthetic-venue',reservation_date:'2026-11-03',status:'confirmed',guests:2,table_id:'T01',payment_status:'not_required',...extra});

test('owner table layout uses a readable list on phones and adjusts to tablet width and system text size',()=>{
  for(const width of [320,360,430,600])assert.equal(getOwnerTableColumns(width),1);
  assert.equal(getOwnerTableColumns(800),2);assert.equal(getOwnerTableColumns(1280),3);
  assert.equal(getOwnerTableColumns(800,1.4),1);assert.equal(getOwnerTableColumns(1280,1.4),2);assert.equal(getOwnerTableColumns(320,2),1);
});
test('analytics scopes to the venue, deduplicates realtime rows and uses Cebu visit dates',()=>{
  const data=[row('a'),row('a'),row('other',{spot_id:'another-venue'}),row('old',{reservation_date:'2026-10-27'}),row('future',{reservation_date:'2026-11-04'}),row('invalid',{reservation_date:'2026-02-31'}),row('start',{reservation_date:'2026-10-28',guest_count:4})];
  const result=buildOwnerAnalytics(data,'synthetic-venue',7,now);assert.equal(result.start,'2026-10-28');assert.equal(result.end,'2026-11-03');assert.equal(result.bookings,2);assert.equal(result.guests,6);assert.equal(result.daily.length,7);assert.equal(result.daily[0].count,1);assert.equal(result.daily[6].count,1);
});
test('fees use payment dates, preserve zero fees and exclude refunds, unresolved payments and invalid amounts',()=>{
  const paid={payment_status:'paid',paid_at:'2026-11-02T23:00:00Z',reservation_fee:1};
  const data=[row('paid',paid),row('zero',{...paid,reservation_fee:0}),row('other-period',{...paid,paid_at:'2026-10-20T00:00:00Z'}),row('refund',{...paid,refund_status:'completed'}),row('review',{...paid,financial_resolution:'resolution_required'}),row('not-paid',{...paid,payment_status:'pending'}),row('undated',{...paid,paid_at:null}),row('invalid',{...paid,reservation_fee:'bad'}),row('negative',{...paid,reservation_fee:-10})];
  const result=buildOwnerAnalytics(data,'synthetic-venue',7,now);assert.equal(result.paidFees,1);assert.equal(result.paidCount,2);assert.equal(result.undatedPayments,1);
});
test('attendance and guests reflect recorded outcomes without invented rates',()=>{
  const result=buildOwnerAnalytics([row('arrived',{status:'checked_in'}),row('complete',{status:'completed',guests:4}),row('missed',{status:'no_show',guests:10}),row('cancelled',{status:'cancelled',guests:20}),row('awaiting',{status:'pending_payment',guests:3})],'synthetic-venue',7,now);
  assert.equal(result.attendanceRate,67);assert.equal(result.guests,9);assert.equal(result.status.attended,2);assert.equal(result.status.noShow,1);assert.equal(result.status.cancelled,1);assert.equal(result.status.awaiting,1);
  assert.equal(buildOwnerAnalytics([row('confirmed')],'synthetic-venue',7,now).attendanceRate,null);
});
test('thirty-day analytics and empty states remain truthful and do not mutate source records',()=>{
  const input=[row('older',{reservation_date:'2026-10-10'})];const before=JSON.stringify(input);
  const result=buildOwnerAnalytics(input,'synthetic-venue',30,now);assert.equal(result.daily.length,30);assert.equal(result.start,'2026-10-05');assert.equal(result.bookings,1);assert.equal(JSON.stringify(input),before);
  const empty=buildOwnerAnalytics([], 'synthetic-venue',7,now);assert.equal(empty.bookings,0);assert.equal(empty.paidFees,0);assert.equal(empty.attendanceRate,null);assert.equal(empty.topTables.length,0);
});
