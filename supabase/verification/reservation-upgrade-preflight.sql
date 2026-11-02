-- Read-only deployment preflight. Aggregate counts and public venue settings only.
begin read only;
set local statement_timeout='30s';
with capabilities as (select
  to_regclass('public.walk_in_visits') is not null as walk_in_visits,
  to_regclass('public.venue_table_states') is not null as venue_table_states,
  to_regprocedure('public.get_venue_table_availability(uuid,date,text)') is not null as availability_rpc,
  to_regprocedure('public.require_active_account()') is not null as account_guard,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='spots'
    and column_name='reservation_inventory_verified_at') as verified_inventory_column,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='reservations'
    and column_name='hold_expires_at') as hold_expiry_column,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='reservation_payments'
    and column_name='idempotency_key') as payment_idempotency_column,
  (select count(*) from (select provider_payment_id from public.reservation_payments
    where provider_payment_id is not null group by provider_payment_id having count(*)>1) d) as duplicate_provider_payment_groups,
  (select count(*) from public.reservations) as reservation_count,
  (select count(*) from public.reservation_payments) as payment_row_count),
venue as (select
  id='66666666-6666-4666-8666-666666666666'::uuid as matches_android_reservation_scope,
  is_public,is_reservable,owner_id is not null as owner_assigned,
  reservation_type,payment_required,reservation_fee,gcash_amount,
  jsonb_typeof(table_inventory)='object' as inventory_is_object,
  (select count(distinct entry->>'tableId') from jsonb_each(
    case when jsonb_typeof(table_inventory)='object' then table_inventory else '{}'::jsonb end) slots
    cross join lateral jsonb_array_elements(case when jsonb_typeof(slots.value)='array' then slots.value else '[]'::jsonb end) entry
    where slots.key in ('sunset','prime','late') and nullif(entry->>'tableId','') is not null) as distinct_configured_tables
from public.spots
where id='66666666-6666-4666-8666-666666666666'::uuid or lower(trim(name))='ruben shads')
select jsonb_build_object('capabilities',(select to_jsonb(c) from capabilities c),
  'venue',(select jsonb_agg(to_jsonb(v)) from venue v)) as preflight;
rollback;
