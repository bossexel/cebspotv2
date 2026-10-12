begin;

alter table public.reservations
  add column if not exists hold_expires_at timestamptz,
  add column if not exists proof_submitted_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null;

-- Bound legacy incomplete holds too. A client-supplied future created_at must
-- never turn an old checkout into an indefinite claim on inventory.
update public.reservations set hold_expires_at = least(created_at, now()) + interval '5 minutes'
where payment_required and payment_status in ('pending','unpaid','failed')
  and status in ('pending','pending_payment','rescheduled');

create function public.set_reservation_server_times() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_at := now(); new.updated_at := now();
  new.hold_expires_at := case when new.payment_required then now() + interval '5 minutes' end;
  new.proof_submitted_at := null; new.paid_at := null; new.approved_by := null;
  return new;
end;
$$;
-- Runs after the existing authoritative fee/status insert boundary.
create trigger reservations_zz_server_times before insert on public.reservations
  for each row execute function public.set_reservation_server_times();

revoke update on public.reservations from anon, authenticated;

create or replace function public.reservation_blocks_table(r public.reservations)
returns boolean language sql stable set search_path = '' as $$
  select r.status not in ('cancelled','completed','no_show') and not coalesce(
    r.payment_required and r.payment_status in ('pending','unpaid','failed')
    and r.status in ('pending','pending_payment','rescheduled')
    and coalesce(r.hold_expires_at, r.created_at + interval '5 minutes') <= now(), false);
$$;

