-- CebSpot reservation table locking
-- Run this in Supabase SQL Editor to prevent double-booking the same table/slot/date.

alter table reservations
  add column if not exists reservation_time_start time,
  add column if not exists reservation_time_end time,
  add column if not exists table_id text,
  add column if not exists slot_id text,
  add column if not exists group_size_type text,
  add column if not exists refund_status text not null default 'not_applicable',
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists adjustment_acknowledged boolean not null default false,
  add column if not exists adjustment_acknowledged_at timestamptz;

alter table reservations drop constraint if exists reservations_payment_status_check;
alter table reservations
  add constraint reservations_payment_status_check
  check (payment_status in ('not_required', 'pending', 'paid', 'failed', 'refund_pending', 'refunded', 'non_refundable', 'unpaid', 'on-site'));

alter table reservations drop constraint if exists reservations_refund_status_check;
alter table reservations
  add constraint reservations_refund_status_check
  check (refund_status in ('not_applicable', 'pending_review', 'approved', 'rejected', 'completed'));

create unique index if not exists reservations_active_table_slot_unique_idx
  on reservations(spot_id, reservation_date, slot_id, table_id)
  where slot_id is not null
    and table_id is not null
    and status not in ('cancelled', 'completed', 'no_show');

create or replace function public.check_reservation_slot_available(
  target_spot_id uuid,
  target_reservation_date date,
  target_slot_id text,
  target_table_id text,
  excluded_reservation_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.reservations
    where spot_id = target_spot_id
      and reservation_date = target_reservation_date
      and slot_id = target_slot_id
      and table_id = target_table_id
      and status not in ('cancelled', 'completed', 'no_show')
      and (excluded_reservation_id is null or id <> excluded_reservation_id)
  );
$$;

grant execute on function public.check_reservation_slot_available(uuid, date, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';
