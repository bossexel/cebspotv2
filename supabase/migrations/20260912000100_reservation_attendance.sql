-- Run this migration in the Supabase SQL Editor.
-- Owners can record a guest arrival or no-show. No-show reservations stop
-- occupying their table immediately, while checked-in guests keep the table.

alter table public.reservations drop constraint if exists reservations_status_check;
alter table public.reservations
  add constraint reservations_status_check check (
    status in ('pending', 'pending_payment', 'confirmed', 'cancelled', 'rescheduled', 'checked_in', 'completed', 'no_show')
  );

create or replace function public.owner_record_reservation_attendance(
  reservation_id uuid,
  attendance_status text
)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  current_reservation public.reservations%rowtype;
  owner_label text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required to update attendance.' using errcode = '42501';
  end if;

  if attendance_status not in ('checked_in', 'no_show') then
    raise exception 'Attendance status must be checked_in or no_show.';
  end if;

  select *
  into current_reservation
  from public.reservations
  where id = reservation_id
  for update;

  if not found then
    raise exception 'Reservation not found.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.spots
    left join public.owner_spot_access access on access.spot_id = spots.id
    where spots.id = current_reservation.spot_id
      and (spots.owner_id = auth.uid() or access.owner_id = auth.uid())
  ) then
    raise exception 'Only the spot owner can update reservation attendance.' using errcode = '42501';
  end if;

  if current_reservation.status in ('cancelled', 'checked_in', 'completed', 'no_show') then
    raise exception 'Attendance was already resolved for this reservation.';
  end if;

  if current_reservation.payment_required and current_reservation.payment_status <> 'paid' then
    raise exception 'Attendance cannot be recorded before the required payment is confirmed.';
  end if;

  if current_reservation.status not in ('pending', 'confirmed', 'rescheduled') then
    raise exception 'This reservation is not ready for an attendance decision.';
  end if;

  update public.reservations
  set status = attendance_status,
      updated_at = now()
  where id = reservation_id
  returning * into current_reservation;

  select coalesce(nullif(trim(spots.name), ''), 'CebSpot venue')
  into owner_label
  from public.spots
  where spots.id = current_reservation.spot_id;

  insert into public.activities (
    user_id,
    user_name,
    action,
    target_id,
    target_name,
    type,
    content,
    spot_id,
    spot_name
  )
  values (
    current_reservation.user_id,
    owner_label,
    case when attendance_status = 'checked_in' then 'confirmed your arrival' else 'marked your reservation as no show' end,
    current_reservation.id::text,
    current_reservation.spot_name,
    case when attendance_status = 'checked_in' then 'reservation_checked_in' else 'reservation_no_show' end,
    case
      when attendance_status = 'checked_in'
        then current_reservation.spot_name || ' confirmed that you arrived. Your table remains assigned to your reservation.'
      else current_reservation.spot_name || ' marked your reservation as a no-show. The table has been released under the reservation policy.'
    end,
    current_reservation.spot_id,
    current_reservation.spot_name
  );

  return current_reservation;
end;
$$;

revoke all on function public.owner_record_reservation_attendance(uuid, text) from public;
grant execute on function public.owner_record_reservation_attendance(uuid, text) to authenticated;

notify pgrst, 'reload schema';
