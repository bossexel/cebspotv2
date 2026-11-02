-- READ ONLY: extension availability and aggregate recovery workload only.
begin read only;
select jsonb_build_object(
  'extensions',(select jsonb_agg(extname order by extname) from pg_extension where extname in ('pg_cron','pg_net','supabase_vault')),
  'payment_status_counts',(select jsonb_object_agg(status,n) from (select status,count(*) n from public.reservation_payments group by status) p),
  'recorded_mode_counts',(select jsonb_agg(to_jsonb(p)) from (
    select status,coalesce(raw_payload#>>'{data,attributes,livemode}',raw_payload#>>'{attributes,livemode}',raw_payload->>'livemode','unknown') as recorded_livemode,count(*) n
    from public.reservation_payments group by status,recorded_livemode order by status,recorded_livemode) p),
  'manual_recovery_rows',(select count(*) from public.reservation_payments where attempt_state in ('creating','reconciliation_required') and (checkout_request is null or created_at<now()-interval '23 hours')),
  'pending_manual_recovery_rows',(select count(*) from public.reservation_payments where status='pending' and attempt_state in ('creating','reconciliation_required') and (checkout_request is null or created_at<now()-interval '23 hours'))
) as worker_preflight;
rollback;
