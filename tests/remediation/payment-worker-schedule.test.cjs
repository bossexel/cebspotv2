const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {createHmac}=require('node:crypto');
const {startDatabase}=require('./database.cjs');
test('manual maintenance installer is idempotent, service-only, preserves records and stores no literal token in cron SQL',async()=>{
  const db=await startDatabase();
  try{
    // The isolated PostgreSQL bundle lacks the hosted platform extensions. Only
    // their catalog/API contracts are stubbed here; real extension execution
    // and scheduled HTTP responses must be verified on the authorized project.
    await db.exec(`create schema vault;create schema cron;create schema net;
      create schema if not exists extensions;
      create function extensions.hmac(value bytea,key bytea,algorithm text) returns bytea language sql as $$ select public.hmac(value,key,algorithm) $$;
      create table vault.decrypted_secrets(id uuid primary key default gen_random_uuid(),name text,decrypted_secret text);
      create function vault.create_secret(value text,secret_name text,description text) returns uuid language sql as $$ insert into vault.decrypted_secrets(name,decrypted_secret) values(secret_name,value) returning id $$;
      create function vault.update_secret(target uuid,value text) returns void language sql as $$ update vault.decrypted_secrets set decrypted_secret=value where id=target $$;
      create table cron.job(jobid bigserial primary key,jobname text unique,schedule text,command text,active boolean default true);
      create function cron.schedule(job_name text,job_schedule text,job_command text) returns bigint language sql as $$ insert into cron.job(jobname,schedule,command) values(job_name,job_schedule,job_command) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid $$;
      create table net.fixture_requests(id bigserial,url text,headers jsonb,body jsonb,timeout_ms integer);
      create table net.http_request_queue(id bigserial,headers jsonb);
      grant all on net.http_request_queue to public,anon,authenticated;
      create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$ insert into net.fixture_requests(url,headers,body,timeout_ms) values(url,headers,body,timeout_milliseconds) returning id $$;`);
    const source=fs.readFileSync('supabase/manual/install-test-payment-maintenance.sql','utf8');
    assert.match(source,/create extension if not exists pg_cron with schema pg_catalog/);assert.match(source,/create extension if not exists pg_net with schema extensions/);
    const sql=source.replace(/^create extension if not exists .+;$/gm,'-- Hosted extension installation is verified separately.');
    const before=(await db.query('select count(*)::int n from reservations')).rows[0].n;
    await db.exec(sql);await db.exec(sql);
    for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_table_privilege($1,'net.http_request_queue','SELECT') allowed",[role])).rows[0].allowed,false);
    assert.equal((await db.query('select count(*)::int n from cron.job')).rows[0].n,0,'Installer scheduled work without explicit configuration');
    for(const role of ['anon','authenticated']){await db.as(null,db,role);await assert.rejects(db.query('select configure_test_payment_maintenance($1)',['synthetic-token-at-least-32-characters']),/permission denied/);}
    await db.as(null,db,'service_role');await assert.rejects(db.query('select configure_test_payment_maintenance($1)',['short']),/valid server worker token/);
    const token='synthetic-worker-token-at-least-32-characters';
    for(let i=0;i<2;i++)assert.equal((await db.query('select configure_test_payment_maintenance($1) result',[token])).rows[0].result.scheduled,true);
    await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from cron.job')).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from vault.decrypted_secrets')).rows[0].n,1);
    const job=(await db.query('select * from cron.job')).rows[0];assert.equal(job.command.includes(token),false);assert.equal(job.schedule,'* * * * *');await db.exec(job.command);
    const request=(await db.query('select * from net.fixture_requests')).rows[0];assert.equal(request.url,'https://fathkdyxgeeokxeobxqp.supabase.co/functions/v1/payment-maintenance');assert.equal(request.headers.Authorization.includes(token),false);const match=/^Maintenance-HMAC (\d+)\.([a-f0-9]{64})$/.exec(request.headers.Authorization);assert.ok(match);assert.equal(match[2],createHmac('sha256',token).update('cebspot-payment-maintenance:'+match[1]).digest('hex'));assert.equal(request.timeout_ms,55000);assert.deepEqual(request.body,{});
    for(const role of ['anon','authenticated']){await db.as(null,db,role);await assert.rejects(db.query('select claim_test_payment_maintenance_minute($1)',[Number(match[1])]),/permission denied/);}
    const clients=await Promise.all([db.connect(),db.connect()]);try{for(const client of clients)await db.as(null,client,'service_role');const claims=await Promise.all(clients.map(client=>client.query('select claim_test_payment_maintenance_minute($1) claimed',[Number(match[1])])));assert.equal(claims.filter(r=>r.rows[0].claimed).length,1);}finally{await Promise.all(clients.map(c=>c.end()));}
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int n from reservations')).rows[0].n,before);
  }finally{await db.close();}
});