create or replace function public.expire_venue_table_holds(target_spot_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.spots where id = target_spot_id for update;
  update public.reservations r set status='cancelled', payment_status='failed', refund_status='not_applicable',
    cancellation_reason='Reservation hold expired without completed payment review.',
    cancelled_at=now(), updated_at=now()
  where r.spot_id=target_spot_id and r.payment_required
    and r.status in ('pending','pending_payment','rescheduled')
    and r.payment_status in ('pending','unpaid','failed')
    and coalesce(r.hold_expires_at,r.created_at+interval '5 minutes') <= now();
  update public.reservation_payments p set status='expired',updated_at=now()
  where p.status='pending' and exists(select 1 from public.reservations r
    where r.id=p.reservation_id and r.spot_id=target_spot_id and r.status='cancelled');
end;
$$;

-- A scheduler can call this with the server role. Readers ignore elapsed holds
-- immediately; the venue lock also makes lazy cleanup safe before a new claim.
create function public.expire_incomplete_reservation_holds() returns void
language plpgsql security definer set search_path = '' as $$
declare venue_id uuid;
begin
  for venue_id in select distinct spot_id from public.reservations
    where payment_required and status in ('pending','pending_payment','rescheduled')
      and payment_status in ('pending','unpaid','failed') and hold_expires_at <= now()
    order by spot_id
  loop perform public.expire_venue_table_holds(venue_id); end loop;
end;
$$;
revoke all on function public.expire_incomplete_reservation_holds() from public,anon,authenticated;
grant execute on function public.expire_incomplete_reservation_holds() to service_role;

create function public.can_read_reservation_proof(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.reservations r where
      object_name ~ ('^' || r.user_id::text || '/' || r.id::text || '/[0-9a-f-]{36}\.(jpg|png|pdf)$')
      and (r.user_id=auth.uid() or (r.payment_proof_url=object_name and (
        public.is_current_user_admin() or exists(select 1 from public.spots s
          where s.id=r.spot_id and (s.owner_id=auth.uid() or exists(
            select 1 from public.owner_spot_access a where a.spot_id=s.id and a.owner_id=auth.uid()))))))
  );
$$;
revoke all on function public.can_read_reservation_proof(text) from public;
grant execute on function public.can_read_reservation_proof(text) to anon,authenticated,service_role;

update storage.buckets set public=false,file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','application/pdf'] where id='payment-proofs';
drop policy if exists payment_proofs_read_related on storage.objects;
drop policy if exists payment_proofs_insert_own on storage.objects;
create policy payment_proofs_read_related on storage.objects for select
  using(bucket_id='payment-proofs' and public.can_read_reservation_proof(name));
create policy payment_proofs_read_guard on storage.objects as restrictive for select
  using(bucket_id<>'payment-proofs' or public.can_read_reservation_proof(name));
-- Only the authenticated server upload endpoint may write validated bytes and
-- metadata. Permissive legacy policies cannot open this bucket for clients.
create policy payment_proofs_insert_guard on storage.objects as restrictive for insert
  with check(bucket_id<>'payment-proofs');
create policy payment_proofs_update_guard on storage.objects as restrictive for update
  using(bucket_id<>'payment-proofs') with check(bucket_id<>'payment-proofs');
create policy payment_proofs_delete_guard on storage.objects as restrictive for delete
  using(bucket_id<>'payment-proofs');

create function public.submit_reservation_payment_proof(
  reservation_id uuid, proof_path text, reference text, payer_number text
) returns public.reservations language plpgsql security definer set search_path = '' as $$
declare r public.reservations%rowtype; venue_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select spot_id into venue_id from public.reservations where id=reservation_id and user_id=auth.uid();
  if venue_id is null then raise exception 'Reservation unavailable.' using errcode='42501'; end if;
  perform 1 from public.spots where id=venue_id for update;
  select * into r from public.reservations where id=reservation_id and user_id=auth.uid() for update;
  if not r.payment_required or r.status not in ('pending_payment','pending','rescheduled')
    or r.payment_status not in ('pending','unpaid','failed')
    or coalesce(r.hold_expires_at,r.created_at+interval '5 minutes') <= now() then
    raise exception 'This reservation is no longer eligible for proof submission.' using errcode='55000';
  end if;
  if r.payment_method is not null and r.payment_method <> 'gcash' then
    raise exception 'An active provider checkout cannot be replaced by manual proof.' using errcode='55000';
  end if;
  if trim(coalesce(reference,'')) !~ '^[A-Za-z0-9][A-Za-z0-9 -]{5,79}$'
    or replace(trim(coalesce(payer_number,'')),' ','') !~ '^(09[0-9]{9}|\+639[0-9]{9})$' then
    raise exception 'Enter a valid payment reference and Philippine mobile number.' using errcode='22023';
  end if;
  if proof_path !~ ('^' || r.user_id::text || '/' || r.id::text || '/[0-9a-f-]{36}\.(jpg|png|pdf)$')
    or not exists(select 1 from storage.objects o where o.bucket_id='payment-proofs' and o.name=proof_path
      and o.metadata->>'mimetype' in ('image/jpeg','image/png','application/pdf')
      and coalesce(o.metadata->>'size','') ~ '^[0-9]{1,7}$'
      and (o.metadata->>'size')::bigint between 1 and 5242880) then
    raise exception 'Upload a validated proof for this reservation first.' using errcode='22023';
  end if;
  update public.reservations set payment_method='gcash',payment_reference=trim(reference),
    payment_proof_url=proof_path,payer_gcash_number=replace(trim(payer_number),' ',''),
    proof_submitted_at=coalesce(r.proof_submitted_at,now()),
    hold_expires_at=coalesce(r.proof_submitted_at,now())+interval '30 minutes',updated_at=now()
    where id=r.id returning * into r;
  return r;
end;
$$;
revoke all on function public.submit_reservation_payment_proof(uuid,text,text,text) from public,anon;
grant execute on function public.submit_reservation_payment_proof(uuid,text,text,text) to authenticated;

create or replace function public.approve_paid_reservation(reservation_id uuid)
returns public.reservations language plpgsql security definer set search_path = '' as $$
declare r public.reservations%rowtype; venue_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select spot_id into venue_id from public.reservations where id=reservation_id;
  if not exists(select 1 from public.spots s where s.id=venue_id and
    (s.owner_id=auth.uid() or public.is_current_user_admin() or exists(
      select 1 from public.owner_spot_access a where a.spot_id=s.id and a.owner_id=auth.uid()))) then
    raise exception 'Only the assigned venue owner or administrator can approve.' using errcode='42501';
  end if;
  perform 1 from public.spots where id=venue_id for update;
  select * into r from public.reservations where id=reservation_id for update;
  if r.payment_status='paid' and r.payment_method='gcash' then return r; end if;
  if not r.payment_required or r.payment_method is distinct from 'gcash'
    or r.proof_submitted_at is null or r.payment_proof_url is null
    or r.status not in ('pending','pending_payment','rescheduled')
    or r.payment_status not in ('pending','unpaid','failed') or r.hold_expires_at <= now() then
    raise exception 'Manual proof is missing, expired, or no longer eligible for approval.' using errcode='55000';
  end if;
  update public.reservations set status='confirmed',payment_status='paid',
    paid_at=coalesce(paid_at,now()),approved_by=auth.uid(),hold_expires_at=null,updated_at=now()
    where id=r.id returning * into r;
  insert into public.activities(user_id,user_name,action,target_id,target_name,type,content,spot_id,spot_name)
    values(r.user_id,'CebSpot','approved your reservation',r.id::text,r.spot_name,'reservation_approved',
      'Your reservation is approved.',r.spot_id,r.spot_name);
  return r;
end;
$$;

commit;
