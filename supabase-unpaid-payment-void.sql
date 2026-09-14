-- Void unpaid reservations so abandoned payment attempts release their table.

create or replace function public.void_unpaid_reservation(
  target_reservation_id uuid,
  cancellation_reason text default 'Payment was not completed.'
)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  current_reservation public.reservations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required to void a reservation.';
  end if;

  select *
  into current_reservation
  from public.reservations
  where id = target_reservation_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Reservation not found.';
  end if;

  if current_reservation.payment_status = 'paid' then
    raise exception 'A paid reservation cannot be voided.';
  end if;

  if current_reservation.status in ('confirmed', 'completed', 'no_show') then
    raise exception 'This reservation can no longer be voided.';
  end if;

  if current_reservation.status <> 'cancelled' then
    update public.reservations
    set
      status = 'cancelled',
      payment_status = 'failed',
      refund_status = 'not_applicable',
      cancellation_reason = coalesce(nullif(trim(void_unpaid_reservation.cancellation_reason), ''), 'Payment was not completed.'),
      cancelled_at = now(),
      updated_at = now()
    where id = target_reservation_id;
  end if;

  update public.reservation_payments
  set
    status = 'expired',
    updated_at = now()
  where reservation_id = target_reservation_id
    and status = 'pending';

  select *
  into current_reservation
  from public.reservations
  where id = target_reservation_id;

  return current_reservation;
end;
$$;

grant execute on function public.void_unpaid_reservation(uuid, text) to authenticated;

-- Also release abandoned PayMongo holds when availability is checked again.
create or replace function public.check_reservation_slot_available(
  target_spot_id uuid,
  target_reservation_date date,
  target_slot_id text,
  target_table_id text,
  excluded_reservation_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reservations
  set
    status = 'cancelled',
    payment_status = 'failed',
    refund_status = 'not_applicable',
    cancellation_reason = 'PayMongo checkout expired without payment.',
    cancelled_at = now(),
    updated_at = now()
  where status = 'pending_payment'
    and payment_status in ('pending', 'unpaid')
    and payment_method in ('paymongo_gcash', 'paymongo_qrph')
      and created_at < now() - interval '5 minutes';

  update public.reservation_payments
  set
    status = 'expired',
    updated_at = now()
  where reservation_id in (
    select id
    from public.reservations
    where status = 'cancelled'
      and cancellation_reason = 'PayMongo checkout expired without payment.'
      and cancelled_at >= now() - interval '1 minute'
  )
    and status = 'pending';

  return not exists (
    select 1
    from public.reservations
    where spot_id = target_spot_id
      and reservation_date = target_reservation_date
      and slot_id = target_slot_id
      and table_id = target_table_id
      and status not in ('cancelled', 'completed', 'no_show')
      and (excluded_reservation_id is null or id <> excluded_reservation_id)
  );
end;
$$;

grant execute on function public.check_reservation_slot_available(uuid, date, text, text, uuid) to authenticated;
