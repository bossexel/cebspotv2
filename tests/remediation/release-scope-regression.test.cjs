const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-client.cjs');
const {isReleaseReservable,reservationClientVenueId}=load('src/utils/tableInventory.ts');
const {getReservationTableAvailability,getLiveReservationTableAvailability}=load('src/services/reservationTableService.ts',{'../lib/supabase':{supabase:{}}});
const inventory={prime:[{tableId:'C01',capacity:4,isReserved:false,bookingPolicy:'online_and_walk_ins'}]};
const confirmed={id:reservationClientVenueId,is_public:true,is_reservable:true,reservation_inventory_verified_at:'2026-10-28T00:00:00Z',table_inventory:inventory};

test('missing verification columns never enable a venue, even with active stored tables',()=>{
 for(const id of [reservationClientVenueId,'30000000-0000-4000-8000-000000000006']){
  const venue={...confirmed,id};delete venue.reservation_inventory_verified_at;
  assert.equal(isReleaseReservable(venue),false);
 }
});

test('availability cannot advertise a discovery or unverified venue even if its RPC claims availability',async()=>{
 for(const changes of [{id:'30000000-0000-4000-8000-000000000006'},{reservation_inventory_verified_at:null},{reservation_inventory_verified_at:undefined},{table_inventory:{}}]){
  const calls=[];
  const api={rpc:async name=>{calls.push(name);return {data:[{table_id:'C01',capacity:4,booking_policy:'online_and_walk_ins',operational_state:'free',online_available:true}],error:null}}};
  await assert.rejects(getReservationTableAvailability({...confirmed,...changes},'2030-01-01','prime',api),/verified|discovery-only/i);
  assert.equal(calls.length,0);
 }
});

test('checkout fresh reads cannot turn a legacy stored reservation flag into permission',async()=>{
 const legacy={...confirmed};delete legacy.reservation_inventory_verified_at;
 const rpc=[];
 const api={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:legacy,error:null})})})}),rpc:async name=>{rpc.push(name);return {data:[],error:null}}};
 await assert.rejects(getLiveReservationTableAvailability(legacy.id,'2030-01-01','prime',api),/verified|discovery-only/i);
 assert.equal(rpc.length,0);
});
