-- Explicit operator reconciliation only. No historical record is changed by
-- applying this migration. Existing strict durable-payment RPCs stay intact.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create or replace function public.reconcile_legacy_test_checkout(target_attempt_id uuid,session_snapshot jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare p public.reservation_payments%rowtype; r public.reservations%rowtype;
  venue_id uuid; attrs jsonb; payment jsonb; paid_count integer; digest text; event_key text;
  event_row public.payment_webhook_events%rowtype; outcome text;
begin
  select spot_id into venue_id from public.reservation_payments where id=target_attempt_id;
  perform 1 from public.spots where id=venue_id for update;
  select r0.* into r from public.reservations r0 join public.reservation_payments p0 on p0.reservation_id=r0.id where p0.id=target_attempt_id for update of r0;
  select * into p from public.reservation_payments where id=target_attempt_id for update;
  attrs:=session_snapshot->'attributes';
  if p.id is null or r.id is null or p.provider<>'paymongo' or p.checkout_request is not null
    or coalesce(p.raw_payload#>'{data,attributes,livemode}',p.raw_payload#>'{attributes,livemode}',p.raw_payload->'livemode') is distinct from 'false'::jsonb
    or p.provider_checkout_session_id is null or p.provider_checkout_session_id !~ '^cs_[A-Za-z0-9_]+$'
    or session_snapshot->>'id' is distinct from p.provider_checkout_session_id
    or session_snapshot->>'type' is distinct from 'checkout_session'
    or attrs->'livemode' is distinct from 'false'::jsonb
    or attrs->>'reference_number' is distinct from p.reservation_id::text
    or attrs#>>'{metadata,reservation_id}' is distinct from p.reservation_id::text
    or (attrs#>>'{metadata,checkout_attempt_id}' is not null and attrs#>>'{metadata,checkout_attempt_id}'<>p.id::text)
    or p.currency<>'PHP' or p.amount<=0
    or jsonb_typeof(attrs->'line_items') is distinct from 'array'
    or jsonb_array_length(attrs->'line_items')<>1
    or attrs#>>'{line_items,0,currency}' is distinct from 'PHP'
    or attrs#>>'{line_items,0,amount}' is distinct from (p.amount*100)::bigint::text
    or attrs#>>'{line_items,0,quantity}' is distinct from '1'
    or jsonb_typeof(attrs->'payments') is distinct from 'array' then
    raise exception 'Legacy test checkout identity or amount mismatch.' using errcode='22023';
  end if;
  if exists(select 1 from public.reservation_payments sibling where sibling.reservation_id=p.reservation_id
    and sibling.id<>p.id and sibling.provider='paymongo'
    and coalesce(sibling.raw_payload#>'{data,attributes,livemode}',sibling.raw_payload#>'{attributes,livemode}',sibling.raw_payload->'livemode') is distinct from 'false'::jsonb) then
    raise exception 'Mixed or unknown payment modes require separate review.' using errcode='22023';
  end if;
  select count(*) into paid_count from jsonb_array_elements(attrs->'payments') v where v#>>'{attributes,status}'='paid';
  if paid_count>1 then raise exception 'Multiple payments require operator review.' using errcode='22023'; end if;
  if paid_count=1 then
    select v into payment from jsonb_array_elements(attrs->'payments') v where v#>>'{attributes,status}'='paid';
    if payment#>'{attributes,livemode}' is distinct from 'false'::jsonb
      or payment#>>'{attributes,currency}' is distinct from 'PHP'
      or payment#>>'{attributes,amount}' is distinct from (p.amount*100)::bigint::text
      or coalesce(payment->>'id','') !~ '^pay_[A-Za-z0-9_]+$'
      or (p.provider_payment_id is not null and p.provider_payment_id<>payment->>'id') then
      raise exception 'Legacy paid transaction mismatch.' using errcode='22023';
    end if;
  elsif attrs->>'status' is distinct from 'expired' then
    raise exception 'Verified terminal provider state required.' using errcode='22023';
  end if;
  digest:=encode(sha256(convert_to(session_snapshot::text,'UTF8')),'hex');
  event_key:='evt_legacy_reconcile_'||replace(p.id::text,'-','')||'_'||substr(digest,1,16);
  event_row:=public.ingest_paymongo_event(event_key,digest,'legacy_reconciliation',p.provider_checkout_session_id,p.id,p.reservation_id);
  if event_row.state='processed' then return event_row.result; end if;
  if p.status='paid' then
    if paid_count=1 and p.provider_payment_id is distinct from payment->>'id' then raise exception 'Paid transaction changed.' using errcode='22023'; end if;
    outcome:='duplicate';
  elsif paid_count=1 then
    update public.reservation_payments set status='paid',attempt_state='complete',
      provider_payment_id=payment->>'id',provider_payment_intent_id=coalesce(payment#>>'{attributes,payment_intent_id}',provider_payment_intent_id),
      paid_at=coalesce(paid_at,now()),lease_expires_at=null,updated_at=now() where id=p.id;
    -- Historical booking capacity is never reopened or silently reassigned.
    update public.reservations set payment_status='refund_pending',refund_status='pending_review',financial_resolution='resolution_required',
      status=case when status in ('pending','pending_payment','rescheduled') then 'cancelled' else status end,
      paid_at=coalesce(paid_at,now()),updated_at=now() where id=r.id;
    outcome:='paid_resolution_required';
  else
    update public.reservation_payments set status='expired',attempt_state='retired',lease_expires_at=null,updated_at=now() where id=p.id;
    outcome:='expired';
  end if;
  update public.payment_webhook_events set state='processed',processed_at=now(),result=outcome where event_id=event_key;
  return outcome;
end;
$$;
revoke all on function public.reconcile_legacy_test_checkout(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.reconcile_legacy_test_checkout(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
