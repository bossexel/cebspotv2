-- Run once in Supabase SQL Editor after the Club branding repair.
-- Adds the bookable floor-plan tables and a privacy-safe availability RPC.

begin;

create or replace function public.get_reserved_table_ids(
  target_spot_id uuid,
  target_reservation_date date,
  target_slot_id text
)
returns text[]
language sql
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct table_id order by table_id), '{}'::text[])
  from public.reservations
  where spot_id = target_spot_id
    and reservation_date = target_reservation_date
    and slot_id = target_slot_id
    and table_id is not null
    and status not in ('cancelled', 'completed', 'no_show')
    and not (
      status = 'pending_payment'
      and payment_status in ('pending', 'unpaid')
      and payment_method in ('paymongo_gcash', 'paymongo_qrph')
        and created_at < now() - interval '5 minutes'
    );
$$;

revoke all on function public.get_reserved_table_ids(uuid, date, text) from public;
grant execute on function public.get_reserved_table_ids(uuid, date, text) to anon, authenticated;

with club_tables as (
  select jsonb_agg(
    jsonb_build_object(
      'tableId', table_id,
      'capacity', capacity,
      'isReserved', false
    )
    order by display_order
  ) as inventory
  from (
    select 'C' || lpad(number::text, 2, '0') as table_id, 4 as capacity, number as display_order
    from generate_series(1, 42) as number
    union all
    select 'VVIP' || lpad(number::text, 2, '0'), 10, 100 + number
    from generate_series(1, 4) as number
    union all
    select 'VIP' || lpad(number::text, 2, '0'), 10, 200 + number
    from generate_series(5, 20) as number
  ) tables
)
update public.spots
set
  table_inventory = jsonb_build_object(
    'sunset', club_tables.inventory,
    'prime', club_tables.inventory,
    'late', club_tables.inventory
  ),
  updated_at = now()
from club_tables
where id = '66666666-6666-4666-8666-666666666666';

notify pgrst, 'reload schema';

commit;
