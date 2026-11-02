-- OPERATOR-ONLY platform setup for the authorized beta project. Not part of
-- timestamped replays. Installs dependencies and a service-only configuration
-- RPC; does NOT schedule a job or embed a token by applying this file.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
-- Attempt defense-in-depth ACL hardening. Hosted extension ownership can prevent
-- this REVOKE; queued headers therefore contain only a short-lived purpose-bound
-- signature, never the reusable worker token. Replay is denied by the claim RPC.
revoke all on table net.http_request_queue from public,anon,authenticated;

create table if not exists public.test_payment_maintenance_minutes (
  epoch_minute bigint primary key,
  claimed_at timestamptz not null default now()
);
alter table public.test_payment_maintenance_minutes enable row level security;
revoke all on table public.test_payment_maintenance_minutes from public,anon,authenticated;
grant select,insert on table public.test_payment_maintenance_minutes to service_role;
create or replace function public.claim_test_payment_maintenance_minute(target_minute bigint)
returns boolean language plpgsql security definer set search_path='' as $claim$
declare inserted integer;
begin
  if target_minute is null or abs(floor(extract(epoch from now())/60)::bigint-target_minute)>1 then return false; end if;
  insert into public.test_payment_maintenance_minutes(epoch_minute) values(target_minute) on conflict do nothing;
  get diagnostics inserted=row_count;
  return inserted=1;
end;
$claim$;
revoke all on function public.claim_test_payment_maintenance_minute(bigint) from public,anon,authenticated;
grant execute on function public.claim_test_payment_maintenance_minute(bigint) to service_role;

create or replace function public.configure_test_payment_maintenance(worker_token text)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare token_id uuid; job_id bigint; existing_jobs integer;
begin
  if worker_token is null or length(worker_token) not between 32 and 256 or worker_token !~ '^[A-Za-z0-9+/=_-]+$' then
    raise exception 'A valid server worker token is required.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('CebSpot test payment maintenance setup'));
  if (select count(*) from vault.decrypted_secrets where name='cebspot_test_payment_worker_token')>1 then
    raise exception 'Duplicate worker Vault configuration.';
  end if;
  select id into token_id from vault.decrypted_secrets where name='cebspot_test_payment_worker_token';
  if token_id is null then
    token_id:=vault.create_secret(worker_token,'cebspot_test_payment_worker_token','CebSpot test-only payment-maintenance worker');
  elsif (select decrypted_secret from vault.decrypted_secrets where id=token_id) is distinct from worker_token then
    perform vault.update_secret(token_id,worker_token);
  end if;
  select count(*) into existing_jobs from cron.job where jobname='cebspot-test-payment-maintenance';
  if existing_jobs>1 then raise exception 'Duplicate maintenance jobs.'; end if;
  job_id:=cron.schedule('cebspot-test-payment-maintenance','* * * * *',$job$
    select net.http_post(
      url:='https://fathkdyxgeeokxeobxqp.supabase.co/functions/v1/payment-maintenance',
      -- pg_net's platform-owned queue can grant PUBLIC table access. Queue a
      -- short-lived, purpose-bound signature, never the reusable worker token.
      -- The worker atomically claims the minute before doing any work.
      headers:=jsonb_build_object('Content-Type','application/json','Authorization',
        'Maintenance-HMAC '||floor(extract(epoch from now())/60)::bigint::text||'.'||
        encode(extensions.hmac(convert_to('cebspot-payment-maintenance:'||floor(extract(epoch from now())/60)::bigint::text,'UTF8'),
          convert_to((select decrypted_secret from vault.decrypted_secrets where name='cebspot_test_payment_worker_token'),'UTF8'),'sha256'),'hex')),
      body:='{}'::jsonb,timeout_milliseconds:=55000);
  $job$);
  if not exists(select 1 from cron.job where jobid=job_id and active and schedule='* * * * *') then
    raise exception 'Maintenance schedule verification failed.';
  end if;
  return jsonb_build_object('scheduled',true,'intervalSeconds',60,'secretStoredInVault',true,'queuedReusableCredential',false);
end;
$function$;
revoke all on function public.configure_test_payment_maintenance(text) from public,anon,authenticated;
grant execute on function public.configure_test_payment_maintenance(text) to service_role;
notify pgrst,'reload schema';
commit;
