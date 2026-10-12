const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {startDatabase}=require('./database.cjs');
const {ids,seed,booking}=require('./fixtures.cjs');
const load=require('./load-client.cjs');
let db;
before(async()=>{db=await startDatabase();await seed(db);});
after(async()=>db?.close());
test('server derives every schedule boundary in agreement with Android while preserving exact minutes',async()=>{
  const client=load('src/utils/reservationTimeSlot.ts');
  await db.as(ids.a);
  for(const club of [false,true])for(const time of ['00:00','01:59','02:00','16:59','17:00','19:59','20:00','22:59','23:00','23:59']) {
    const slot=(await db.query('select reservation_slot_for_time($1,$2) slot',[time,club])).rows[0].slot;
    assert.equal(slot,client.getReservationTimeSlot(time,club),`${time}/${club}`);
  }
  const row=await booking(db,{reservation_time:'20:37',slot_id:'prime',guest_name:'  Synthetic Guest  ',guest_email:' GUEST@fixture.example.test ',guest_phone:'+63 917-123-4567',payment_terms_accepted_at:'2099-01-01'});
  assert.equal(row.slot_id,'sunset');assert.equal(row.reservation_time,'20:37:00');assert.equal(row.reservation_time_start,'20:37:00');assert.equal(row.reservation_time_end,null);
  assert.equal(row.guest_phone,'+639171234567');assert.equal(row.guest_name,'Synthetic Guest');assert.equal(row.guest_email,'guest@fixture.example.test');
  assert.ok(Math.abs(row.payment_terms_accepted_at-Date.now())<10000);
});
test('forged alternate slot cannot evade competing inventory claims',async()=>{
  await db.as(ids.b);await assert.rejects(booking(db,{user_id:ids.b,reservation_time:'20:37',slot_id:'late'}),/just booked|reserved|available/i);
});
test('direct database inserts reject invalid contact details, past arrivals and invalid minute precision',async()=>{
  await db.as(ids.a);
  for(const overrides of [{guest_name:''},{guest_email:'x@'},{guest_email:'a@bad host.test'},{guest_phone:'123456789012345'},{guest_phone:'09171234567<script>'},{reservation_date:'2000-01-01'},{reservation_time:'24:00'},{reservation_time:'23:10:35'}]) {
    await assert.rejects(booking(db,{slot_id:'late',...overrides}),/valid guest|valid arrival|future/i);
  }
});
test('client price presentation cannot invent a fee or paid classification from a venue name',()=>{
  const api=load('src/utils/reservations.ts',{'../lib/supabase':{hasSupabaseConfig:false,supabase:{}}});
  assert.equal(api.calculateReservationFee({name:'Test Cebspot Club'}),0);
  assert.equal(api.getSpotReservationType({name:'Test Cebspot Club',reservation_fee:0,reservation_type:'free',payment_required:false}),'free');
  assert.equal(api.calculateReservationFee({reservation_fee:250}),250);
});
