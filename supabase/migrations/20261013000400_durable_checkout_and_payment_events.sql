begin;
alter table public.reservation_payments
  add column idempotency_key uuid not null default gen_random_uuid(),
  add column checkout_request jsonb,
  add column attempt_state text not null default 'active'
    check(attempt_state in ('creating','active','reconciliation_required','retiring','retired','complete')),
  add column lease_expires_at timestamptz,
  add column last_error_code text;
alter table public.reservations add column financial_resolution text
  check(financial_resolution in ('resolution_required','resolved'));
create unique index reservation_payments_idempotency_key on public.reservation_payments(idempotency_key);
create unique index reservation_payments_unique_provider_payment on public.reservation_payments(provider_payment_id)
  where provider_payment_id is not null;
-- Existing ambiguous duplicates are retained for reconciliation, never deleted.
update public.reservation_payments set attempt_state='reconciliation_required'
  where status='pending';
create unique index reservation_payments_one_active_attempt on public.reservation_payments(reservation_id)
  where status='pending' and attempt_state in ('creating','active');

create table public.payment_session_retirements(
  attempt_id uuid primary key references public.reservation_payments(id),
  session_id text not null, state text not null default 'pending' check(state in ('pending','working','complete')),
  tries integer not null default 0, available_at timestamptz not null default now(),
  lease_expires_at timestamptz, completed_at timestamptz, last_error_code text
);
create table public.payment_webhook_events(
  event_id text primary key, payload_sha256 text not null, event_type text not null,
  session_id text, attempt_id uuid, reservation_id uuid,
  state text not null default 'pending' check(state in ('pending','processed','rejected')),
  received_at timestamptz not null default now(), processed_at timestamptz, result text
);
alter table public.payment_session_retirements enable row level security;
alter table public.payment_webhook_events enable row level security;
revoke all on public.payment_session_retirements,public.payment_webhook_events from anon,authenticated;
revoke insert,update,delete on public.reservation_payments from anon,authenticated;
grant all on public.payment_session_retirements,public.payment_webhook_events to service_role;

create function public.queue_checkout_retirement() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status in ('cancelled','completed','no_show') or new.payment_status='paid' then
    insert into public.payment_session_retirements(attempt_id,session_id)
      select p.id,p.provider_checkout_session_id from public.reservation_payments p
      where p.reservation_id=new.id and p.provider_checkout_session_id is not null
        and p.status <> 'paid' and p.attempt_state <> 'retired'
      on conflict(attempt_id) do nothing;
    update public.reservation_payments set status='expired',
      attempt_state=case when provider_checkout_session_id is null then 'reconciliation_required' else 'retiring' end,
      updated_at=now() where reservation_id=new.id and status='pending';
  end if;
  return new;
end;
$$;
create trigger reservations_queue_checkout_retirement after update of status,payment_status on public.reservations
  for each row execute function public.queue_checkout_retirement();

