-- CebSpot PayMongo GCash Checkout support
-- Run this once in Supabase SQL Editor before deploying the PayMongo Edge Functions.

create table if not exists reservation_payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  spot_id uuid references spots(id) on delete set null,
  provider text not null default 'paymongo' check (provider in ('paymongo', 'manual')),
  payment_method text not null default 'gcash',
  provider_checkout_session_id text unique,
  provider_payment_intent_id text unique,
  provider_payment_method_id text,
  provider_payment_id text,
  amount numeric(10, 2) not null,
  currency text not null default 'PHP',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'expired', 'refunded')),
  qr_image_url text,
  checkout_url text,
  expires_at timestamptz,
  paid_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table reservation_payments
  add column if not exists user_id uuid references profiles(id) on delete set null,
  add column if not exists spot_id uuid references spots(id) on delete set null,
  add column if not exists provider text not null default 'paymongo',
  add column if not exists payment_method text not null default 'gcash',
  add column if not exists provider_checkout_session_id text,
  add column if not exists provider_payment_intent_id text unique,
  add column if not exists provider_payment_method_id text,
  add column if not exists provider_payment_id text,
  add column if not exists amount numeric(10, 2) not null default 0,
  add column if not exists currency text not null default 'PHP',
  add column if not exists status text not null default 'pending',
  add column if not exists qr_image_url text,
  add column if not exists checkout_url text,
  add column if not exists expires_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists raw_payload jsonb not null default '{}'::jsonb;

alter table reservation_payments drop constraint if exists reservation_payments_provider_check;
alter table reservation_payments drop constraint if exists reservation_payments_status_check;
alter table reservation_payments
  add constraint reservation_payments_provider_check check (provider in ('paymongo', 'manual')),
  add constraint reservation_payments_status_check check (status in ('pending', 'paid', 'failed', 'expired', 'refunded'));

create index if not exists reservation_payments_reservation_idx on reservation_payments(reservation_id);
create index if not exists reservation_payments_user_idx on reservation_payments(user_id, created_at desc);
create index if not exists reservation_payments_spot_idx on reservation_payments(spot_id, created_at desc);
create unique index if not exists reservation_payments_checkout_session_idx on reservation_payments(provider_checkout_session_id);
create index if not exists reservation_payments_provider_intent_idx on reservation_payments(provider_payment_intent_id);

alter table reservations
  add column if not exists reservation_time_start time,
  add column if not exists reservation_time_end time,
  add column if not exists table_id text,
  add column if not exists slot_id text,
  add column if not exists group_size_type text;

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

alter table reservation_payments enable row level security;

drop policy if exists "reservation_payments_select_own" on reservation_payments;
drop policy if exists "reservation_payments_select_owner" on reservation_payments;

create policy "reservation_payments_select_own"
  on reservation_payments for select
  using (user_id = auth.uid());

create policy "reservation_payments_select_owner"
  on reservation_payments for select
  using (
    exists (
      select 1
      from spots
      left join owner_spot_access access on access.spot_id = spots.id
      where spots.id = reservation_payments.spot_id
        and (spots.owner_id = auth.uid() or access.owner_id = auth.uid())
    )
  );

notify pgrst, 'reload schema';
