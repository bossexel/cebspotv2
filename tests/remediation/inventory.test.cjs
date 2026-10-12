const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {startDatabase}=require('./database.cjs');
const {ids,inventory,seed,booking}=require('./fixtures.cjs');
let db;
before(async()=>{db=await startDatabase();await seed(db,{confirm:false});});
after(async()=>db?.close());
test('neither an inventory template nor the old reservable flag enables reservations',async()=>{
  assert.equal((await db.query('select bool_or(is_reservable) enabled from spots')).rows[0].enabled,false);
  await db.as(ids.a); await assert.rejects(booking(db),/not available|discovery-only|available venue/);
});
test('customers and unrelated owners cannot confirm inventory',async()=>{
  for(const actor of [ids.a,ids.other]) {await db.as(actor);await assert.rejects(db.query('select confirm_client_venue_inventory($1,$2)',[ids.venue,JSON.stringify(inventory)]),/assigned owner/);}
});
test('assigned owner confirms actual inventory; a stale confirmation is rejected',async()=>{
  await db.as(ids.owner);
  await assert.rejects(db.query('select confirm_client_venue_inventory($1,$2)',[ids.venue,'{}']),/changed/);
  const result=await db.query('select (confirm_client_venue_inventory($1,$2)).is_reservable enabled',[ids.venue,JSON.stringify(inventory)]);
  assert.equal(result.rows[0].enabled,true);
});
test('all other venues stay discovery-only despite valid inventory and forged flags',async()=>{
  await db.query('update spots set is_reservable=true where id=$1',[ids.discovery]);
  await assert.rejects(db.query('select confirm_client_venue_inventory($1,$2)',[ids.discovery,JSON.stringify(inventory)]),/assigned owner/);
  await db.as(ids.a); await assert.rejects(booking(db,{spot_id:ids.discovery}),/not available|discovery-only|available venue/);
  assert.equal((await db.query('select bool_or(online_available) enabled from get_venue_table_availability($1)',[ids.discovery])).rows[0].enabled,false);
});
test('sole confirmed venue books real tables and rejects fake or already occupied inventory',async()=>{
  await db.as(ids.a);
  await assert.rejects(booking(db,{table_id:'FAKE'}),/not valid|not configured|not found/);
  const saved=await booking(db); assert.equal(saved.spot_name,'Synthetic fixture venue');
  await db.as(ids.b); await assert.rejects(booking(db,{user_id:ids.b}),/already|available|reserved|just booked/);
});
test('malformed, empty, reserved-only, or walk-in-only inventory cannot pass confirmation',async()=>{
  await db.exec('reset role');
  for(const source of [{},{prime:[{capacity:4}]},{prime:[{tableId:'C01',capacity:0}]},{prime:[{tableId:'C01',capacity:4,isReserved:true}]},{prime:[{tableId:'C01',capacity:4,bookingPolicy:'walk_in_only'}]},{prime:[{tableId:'C01',capacity:4,isReserved:'false'}]}]) {
    assert.equal((await db.query('select has_active_online_inventory($1) valid',[JSON.stringify(source)])).rows[0].valid,false);
  }
});
test('direct edits cannot forge verification and an inventory change invalidates confirmation',async()=>{
  await db.as(ids.owner);
  await assert.rejects(db.query('update spots set reservation_inventory_verified_at=now() where id=$1',[ids.venue]),/protected operation/);
  await db.exec('reset role');
  await db.query("update spots set table_inventory=jsonb_set(table_inventory,'{late,0,capacity}','3') where id=$1",[ids.venue]);
  const spot=(await db.query('select is_reservable,reservation_inventory_verified_at from spots where id=$1',[ids.venue])).rows[0];
  assert.equal(spot.is_reservable,false);assert.equal(spot.reservation_inventory_verified_at,null);
});
