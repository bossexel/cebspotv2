-- Aggregate monitoring only. No token, signature, provider ID or response body.
begin read only;
select jsonb_build_object(
  'cron_installed',exists(select 1 from pg_extension where extname='pg_cron'),
  'net_installed',exists(select 1 from pg_extension where extname='pg_net'),
  'active_minute_jobs',(select count(*) from cron.job where jobname='cebspot-test-payment-maintenance' and active and schedule='* * * * *'),
  'cron_successes',(select count(*) from cron.job_run_details d join cron.job j using(jobid) where j.jobname='cebspot-test-payment-maintenance' and d.status='succeeded' and d.start_time>now()-interval '15 minutes'),
  'cron_failures',(select count(*) from cron.job_run_details d join cron.job j using(jobid) where j.jobname='cebspot-test-payment-maintenance' and d.status='failed' and d.start_time>now()-interval '15 minutes'),
  'claimed_minutes',(select count(*) from public.test_payment_maintenance_minutes where claimed_at>now()-interval '15 minutes'),
  'successful_worker_responses',(select count(*) from net._http_response where created>now()-interval '15 minutes' and status_code=200 and not timed_out and case when content is json then content::jsonb->'ok'='true'::jsonb else false end),
  'failed_http_responses',(select count(*) from net._http_response where created>now()-interval '15 minutes' and (status_code is distinct from 200 or timed_out or error_msg is not null)),
  'queued_reusable_credentials',(select count(*) from net.http_request_queue where url='https://fathkdyxgeeokxeobxqp.supabase.co/functions/v1/payment-maintenance' and coalesce(headers->>'Authorization','') not similar to 'Maintenance-HMAC [0-9]+\.[a-f0-9]{64}'),
  'vault_secret_exists',(select count(*)=1 from vault.decrypted_secrets where name='cebspot_test_payment_worker_token'),
  'vault_client_reads_blocked',not has_table_privilege('anon','vault.decrypted_secrets','SELECT') and not has_table_privilege('authenticated','vault.decrypted_secrets','SELECT'),
  'minute_table_rls',(select relrowsecurity from pg_class where oid='public.test_payment_maintenance_minutes'::regclass),
  'minute_claim_client_denied',not has_function_privilege('anon','public.claim_test_payment_maintenance_minute(bigint)','EXECUTE') and not has_function_privilege('authenticated','public.claim_test_payment_maintenance_minute(bigint)','EXECUTE'),
  'configure_client_denied',not has_function_privilege('anon','public.configure_test_payment_maintenance(text)','EXECUTE') and not has_function_privilege('authenticated','public.configure_test_payment_maintenance(text)','EXECUTE'),
  'manual_recovery_count',(select (public.get_payment_recovery_batch(5)->>'manual_count')::int),
  'retirement_backlog',(select count(*) from public.payment_session_retirements where state in ('pending','working'))
) as maintenance_postcheck;
rollback;
