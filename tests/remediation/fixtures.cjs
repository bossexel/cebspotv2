const ids={a:'30000000-0000-4000-8000-000000000001',b:'30000000-0000-4000-8000-000000000002',owner:'30000000-0000-4000-8000-000000000003',other:'30000000-0000-4000-8000-000000000004',admin:'30000000-0000-4000-8000-000000000005',venue:'66666666-6666-4666-8666-666666666666',discovery:'30000000-0000-4000-8000-000000000006'};
const inventory={sunset:[{tableId:'C01',capacity:4,isReserved:false}],prime:[{tableId:'C01',capacity:4,isReserved:false}],late:[{tableId:'C01',capacity:4,isReserved:false}]};
async function seed(db,{confirm=true,fee=150}={}) {
  await db.exec('reset role');
  for(const [name,id] of Object.entries(ids).filter(([name])=>!['venue','discovery'].includes(name))) await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,name==='admin'?'testadmin6000@gmail.com':`${name}@fixture.example.test`]);
  await db.query("update profiles set role='owner' where id=any($1::uuid[])",[[ids.owner,ids.other]]);
  for(const venue of [ids.venue,ids.discovery]) await db.query("insert into spots(id,name,category,address,latitude,longitude,owner_id,is_public,is_reservable,table_inventory,reservation_fee,gcash_amount,payment_required,reservation_type) values($1,'Synthetic fixture venue','Cafe','Synthetic fixture',10,123,$2,true,true,$3,$4,$4,$5,$6)",[venue,ids.owner,JSON.stringify(inventory),fee,fee>0,fee>0?'paid':'free']);
  if(confirm) { await db.as(ids.owner); await db.query('select confirm_client_venue_inventory($1,$2)',[ids.venue,JSON.stringify(inventory)]); }
  await db.exec('reset role');
}
async function booking(db,overrides={}) {
  const defaults={user_id:ids.a,spot_id:ids.venue,spot_name:'Untrusted name',reservation_time:'23:10',slot_id:'prime',table_id:'C01',guests:2,guest_count:2,guest_name:'Synthetic Guest',guest_email:'guest@fixture.example.test',guest_phone:'09171234567',payment_terms_accepted:true,qr_code:require('node:crypto').randomUUID()};
  const row={...defaults,...overrides};
  const keys=Object.keys(row);
  return (await db.query(`insert into reservations(${keys.join(',')},reservation_date) values(${keys.map((_,i)=>'$'+(i+1)).join(',')},(now() at time zone 'Asia/Manila')::date+1) returning *`,Object.values(row))).rows[0];
}
module.exports={ids,inventory,seed,booking};
