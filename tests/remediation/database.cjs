const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const platformFixture = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema storage;
  create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}',created_at timestamptz default now(),email_confirmed_at timestamptz);
  create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
  create table storage.buckets(id text primary key,name text,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner uuid,owner_id text,metadata jsonb default '{}',created_at timestamptz default now(),unique(bucket_id,name));
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:greatest(cardinality(string_to_array(name,'/'))-1,0)] $$;
  alter table storage.objects enable row level security;
  create publication supabase_realtime;
  grant usage on schema public,auth,storage to anon,authenticated,service_role;
  grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
  grant all on storage.buckets to service_role;
  alter default privileges in schema public grant select,insert,update,delete on tables to anon,authenticated,service_role;
  alter default privileges in schema public grant usage,select on sequences to anon,authenticated,service_role;
`;
async function startDatabase({ through } = {}) {
  const db = await require('./postgres.cjs').startPostgres(root);
  try {
    await db.exec(platformFixture);
    const migrations = fs.readdirSync(path.join(root,'supabase/migrations')).filter(name=>/^\d{14}_.+\.sql$/.test(name)).sort();
    const manifest=[];
    for (const name of migrations) {
      if (through && name > through) break;
      const bytes=fs.readFileSync(path.join(root,'supabase/migrations',name));
      try { await db.exec(bytes.toString()); } catch(error) { error.message=`${name}: ${error.message}`; throw error; }
      manifest.push({name,sha256:createHash('sha256').update(bytes).digest('hex')});
    }
    db.manifest=manifest;
    db.as = async (id, client=db, role='authenticated') => {
      await client.query('reset role');
      await client.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [id || '',role]);
      await client.query(`set role ${role === 'anon' ? 'anon' : role === 'service_role' ? 'service_role' : 'authenticated'}`);
    };
    return db;
  } catch(error) { await db.close(); throw error; }
}
module.exports={startDatabase,platformFixture};
