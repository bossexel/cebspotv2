-- READ ONLY: capability and policy metadata plus aggregate public availability.
begin read only;
set local statement_timeout='30s';
select jsonb_build_object(
  'walk_in_visits',to_regclass('public.walk_in_visits') is not null,
  'venue_table_states',to_regclass('public.venue_table_states') is not null,
  'availability_rpc',to_regprocedure('public.get_venue_table_availability(uuid,date,text)') is not null,
  'verified_inventory_column',exists(select 1 from information_schema.columns where table_schema='public' and table_name='spots' and column_name='reservation_inventory_verified_at'),
  'hold_expiry_column',exists(select 1 from information_schema.columns where table_schema='public' and table_name='reservations' and column_name='hold_expires_at'),
  'payment_idempotency_column',exists(select 1 from information_schema.columns where table_schema='public' and table_name='reservation_payments' and column_name='idempotency_key'),
  'financial_resolution_column',exists(select 1 from information_schema.columns where table_schema='public' and table_name='reservations' and column_name='financial_resolution'),
  'payment_webhook_events',to_regclass('public.payment_webhook_events') is not null,
  'payment_session_retirements',to_regclass('public.payment_session_retirements') is not null,
  'owner_inventory_confirmation_rpc',to_regprocedure('public.confirm_client_venue_inventory(uuid,jsonb)') is not null,
  'private_upload_rpc',to_regprocedure('public.claim_private_upload(uuid,text,uuid)') is not null,
  'active_account_rpc',to_regprocedure('public.account_is_active(uuid)') is not null,
  'private_event_guard',exists(select 1 from pg_policies where schemaname='public' and tablename='activities' and policyname='activities_private_visibility_guard' and permissive='RESTRICTIVE'),
  'new_tables_have_rls',(select bool_and(relrowsecurity) from pg_class where oid in ('public.walk_in_visits'::regclass,'public.venue_table_states'::regclass,'public.payment_webhook_events'::regclass,'public.payment_session_retirements'::regclass)),
  'walk_in_direct_insert_blocked',not has_table_privilege('authenticated','public.walk_in_visits','INSERT'),
  'table_state_direct_insert_blocked',not has_table_privilege('authenticated','public.venue_table_states','INSERT'),
  'anonymous_availability_execute',has_function_privilege('anon','public.get_venue_table_availability(uuid,date,text)','EXECUTE'),
  'reservation_count',(select count(*) from public.reservations),
  'payment_row_count',(select count(*) from public.reservation_payments),
  'venue_inventory_verified',(select reservation_inventory_verified_at is not null from public.spots where id='66666666-6666-4666-8666-666666666666'),
  'venue_effectively_reservable',public.release_venue_is_reservable('66666666-6666-4666-8666-666666666666'),
  'configured_availability_rows',(select count(*) from public.get_venue_table_availability('66666666-6666-4666-8666-666666666666',current_date+1,'prime')),
  'online_available_rows',(select count(*) from public.get_venue_table_availability('66666666-6666-4666-8666-666666666666',current_date+1,'prime') where online_available),
  'migration_ledger_columns',(select jsonb_agg(column_name order by ordinal_position) from information_schema.columns where table_schema='supabase_migrations' and table_name='schema_migrations')
) as postcheck;
rollback;
