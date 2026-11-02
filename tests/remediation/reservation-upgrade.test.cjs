const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { startDatabase } = require('./database.cjs');
const { fromCatalog } = require('./catalog-fixture.cjs');
const { ids, inventory, seed, booking } = require('./fixtures.cjs');
const { build, statements, withoutComments, output } = require('../../scripts/build-reservation-upgrade.cjs');
const sql = fs.readFileSync(output, 'utf8');
const legacyFiles = ['20261013000700_circle_location_controls.sql','20261025000100_activity_feed_pagination.sql','20261027000100_independent_spot_posts.sql','20261028000100_beta_identity_prerequisites.sql','20261030000100_activity_post_votes.sql','20261031000100_owner_managed_spot_posts.sql'];

test('reservation upgrade is source-derived and has no top-level business-data mutation', () => {
  assert.equal(sql, build().sql);
  for (const s of statements(sql).map(withoutComments)) {
    assert.doesNotMatch(s, /^(?:delete|truncate|drop table|drop column|update public\.)/i);
    assert.doesNotMatch(s, /^alter table[\s\S]*\bdrop column\b/i);
  }
});

async function previous() {
  const db = await startDatabase({ through: '20261006000100_audit_authorization_hardening.sql' });
  try {
    for (const f of legacyFiles) await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    return db;
  } catch (error) { await db.close(); throw error; }
}
async function snapshot(db) {
  const result = {};
  for (const name of ['profiles','spots','reservations','reservation_payments','activities']) result[name] = (await db.query(`select * from public.${name} order by id`)).rows;
  return result;
}
function originalColumns(after, before) {
  return Object.fromEntries(Object.entries(before).map(([t, rows]) => [t, after[t].map((row,i) => Object.fromEntries(Object.keys(rows[i]).map(k => [k, row[k]])))]));
}
async function exercise(db, t) {
  try {
    const hasVerification=(await db.query("select exists(select 1 from information_schema.columns where table_name='spots' and column_name='reservation_inventory_verified_at') yes")).rows[0].yes;
    await seed(db, { confirm: hasVerification });
    const legacy = await booking(db, { reservation_date: '2030-12-01' });
    if(hasVerification) await db.query('update spots set reservation_inventory_verified_at=null,reservation_inventory_verified_by=null where id=$1',[ids.venue]);
    await db.query("insert into reservation_payments(reservation_id,user_id,spot_id,provider,provider_payment_id,amount,currency,status) values($1,$2,$3,'paymongo','synthetic-provider-paid',150,'PHP','paid')",[legacy.id,ids.a,ids.venue]);
    const before = await snapshot(db);
    const identity = (await db.query("select pg_get_functiondef('require_active_account()'::regprocedure) body")).rows[0].body;
    const validator = (await db.query("select pg_get_functiondef(to_regprocedure('public.validate_reservation_details()')) body")).rows[0].body;
    await t.test('upgrade preserves every existing business column, identity guard, and old flags', async () => {
      await db.exec(sql);
      assert.deepEqual(originalColumns(await snapshot(db), before), before);
      assert.equal((await db.query("select pg_get_functiondef('require_active_account()'::regprocedure) body")).rows[0].body, identity);
      if (validator) assert.equal((await db.query("select pg_get_functiondef('public.validate_reservation_details()'::regprocedure) body")).rows[0].body, validator);
      assert.equal((await db.query('select reservation_inventory_verified_at from spots where id=$1',[ids.venue])).rows[0].reservation_inventory_verified_at, null);
    });
    await t.test('second application is a no-op for all business rows and function definitions', async () => {
      const rows = await snapshot(db);
      const functions = (await db.query("select proname,pg_get_functiondef(oid) body from pg_proc where pronamespace='public'::regnamespace and prokind='f' order by proname,oid")).rows;
      await db.exec(sql);
      assert.deepEqual(await snapshot(db), rows);
      assert.deepEqual((await db.query("select proname,pg_get_functiondef(oid) body from pg_proc where pronamespace='public'::regnamespace and prokind='f' order by proname,oid")).rows, functions);
    });
    await t.test('unverified inventory fails closed; owner confirmation restores public availability', async () => {
      await db.as(null, db, 'anon');
      assert.equal((await db.query('select bool_or(online_available) allowed from get_venue_table_availability($1)',[ids.venue])).rows[0].allowed, false);
      await db.as(ids.other);
      await assert.rejects(db.query('select confirm_client_venue_inventory($1,$2)',[ids.venue,JSON.stringify(inventory)]), /assigned owner/);
      await db.as(ids.owner);
      await db.query('select confirm_client_venue_inventory($1,$2)',[ids.venue,JSON.stringify(inventory)]);
      await db.as(null, db, 'anon');
      assert.equal((await db.query('select bool_or(online_available) allowed from get_venue_table_availability($1,current_date+1)',[ids.venue])).rows[0].allowed, true);
    });
    let saved;
    await t.test('confirmed customer books with authoritative fees; other users cannot read or alter it', async () => {
      await db.as(ids.a);
      saved = await booking(db, { fee: 0, payment_status:'paid',status:'confirmed' });
      assert.equal(saved.payment_status, 'pending'); assert.equal(saved.status, 'pending_payment');
      assert.equal(Number(saved.fee),150); assert.ok(saved.hold_expires_at);
      await db.as(ids.b);
      assert.equal((await db.query('select id from reservations where id=$1',[saved.id])).rows.length,0);
      await assert.rejects(db.query("update reservations set status='confirmed' where id=$1",[saved.id]),/permission denied/);
      await assert.rejects(booking(db, { user_id: ids.a,reservation_date:'2030-12-03' }), /row-level security/);
    });
    await t.test('simultaneous requests cannot double-book the same table', async () => {
      const clients = await Promise.all([db.connect(),db.connect()]);
      try {
        for (const [i,c] of clients.entries()) await db.as(i ? ids.b : ids.a, c);
        const outcomes=await Promise.allSettled(clients.map((c,i)=>booking(c,{user_id:i?ids.b:ids.a,reservation_date:'2030-12-02'})));
        assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
        assert.equal(outcomes.filter(r=>r.status==='rejected').length,1);
      } finally { await Promise.all(clients.map(c=>c.end())); }
    });
    await t.test('expired holds release inventory, owner walk-ins use a separate ledger and cannot overfill', async () => {
      await db.exec('reset role');
      await db.query("update reservations set hold_expires_at=now()-interval '1 second' where id=$1",[saved.id]);
      await db.as(ids.b);
      const replacement=await booking(db,{user_id:ids.b});
      assert.notEqual(replacement.id,saved.id);
      await db.as(ids.owner);
      await assert.rejects(db.query('select owner_seat_walk_in($1,$2,5)',[ids.venue,'C01']), /capacity|party|available|free/);
      // A future online booking does not fabricate a walk-in payment.
      const count=(await db.query('select count(*)::int n from reservation_payments')).rows[0].n;
      const visit=(await db.query('select * from owner_seat_walk_in($1,$2,2)',[ids.venue,'C01'])).rows[0];
      assert.equal(visit.status,'checked_in');
      assert.equal((await db.query('select count(*)::int n from reservation_payments')).rows[0].n,count);
      await db.query('select owner_complete_walk_in($1)',[visit.id]);
      await db.query('select owner_mark_table_ready($1,$2)',[ids.venue,'C01']);
    });
    await t.test('private events are visible only to recipient, authorized staff and admin', async () => {
      await db.exec('reset role');
      await db.query("insert into activities(user_id,user_name,type,target_id,spot_id,content) values($1,'Synthetic','reservation_approved',$2,$3,'Synthetic')",[ids.a,saved.id,ids.venue]);
      for(const [id,role,expected] of [[null,'anon',0],[ids.b,'authenticated',0],[ids.other,'authenticated',0],[ids.a,'authenticated',1],[ids.owner,'authenticated',1],[ids.admin,'authenticated',1]]) {
        await db.as(id,db,role);
        assert.equal((await db.query("select count(*)::int n from activities where type='reservation_approved'")).rows[0].n,expected);
      }
    });
    await t.test('unconfirmed and deleting accounts and direct table writes are rejected', async () => {
      await db.exec('reset role');
      await db.query('update auth.users set email_confirmed_at=null where id=$1',[ids.b]);
      await db.as(ids.b); await assert.rejects(booking(db,{user_id:ids.b,reservation_date:'2030-12-04'}),/confirmed/);
      await db.exec('reset role');
      await db.query('update auth.users set email_confirmed_at=now() where id=$1',[ids.b]);
      if (!(await db.query("select to_regclass('public.account_deletion_requests') name")).rows[0].name) await db.exec('create table account_deletion_requests(user_id uuid primary key)');
      await db.query('insert into account_deletion_requests(user_id) values($1)',[ids.b]);
      await db.as(ids.b); await assert.rejects(booking(db,{user_id:ids.b,reservation_date:'2030-12-04'}),/deletion|unavailable/);
      await db.as(ids.a);
      await assert.rejects(db.query("insert into venue_table_states(spot_id,table_id,state) values($1,'FAKE','free')",[ids.venue]),/permission denied/);
      await assert.rejects(db.query("insert into walk_in_visits(spot_id,table_id,party_size,seated_by) values($1,'FAKE',1,$2)",[ids.venue,ids.a]),/permission denied/);
    });
  } finally { await db.close(); }
}
test('focused upgrade on documented older beta fixture', async t => exercise(await previous(),t));
test('focused upgrade on fresh full-chain schema retains stronger account protections', async t => {
  // Before the newly generated migration, which exercise() applies twice.
  const db=await startDatabase({through:'20261031000100_owner_managed_spot_posts.sql'});
  await exercise(db,t);
});
const capture=process.env.RESERVATION_SCHEMA_CAPTURE;
test('focused upgrade on captured hosted public schema with synthetic data only', {skip:!capture}, async t => {
  const document=JSON.parse(fs.readFileSync(capture,'utf8').replace(/^\uFEFF/,''));
  await exercise(await fromCatalog(document.rows[0].catalog),t);
});
