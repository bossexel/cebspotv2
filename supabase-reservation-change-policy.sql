-- Run this migration in the Supabase SQL Editor.
-- Free reservations keep self-service cancellation and date adjustments.
-- Paid reservations enforce the spot's no-cancellation policy.

create or replace function public.cancel_own_free_reservation(
  target_reservation_id uuid,
  cancellation_reason_input text default null
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
    raise exception 'Authentication required to cancel a reservation.' using errcode = '42501';
  end if;

  select *
  into current_reservation
  from public.reservations
  where id = target_reservation_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Reservation not found.' using errcode = 'P0002';
  end if;

  if current_reservation.payment_required or current_reservation.reservation_type = 'paid' then
    raise exception 'This spot does not allow self-service cancellation for this reservation.' using errcode = '42501';
  end if;

  if current_reservation.status in ('cancelled', 'completed', 'no_show') then
    raise exception 'This reservation can no longer be cancelled.';
  end if;

  update public.reservations
  set
    status = 'cancelled',
    payment_status = 'not_required',
    refund_status = 'not_applicable',
    cancellation_reason = nullif(trim(cancellation_reason_input), ''),
    cancelled_at = now(),
    updated_at = now()
  where id = target_reservation_id
  returning * into current_reservation;

  return current_reservation;
end;
$$;

revoke all on function public.cancel_own_free_reservation(uuid, text) from public;
grant execute on function public.cancel_own_free_reservation(uuid, text) to authenticated;

create or replace function public.reschedule_own_free_reservation(
  target_reservation_id uuid,
  reservation_date_input date
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
    raise exception 'Authentication required to adjust a reservation.' using errcode = '42501';
  end if;

  select *
  into current_reservation
  from public.reservations
  where id = target_reservation_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Reservation not found.' using errcode = 'P0002';
  end if;

  if current_reservation.payment_required or current_reservation.reservation_type = 'paid' then
    raise exception 'This spot does not allow self-service adjustments for this reservation.' using errcode = '42501';
  end if;

  if current_reservation.status in ('cancelled', 'completed', 'no_show') then
    raise exception 'This reservation can no longer be adjusted.';
  end if;

  if reservation_date_input < current_date then
    raise exception 'Reservation date cannot be in the past.';
  end if;

  update public.reservations
  set
    reservation_date = reservation_date_input,
    status = 'rescheduled',
    updated_at = now()
  where id = target_reservation_id
  returning * into current_reservation;

  return current_reservation;
end;
$$;

revoke all on function public.reschedule_own_free_reservation(uuid, date) from public;
grant execute on function public.reschedule_own_free_reservation(uuid, date) to authenticated;

notify pgrst, 'reload schema';