create function public.begin_checkout_attempt(target_reservation_id uuid,customer_id uuid,method text,replace_active boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.reservations%rowtype; p public.reservation_payments%rowtype; venue_id uuid;
begin
  if method not in ('gcash','qrph') then raise exception 'Invalid checkout method.' using errcode='22023'; end if;
  select spot_id into venue_id from public.reservations where id=target_reservation_id and user_id=customer_id;
  if venue_id is null then raise exception 'Reservation not found.' using errcode='42501'; end if;
  perform 1 from public.spots where id=venue_id for update;
  select * into r from public.reservations where id=target_reservation_id for update;
  if not public.release_venue_is_reservable(r.spot_id) or not r.payment_required or r.reservation_fee < 1
    or r.payment_status not in ('pending','unpaid','failed')
    or r.status not in ('pending_payment','pending','rescheduled')
    or coalesce(r.hold_expires_at,r.created_at+interval '5 minutes') <= now()
    or r.payment_method='gcash' then
    raise exception 'This reservation cannot accept provider checkout.' using errcode='55000';
  end if;
  if nullif(trim(r.guest_name),'') is null or nullif(trim(r.guest_email),'') is null
    or nullif(trim(r.guest_phone),'') is null then raise exception 'Saved contact details are required.'; end if;
  if exists(select 1 from public.reservation_payments where reservation_id=r.id
      and attempt_state in ('retiring','reconciliation_required') and status <> 'pending') then
    return jsonb_build_object('action','reconcile');
  end if;
  select * into p from public.reservation_payments where reservation_id=r.id and status='pending'
    order by created_at desc,id limit 1 for update;
  if found then
    if p.payment_method <> method or replace_active then
      if p.provider_checkout_session_id is null then
        return jsonb_build_object('action','reconcile','attempt',to_jsonb(p));
      end if;
      insert into public.payment_session_retirements(attempt_id,session_id) values(p.id,p.provider_checkout_session_id)
        on conflict(attempt_id) do nothing;
      update public.reservation_payments set status='expired',attempt_state='retiring',updated_at=now() where id=p.id;
      return jsonb_build_object('action','retire','attempt',to_jsonb(p));
    end if;
    if p.attempt_state='active' and p.checkout_url is not null then
      return jsonb_build_object('action','reuse','attempt',to_jsonb(p));
    end if;
    if p.lease_expires_at > now() then return jsonb_build_object('action','busy','attempt',to_jsonb(p)); end if;
    if p.checkout_request is null and p.attempt_state='reconciliation_required' then
      return jsonb_build_object('action','reconcile','attempt',to_jsonb(p));
    end if;
    update public.reservation_payments set attempt_state='creating',lease_expires_at=now()+interval '30 seconds',updated_at=now()
      where id=p.id returning * into p;
  else
    insert into public.reservation_payments(reservation_id,user_id,spot_id,payment_method,amount,currency,status,attempt_state,lease_expires_at,expires_at)
      values(r.id,r.user_id,r.spot_id,method,r.reservation_fee,'PHP','pending','creating',now()+interval '30 seconds',r.hold_expires_at)
      returning * into p;
    update public.reservations set payment_method='paymongo_'||method,updated_at=now() where id=r.id;
  end if;
  return jsonb_build_object('action','create','attempt',to_jsonb(p),'reservation',to_jsonb(r));
end;
$$;

create function public.prepare_checkout_request(target_attempt_id uuid,request_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.reservation_payments%rowtype; attrs jsonb;
begin
  select * into p from public.reservation_payments where id=target_attempt_id for update;
  if not found then raise exception 'Attempt not found.'; end if;
  if p.checkout_request is not null then return p.checkout_request; end if;
  attrs:=request_payload#>'{data,attributes}';
  if attrs->>'reference_number' is distinct from p.reservation_id::text
    or attrs#>>'{metadata,checkout_attempt_id}' is distinct from p.id::text
    or attrs#>>'{metadata,reservation_id}' is distinct from p.reservation_id::text
    or attrs#>>'{line_items,0,currency}' is distinct from 'PHP'
    or attrs#>>'{line_items,0,amount}' is distinct from (p.amount*100)::bigint::text
    or attrs#>>'{line_items,0,quantity}' is distinct from '1'
    or jsonb_array_length(attrs->'line_items') <> 1 then raise exception 'Checkout request does not match durable attempt.'; end if;
  update public.reservation_payments set checkout_request=request_payload where id=p.id;
  return request_payload;
end;
$$;

create function public.record_checkout_session(target_attempt_id uuid,session_snapshot jsonb)
returns public.reservation_payments language plpgsql security definer set search_path='' as $$
declare p public.reservation_payments%rowtype; r public.reservations%rowtype; venue_id uuid; attrs jsonb; sid text;
begin
  select spot_id into venue_id from public.reservation_payments where id=target_attempt_id;
  perform 1 from public.spots where id=venue_id for update;
  select r0.* into r from public.reservations r0 join public.reservation_payments p0 on p0.reservation_id=r0.id where p0.id=target_attempt_id for update of r0;
  select * into p from public.reservation_payments where id=target_attempt_id for update;
  if not found then raise exception 'Attempt not found.'; end if;
  attrs:=session_snapshot->'attributes';sid:=session_snapshot->>'id';
  if coalesce(sid,'') !~ '^cs_[A-Za-z0-9_]+$' or attrs->'livemode' is distinct from 'false'::jsonb
    or attrs->>'reference_number' is distinct from p.reservation_id::text
    or attrs#>>'{metadata,checkout_attempt_id}' is distinct from p.id::text
    or attrs#>>'{metadata,reservation_id}' is distinct from p.reservation_id::text
    or attrs#>>'{line_items,0,currency}' is distinct from 'PHP'
    or attrs#>>'{line_items,0,amount}' is distinct from (p.amount*100)::bigint::text
    or attrs#>>'{line_items,0,quantity}' is distinct from '1'
    or jsonb_array_length(attrs->'line_items') <> 1
    or coalesce(attrs->>'checkout_url','') !~ '^https://checkout\.paymongo\.com/' then
    raise exception 'Provider session does not match test-mode checkout attempt.' using errcode='22023';
  end if;
  if p.provider_checkout_session_id is not null and p.provider_checkout_session_id <> sid then
    raise exception 'Attempt already has a different provider session.'; end if;
  update public.reservation_payments set provider_checkout_session_id=sid,checkout_url=attrs->>'checkout_url',
    attempt_state=case when p.status='paid' then 'complete'
      when r.status in ('cancelled','completed','no_show') or r.payment_status='paid' or r.hold_expires_at <= now() or p.status='expired' then 'retiring'
      else 'active' end,lease_expires_at=null,updated_at=now() where id=p.id returning * into p;
  if p.attempt_state='retiring' then
    insert into public.payment_session_retirements(attempt_id,session_id) values(p.id,sid) on conflict(attempt_id) do nothing;
  else
    update public.reservations set payment_reference=sid,updated_at=now() where id=r.id and payment_status<>'paid';
  end if;
  return p;
end;
$$;

create function public.ingest_paymongo_event(incoming_event_id text,payload_hash text,incoming_type text,
  incoming_session_id text,incoming_attempt_id uuid,incoming_reservation_id uuid)
returns public.payment_webhook_events language plpgsql security definer set search_path='' as $$
declare e public.payment_webhook_events%rowtype;
begin
  if incoming_event_id !~ '^evt_[A-Za-z0-9_]{1,150}$' or payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid event identity.' using errcode='22023'; end if;
  insert into public.payment_webhook_events(event_id,payload_sha256,event_type,session_id,attempt_id,reservation_id)
    values(incoming_event_id,payload_hash,incoming_type,incoming_session_id,incoming_attempt_id,incoming_reservation_id)
    on conflict(event_id) do nothing;
  select * into e from public.payment_webhook_events where event_id=incoming_event_id;
  if e.payload_sha256 <> payload_hash then raise exception 'Event identity was reused with different content.' using errcode='22023'; end if;
  return e;
end;
$$;

create function public.apply_paymongo_snapshot(incoming_event_id text,target_attempt_id uuid,session_snapshot jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare p public.reservation_payments%rowtype; r public.reservations%rowtype; e public.payment_webhook_events%rowtype;
  attrs jsonb; payment jsonb; paid_count int; venue_id uuid; late boolean; outcome text;
begin
  -- All payment, cancellation, inventory and approval writers take venue first.
  select spot_id into venue_id from public.reservation_payments where id=target_attempt_id;
  perform 1 from public.spots where id=venue_id for update;
  select r0.* into r from public.reservations r0 join public.reservation_payments p0 on p0.reservation_id=r0.id where p0.id=target_attempt_id for update of r0;
  select * into p from public.reservation_payments where id=target_attempt_id for update;
  select * into e from public.payment_webhook_events where event_id=incoming_event_id for update;
  if e.event_id is null or p.id is null then raise exception 'Event or attempt unavailable.'; end if;
  if e.state <> 'pending' then return e.result; end if;
  if (e.attempt_id is not null and e.attempt_id <> p.id)
    or (e.reservation_id is not null and e.reservation_id <> p.reservation_id)
    or e.session_id is distinct from session_snapshot->>'id' then raise exception 'Event reference mismatch.' using errcode='22023'; end if;
  perform public.record_checkout_session(p.id,session_snapshot);
  attrs:=session_snapshot->'attributes';
  select count(*) into paid_count from jsonb_array_elements(coalesce(attrs->'payments','[]')) value where value#>>'{attributes,status}'='paid';
  if paid_count>1 then raise exception 'Multiple paid transactions require financial reconciliation.' using errcode='22023'; end if;
  if paid_count=1 then
    select value into payment from jsonb_array_elements(attrs->'payments') value where value#>>'{attributes,status}'='paid';
    if payment#>>'{attributes,currency}' is distinct from 'PHP'
      or payment#>>'{attributes,amount}' is distinct from (p.amount*100)::bigint::text
      or coalesce(payment->>'id','') !~ '^pay_[A-Za-z0-9_]+$'
      or payment#>'{attributes,livemode}' is distinct from 'false'::jsonb then
      raise exception 'Paid amount, currency, mode or payment reference mismatch.' using errcode='22023'; end if;
    if p.status='paid' then
      if p.provider_payment_id is distinct from payment->>'id' then raise exception 'Attempt has another paid transaction.'; end if;
      outcome:='duplicate';
    else
      late:=r.status in ('cancelled','completed','no_show') or r.payment_status='paid' or p.status='expired'
        or p.attempt_state in ('retiring','retired') or coalesce(r.hold_expires_at,r.created_at+interval '5 minutes')<=now();
      update public.reservation_payments set status='paid',attempt_state='complete',provider_payment_id=payment->>'id',
        provider_payment_intent_id=payment#>>'{attributes,payment_intent_id}',paid_at=coalesce(paid_at,now()),updated_at=now()
        where id=p.id;
      if late then
        update public.reservations set payment_status='refund_pending',refund_status='pending_review',
          status=case when status in ('pending','pending_payment','rescheduled') then 'cancelled' else status end,
          financial_resolution='resolution_required',paid_at=coalesce(paid_at,now()),updated_at=now() where id=r.id;
        outcome:='resolution_required';
      else
        update public.reservations set status='confirmed',payment_status='paid',payment_reference=payment->>'id',
          paid_at=coalesce(paid_at,now()),hold_expires_at=null,updated_at=now() where id=r.id;
        insert into public.activities(user_id,user_name,action,target_id,target_name,type,content,spot_id,spot_name)
          values(r.user_id,'CebSpot','received your payment',r.id::text,r.spot_name,'payment_received','Reservation payment received.',r.spot_id,r.spot_name);
        outcome:='paid';
      end if;
    end if;
  elsif attrs->>'status'='expired' and p.status <> 'paid' then
    update public.reservation_payments set status='expired',attempt_state='retired',updated_at=now() where id=p.id;
    outcome:='expired';
  else outcome:='unchanged'; end if;
  update public.payment_webhook_events set state='processed',processed_at=now(),result=outcome where event_id=e.event_id;
  return outcome;
end;
$$;

create function public.claim_payment_retirements(batch_size integer default 10)
returns setof public.payment_session_retirements language sql security definer set search_path='' as $$
  update public.payment_session_retirements set state='working',tries=tries+1,lease_expires_at=now()+interval '60 seconds'
  where attempt_id in (select attempt_id from public.payment_session_retirements
    where state<>'complete' and available_at<=now() and (lease_expires_at is null or lease_expires_at<=now())
    order by available_at for update skip locked limit least(greatest(batch_size,1),10)) returning *;
$$;
create function public.finish_payment_retirement(target_attempt_id uuid,succeeded boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.payment_session_retirements set state=case when succeeded then 'complete' else 'pending' end,
    lease_expires_at=null,completed_at=case when succeeded then now() end,
    available_at=now()+least(3600,30*power(2,least(tries,7))) * interval '1 second',
    last_error_code=case when succeeded then null else 'provider_unavailable' end where attempt_id=target_attempt_id;
  if succeeded then update public.reservation_payments set attempt_state='retired',status='expired',updated_at=now()
    where id=target_attempt_id and status<>'paid'; end if;
end;
$$;

-- These RPCs accept server-authenticated identities and provider snapshots.
-- None is an authorization surface for an ordinary customer or administrator JWT.
revoke all on function public.begin_checkout_attempt(uuid,uuid,text,boolean),public.prepare_checkout_request(uuid,jsonb),
  public.record_checkout_session(uuid,jsonb),public.ingest_paymongo_event(text,text,text,text,uuid,uuid),
  public.apply_paymongo_snapshot(text,uuid,jsonb),public.claim_payment_retirements(integer),
  public.finish_payment_retirement(uuid,boolean) from public,anon,authenticated;
grant execute on function public.begin_checkout_attempt(uuid,uuid,text,boolean),public.prepare_checkout_request(uuid,jsonb),
  public.record_checkout_session(uuid,jsonb),public.ingest_paymongo_event(text,text,text,text,uuid,uuid),
  public.apply_paymongo_snapshot(text,uuid,jsonb),public.claim_payment_retirements(integer),
  public.finish_payment_retirement(uuid,boolean) to service_role;
-- Preserve existing customer/owner behavior while fixing the old inverse
-- reservation-then-venue lock order, including cancellation/webhook races.
create function public.lock_related_reservation_venue(target_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare venue_id uuid;
begin
  select r.spot_id into venue_id from public.reservations r join public.spots s on s.id=r.spot_id
    where r.id=target_id and auth.uid() is not null and (r.user_id=auth.uid() or s.owner_id=auth.uid()
      or public.is_current_user_admin() or exists(select 1 from public.owner_spot_access a where a.spot_id=s.id and a.owner_id=auth.uid()));
  if venue_id is null then raise exception 'Reservation unavailable.' using errcode='42501'; end if;
  perform 1 from public.spots where id=venue_id for update;
end;
$$;
revoke all on function public.lock_related_reservation_venue(uuid) from public,anon,authenticated;
alter function public.void_unpaid_reservation(uuid,text) rename to void_unpaid_reservation_internal;
alter function public.cancel_own_free_reservation(uuid,text) rename to cancel_own_free_reservation_internal;
alter function public.reschedule_own_free_reservation(uuid,date) rename to reschedule_own_free_reservation_internal;
alter function public.owner_record_reservation_attendance(uuid,text) rename to owner_record_reservation_attendance_internal;
-- The archived void function qualifies its argument with its old function
-- name; explicitly replace that body after renaming so cancellation still works.
create or replace function public.void_unpaid_reservation_internal(target_reservation_id uuid,cancellation_reason text default 'Payment was not completed.')
returns public.reservations language plpgsql security definer set search_path='' as $$
declare r public.reservations%rowtype;
begin
  select * into r from public.reservations where id=target_reservation_id and user_id=auth.uid() for update;
  if not found then raise exception 'Reservation not found.' using errcode='42501'; end if;
  if r.payment_status='paid' or r.status in ('confirmed','completed','no_show','checked_in') then
    raise exception 'This reservation can no longer be voided.'; end if;
  if r.status<>'cancelled' then
    update public.reservations set status='cancelled',payment_status='failed',refund_status='not_applicable',
      cancellation_reason=coalesce(nullif(trim($2),''),'Payment was not completed.'),cancelled_at=now(),updated_at=now()
      where id=r.id returning * into r;
  end if;
  return r;
end;
$$;
revoke all on function public.void_unpaid_reservation_internal(uuid,text),public.cancel_own_free_reservation_internal(uuid,text),
  public.reschedule_own_free_reservation_internal(uuid,date),public.owner_record_reservation_attendance_internal(uuid,text) from public,anon,authenticated;
create function public.void_unpaid_reservation(target_reservation_id uuid,cancellation_reason text default 'Payment was not completed.')
returns public.reservations language plpgsql security definer set search_path='' as $$
begin
  perform public.lock_related_reservation_venue(target_reservation_id);
  if exists(select 1 from public.reservations where id=target_reservation_id
    and (payment_status in ('paid','refund_pending','refunded','non_refundable') or financial_resolution='resolution_required')) then
    raise exception 'A paid or unresolved payment cannot be voided.'; end if;
  return public.void_unpaid_reservation_internal(target_reservation_id,cancellation_reason);
end;
$$;
create function public.cancel_own_free_reservation(target_reservation_id uuid,cancellation_reason_input text default null)
returns public.reservations language plpgsql security definer set search_path='' as $$
begin perform public.lock_related_reservation_venue(target_reservation_id);
  return public.cancel_own_free_reservation_internal(target_reservation_id,cancellation_reason_input); end;
$$;
create function public.reschedule_own_free_reservation(target_reservation_id uuid,reservation_date_input date)
returns public.reservations language plpgsql security definer set search_path='' as $$
begin perform public.lock_related_reservation_venue(target_reservation_id);
  return public.reschedule_own_free_reservation_internal(target_reservation_id,reservation_date_input); end;
$$;
create function public.owner_record_reservation_attendance(reservation_id uuid,attendance_status text)
returns public.reservations language plpgsql security definer set search_path='' as $$
begin perform public.lock_related_reservation_venue(reservation_id);
  return public.owner_record_reservation_attendance_internal(reservation_id,attendance_status); end;
$$;
revoke all on function public.void_unpaid_reservation(uuid,text),public.cancel_own_free_reservation(uuid,text),
  public.reschedule_own_free_reservation(uuid,date),public.owner_record_reservation_attendance(uuid,text) from public,anon;
grant execute on function public.void_unpaid_reservation(uuid,text),public.cancel_own_free_reservation(uuid,text),
  public.reschedule_own_free_reservation(uuid,date),public.owner_record_reservation_attendance(uuid,text) to authenticated;
commit;
