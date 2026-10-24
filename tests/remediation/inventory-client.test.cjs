const {test}=require('node:test');
const assert=require('node:assert/strict');
const tables=require('./load-client.cjs')('src/utils/tableInventory.ts');
test('stored inventory never creates missing table IDs or capacities',()=>{
  for(const source of [null,{}, {prime:[]},{prime:[{capacity:4}]},{prime:[{tableId:'C01'}]},{prime:[{tableId:'C01',capacity:0}]}]) {
    assert.equal(tables.getPhysicalTables(source).length,0);
  }
});
test('client advertises only the confirmed sole venue with active online inventory',()=>{
  const valid={id:tables.reservationClientVenueId,is_public:true,is_reservable:true,reservation_inventory_verified_at:'2026-10-13T00:00:00Z',table_inventory:{prime:[{tableId:'C01',capacity:4,isReserved:false}]}};
  assert.equal(tables.isReleaseReservable(valid),true);
  for(const changes of [{id:'other'}, {is_public:false},{is_reservable:false},{reservation_inventory_verified_at:null},{table_inventory:{}},{table_inventory:{prime:[{tableId:'C01',capacity:4,isReserved:true}]}},{table_inventory:{prime:[{tableId:'C01',capacity:4,bookingPolicy:'walk_in_only'}]}}]) assert.equal(tables.isReleaseReservable({...valid,...changes}),false);
});
test('legacy deployments retain their stored reservation flags without a verification column',()=>{
  const legacy={id:'legacy-venue',is_public:true,is_reservable:true};
  assert.equal(tables.isReleaseReservable(legacy),true);
  assert.equal(tables.isReleaseReservable({...legacy,is_public:false}),false);
  assert.equal(tables.isReleaseReservable({...legacy,is_reservable:false}),false);
  // Present-but-empty verification belongs to the newer schema, not legacy mode.
  assert.equal(tables.isReleaseReservable({...legacy,reservation_inventory_verified_at:null}),false);
  assert.equal(tables.isReleaseReservable({...legacy,reservation_inventory_verified_at:undefined}),false);
});
