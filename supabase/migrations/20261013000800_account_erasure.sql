begin;
-- Jobs deliberately survive Auth removal; contain identifiers/state, never contact data.
create table public.account_deletion_requests(
 user_id uuid primary key,state text not null default 'quiescing' check(state in ('quiescing','cleaning','ready','complete')),
 created_at timestamptz not null default now(),erase_after timestamptz not null default now()+interval '2 minutes',completed_at timestamptz
);
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from anon,authenticated;
grant select on public.account_deletion_requests to authenticated;
grant all on public.account_deletion_requests to service_role;
create policy deletion_read_own on public.account_deletion_requests for select using(user_id=auth.uid());

create function public.account_is_active(customer_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=customer_id)
 and not exists(select 1 from public.account_deletion_requests where user_id=customer_id);
$$;
create function public.account_session_active() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is null or public.account_is_active(auth.uid());
$$;
create function public.require_active_account() returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.account_session_active() then raise exception 'Account deletion in progress or account unavailable.' using errcode='42501'; end if;
end;
$$;
create function public.guard_active_account_write() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform public.require_active_account();
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$$;
-- Restrictive policies protect old JWTs even when a legacy permissive policy exists.
do $$ declare t record; f record; body text; definition text; replacement text;
begin
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r' and c.relrowsecurity and c.relname<>'account_deletion_requests' loop
  execute format('create policy account_active_guard on public.%I as restrictive for all using(public.account_session_active()) with check(public.account_session_active())',t.relname);
  execute format('create trigger zzzz_account_active before insert or update or delete on public.%I for each row execute function public.guard_active_account_write()',t.relname);
 end loop;
 -- Preserve function names/defaults/privileges, including self-qualified parameters.
 -- Definer RPCs bypass RLS, so they need the same guard inside their existing body.
 for f in select p.oid,p.prosrc,l.lanname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  join pg_language l on l.oid=p.prolang where n.nspname='public' and p.prosecdef and p.prokind='f'
  and p.prorettype<>'trigger'::regtype and p.provolatile<>'i' and l.lanname in ('sql','plpgsql')
  and p.proname not in ('account_is_active','account_session_active','require_active_account')
  and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute')) loop
   body:=case when f.lanname='sql' then 'select public.require_active_account();'||chr(10)||f.prosrc
     else 'begin perform public.require_active_account();'||chr(10)||f.prosrc||chr(10)||'end;' end;
   definition:=pg_get_functiondef(f.oid);
   replacement:=replace(definition,'AS $function$'||f.prosrc||'$function$','AS $function$'||body||'$function$');
   if replacement=definition then raise exception 'Unexpected function definition format for %',f.oid::regprocedure; end if;
   execute replacement;
 end loop;
end $$;
create policy account_active_guard on storage.objects as restrictive for all
 using(public.account_session_active()) with check(public.account_session_active());

-- Preserve financial rows while removing the Auth/profile link.
alter table public.reservations alter column user_id drop not null;
alter table public.reservations drop constraint reservations_user_id_fkey;
alter table public.reservations add constraint reservations_user_id_fkey foreign key(user_id) references public.profiles(id) on delete set null;
alter table public.walk_in_visits alter column seated_by drop not null;
alter table public.walk_in_visits drop constraint walk_in_visits_seated_by_fkey;
alter table public.walk_in_visits add constraint walk_in_visits_seated_by_fkey foreign key(seated_by) references public.profiles(id) on delete set null;
alter table public.owner_application_drafts drop constraint owner_application_drafts_requester_id_fkey;
alter table public.owner_application_drafts add constraint owner_application_drafts_requester_id_fkey foreign key(requester_id) references public.profiles(id) on delete cascade;
alter table public.private_upload_admissions drop constraint private_upload_admissions_requester_id_fkey;
alter table public.private_upload_admissions add constraint private_upload_admissions_requester_id_fkey foreign key(requester_id) references public.profiles(id) on delete cascade;

