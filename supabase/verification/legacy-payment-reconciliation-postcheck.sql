-- Read-only counts and hashes. Includes live-labelled obligations without
-- querying the live payment provider or returning any individual record.
begin read only;
select jsonb_build_object(
  'legacy_rpc_service_only',has_function_privilege('service_role','public.reconcile_legacy_test_checkout(uuid,jsonb)','EXECUTE')
    and not has_function_privilege('anon','public.reconcile_legacy_test_checkout(uuid,jsonb)','EXECUTE')
    and not has_function_privilege('authenticated','public.reconcile_legacy_test_checkout(uuid,jsonb)','EXECUTE'),
  'reservation_count',(select count(*) from public.reservations),
  'payment_count',(select count(*) from public.reservation_payments),
  'payment_status_counts',(select jsonb_object_agg(status,n) from (select status,count(*) n from public.reservation_payments group by status) s),
  'pending_test_count',(select count(*) from public.reservation_payments where status='pending' and coalesce(raw_payload#>'{data,attributes,livemode}',raw_payload#>'{attributes,livemode}',raw_payload->'livemode')='false'::jsonb),
  'reviewed_legacy_test_paid',(select count(*) from public.payment_webhook_events where event_type='legacy_reconciliation' and state='processed' and result='paid_resolution_required'),
  'reviewed_legacy_test_expired',(select count(*) from public.payment_webhook_events where event_type='legacy_reconciliation' and state='processed' and result='expired'),
  'historical_live_payment_count',(select count(*) from public.reservation_payments where coalesce(raw_payload#>'{data,attributes,livemode}',raw_payload#>'{attributes,livemode}',raw_payload->'livemode')='true'::jsonb),
  'historical_live_payments_hash',(select md5(coalesce(string_agg(to_jsonb(p)::text,E'\n' order by p.id),'')) from public.reservation_payments p where coalesce(p.raw_payload#>'{data,attributes,livemode}',p.raw_payload#>'{attributes,livemode}',p.raw_payload->'livemode')='true'::jsonb),
  'historical_live_bookings_hash',(select md5(coalesce(string_agg(to_jsonb(r)::text,E'\n' order by r.id),'')) from public.reservations r where exists(select 1 from public.reservation_payments p where p.reservation_id=r.id and coalesce(p.raw_payload#>'{data,attributes,livemode}',p.raw_payload#>'{attributes,livemode}',p.raw_payload->'livemode')='true'::jsonb)),
  'shared_account_guard_hash',md5(pg_get_functiondef('public.require_active_account()'::regprocedure)),
  'shared_identity_guard_hash',md5(pg_get_functiondef('public.guard_profile_identity()'::regprocedure))
) as reconciliation_postcheck;
rollback;
