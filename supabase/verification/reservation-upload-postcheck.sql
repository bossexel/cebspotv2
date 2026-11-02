-- Read-only aggregates. Never return uploaded paths, customer records or keys.
begin read only;
set local statement_timeout='30s';
select jsonb_build_object(
  'dependency_tables_present',(select count(*)=3 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('private_upload_admissions','owner_application_drafts','account_deletion_requests') and c.relkind='r'),
  'dependency_tables_rls',(select count(*)=3 and bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('private_upload_admissions','owner_application_drafts','account_deletion_requests') and c.relkind='r'),
  'client_direct_writes_blocked',(select bool_and(not has_table_privilege(r.role_name,'public.'||t.table_name,'INSERT') and not has_table_privilege(r.role_name,'public.'||t.table_name,'UPDATE') and not has_table_privilege(r.role_name,'public.'||t.table_name,'DELETE')) from (values('anon'),('authenticated')) r(role_name) cross join (values('private_upload_admissions'),('owner_application_drafts'),('account_deletion_requests')) t(table_name)),
  'private_rpcs_service_only',(select bool_and(has_function_privilege('service_role',signature,'EXECUTE') and not has_function_privilege('anon',signature,'EXECUTE') and not has_function_privilege('authenticated',signature,'EXECUTE')) from (values('public.claim_private_upload(uuid,text,uuid)'),('public.list_expired_private_uploads(integer)'),('public.account_is_active(uuid)'),('public.get_payment_recovery_batch(integer)')) f(signature)),
  'payment_proofs_private',exists(select 1 from storage.buckets where id='payment-proofs' and not public),
  'recovery_eligible_count',jsonb_array_length(public.get_payment_recovery_batch(5)->'attempts'),
  'legacy_manual_review_count',(public.get_payment_recovery_batch(5)->>'manual_count')::bigint,
  'shared_account_guard_hash',md5(pg_get_functiondef('public.require_active_account()'::regprocedure)),
  'shared_identity_guard_hash',md5(pg_get_functiondef('public.guard_profile_identity()'::regprocedure))
) as postcheck;
rollback;