create function public.account_deletion_check(customer_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 -- Same venue-first lock order as reservation/payment transitions. Also covers a
 -- concurrently inserted first reservation that did not exist at the first read.
 perform 1 from public.spots where id='66666666-6666-4666-8666-666666666666' order by id for update;
 perform 1 from public.profiles where id=customer_id for no key update;
 if exists(select 1 from public.profiles where id=customer_id and role='admin')
  or exists(select 1 from public.spots where owner_id=customer_id)
  or exists(select 1 from public.owner_spot_access where owner_id=customer_id) then
   raise exception 'Transfer venue assignments and administrator responsibilities before deleting this account.' using errcode='55000'; end if;
 if exists(select 1 from public.reservations where user_id=customer_id and (status not in ('cancelled','completed','no_show')
  or financial_resolution='resolution_required' or payment_status='refund_pending' or refund_status in ('pending_review','approved'))) then
   raise exception 'Close active bookings and resolve pending payments/refunds before deleting this account.' using errcode='55000'; end if;
 if exists(select 1 from public.reservation_payments p where p.user_id=customer_id and
   (p.attempt_state in ('creating','active','reconciliation_required') or p.status='pending'
    or exists(select 1 from public.payment_session_retirements o where o.attempt_id=p.id and o.state<>'complete')))
  or exists(select 1 from public.payment_webhook_events e join public.reservations r on r.id=e.reservation_id
    where r.user_id=customer_id and e.state<>'processed') then
   raise exception 'Payment reconciliation or session retirement must finish before account deletion.' using errcode='55000'; end if;
end;
$$;
-- Service endpoints also recheck their verified customer, rather than relying
-- on the service JWT (whose auth.uid() is intentionally empty).
do $$ declare f record; definition text; body text;
begin
 for f in select oid,prosrc from pg_proc where oid in
  ('public.claim_private_upload(uuid,text,uuid)'::regprocedure,'public.begin_checkout_attempt(uuid,uuid,text,boolean)'::regprocedure) loop
  body:='begin if not public.account_is_active(customer_id) then raise exception ''Account unavailable.'' using errcode=''42501''; end if;'||chr(10)||f.prosrc||chr(10)||'end;';
  definition:=replace(pg_get_functiondef(f.oid),'AS $function$'||f.prosrc||'$function$','AS $function$'||body||'$function$');
  execute definition;
 end loop;
end $$;
create function public.begin_account_deletion(customer_id uuid) returns public.account_deletion_requests
language plpgsql security definer set search_path='' as $$
declare result public.account_deletion_requests%rowtype; c record; remaining uuid[];
begin
 perform public.account_deletion_check(customer_id);
 if not exists(select 1 from public.profiles where id=customer_id) then raise exception 'Account unavailable.' using errcode='42501'; end if;
 insert into public.account_deletion_requests(user_id) values(customer_id) on conflict(user_id) do nothing;
 update public.circle_location_shares set enabled=false,generation=gen_random_uuid(),latitude=null,longitude=null,updated_at=null where user_id=customer_id;
 for c in select * from public.circles where customer_id=any(members) or owner_id=customer_id order by id for update loop
  select coalesce(array_agg(distinct member order by member),'{}') into remaining from unnest(c.members) member where member<>customer_id;
  if cardinality(remaining)=0 then delete from public.circles where id=c.id;
  else update public.circles set members=remaining,owner_id=case when owner_id=customer_id then remaining[1] else owner_id end,
   invite_code=null,invite_expires_at=null,updated_at=now() where id=c.id; end if;
 end loop;
 select * into result from public.account_deletion_requests where user_id=customer_id;
 return result;
end;
$$;
-- The erasure-only trigger bypass is transaction-local, server-only, and checks
-- the cleared fields. It cannot be used by a client to skip contact validation.
do $$ declare source text;
begin
 select prosrc into source from pg_proc where oid='public.validate_reservation_details()'::regprocedure;
 source:=replace(source,E'begin\n',E'begin\n  if tg_op=''UPDATE'' and auth.role()=''service_role'' and current_setting(''cebspot.account_erasure'',true)=old.user_id::text and new.user_id is null and new.guest_name is null and new.guest_email is null and new.guest_phone is null then return new; end if;\n');
 execute 'create or replace function public.validate_reservation_details() returns trigger language plpgsql security definer set search_path='''' as '||quote_literal(source);
end $$;
create function public.erase_account_personal_data(customer_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare t record; job public.account_deletion_requests%rowtype;
begin
 perform public.account_deletion_check(customer_id);
 select * into job from public.account_deletion_requests where user_id=customer_id for update;
 if not found or job.erase_after>now() then raise exception 'Wait for in-flight requests to finish before retrying deletion.' using errcode='55000'; end if;
 perform set_config('cebspot.account_erasure',customer_id::text,true);
 update public.reservation_payments set user_id=null,raw_payload='{}',checkout_request=null,checkout_url=null,qr_image_url=null,last_error_code=null
   where user_id=customer_id or reservation_id in(select id from public.reservations where user_id=customer_id);
 update public.reservations set user_id=null,guest_name=null,guest_email=null,guest_phone=null,note=null,
   payment_reference=null,payment_proof_url=null,payer_gcash_number=null,qr_code='erased-'||id::text,cancellation_reason=null where user_id=customer_id;
 -- UUID ownership columns are inspected from the authoritative catalog, covering
 -- contributions without foreign keys as well as ordinary cascading relations.
 for t in select c.table_name,c.column_name from information_schema.columns c join pg_class p on p.relname=c.table_name
  join pg_namespace n on n.oid=p.relnamespace and n.nspname=c.table_schema
  where c.table_schema='public' and p.relkind='r' and c.udt_name='uuid'
  and c.column_name in ('user_id','requester_id','submitter_id','reporter_id','asked_by')
  and c.table_name not in ('profiles','reservations','reservation_payments','account_deletion_requests') loop
   execute format('delete from public.%I where %I=$1',t.table_name,t.column_name) using customer_id;
 end loop;
 update public.profiles set friends=array_remove(friends,customer_id) where customer_id=any(friends);
 update public.profiles set first_name=null,last_name=null,display_name='Deleted account',photo_url=null,location=null,last_location_update=null,
   email='deleted-'||customer_id::text||'@invalid.invalid',friends='{}',points=0,total_xp=0 where id=customer_id;
 update public.account_deletion_requests set state='cleaning' where user_id=customer_id and state<>'complete';
 return true;
end;
$$;
create function public.account_deletion_files(customer_id uuid) returns table(bucket_id text,name text)
language sql stable security definer set search_path='' as $$
 select o.bucket_id,o.name from storage.objects o where exists(select 1 from public.account_deletion_requests where user_id=customer_id)
 and (o.owner=customer_id or o.owner_id=customer_id::text or split_part(o.name,'/',1)=customer_id::text) order by o.bucket_id,o.name limit 50;
$$;
create function public.ready_account_deletion(customer_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.account_deletion_requests where user_id=customer_id and state in ('cleaning','ready') and erase_after<=now())
   or exists(select 1 from public.account_deletion_files(customer_id)) then raise exception 'Private file cleanup is not complete.' using errcode='55000'; end if;
 update public.account_deletion_requests set state='ready' where user_id=customer_id;
 return true;
end;
$$;
-- Do not silently erase linked payment history through a manual Auth delete.
create function public.guard_profile_ledger_deletion() returns trigger language plpgsql security definer set search_path='' as $$
declare t record; owned boolean;
begin
 if exists(select 1 from public.account_deletion_requests where user_id=old.id and state='ready') then return old; end if;
 if exists(select 1 from public.circles where old.id=any(members) or owner_id=old.id)
  or exists(select 1 from public.spots where owner_id=old.id)
  or exists(select 1 from public.owner_spot_access where owner_id=old.id)
  or exists(select 1 from storage.objects where owner=old.id or owner_id=old.id::text or split_part(name,'/',1)=old.id::text) then
  raise exception 'Use account deletion cleanup before removing an account with owned data.' using errcode='55000'; end if;
 for t in select c.table_name,c.column_name from information_schema.columns c join pg_class p on p.relname=c.table_name
  join pg_namespace n on n.oid=p.relnamespace and n.nspname=c.table_schema
  where c.table_schema='public' and p.relkind='r' and c.udt_name='uuid'
  and c.column_name in ('user_id','requester_id','submitter_id','reporter_id','asked_by') and c.table_name<>'account_deletion_requests' loop
  execute format('select exists(select 1 from public.%I where %I=$1)',t.table_name,t.column_name) into owned using old.id;
  if owned then raise exception 'Use account deletion cleanup before removing an account with personal or financial rows.' using errcode='55000'; end if;
 end loop;
 -- Empty newly invited accounts may still be rolled back by owner provisioning.
 return old;
end;
$$;
create trigger profiles_preserve_ledger before delete on public.profiles for each row execute function public.guard_profile_ledger_deletion();
revoke all on function public.account_is_active(uuid),public.account_deletion_check(uuid),public.begin_account_deletion(uuid),
 public.erase_account_personal_data(uuid),public.account_deletion_files(uuid),public.ready_account_deletion(uuid),
 public.guard_profile_ledger_deletion(),public.guard_active_account_write() from public,anon,authenticated;
grant execute on function public.account_is_active(uuid),public.account_deletion_check(uuid),public.begin_account_deletion(uuid),
 public.erase_account_personal_data(uuid),public.account_deletion_files(uuid),public.ready_account_deletion(uuid) to service_role;
revoke all on function public.account_session_active(),public.require_active_account() from public;
grant execute on function public.account_session_active(),public.require_active_account() to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
