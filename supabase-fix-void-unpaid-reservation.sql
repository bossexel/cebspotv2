-- Repair the ambiguous cancellation_reason parameter without changing the RPC API.
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

  select * into current_reservation
  from public.reservations
  where id = target_reservation_id and user_id = auth.uid()
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
    set status = 'cancelled',
        payment_status = 'failed',
        refund_status = 'not_applicable',
        cancellation_reason = coalesce(nullif(trim(void_unpaid_reservation.cancellation_reason), ''), 'Payment was not completed.'),
        cancelled_at = now(),
        updated_at = now()
    where id = target_reservation_id;
  end if;

  update public.reservation_payments
  set status = 'expired', updated_at = now()
  where reservation_id = target_reservation_id and status = 'pending';

  select * into current_reservation
  from public.reservations
  where id = target_reservation_id;
  return current_reservation;
end;
$$;

grant execute on function public.void_unpaid_reservation(uuid, text) to authenticated;
