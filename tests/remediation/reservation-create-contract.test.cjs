const {test}=require('node:test');const assert=require('node:assert/strict');
const load=require('./load-client.cjs');
const input={user_id:'customer',spot_id:'66666666-6666-4666-8666-666666666666',spot_name:'Synthetic venue',reservation_date:'2030-01-01',reservation_time:'20:15',table_id:'C01',slot_id:'prime',guests:2,guest_count:2,guest_name:'Synthetic Guest',guest_email:'guest@example.test',guest_phone:'09171234567',payment_required:false,reservation_type:'free',fee:0,status:'confirmed',payment_status:'not_required'};
function fixture(configured=true,firstError=null){
 const inserts=[],events=[];
 const supabase={from:()=>({insert:attrs=>{
  inserts.push(attrs);
  return {select:()=>({single:async()=>inserts.length===1&&firstError
   ? {data:null,error:firstError}
   : {data:{id:'synthetic',created_at:new Date().toISOString(),...attrs},error:null}})};
 }})};
 return {inserts,events,service:load('src/services/reservationService.ts',{
  '../lib/supabase':{hasSupabaseConfig:configured,supabase},
  './activityService':{activityService:{logActivity:async e=>events.push(e)}}
 }).reservationService};
}
test('missing backend configuration never produces a fake confirmed reservation',async()=>{
 const f=fixture(false);await assert.rejects(f.service.createReservation(input),/unavailable|configured/i);assert.equal(f.inserts.length,0);assert.equal(f.events.length,0);
});
test('schema mismatch never retries a reservation after dropping guest, table and payment fields',async()=>{
 const f=fixture(true,{code:'PGRST204',message:'Could not find the guest_phone column in the schema cache'});
 await assert.rejects(f.service.createReservation(input),/updated|unavailable|schema/i);assert.equal(f.inserts.length,1);assert.equal(f.events.length,0);assert.equal(f.inserts[0].guest_phone,input.guest_phone);assert.equal(f.inserts[0].table_id,input.table_id);
});
test('configured creation submits one complete contact/table snapshot and uses the server result',async()=>{
 const f=fixture();const row=await f.service.createReservation(input);assert.equal(f.inserts.length,1);assert.equal(f.inserts[0],input);assert.equal(row.guest_phone,input.guest_phone);assert.equal(row.table_id,input.table_id);assert.equal(row.id,'synthetic');
});
test('unconfigured or incomplete availability never reports a table as free',async()=>{
 const api=load('src/utils/reservations.ts',{'../lib/supabase':{hasSupabaseConfig:false,supabase:{}}});
 await assert.rejects(api.checkReservationAvailability({spotId:input.spot_id,reservationDate:input.reservation_date,slotId:input.slot_id,tableId:input.table_id}),/unavailable|configured/i);
 const configured=load('src/utils/reservations.ts',{'../lib/supabase':{hasSupabaseConfig:true,supabase:{}}});
 await assert.rejects(configured.checkReservationAvailability({spotId:input.spot_id}),/details|table|time/i);
});
