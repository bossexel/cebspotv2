-- Run once in Supabase SQL Editor.
-- Stores the guest details and payment-term acceptance shown during checkout.

begin;

alter table public.reservations
  add column if not exists guest_name text,
  add column if not exists guest_email text,
  add column if not exists guest_phone text,
  add column if not exists payment_terms_accepted boolean not null default false,
  add column if not exists payment_terms_accepted_at timestamptz;

update public.reservations reservation
set
  guest_name = coalesce(
    reservation.guest_name,
    nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
    nullif(trim(profile.display_name), ''),
    split_part(profile.email, '@', 1)
  ),
  guest_email = coalesce(reservation.guest_email, profile.email)
from public.profiles profile
where profile.id = reservation.user_id
  and (reservation.guest_name is null or reservation.guest_email is null);

create or replace function public.enforce_paid_reservation_checkout_details()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.payment_required then
    if not coalesce(new.payment_terms_accepted, false) then
      raise exception 'Deposit terms must be accepted before creating a paid reservation.';
    end if;
    if nullif(trim(coalesce(new.guest_name, '')), '') is null
      or nullif(trim(coalesce(new.guest_email, '')), '') is null
      or nullif(trim(coalesce(new.guest_phone, '')), '') is null then
      raise exception 'Guest name, email, and phone are required for paid reservations.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_require_checkout_details on public.reservations;
create trigger reservations_require_checkout_details
  before insert or update of payment_required, payment_terms_accepted on public.reservations
  for each row execute function public.enforce_paid_reservation_checkout_details();

-- Align abandoned PayMongo table release with the five-minute table hold.
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
  set status = 'expired', updated_at = now()
  where reservation_id in (
    select id from public.reservations
    where status = 'cancelled'
      and cancellation_reason = 'PayMongo checkout expired without payment.'
      and cancelled_at >= now() - interval '1 minute'
  )
    and status = 'pending';

  return not exists (
    select 1 from public.reservations
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

notify pgrst, 'reload schema';

commit;
