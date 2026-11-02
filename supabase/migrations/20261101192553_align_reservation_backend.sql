-- GENERATED: node scripts/build-reservation-upgrade.cjs
-- Read docs/reservation-schema-upgrade.md before application.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
-- No foundation replay, business-row backfill, fixture inventory or history repair.
do $preflight$
declare prerequisite text;
begin
  foreach prerequisite in array array['public.spots','public.profiles','public.reservations',
    'public.reservation_payments','public.activities','public.owner_spot_access','public.spot_submissions'] loop
    if to_regclass(prerequisite) is null then raise exception 'Missing prerequisite: %',prerequisite; end if;
  end loop;
  if to_regprocedure('public.require_active_account()') is null
    or to_regprocedure('public.guard_profile_identity()') is null
    or to_regprocedure('public.is_current_user_admin()') is null then
    raise exception 'Existing identity prerequisites must be installed and reviewed first.';
  end if;
  if exists(select 1 from public.reservation_payments where provider_payment_id is not null
    group by provider_payment_id having count(*)>1) then
    raise exception 'Duplicate provider payment references require reconciliation before upgrade.';
  end if;
end $preflight$;

-- Derived from 20261006000100_audit_authorization_hardening.sql; see builder for reviewed adaptations.

drop policy if exists "reservations_update_owner" on public.reservations;

create or replace function public.enforce_reservation_insert_boundary()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  authoritative_spot public.spots%rowtype;
  authoritative_fee numeric(10, 2);
  requires_payment boolean;
  slot_tables jsonb;
begin
  select *
  into authoritative_spot
  from public.spots
  where id = new.spot_id
    and is_public
    and is_reservable
  for key share;

  if not found then
    raise exception 'This venue is not available for reservations.';
  end if;

  if new.reservation_date < current_date then
    raise exception 'Reservation date must be today or later.';
  end if;

  if coalesce(new.slot_id, '') not in ('sunset', 'prime', 'late') then
    raise exception 'Select a valid reservation time slot.';
  end if;

  if nullif(trim(coalesce(new.table_id, '')), '') is null then
    raise exception 'A valid table must be selected.';
  end if;

  slot_tables := authoritative_spot.table_inventory -> new.slot_id;
  if jsonb_typeof(slot_tables) is distinct from 'array' then
    raise exception 'No reservation tables are configured for this time slot.';
  end if;
  if jsonb_array_length(slot_tables) = 0 then
    raise exception 'No reservation tables are configured for this time slot.';
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(slot_tables) table_entry
    where coalesce(table_entry ->> 'tableId', table_entry ->> 'table_id') = new.table_id
      and coalesce(table_entry ->> 'capacity', '0') ~ '^[0-9]+$'
      and (table_entry ->> 'capacity')::integer >= greatest(new.guest_count, new.guests, 1)
  ) then
    raise exception 'The selected table is not valid for this venue or group size.';
  end if;

  authoritative_fee := greatest(
    coalesce(nullif(authoritative_spot.gcash_amount, 0), authoritative_spot.reservation_fee, 0),
    0
  );
  requires_payment := authoritative_spot.payment_required
    or authoritative_spot.reservation_type = 'paid'
    or authoritative_fee > 0;

  new.spot_name := authoritative_spot.name;
  new.fee := case when requires_payment then authoritative_fee else 0 end;
  new.reservation_fee := case when requires_payment then authoritative_fee else 0 end;
  new.reservation_type := case when requires_payment then 'paid' else 'free' end;
  new.payment_required := requires_payment;
  new.payment_status := case when requires_payment then 'pending' else 'not_required' end;
  new.status := case when requires_payment then 'pending_payment' else 'pending' end;
  new.payment_method := null;
  new.payment_reference := null;
  new.payment_proof_url := null;
  new.payer_gcash_number := null;

  if requires_payment and not coalesce(new.payment_terms_accepted, false) then
    raise exception 'Deposit terms must be accepted before creating a paid reservation.';
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_enforce_booking_insert on public.reservations;

drop trigger if exists reservations_enforce_booking_insert on public.reservations;
create trigger reservations_enforce_booking_insert
  before insert on public.reservations
  for each row execute function public.enforce_reservation_insert_boundary();

-- Derived from 20261011000100_table_booking_policy_and_walk_ins.sql; see builder for reviewed adaptations.

do $$ begin
  if to_regprocedure('public.enforce_reservation_insert_boundary()') is not null then
    alter function public.enforce_reservation_insert_boundary() security definer;
    alter function public.enforce_reservation_insert_boundary() set search_path = public;
  end if;
end $$;

create table if not exists public.walk_in_visits (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  table_id text not null,
  party_size integer not null check (party_size between 1 and 100),
  status text not null default 'checked_in' check (status in ('checked_in', 'completed')),
  seated_by uuid not null references public.profiles(id),
  checked_in_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists walk_in_visits_one_active_table
  on public.walk_in_visits(spot_id, table_id) where status = 'checked_in';

create index if not exists reservations_active_physical_table_idx
  on public.reservations(spot_id, table_id, reservation_date)
  where status not in ('cancelled', 'completed', 'no_show');

create table if not exists public.venue_table_states (
  spot_id uuid not null references public.spots(id) on delete cascade,
  table_id text not null,
  state text not null default 'free' check (state in ('free', 'occupied', 'cleaning')),
  reservation_id uuid references public.reservations(id) on delete set null,
  walk_in_visit_id uuid references public.walk_in_visits(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (spot_id, table_id),
  check (reservation_id is null or walk_in_visit_id is null)
);

create or replace function public.is_venue_owner(target_spot_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.profiles p join public.spots s on s.id = target_spot_id
    where p.id = auth.uid() and p.role = 'owner'
      and (s.owner_id = p.id or exists (
        select 1 from public.owner_spot_access a where a.spot_id = s.id and a.owner_id = p.id
      ))
  );
$$;

revoke all on function public.is_venue_owner(uuid) from public;

grant execute on function public.is_venue_owner(uuid) to anon, authenticated, service_role;

alter table public.walk_in_visits enable row level security;

alter table public.venue_table_states enable row level security;

revoke all on public.walk_in_visits, public.venue_table_states from anon, authenticated;

grant select on public.walk_in_visits to authenticated;

grant select on public.venue_table_states to anon, authenticated;

drop policy if exists walk_in_visits_owner_read on public.walk_in_visits;
create policy walk_in_visits_owner_read on public.walk_in_visits for select to authenticated
  using (public.is_venue_owner(spot_id));

drop policy if exists venue_table_states_read on public.venue_table_states;
create policy venue_table_states_read on public.venue_table_states for select to anon, authenticated
  using (public.is_venue_owner(spot_id) or exists (select 1 from public.spots s where s.id = spot_id and s.is_public));

create or replace function public.physical_venue_tables(inventory jsonb)
returns table(table_id text, capacity integer, booking_policy text, unavailable boolean)
language sql immutable set search_path = public as $$
  select entry->>'tableId', min((entry->>'capacity')::integer),
    case when bool_or(coalesce(entry->>'bookingPolicy', 'online_and_walk_ins') = 'walk_in_only')
      then 'walk_in_only' else 'online_and_walk_ins' end,
    bool_or(coalesce((entry->>'isReserved')::boolean, false))
  from jsonb_each(case when jsonb_typeof(inventory) = 'object' then inventory else '{}'::jsonb end) slots
  cross join lateral jsonb_array_elements(case when jsonb_typeof(slots.value) = 'array' then slots.value else '[]'::jsonb end) entry
  where slots.key in ('sunset', 'prime', 'late') and nullif(entry->>'tableId', '') is not null
    and coalesce(entry->>'capacity', '') ~ '^[0-9]+$'
  group by entry->>'tableId';
$$;

create or replace function public.reservation_blocks_table(r public.reservations)
returns boolean language sql stable set search_path = public as $$
  select r.status not in ('cancelled', 'completed', 'no_show') and not coalesce((
    r.status = 'pending_payment' and r.payment_status in ('pending', 'unpaid')
    and r.payment_method in ('paymongo_gcash', 'paymongo_qrph')
    and r.created_at < now() - interval '5 minutes'
  ), false);
$$;

create or replace function public.table_policy_is_locked(target_spot_id uuid, target_table_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.reservations r where r.spot_id = target_spot_id
    and r.table_id = target_table_id and public.reservation_blocks_table(r))
  or exists (select 1 from public.walk_in_visits w where w.spot_id = target_spot_id
    and w.table_id = target_table_id and w.status = 'checked_in')
  or exists (select 1 from public.venue_table_states t where t.spot_id = target_spot_id
    and t.table_id = target_table_id and t.state <> 'free');
$$;

create or replace function public.get_venue_table_inventory_availability(
  target_spot_id uuid, target_reservation_date date default null, target_slot_id text default null
)
returns table(table_id text, capacity integer, booking_policy text, operational_state text,
  online_available boolean, policy_locked boolean, walk_in_visit_id uuid, walk_in_party_size integer)
language plpgsql stable security definer set search_path = public as $$
declare
  venue public.spots%rowtype;
  venue_owner boolean := public.is_venue_owner(target_spot_id);
  venue_today date := (now() at time zone 'Asia/Manila')::date;
begin
  select * into venue from public.spots where id = target_spot_id;
  if not found or (not venue.is_public and not venue_owner) then
    raise exception 'Venue unavailable.' using errcode = '42501';
  end if;
  if target_slot_id is not null and target_slot_id not in ('sunset', 'prime', 'late') then
    raise exception 'Select a valid reservation slot.' using errcode = '22023';
  end if;
  return query
  with tables as (select * from public.physical_venue_tables(venue.table_inventory)),
  live as (
    select t.*, ts.walk_in_visit_id as visit_id,
      case
        when ts.state = 'occupied' or exists (select 1 from public.reservations r
          where r.spot_id = target_spot_id and r.table_id = t.table_id and r.status = 'checked_in')
          or exists (select 1 from public.walk_in_visits w where w.spot_id = target_spot_id
            and w.table_id = t.table_id and w.status = 'checked_in') then 'occupied'
        when ts.state = 'cleaning' then 'cleaning'
        when t.unavailable then 'unavailable'
        when exists (select 1 from public.reservations r where r.spot_id = target_spot_id
          and r.table_id = t.table_id and r.reservation_date = coalesce(target_reservation_date, venue_today)
          and (target_slot_id is null or r.slot_id = target_slot_id)
          and public.reservation_blocks_table(r) and r.status = 'pending_payment') then 'held'
        when exists (select 1 from public.reservations r where r.spot_id = target_spot_id
          and r.table_id = t.table_id and r.reservation_date = coalesce(target_reservation_date, venue_today)
          and (target_slot_id is null or r.slot_id = target_slot_id)
          and public.reservation_blocks_table(r)) then 'due'
        else 'free'
      end as table_state
    from tables t left join public.venue_table_states ts on ts.spot_id = target_spot_id and ts.table_id = t.table_id
    where target_slot_id is null or exists (select 1 from jsonb_array_elements(
      case when jsonb_typeof(venue.table_inventory->target_slot_id) = 'array'
        then venue.table_inventory->target_slot_id else '[]'::jsonb end
    ) entry where entry->>'tableId' = t.table_id)
  )
  select l.table_id, l.capacity, l.booking_policy, l.table_state,
    venue.is_public and venue.is_reservable and l.table_state = 'free'
      and l.booking_policy = 'online_and_walk_ins',
    case when venue_owner then public.table_policy_is_locked(target_spot_id, l.table_id) else true end,
    case when venue_owner then l.visit_id else null end,
    case when venue_owner then (select w.party_size from public.walk_in_visits w where w.id = l.visit_id) else null end
  from live l order by l.table_id;
end;
$$;

revoke all on function public.get_venue_table_inventory_availability(uuid, date, text) from public;

grant execute on function public.get_venue_table_inventory_availability(uuid, date, text) to anon, authenticated;

create or replace function public.guard_table_inventory_policy()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  slot text;
  entry jsonb;
  entries jsonb;
  normalized jsonb := '{}'::jsonb;
  previous_policy text;
  proposed_policy text;
  old_table record;
  new_table record;
begin
  foreach slot in array array['sunset', 'prime', 'late'] loop
    entries := '[]'::jsonb;
    if new.table_inventory ? slot and jsonb_typeof(new.table_inventory->slot) <> 'array' then
      raise exception 'Invalid table inventory.' using errcode = '22023';
    end if;
    for entry in select value from jsonb_array_elements(coalesce(new.table_inventory->slot, '[]'::jsonb)) loop
      if nullif(trim(entry->>'tableId'), '') is null or coalesce(entry->>'capacity', '') !~ '^[0-9]+$'
        or (entry->>'capacity')::integer not between 1 and 100 then
        raise exception 'Tables require a name and capacity from 1 to 100.' using errcode = '22023';
      end if;
      select p.booking_policy into previous_policy from public.physical_venue_tables(old.table_inventory) p
        where p.table_id = entry->>'tableId';
      proposed_policy := coalesce(entry->>'bookingPolicy', previous_policy, 'online_and_walk_ins');
      if proposed_policy not in ('online_and_walk_ins', 'walk_in_only') then
        raise exception 'Invalid table booking policy.' using errcode = '22023';
      end if;
      entries := entries || jsonb_build_array(entry || jsonb_build_object('bookingPolicy', proposed_policy));
    end loop;
    normalized := normalized || jsonb_build_object(slot, entries);
  end loop;
  if exists (
    select 1 from jsonb_each(normalized) slots cross join lateral jsonb_array_elements(slots.value) e
    group by e->>'tableId' having count(distinct e->>'bookingPolicy') > 1
  ) then raise exception 'Use one booking policy for every copy of a physical table.' using errcode = '22023'; end if;
  new.table_inventory := normalized;
  for old_table in select * from public.physical_venue_tables(old.table_inventory) loop
    select * into new_table from public.physical_venue_tables(normalized) p where p.table_id = old_table.table_id;
    if not found or new_table.booking_policy is distinct from old_table.booking_policy then
      if not public.is_venue_owner(old.id) and auth.role() is distinct from 'service_role' then
        raise exception 'Only an authorized venue owner can change table policies.' using errcode = '42501';
      end if;
      if public.table_policy_is_locked(old.id, old_table.table_id) then
        raise exception 'Table % is not clear. Complete its bookings and visits, then mark it ready before changing policy.', old_table.table_id
          using errcode = '55000';
      end if;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists spots_guard_table_policy on public.spots;
create trigger spots_guard_table_policy before update of table_inventory on public.spots
  for each row execute function public.guard_table_inventory_policy();

create or replace function public.owner_set_table_booking_policy(
  target_spot_id uuid, target_table_id text, booking_policy_input text
)
returns public.spots language plpgsql security definer set search_path = public as $$
declare venue public.spots%rowtype; inventory jsonb := '{}'::jsonb; slot text;
begin
  if not public.is_venue_owner(target_spot_id) then
    raise exception 'Only an authorized venue owner can change table policies.' using errcode = '42501';
  end if;
  if booking_policy_input is null or booking_policy_input not in ('online_and_walk_ins', 'walk_in_only') then
    raise exception 'Invalid table booking policy.' using errcode = '22023';
  end if;
  select * into venue from public.spots where id = target_spot_id for update;
  if not exists (select 1 from public.physical_venue_tables(venue.table_inventory) p where p.table_id = target_table_id) then
    raise exception 'Table not found. Refresh the table list.' using errcode = 'P0002';
  end if;
  foreach slot in array array['sunset', 'prime', 'late'] loop
    inventory := inventory || jsonb_build_object(slot, coalesce((select jsonb_agg(
      case when e->>'tableId' = target_table_id then e || jsonb_build_object('bookingPolicy', booking_policy_input) else e end
    ) from jsonb_array_elements(coalesce(venue.table_inventory->slot, '[]'::jsonb)) e), '[]'::jsonb));
  end loop;
  update public.spots set table_inventory = inventory, updated_at = now() where id = target_spot_id returning * into venue;
  return venue;
end;
$$;

revoke all on function public.owner_set_table_booking_policy(uuid, text, text) from public;

grant execute on function public.owner_set_table_booking_policy(uuid, text, text) to authenticated;

create or replace function public.expire_venue_table_holds(target_spot_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.spots where id = target_spot_id for update;
  update public.reservations r set status = 'cancelled', payment_status = 'failed', refund_status = 'not_applicable',
    cancellation_reason = 'PayMongo checkout expired without payment.', cancelled_at = now(), updated_at = now()
  where r.spot_id = target_spot_id and r.status = 'pending_payment'
    and r.payment_status in ('pending', 'unpaid') and r.payment_method in ('paymongo_gcash', 'paymongo_qrph')
    and r.created_at < now() - interval '5 minutes';
  update public.reservation_payments p set status = 'expired', updated_at = now()
  where p.status = 'pending' and exists (select 1 from public.reservations r where r.id = p.reservation_id
    and r.spot_id = target_spot_id and r.status = 'cancelled'
    and r.cancellation_reason = 'PayMongo checkout expired without payment.');
end;
$$;

create or replace function public.guard_online_table_booking()
returns trigger language plpgsql security definer set search_path = public as $$
declare venue public.spots%rowtype; selected_table record; new_assignment boolean;
begin
  select * into venue from public.spots where id = new.spot_id for update;
  if not found then raise exception 'Venue unavailable.'; end if;
  new_assignment := tg_op = 'INSERT';
  if tg_op = 'UPDATE' then
    new_assignment := old.spot_id is distinct from new.spot_id or old.table_id is distinct from new.table_id
      or old.slot_id is distinct from new.slot_id or old.reservation_date is distinct from new.reservation_date
      or (old.status in ('cancelled', 'completed', 'no_show') and new.status not in ('cancelled', 'completed', 'no_show'));
    if old.status = 'checked_in' and (old.spot_id is distinct from new.spot_id or old.table_id is distinct from new.table_id) then
      raise exception 'Complete the checked-in visit before moving its table.' using errcode = '55000';
    end if;
  end if;
  -- INSERT status is untrusted; the existing insert boundary normalizes it later.
  if tg_op = 'UPDATE' and new.status in ('cancelled', 'completed', 'no_show') then return new; end if;
  if new_assignment then
    if not venue.is_public or not venue.is_reservable or new.reservation_date < (now() at time zone 'Asia/Manila')::date
      or coalesce(new.slot_id, '') not in ('sunset', 'prime', 'late') then
      raise exception 'Select an available venue, date, and reservation slot.' using errcode = '22023';
    end if;
    select * into selected_table from public.physical_venue_tables(venue.table_inventory) p where p.table_id = new.table_id;
    if not found then raise exception 'Table not found. Refresh availability.' using errcode = 'P0002'; end if;
    if selected_table.booking_policy = 'walk_in_only' then
      raise exception 'Walk-ins only: this table cannot be reserved online. Choose another table.' using errcode = 'P0001';
    end if;
    if selected_table.unavailable or selected_table.capacity < greatest(new.guest_count, new.guests, 1)
      or not exists (select 1 from jsonb_array_elements(coalesce(venue.table_inventory->new.slot_id, '[]'::jsonb)) e
        where e->>'tableId' = new.table_id) then
      raise exception 'This table is unavailable for your party. Refresh availability.' using errcode = '55000';
    end if;
    -- Retain the existing five-minute PayMongo expiry and unique slot index.
    perform public.expire_venue_table_holds(new.spot_id);
    if exists (select 1 from public.reservations r where r.spot_id = new.spot_id and r.table_id = new.table_id
      and r.reservation_date = new.reservation_date and r.slot_id = new.slot_id and r.id <> new.id
      and public.reservation_blocks_table(r)) then
      raise exception 'This table was just booked. Refresh availability and choose another table.' using errcode = '55000';
    end if;
  end if;
  if new_assignment or new.status = 'checked_in' then
    if exists (select 1 from public.venue_table_states t where t.spot_id = new.spot_id and t.table_id = new.table_id
      and t.state <> 'free' and (t.reservation_id is distinct from new.id or t.state = 'cleaning'))
      or exists (select 1 from public.walk_in_visits w where w.spot_id = new.spot_id and w.table_id = new.table_id and w.status = 'checked_in')
      or exists (select 1 from public.reservations r where r.spot_id = new.spot_id and r.table_id = new.table_id
        and r.id <> new.id and r.status = 'checked_in') then
      raise exception 'This table is occupied or cleaning. Refresh availability and choose another table.' using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_00_table_booking_guard on public.reservations;
create trigger reservations_00_table_booking_guard
  before insert or update of spot_id, table_id, slot_id, reservation_date, status, guest_count, guests on public.reservations
  for each row execute function public.guard_online_table_booking();

create or replace function public.sync_reservation_table_state()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.table_id is null then return new; end if;
  if new.status = 'checked_in' then
    insert into public.venue_table_states(spot_id, table_id, state, reservation_id)
      values (new.spot_id, new.table_id, 'occupied', new.id)
    on conflict (spot_id, table_id) do update set state = 'occupied', reservation_id = new.id,
      walk_in_visit_id = null, updated_at = now();
  elsif tg_op = 'UPDATE' and old.status = 'checked_in' and new.status in ('completed', 'cancelled', 'no_show') then
    insert into public.venue_table_states(spot_id, table_id, state) values (new.spot_id, new.table_id, 'cleaning')
    on conflict (spot_id, table_id) do update set state = 'cleaning', reservation_id = null,
      walk_in_visit_id = null, updated_at = now();
  else
    insert into public.venue_table_states(spot_id, table_id) values (new.spot_id, new.table_id)
    on conflict (spot_id, table_id) do update set updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_sync_table_state on public.reservations;
create trigger reservations_sync_table_state after insert or update of status, reservation_date, slot_id, table_id on public.reservations
  for each row execute function public.sync_reservation_table_state();

create or replace function public.owner_seat_walk_in(target_spot_id uuid, target_table_id text, party_size_input integer)
returns public.walk_in_visits language plpgsql security definer set search_path = public as $$
declare available_table record; visit public.walk_in_visits%rowtype;
begin
  if not public.is_venue_owner(target_spot_id) then
    raise exception 'Only an authorized venue owner can seat walk-ins.' using errcode = '42501';
  end if;
  if party_size_input is null or party_size_input not between 1 and 100 then
    raise exception 'Enter a party size from 1 to 100.' using errcode = '22023';
  end if;
  perform 1 from public.spots where id = target_spot_id for update;
  select * into available_table from public.get_venue_table_inventory_availability(target_spot_id) t where t.table_id = target_table_id;
  if not found then raise exception 'Table not found. Refresh the table list.' using errcode = 'P0002'; end if;
  if available_table.operational_state <> 'free' or available_table.capacity < party_size_input then
    raise exception 'This table is no longer free or does not fit your party. Refresh and choose another table.' using errcode = '55000';
  end if;
  insert into public.walk_in_visits(spot_id, table_id, party_size, seated_by)
    values (target_spot_id, target_table_id, party_size_input, auth.uid()) returning * into visit;
  insert into public.venue_table_states(spot_id, table_id, state, walk_in_visit_id)
    values (target_spot_id, target_table_id, 'occupied', visit.id)
  on conflict (spot_id, table_id) do update set state = 'occupied', walk_in_visit_id = visit.id,
    reservation_id = null, updated_at = now();
  return visit;
end;
$$;

revoke all on function public.owner_seat_walk_in(uuid, text, integer) from public;

grant execute on function public.owner_seat_walk_in(uuid, text, integer) to authenticated;

create or replace function public.owner_complete_walk_in(target_visit_id uuid)
returns public.walk_in_visits language plpgsql security definer set search_path = public as $$
declare visit public.walk_in_visits%rowtype;
begin
  select * into visit from public.walk_in_visits where id = target_visit_id;
  if not found or not public.is_venue_owner(visit.spot_id) then
    raise exception 'Only an authorized venue owner can complete this visit.' using errcode = '42501';
  end if;
  perform 1 from public.spots where id = visit.spot_id for update;
  update public.walk_in_visits set status = 'completed', completed_at = now(), updated_at = now()
    where id = target_visit_id and status = 'checked_in' returning * into visit;
  if not found then raise exception 'This visit was already completed. Refresh the table list.' using errcode = '55000'; end if;
  update public.venue_table_states set state = 'cleaning', walk_in_visit_id = null, reservation_id = null, updated_at = now()
    where spot_id = visit.spot_id and table_id = visit.table_id;
  return visit;
end;
$$;

revoke all on function public.owner_complete_walk_in(uuid) from public;

grant execute on function public.owner_complete_walk_in(uuid) to authenticated;

create or replace function public.owner_complete_reservation_visit(target_reservation_id uuid)
returns public.reservations language plpgsql security definer set search_path = public as $$
declare visit public.reservations%rowtype;
begin
  select * into visit from public.reservations where id = target_reservation_id;
  if not found or not public.is_venue_owner(visit.spot_id) then
    raise exception 'Only an authorized venue owner can complete this visit.' using errcode = '42501';
  end if;
  perform 1 from public.spots where id = visit.spot_id for update;
  update public.reservations set status = 'completed', updated_at = now()
    where id = target_reservation_id and status = 'checked_in' returning * into visit;
  if not found then raise exception 'Only checked-in visits can be completed. Refresh the reservations.' using errcode = '55000'; end if;
  return visit;
end;
$$;

revoke all on function public.owner_complete_reservation_visit(uuid) from public;

grant execute on function public.owner_complete_reservation_visit(uuid) to authenticated;

create or replace function public.owner_mark_table_ready(target_spot_id uuid, target_table_id text)
returns public.venue_table_states language plpgsql security definer set search_path = public as $$
declare ready_table public.venue_table_states%rowtype;
begin
  if not public.is_venue_owner(target_spot_id) then
    raise exception 'Only an authorized venue owner can mark tables ready.' using errcode = '42501';
  end if;
  perform 1 from public.spots where id = target_spot_id for update;
  if exists (select 1 from public.walk_in_visits w where w.spot_id = target_spot_id and w.table_id = target_table_id and w.status = 'checked_in')
    or exists (select 1 from public.reservations r where r.spot_id = target_spot_id and r.table_id = target_table_id and r.status = 'checked_in') then
    raise exception 'Complete the active visit before marking this table ready.' using errcode = '55000';
  end if;
  update public.venue_table_states set state = 'free', reservation_id = null, walk_in_visit_id = null, updated_at = now()
    where spot_id = target_spot_id and table_id = target_table_id and state = 'cleaning' returning * into ready_table;
  if not found then raise exception 'Only a cleaning table can be marked ready. Refresh the table list.' using errcode = '55000'; end if;
  return ready_table;
end;
$$;

revoke all on function public.owner_mark_table_ready(uuid, text) from public;

grant execute on function public.owner_mark_table_ready(uuid, text) to authenticated;

create or replace function public.get_reserved_table_ids(target_spot_id uuid, target_reservation_date date, target_slot_id text)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(t.table_id order by t.table_id), '{}'::text[])
  from public.get_venue_table_inventory_availability(target_spot_id, target_reservation_date, target_slot_id) t
  where not t.online_available;
$$;

create or replace function public.check_reservation_slot_available(
  target_spot_id uuid, target_reservation_date date, target_slot_id text,
  target_table_id text, excluded_reservation_id uuid default null
)
returns boolean language plpgsql security definer set search_path = public as $$
declare venue public.spots%rowtype; selected_table record;
begin
  select * into venue from public.spots where id = target_spot_id for update;
  if not found or not venue.is_public or not venue.is_reservable
    or target_reservation_date is null or target_reservation_date < (now() at time zone 'Asia/Manila')::date
    or coalesce(target_slot_id, '') not in ('sunset', 'prime', 'late') then return false; end if;
  perform public.expire_venue_table_holds(target_spot_id);
  select * into selected_table from public.physical_venue_tables(venue.table_inventory) t where t.table_id = target_table_id;
  if not found then return false; end if;
  if selected_table.booking_policy = 'walk_in_only' or selected_table.unavailable then return false; end if;
  return exists (select 1 from jsonb_array_elements(coalesce(venue.table_inventory->target_slot_id, '[]'::jsonb)) e
      where e->>'tableId' = target_table_id)
    and not exists (select 1 from public.venue_table_states t where t.spot_id = target_spot_id and t.table_id = target_table_id and t.state <> 'free')
    and not exists (select 1 from public.walk_in_visits w where w.spot_id = target_spot_id and w.table_id = target_table_id and w.status = 'checked_in')
    and not exists (select 1 from public.reservations r where r.spot_id = target_spot_id and r.table_id = target_table_id
      and (excluded_reservation_id is null or r.id <> excluded_reservation_id)
      and (r.status = 'checked_in' or (r.reservation_date = target_reservation_date and r.slot_id = target_slot_id and public.reservation_blocks_table(r))));
end;
$$;

revoke all on function public.get_reserved_table_ids(uuid, date, text) from public;

grant execute on function public.get_reserved_table_ids(uuid, date, text) to anon, authenticated;

revoke all on function public.check_reservation_slot_available(uuid, date, text, text, uuid) from public;

grant execute on function public.check_reservation_slot_available(uuid, date, text, text, uuid) to authenticated;

revoke all on function public.physical_venue_tables(jsonb), public.reservation_blocks_table(public.reservations),
  public.table_policy_is_locked(uuid, text), public.guard_table_inventory_policy(), public.guard_online_table_booking(),
  public.sync_reservation_table_state(), public.expire_venue_table_holds(uuid) from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='venue_table_states') then
    alter publication supabase_realtime add table public.venue_table_states;
  end if;
end $$;

-- Derived from 20261013000100_activity_privacy.sql; see builder for reviewed adaptations.

create or replace function public.can_read_activity(
  recipient uuid, event_type text, event_target text, event_spot uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  select
    (auth.uid() is not null and (
      recipient = auth.uid() or public.is_current_user_admin()
      or (event_type in (
        'reservation', 'reservation_approved', 'reservation_checked_in',
        'reservation_no_show', 'reservation_reminder', 'reservation_cancelled',
        'reservation_rescheduled', 'payment_received', 'payment_failed'
      ) and exists (
        select 1 from public.reservations r
        join public.spots s on s.id = r.spot_id
        where r.id::text = event_target and r.user_id = recipient
          and r.spot_id = event_spot
          and (s.owner_id = auth.uid() or exists (
            select 1 from public.owner_spot_access a
            where a.spot_id = s.id and a.owner_id = auth.uid()
          ))
      ))
    ))
    or (event_type = 'discovery' and exists (
      select 1 from public.spots s where s.id = event_spot and s.is_public
    ))
    or (event_type = 'submission' and exists (
      select 1 from public.spot_submissions s
      where s.id::text = event_target and s.submitter_id = recipient and s.status = 'approved'
    ));
$$;

revoke all on function public.can_read_activity(uuid,text,text,uuid) from public;

grant execute on function public.can_read_activity(uuid,text,text,uuid) to anon, authenticated, service_role;

alter table public.activities enable row level security;

drop policy if exists activities_read on public.activities;

drop policy if exists activities_private_visibility_guard on public.activities;

drop policy if exists activities_read on public.activities;
create policy activities_read on public.activities for select to anon, authenticated
  using (public.can_read_activity(user_id,type,target_id,spot_id));

drop policy if exists activities_private_visibility_guard on public.activities;
create policy activities_private_visibility_guard on public.activities as restrictive for select to anon, authenticated
  using (public.can_read_activity(user_id,type,target_id,spot_id));

revoke update, delete on public.activities from anon, authenticated;

drop policy if exists activities_insert_own on public.activities;

drop policy if exists activities_insert_own on public.activities;
create policy activities_insert_own on public.activities for insert to authenticated
  with check (user_id = auth.uid());

create or replace function public.validate_activity_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon','authenticated') then
    if auth.uid() is null or new.user_id is distinct from auth.uid() then
      raise exception 'Activity recipient must be the caller.' using errcode = '42501';
    end if;
    if new.type = 'discovery' then
      if not exists (select 1 from public.spots s where s.id = new.spot_id and s.is_public) then
        raise exception 'Discovery must reference a public venue.' using errcode = '42501';
      end if;
    elsif new.type = 'submission' then
      if not exists (select 1 from public.spot_submissions s where s.id::text = new.target_id and s.submitter_id = auth.uid()) then
        raise exception 'Submission must belong to the caller.' using errcode = '42501';
      end if;
    elsif new.type in ('reservation','reservation_reminder') then
      if not exists (select 1 from public.reservations r where r.id::text = new.target_id and r.user_id = auth.uid() and r.spot_id = new.spot_id) then
        raise exception 'Reservation event must reference an owned reservation.' using errcode = '42501';
      end if;
    elsif new.type = 'owner_access' then
      if not exists (select 1 from public.owner_access_requests r where r.id::text = new.target_id and r.requester_id = auth.uid()) then
        raise exception 'Owner request must belong to the caller.' using errcode = '42501';
      end if;
    else
      raise exception 'This activity type is server-owned.' using errcode = '42501';
    end if;
    new.created_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists activities_validate_insert on public.activities;

drop trigger if exists activities_validate_insert on public.activities;
create trigger activities_validate_insert before insert on public.activities
  for each row execute function public.validate_activity_insert();

-- Derived from 20261013000200_android_reservation_scope.sql; see builder for reviewed adaptations.

alter table public.spots
  add column if not exists reservation_inventory_verified_at timestamptz,
  add column if not exists reservation_inventory_verified_by uuid references public.profiles(id) on delete set null;

create or replace function public.has_active_online_inventory(inventory jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare slot_name text; entry jsonb; has_online boolean := false;
begin
  if jsonb_typeof(inventory) is distinct from 'object' then return false; end if;
  foreach slot_name in array array['sunset','prime','late'] loop
    if inventory ? slot_name then
      if jsonb_typeof(inventory->slot_name) is distinct from 'array' then return false; end if;
      for entry in select value from jsonb_array_elements(inventory->slot_name) loop
        if jsonb_typeof(entry) is distinct from 'object'
          or coalesce(entry->>'tableId','') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$'
          or jsonb_typeof(entry->'capacity') is distinct from 'number'
          or coalesce(entry->>'capacity','') !~ '^([1-9][0-9]?|100)$'
          or (entry ? 'isReserved' and jsonb_typeof(entry->'isReserved') is distinct from 'boolean')
          or coalesce(entry->>'bookingPolicy','online_and_walk_ins') not in ('online_and_walk_ins','walk_in_only') then
          return false;
        end if;
        has_online := has_online or (coalesce(entry->>'isReserved','false') = 'false'
          and coalesce(entry->>'bookingPolicy','online_and_walk_ins') = 'online_and_walk_ins');
      end loop;
    end if;
  end loop;
  return has_online;
end;
$$;

create or replace function public.guard_release_reservability()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon','authenticated') then
    if (tg_op = 'INSERT' and (new.reservation_inventory_verified_at is not null or new.reservation_inventory_verified_by is not null))
      or (tg_op = 'UPDATE' and (new.reservation_inventory_verified_at is distinct from old.reservation_inventory_verified_at
        or new.reservation_inventory_verified_by is distinct from old.reservation_inventory_verified_by)) then
      raise exception 'Inventory confirmation is a protected operation.' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.table_inventory is distinct from old.table_inventory then
    new.reservation_inventory_verified_at := null;
    new.reservation_inventory_verified_by := null;
  end if;
  new.is_reservable := coalesce(new.is_reservable,false)
    and new.id = '66666666-6666-4666-8666-666666666666'::uuid
    and new.is_public and new.reservation_inventory_verified_at is not null
    and public.has_active_online_inventory(new.table_inventory);
  return new;
end;
$$;

drop trigger if exists spots_release_reservability on public.spots;

drop trigger if exists spots_release_reservability on public.spots;
create trigger spots_release_reservability before insert or update on public.spots
  for each row execute function public.guard_release_reservability();

create or replace function public.confirm_client_venue_inventory(target_spot_id uuid, expected_inventory jsonb)
returns public.spots language plpgsql security definer set search_path = '' as $$
declare venue public.spots%rowtype;
begin
  if auth.uid() is null or target_spot_id <> '66666666-6666-4666-8666-666666666666'::uuid
    or not (public.is_venue_owner(target_spot_id) or public.is_current_user_admin()) then
    raise exception 'Only the assigned owner or administrator may confirm client inventory.' using errcode = '42501';
  end if;
  select * into venue from public.spots where id=target_spot_id for update;
  if not found or not venue.is_public or venue.table_inventory is distinct from expected_inventory
    or not public.has_active_online_inventory(venue.table_inventory) then
    raise exception 'Inventory changed or has no valid active online tables. Refresh and verify the actual venue.';
  end if;
  update public.spots set reservation_inventory_verified_at=now(),reservation_inventory_verified_by=auth.uid(),is_reservable=true,updated_at=now()
    where id=target_spot_id returning * into venue;
  return venue;
end;
$$;

revoke all on function public.confirm_client_venue_inventory(uuid,jsonb) from public,anon;

grant execute on function public.confirm_client_venue_inventory(uuid,jsonb) to authenticated;

create or replace function public.release_venue_is_reservable(target_spot_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.spots s where s.id=target_spot_id
    and s.id='66666666-6666-4666-8666-666666666666'::uuid
    and s.is_public and s.is_reservable and s.reservation_inventory_verified_at is not null
    and public.has_active_online_inventory(s.table_inventory));
$$;

revoke all on function public.release_venue_is_reservable(uuid) from public;

grant execute on function public.release_venue_is_reservable(uuid) to anon,authenticated,service_role;

create or replace function public.guard_release_reservation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.release_venue_is_reservable(new.spot_id) then
    raise exception 'This venue is discovery-only or its actual inventory is not confirmed.';
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_release_scope on public.reservations;
create trigger reservations_release_scope before insert or update of spot_id on public.reservations
  for each row execute function public.guard_release_reservation();

revoke all on function public.get_venue_table_inventory_availability(uuid,date,text) from public,anon,authenticated;

create or replace function public.get_venue_table_availability(target_spot_id uuid,target_reservation_date date default null,target_slot_id text default null)
returns table(table_id text,capacity integer,booking_policy text,operational_state text,online_available boolean,policy_locked boolean,walk_in_visit_id uuid,walk_in_party_size integer)
language sql stable security definer set search_path = '' as $$
  select t.table_id,t.capacity,t.booking_policy,t.operational_state,
    t.online_available and public.release_venue_is_reservable(target_spot_id),
    t.policy_locked,t.walk_in_visit_id,t.walk_in_party_size
  from public.get_venue_table_inventory_availability(target_spot_id,target_reservation_date,target_slot_id) t;
$$;

revoke all on function public.get_venue_table_availability(uuid,date,text) from public;

grant execute on function public.get_venue_table_availability(uuid,date,text) to anon,authenticated,service_role;

-- Derived from 20261013000300_manual_proof_and_bounded_holds.sql; see builder for reviewed adaptations.

alter table public.reservations
  add column if not exists hold_expires_at timestamptz,
  add column if not exists proof_submitted_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null;

create or replace function public.set_reservation_server_times() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_at := now(); new.updated_at := now();
  new.hold_expires_at := case when new.payment_required then now() + interval '5 minutes' end;
  new.proof_submitted_at := null; new.paid_at := null; new.approved_by := null;
  return new;
end;
$$;

drop trigger if exists reservations_zz_server_times on public.reservations;
create trigger reservations_zz_server_times before insert on public.reservations
  for each row execute function public.set_reservation_server_times();

revoke update on public.reservations from anon, authenticated;

create or replace function public.reservation_blocks_table(r public.reservations)
returns boolean language sql stable set search_path = '' as $$
  select r.status not in ('cancelled','completed','no_show') and not coalesce(
    r.payment_required and r.payment_status in ('pending','unpaid','failed')
    and r.status in ('pending','pending_payment','rescheduled')
    and coalesce(r.hold_expires_at, r.created_at + interval '5 minutes') <= now(), false);
$$;

create or replace function public.expire_venue_table_holds(target_spot_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.spots where id = target_spot_id for update;
  update public.reservations r set status='cancelled', payment_status='failed', refund_status='not_applicable',
    cancellation_reason='Reservation hold expired without completed payment review.',
    cancelled_at=now(), updated_at=now()
  where r.spot_id=target_spot_id and r.payment_required
    and r.status in ('pending','pending_payment','rescheduled')
    and r.payment_status in ('pending','unpaid','failed')
    and coalesce(r.hold_expires_at,r.created_at+interval '5 minutes') <= now();
  update public.reservation_payments p set status='expired',updated_at=now()
  where p.status='pending' and exists(select 1 from public.reservations r
    where r.id=p.reservation_id and r.spot_id=target_spot_id and r.status='cancelled');
end;
$$;

create or replace function public.expire_incomplete_reservation_holds() returns void
language plpgsql security definer set search_path = '' as $$
declare venue_id uuid;
begin
  for venue_id in select distinct spot_id from public.reservations
    where payment_required and status in ('pending','pending_payment','rescheduled')
      and payment_status in ('pending','unpaid','failed') and hold_expires_at <= now()
    order by spot_id
  loop perform public.expire_venue_table_holds(venue_id); end loop;
end;
$$;

revoke all on function public.expire_incomplete_reservation_holds() from public,anon,authenticated;

grant execute on function public.expire_incomplete_reservation_holds() to service_role;

create or replace function public.can_read_reservation_proof(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.reservations r where
      object_name ~ ('^' || r.user_id::text || '/' || r.id::text || '/[0-9a-f-]{36}\.(jpg|png|pdf)$')
      and (r.user_id=auth.uid() or (r.payment_proof_url=object_name and (
        public.is_current_user_admin() or exists(select 1 from public.spots s
          where s.id=r.spot_id and (s.owner_id=auth.uid() or exists(
            select 1 from public.owner_spot_access a where a.spot_id=s.id and a.owner_id=auth.uid()))))))
  );
$$;

revoke all on function public.can_read_reservation_proof(text) from public;

grant execute on function public.can_read_reservation_proof(text) to anon,authenticated,service_role;

update storage.buckets set public=false,file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','application/pdf'] where id='payment-proofs';

drop policy if exists payment_proofs_read_related on storage.objects;

drop policy if exists payment_proofs_insert_own on storage.objects;

drop policy if exists payment_proofs_read_related on storage.objects;
create policy payment_proofs_read_related on storage.objects for select
  using(bucket_id='payment-proofs' and public.can_read_reservation_proof(name));

drop policy if exists payment_proofs_read_guard on storage.objects;
create policy payment_proofs_read_guard on storage.objects as restrictive for select
  using(bucket_id<>'payment-proofs' or public.can_read_reservation_proof(name));

drop policy if exists payment_proofs_insert_guard on storage.objects;
create policy payment_proofs_insert_guard on storage.objects as restrictive for insert
  with check(bucket_id<>'payment-proofs');

drop policy if exists payment_proofs_update_guard on storage.objects;
create policy payment_proofs_update_guard on storage.objects as restrictive for update
  using(bucket_id<>'payment-proofs') with check(bucket_id<>'payment-proofs');

drop policy if exists payment_proofs_delete_guard on storage.objects;
create policy payment_proofs_delete_guard on storage.objects as restrictive for delete
  using(bucket_id<>'payment-proofs');

create or replace function public.submit_reservation_payment_proof(
  reservation_id uuid, proof_path text, reference text, payer_number text
) returns public.reservations language plpgsql security definer set search_path = '' as $$
declare r public.reservations%rowtype; venue_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select spot_id into venue_id from public.reservations where id=reservation_id and user_id=auth.uid();
  if venue_id is null then raise exception 'Reservation unavailable.' using errcode='42501'; end if;
  perform 1 from public.spots where id=venue_id for update;
  select * into r from public.reservations where id=reservation_id and user_id=auth.uid() for update;
  if not r.payment_required or r.status not in ('pending_payment','pending','rescheduled')
    or r.payment_status not in ('pending','unpaid','failed')
    or coalesce(r.hold_expires_at,r.created_at+interval '5 minutes') <= now() then
    raise exception 'This reservation is no longer eligible for proof submission.' using errcode='55000';
  end if;
  if r.payment_method is not null and r.payment_method <> 'gcash' then
    raise exception 'An active provider checkout cannot be replaced by manual proof.' using errcode='55000';
  end if;
  if trim(coalesce(reference,'')) !~ '^[A-Za-z0-9][A-Za-z0-9 -]{5,79}$'
    or replace(trim(coalesce(payer_number,'')),' ','') !~ '^(09[0-9]{9}|\+639[0-9]{9})$' then
    raise exception 'Enter a valid payment reference and Philippine mobile number.' using errcode='22023';
  end if;
  if proof_path !~ ('^' || r.user_id::text || '/' || r.id::text || '/[0-9a-f-]{36}\.(jpg|png|pdf)$')
    or not exists(select 1 from storage.objects o where o.bucket_id='payment-proofs' and o.name=proof_path
      and o.metadata->>'mimetype' in ('image/jpeg','image/png','application/pdf')
      and coalesce(o.metadata->>'size','') ~ '^[0-9]{1,7}$'
      and (o.metadata->>'size')::bigint between 1 and 5242880) then
    raise exception 'Upload a validated proof for this reservation first.' using errcode='22023';
  end if;
  update public.reservations set payment_method='gcash',payment_reference=trim(reference),
    payment_proof_url=proof_path,payer_gcash_number=replace(trim(payer_number),' ',''),
    proof_submitted_at=coalesce(r.proof_submitted_at,now()),
    hold_expires_at=coalesce(r.proof_submitted_at,now())+interval '30 minutes',updated_at=now()
    where id=r.id returning * into r;
  return r;
end;
$$;

revoke all on function public.submit_reservation_payment_proof(uuid,text,text,text) from public,anon;

grant execute on function public.submit_reservation_payment_proof(uuid,text,text,text) to authenticated;

create or replace function public.approve_paid_reservation(reservation_id uuid)
returns public.reservations language plpgsql security definer set search_path = '' as $$
declare r public.reservations%rowtype; venue_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select spot_id into venue_id from public.reservations where id=reservation_id;
  if not exists(select 1 from public.spots s where s.id=venue_id and
    (s.owner_id=auth.uid() or public.is_current_user_admin() or exists(
      select 1 from public.owner_spot_access a where a.spot_id=s.id and a.owner_id=auth.uid()))) then
    raise exception 'Only the assigned venue owner or administrator can approve.' using errcode='42501';
  end if;
  perform 1 from public.spots where id=venue_id for update;
  select * into r from public.reservations where id=reservation_id for update;
  if r.payment_status='paid' and r.payment_method='gcash' then return r; end if;
  if not r.payment_required or r.payment_method is distinct from 'gcash'
    or r.proof_submitted_at is null or r.payment_proof_url is null
    or r.status not in ('pending','pending_payment','rescheduled')
    or r.payment_status not in ('pending','unpaid','failed') or r.hold_expires_at <= now() then
    raise exception 'Manual proof is missing, expired, or no longer eligible for approval.' using errcode='55000';
  end if;
  update public.reservations set status='confirmed',payment_status='paid',
    paid_at=coalesce(paid_at,now()),approved_by=auth.uid(),hold_expires_at=null,updated_at=now()
    where id=r.id returning * into r;
  insert into public.activities(user_id,user_name,action,target_id,target_name,type,content,spot_id,spot_name)
    values(r.user_id,'CebSpot','approved your reservation',r.id::text,r.spot_name,'reservation_approved',
      'Your reservation is approved.',r.spot_id,r.spot_name);
  return r;
end;
$$;

-- Derived from 20261013000400_durable_checkout_and_payment_events.sql; see builder for reviewed adaptations.

alter table public.reservation_payments
  add column if not exists idempotency_key uuid not null default gen_random_uuid(),
  add column if not exists checkout_request jsonb,
  add column if not exists attempt_state text not null default 'reconciliation_required'
    check(attempt_state in ('creating','active','reconciliation_required','retiring','retired','complete')),
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_error_code text;
alter table public.reservation_payments alter column attempt_state set default 'active';

alter table public.reservations add column if not exists financial_resolution text
  check(financial_resolution in ('resolution_required','resolved'));

create unique index if not exists reservation_payments_idempotency_key on public.reservation_payments(idempotency_key);

create unique index if not exists reservation_payments_unique_provider_payment on public.reservation_payments(provider_payment_id)
  where provider_payment_id is not null;

create unique index if not exists reservation_payments_one_active_attempt on public.reservation_payments(reservation_id)
  where status='pending' and attempt_state in ('creating','active');

create table if not exists public.payment_session_retirements(
  attempt_id uuid primary key references public.reservation_payments(id),
  session_id text not null, state text not null default 'pending' check(state in ('pending','working','complete')),
  tries integer not null default 0, available_at timestamptz not null default now(),
  lease_expires_at timestamptz, completed_at timestamptz, last_error_code text
);

create table if not exists public.payment_webhook_events(
  event_id text primary key, payload_sha256 text not null, event_type text not null,
  session_id text, attempt_id uuid, reservation_id uuid,
  state text not null default 'pending' check(state in ('pending','processed','rejected')),
  received_at timestamptz not null default now(), processed_at timestamptz, result text
);

alter table public.payment_session_retirements enable row level security;

alter table public.payment_webhook_events enable row level security;

revoke all on public.payment_session_retirements,public.payment_webhook_events from anon,authenticated;

revoke insert,update,delete on public.reservation_payments from anon,authenticated;

grant all on public.payment_session_retirements,public.payment_webhook_events to service_role;

create or replace function public.queue_checkout_retirement() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status in ('cancelled','completed','no_show') or new.payment_status='paid' then
    insert into public.payment_session_retirements(attempt_id,session_id)
      select p.id,p.provider_checkout_session_id from public.reservation_payments p
      where p.reservation_id=new.id and p.provider_checkout_session_id is not null
        and p.status <> 'paid' and p.attempt_state <> 'retired'
      on conflict(attempt_id) do nothing;
    update public.reservation_payments set status='expired',
      attempt_state=case when provider_checkout_session_id is null then 'reconciliation_required' else 'retiring' end,
      updated_at=now() where reservation_id=new.id and status='pending';
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_queue_checkout_retirement on public.reservations;
create trigger reservations_queue_checkout_retirement after update of status,payment_status on public.reservations
  for each row execute function public.queue_checkout_retirement();

create or replace function public.begin_checkout_attempt(target_reservation_id uuid,customer_id uuid,method text,replace_active boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.reservations%rowtype; p public.reservation_payments%rowtype; venue_id uuid;
begin
  if method not in ('gcash','qrph') then raise exception 'Invalid checkout method.' using errcode='22023'; end if;
  select spot_id into venue_id from public.reservations where id=target_reservation_id and user_id=customer_id;
  if venue_id is null then raise exception 'Reservation not found.' using errcode='42501'; end if;
  perform 1 from public.spots where id=venue_id for update;
  select * into r from public.reservations where id=target_reservation_id for update;
  if not public.release_venue_is_reservable(r.spot_id) or not r.payment_required or r.reservation_fee < 1
    or r.payment_status not in ('pending','unpaid','failed')
    or r.status not in ('pending_payment','pending','rescheduled')
    or coalesce(r.hold_expires_at,r.created_at+interval '5 minutes') <= now()
    or r.payment_method='gcash' then
    raise exception 'This reservation cannot accept provider checkout.' using errcode='55000';
  end if;
  if nullif(trim(r.guest_name),'') is null or nullif(trim(r.guest_email),'') is null
    or nullif(trim(r.guest_phone),'') is null then raise exception 'Saved contact details are required.'; end if;
  if exists(select 1 from public.reservation_payments where reservation_id=r.id
      and attempt_state in ('retiring','reconciliation_required') and status <> 'pending') then
    return jsonb_build_object('action','reconcile');
  end if;
  select * into p from public.reservation_payments where reservation_id=r.id and status='pending'
    order by created_at desc,id limit 1 for update;
  if found then
    if p.payment_method <> method or replace_active then
      if p.provider_checkout_session_id is null then
        return jsonb_build_object('action','reconcile','attempt',to_jsonb(p));
      end if;
      insert into public.payment_session_retirements(attempt_id,session_id) values(p.id,p.provider_checkout_session_id)
        on conflict(attempt_id) do nothing;
      update public.reservation_payments set status='expired',attempt_state='retiring',updated_at=now() where id=p.id;
      return jsonb_build_object('action','retire','attempt',to_jsonb(p));
    end if;
    if p.attempt_state='active' and p.checkout_url is not null then
      return jsonb_build_object('action','reuse','attempt',to_jsonb(p));
    end if;
    if p.lease_expires_at > now() then return jsonb_build_object('action','busy','attempt',to_jsonb(p)); end if;
    if p.checkout_request is null and p.attempt_state='reconciliation_required' then
      return jsonb_build_object('action','reconcile','attempt',to_jsonb(p));
    end if;
    update public.reservation_payments set attempt_state='creating',lease_expires_at=now()+interval '30 seconds',updated_at=now()
      where id=p.id returning * into p;
  else
    insert into public.reservation_payments(reservation_id,user_id,spot_id,payment_method,amount,currency,status,attempt_state,lease_expires_at,expires_at)
      values(r.id,r.user_id,r.spot_id,method,r.reservation_fee,'PHP','pending','creating',now()+interval '30 seconds',r.hold_expires_at)
      returning * into p;
    update public.reservations set payment_method='paymongo_'||method,updated_at=now() where id=r.id;
  end if;
  return jsonb_build_object('action','create','attempt',to_jsonb(p),'reservation',to_jsonb(r));
end;
$$;

create or replace function public.prepare_checkout_request(target_attempt_id uuid,request_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.reservation_payments%rowtype; attrs jsonb;
begin
  select * into p from public.reservation_payments where id=target_attempt_id for update;
  if not found then raise exception 'Attempt not found.'; end if;
  if p.checkout_request is not null then return p.checkout_request; end if;
  attrs:=request_payload#>'{data,attributes}';
  if attrs->>'reference_number' is distinct from p.reservation_id::text
    or attrs#>>'{metadata,checkout_attempt_id}' is distinct from p.id::text
    or attrs#>>'{metadata,reservation_id}' is distinct from p.reservation_id::text
    or attrs#>>'{line_items,0,currency}' is distinct from 'PHP'
    or attrs#>>'{line_items,0,amount}' is distinct from (p.amount*100)::bigint::text
    or attrs#>>'{line_items,0,quantity}' is distinct from '1'
    or jsonb_array_length(attrs->'line_items') <> 1 then raise exception 'Checkout request does not match durable attempt.'; end if;
  update public.reservation_payments set checkout_request=request_payload where id=p.id;
  return request_payload;
end;
$$;

create or replace function public.record_checkout_session(target_attempt_id uuid,session_snapshot jsonb)
returns public.reservation_payments language plpgsql security definer set search_path='' as $$
declare p public.reservation_payments%rowtype; r public.reservations%rowtype; venue_id uuid; attrs jsonb; sid text;
begin
  select spot_id into venue_id from public.reservation_payments where id=target_attempt_id;
  perform 1 from public.spots where id=venue_id for update;
  select r0.* into r from public.reservations r0 join public.reservation_payments p0 on p0.reservation_id=r0.id where p0.id=target_attempt_id for update of r0;
  select * into p from public.reservation_payments where id=target_attempt_id for update;
  if not found then raise exception 'Attempt not found.'; end if;
  attrs:=session_snapshot->'attributes';sid:=session_snapshot->>'id';
  if coalesce(sid,'') !~ '^cs_[A-Za-z0-9_]+$' or attrs->'livemode' is distinct from 'false'::jsonb
    or attrs->>'reference_number' is distinct from p.reservation_id::text
    or attrs#>>'{metadata,checkout_attempt_id}' is distinct from p.id::text
    or attrs#>>'{metadata,reservation_id}' is distinct from p.reservation_id::text
    or attrs#>>'{line_items,0,currency}' is distinct from 'PHP'
    or attrs#>>'{line_items,0,amount}' is distinct from (p.amount*100)::bigint::text
    or attrs#>>'{line_items,0,quantity}' is distinct from '1'
    or jsonb_array_length(attrs->'line_items') <> 1
    or coalesce(attrs->>'checkout_url','') !~ '^https://checkout\.paymongo\.com/' then
    raise exception 'Provider session does not match test-mode checkout attempt.' using errcode='22023';
  end if;
  if p.provider_checkout_session_id is not null and p.provider_checkout_session_id <> sid then
    raise exception 'Attempt already has a different provider session.'; end if;
  update public.reservation_payments set provider_checkout_session_id=sid,checkout_url=attrs->>'checkout_url',
    attempt_state=case when p.status='paid' then 'complete'
      when r.status in ('cancelled','completed','no_show') or r.payment_status='paid' or r.hold_expires_at <= now() or p.status='expired' then 'retiring'
      else 'active' end,lease_expires_at=null,updated_at=now() where id=p.id returning * into p;
  if p.attempt_state='retiring' then
    insert into public.payment_session_retirements(attempt_id,session_id) values(p.id,sid) on conflict(attempt_id) do nothing;
  else
    update public.reservations set payment_reference=sid,updated_at=now() where id=r.id and payment_status<>'paid';
  end if;
  return p;
end;
$$;

create or replace function public.ingest_paymongo_event(incoming_event_id text,payload_hash text,incoming_type text,
  incoming_session_id text,incoming_attempt_id uuid,incoming_reservation_id uuid)
returns public.payment_webhook_events language plpgsql security definer set search_path='' as $$
declare e public.payment_webhook_events%rowtype;
begin
  if incoming_event_id !~ '^evt_[A-Za-z0-9_]{1,150}$' or payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid event identity.' using errcode='22023'; end if;
  insert into public.payment_webhook_events(event_id,payload_sha256,event_type,session_id,attempt_id,reservation_id)
    values(incoming_event_id,payload_hash,incoming_type,incoming_session_id,incoming_attempt_id,incoming_reservation_id)
    on conflict(event_id) do nothing;
  select * into e from public.payment_webhook_events where event_id=incoming_event_id;
  if e.payload_sha256 <> payload_hash then raise exception 'Event identity was reused with different content.' using errcode='22023'; end if;
  return e;
end;
$$;

create or replace function public.apply_paymongo_snapshot(incoming_event_id text,target_attempt_id uuid,session_snapshot jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare p public.reservation_payments%rowtype; r public.reservations%rowtype; e public.payment_webhook_events%rowtype;
  attrs jsonb; payment jsonb; paid_count int; venue_id uuid; late boolean; outcome text;
begin
  -- All payment, cancellation, inventory and approval writers take venue first.
  select spot_id into venue_id from public.reservation_payments where id=target_attempt_id;
  perform 1 from public.spots where id=venue_id for update;
  select r0.* into r from public.reservations r0 join public.reservation_payments p0 on p0.reservation_id=r0.id where p0.id=target_attempt_id for update of r0;
  select * into p from public.reservation_payments where id=target_attempt_id for update;
  select * into e from public.payment_webhook_events where event_id=incoming_event_id for update;
  if e.event_id is null or p.id is null then raise exception 'Event or attempt unavailable.'; end if;
  if e.state <> 'pending' then return e.result; end if;
  if (e.attempt_id is not null and e.attempt_id <> p.id)
    or (e.reservation_id is not null and e.reservation_id <> p.reservation_id)
    or e.session_id is distinct from session_snapshot->>'id' then raise exception 'Event reference mismatch.' using errcode='22023'; end if;
  perform public.record_checkout_session(p.id,session_snapshot);
  attrs:=session_snapshot->'attributes';
  select count(*) into paid_count from jsonb_array_elements(coalesce(attrs->'payments','[]')) value where value#>>'{attributes,status}'='paid';
  if paid_count>1 then raise exception 'Multiple paid transactions require financial reconciliation.' using errcode='22023'; end if;
  if paid_count=1 then
    select value into payment from jsonb_array_elements(attrs->'payments') value where value#>>'{attributes,status}'='paid';
    if payment#>>'{attributes,currency}' is distinct from 'PHP'
      or payment#>>'{attributes,amount}' is distinct from (p.amount*100)::bigint::text
      or coalesce(payment->>'id','') !~ '^pay_[A-Za-z0-9_]+$'
      or payment#>'{attributes,livemode}' is distinct from 'false'::jsonb then
      raise exception 'Paid amount, currency, mode or payment reference mismatch.' using errcode='22023'; end if;
    if p.status='paid' then
      if p.provider_payment_id is distinct from payment->>'id' then raise exception 'Attempt has another paid transaction.'; end if;
      outcome:='duplicate';
    else
      late:=r.status in ('cancelled','completed','no_show') or r.payment_status='paid' or p.status='expired'
        or p.attempt_state in ('retiring','retired') or coalesce(r.hold_expires_at,r.created_at+interval '5 minutes')<=now();
      update public.reservation_payments set status='paid',attempt_state='complete',provider_payment_id=payment->>'id',
        provider_payment_intent_id=payment#>>'{attributes,payment_intent_id}',paid_at=coalesce(paid_at,now()),updated_at=now()
        where id=p.id;
      if late then
        update public.reservations set payment_status='refund_pending',refund_status='pending_review',
          status=case when status in ('pending','pending_payment','rescheduled') then 'cancelled' else status end,
          financial_resolution='resolution_required',paid_at=coalesce(paid_at,now()),updated_at=now() where id=r.id;
        outcome:='resolution_required';
      else
        update public.reservations set status='confirmed',payment_status='paid',payment_reference=payment->>'id',
          paid_at=coalesce(paid_at,now()),hold_expires_at=null,updated_at=now() where id=r.id;
        insert into public.activities(user_id,user_name,action,target_id,target_name,type,content,spot_id,spot_name)
          values(r.user_id,'CebSpot','received your payment',r.id::text,r.spot_name,'payment_received','Reservation payment received.',r.spot_id,r.spot_name);
        outcome:='paid';
      end if;
    end if;
  elsif attrs->>'status'='expired' and p.status <> 'paid' then
    update public.reservation_payments set status='expired',attempt_state='retired',updated_at=now() where id=p.id;
    outcome:='expired';
  else outcome:='unchanged'; end if;
  update public.payment_webhook_events set state='processed',processed_at=now(),result=outcome where event_id=e.event_id;
  return outcome;
end;
$$;

create or replace function public.claim_payment_retirements(batch_size integer default 10)
returns setof public.payment_session_retirements language sql security definer set search_path='' as $$
  update public.payment_session_retirements set state='working',tries=tries+1,lease_expires_at=now()+interval '60 seconds'
  where attempt_id in (select attempt_id from public.payment_session_retirements
    where state<>'complete' and available_at<=now() and (lease_expires_at is null or lease_expires_at<=now())
    order by available_at for update skip locked limit least(greatest(batch_size,1),10)) returning *;
$$;

create or replace function public.finish_payment_retirement(target_attempt_id uuid,succeeded boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.payment_session_retirements set state=case when succeeded then 'complete' else 'pending' end,
    lease_expires_at=null,completed_at=case when succeeded then now() end,
    available_at=now()+least(3600,30*power(2,least(tries,7))) * interval '1 second',
    last_error_code=case when succeeded then null else 'provider_unavailable' end where attempt_id=target_attempt_id;
  if succeeded then update public.reservation_payments set attempt_state='retired',status='expired',updated_at=now()
    where id=target_attempt_id and status<>'paid'; end if;
end;
$$;

revoke all on function public.begin_checkout_attempt(uuid,uuid,text,boolean),public.prepare_checkout_request(uuid,jsonb),
  public.record_checkout_session(uuid,jsonb),public.ingest_paymongo_event(text,text,text,text,uuid,uuid),
  public.apply_paymongo_snapshot(text,uuid,jsonb),public.claim_payment_retirements(integer),
  public.finish_payment_retirement(uuid,boolean) from public,anon,authenticated;

grant execute on function public.begin_checkout_attempt(uuid,uuid,text,boolean),public.prepare_checkout_request(uuid,jsonb),
  public.record_checkout_session(uuid,jsonb),public.ingest_paymongo_event(text,text,text,text,uuid,uuid),
  public.apply_paymongo_snapshot(text,uuid,jsonb),public.claim_payment_retirements(integer),
  public.finish_payment_retirement(uuid,boolean) to service_role;

create or replace function public.lock_related_reservation_venue(target_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare venue_id uuid;
begin
  select r.spot_id into venue_id from public.reservations r join public.spots s on s.id=r.spot_id
    where r.id=target_id and auth.uid() is not null and (r.user_id=auth.uid() or s.owner_id=auth.uid()
      or public.is_current_user_admin() or exists(select 1 from public.owner_spot_access a where a.spot_id=s.id and a.owner_id=auth.uid()));
  if venue_id is null then raise exception 'Reservation unavailable.' using errcode='42501'; end if;
  perform 1 from public.spots where id=venue_id for update;
end;
$$;

revoke all on function public.lock_related_reservation_venue(uuid) from public,anon,authenticated;

do $rename$ begin
  if to_regprocedure('public.void_unpaid_reservation_internal(uuid,text)') is null then
    alter function public.void_unpaid_reservation(uuid,text) rename to void_unpaid_reservation_internal;
  end if;
end $rename$;

do $rename$ begin
  if to_regprocedure('public.cancel_own_free_reservation_internal(uuid,text)') is null then
    alter function public.cancel_own_free_reservation(uuid,text) rename to cancel_own_free_reservation_internal;
  end if;
end $rename$;

do $rename$ begin
  if to_regprocedure('public.reschedule_own_free_reservation_internal(uuid,date)') is null then
    alter function public.reschedule_own_free_reservation(uuid,date) rename to reschedule_own_free_reservation_internal;
  end if;
end $rename$;

do $rename$ begin
  if to_regprocedure('public.owner_record_reservation_attendance_internal(uuid,text)') is null then
    alter function public.owner_record_reservation_attendance(uuid,text) rename to owner_record_reservation_attendance_internal;
  end if;
end $rename$;

create or replace function public.void_unpaid_reservation_internal(target_reservation_id uuid,cancellation_reason text default 'Payment was not completed.')
returns public.reservations language plpgsql security definer set search_path='' as $$
declare r public.reservations%rowtype;
begin
  select * into r from public.reservations where id=target_reservation_id and user_id=auth.uid() for update;
  if not found then raise exception 'Reservation not found.' using errcode='42501'; end if;
  if r.payment_status='paid' or r.status in ('confirmed','completed','no_show','checked_in') then
    raise exception 'This reservation can no longer be voided.'; end if;
  if r.status<>'cancelled' then
    update public.reservations set status='cancelled',payment_status='failed',refund_status='not_applicable',
      cancellation_reason=coalesce(nullif(trim($2),''),'Payment was not completed.'),cancelled_at=now(),updated_at=now()
      where id=r.id returning * into r;
  end if;
  return r;
end;
$$;

revoke all on function public.void_unpaid_reservation_internal(uuid,text),public.cancel_own_free_reservation_internal(uuid,text),
  public.reschedule_own_free_reservation_internal(uuid,date),public.owner_record_reservation_attendance_internal(uuid,text) from public,anon,authenticated;

create or replace function public.void_unpaid_reservation(target_reservation_id uuid,cancellation_reason text default 'Payment was not completed.')
returns public.reservations language plpgsql security definer set search_path='' as $$
begin
  perform public.lock_related_reservation_venue(target_reservation_id);
  if exists(select 1 from public.reservations where id=target_reservation_id
    and (payment_status in ('paid','refund_pending','refunded','non_refundable') or financial_resolution='resolution_required')) then
    raise exception 'A paid or unresolved payment cannot be voided.'; end if;
  return public.void_unpaid_reservation_internal(target_reservation_id,cancellation_reason);
end;
$$;

create or replace function public.cancel_own_free_reservation(target_reservation_id uuid,cancellation_reason_input text default null)
returns public.reservations language plpgsql security definer set search_path='' as $$
begin perform public.lock_related_reservation_venue(target_reservation_id);
  return public.cancel_own_free_reservation_internal(target_reservation_id,cancellation_reason_input); end;
$$;

create or replace function public.reschedule_own_free_reservation(target_reservation_id uuid,reservation_date_input date)
returns public.reservations language plpgsql security definer set search_path='' as $$
begin perform public.lock_related_reservation_venue(target_reservation_id);
  return public.reschedule_own_free_reservation_internal(target_reservation_id,reservation_date_input); end;
$$;

create or replace function public.owner_record_reservation_attendance(reservation_id uuid,attendance_status text)
returns public.reservations language plpgsql security definer set search_path='' as $$
begin perform public.lock_related_reservation_venue(reservation_id);
  return public.owner_record_reservation_attendance_internal(reservation_id,attendance_status); end;
$$;

revoke all on function public.void_unpaid_reservation(uuid,text),public.cancel_own_free_reservation(uuid,text),
  public.reschedule_own_free_reservation(uuid,date),public.owner_record_reservation_attendance(uuid,text) from public,anon;

grant execute on function public.void_unpaid_reservation(uuid,text),public.cancel_own_free_reservation(uuid,text),
  public.reschedule_own_free_reservation(uuid,date),public.owner_record_reservation_attendance(uuid,text) to authenticated;

-- Derived from 20261013000600_server_reservation_details.sql; see builder for reviewed adaptations.

create or replace function public.reservation_slot_for_time(arrival time,club_floor_plan boolean)
returns text language sql immutable set search_path='' as $$
  select case when club_floor_plan then
    case when arrival>=time '23:00' or arrival<time '02:00' then 'prime'
         when arrival>=time '20:00' then 'sunset' else 'late' end
    else case when arrival>=time '20:00' and arrival<time '23:00' then 'prime'
              when arrival>=time '17:00' and arrival<time '20:00' then 'sunset' else 'late' end end;
$$;

do $details$ begin
  if to_regprocedure('public.validate_reservation_details()') is null then
    execute 'create or replace function public.validate_reservation_details() returns trigger
language plpgsql security definer set search_path='''' as $$
begin
  new.guest_name:=trim(new.guest_name);
  new.guest_email:=lower(trim(new.guest_email));
  new.guest_phone:=regexp_replace(new.guest_phone,''[ ()-]'','''',''g'');
  if coalesce(length(new.guest_name),0) not between 2 and 120
    or coalesce(length(new.guest_email),0) not between 5 and 254
    or coalesce(new.guest_email,'''') !~ ''^[A-Za-z0-9.!#$%&''''*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$''
    or coalesce(new.guest_phone,'''') !~ ''^(09[0-9]{9}|\+639[0-9]{9})$'' then
    raise exception ''Provide a valid guest name, email and Philippine mobile number.'' using errcode=''22023'';
  end if;
  if new.reservation_time is null or new.reservation_time>=time ''24:00''
    or extract(second from new.reservation_time)<>0
    or new.reservation_date is null or new.reservation_date<(now() at time zone ''Asia/Manila'')::date then
    raise exception ''Select a valid arrival date and exact minute.'' using errcode=''22023'';
  end if;
  if new.reservation_date=(now() at time zone ''Asia/Manila'')::date
    and new.reservation_time<=(now() at time zone ''Asia/Manila'')::time then
    raise exception ''Arrival time must be in the future.'' using errcode=''22023'';
  end if;
  new.slot_id:=public.reservation_slot_for_time(new.reservation_time,new.spot_id=''66666666-6666-4666-8666-666666666666''::uuid);
  new.reservation_time_start:=new.reservation_time;
  new.reservation_time_end:=null;
  if tg_op=''INSERT'' then
    new.payment_terms_accepted_at:=case when new.payment_terms_accepted then now() else null end;
  end if;
  return new;
end;
$$;';
  end if;
end $details$;

drop trigger if exists reservations_00_server_details on public.reservations;
create trigger reservations_00_server_details before insert or update of
  guest_name,guest_email,guest_phone,reservation_time,reservation_date,slot_id on public.reservations
  for each row execute function public.validate_reservation_details();

revoke all on function public.validate_reservation_details() from public,anon,authenticated;

revoke all on function public.reservation_slot_for_time(time,boolean) from public;

grant execute on function public.reservation_slot_for_time(time,boolean) to authenticated,service_role;

-- Keep the installed account guard. Add confirmed-account checks for this scope,
-- including deletion-aware deployments, without weakening their existing checks.
create or replace function public.assert_reservation_account() returns void
language plpgsql security definer set search_path='' as $body$
declare deleting boolean := false;
begin
  if auth.uid() is null then return; end if;
  perform public.require_active_account();
  if not exists(select 1 from auth.users u join public.profiles p on p.id=u.id
    where u.id=auth.uid() and u.email_confirmed_at is not null) then
    raise exception 'A confirmed signed-in account is required.' using errcode='42501';
  end if;
  if to_regclass('public.account_deletion_requests') is not null then
    execute 'select exists(select 1 from public.account_deletion_requests where user_id=$1)'
      into deleting using auth.uid();
    if deleting then raise exception 'Account deletion in progress.' using errcode='42501'; end if;
  end if;
end $body$;
revoke all on function public.assert_reservation_account() from public,anon,authenticated;

create or replace function public.guard_reservation_actor() returns trigger
language plpgsql security definer set search_path='' as $body$
begin
  if current_setting('role',true) in ('anon','authenticated') and auth.uid() is null then
    raise exception 'Authentication required.' using errcode='42501';
  end if;
  perform public.assert_reservation_account();
  if tg_op='DELETE' then return old; end if;
  return new;
end $body$;
revoke all on function public.guard_reservation_actor() from public,anon,authenticated;
drop trigger if exists reservations_account_boundary on public.reservations;
create trigger reservations_account_boundary before insert or update or delete on public.reservations
  for each row execute function public.guard_reservation_actor();
drop trigger if exists walk_in_account_boundary on public.walk_in_visits;
create trigger walk_in_account_boundary before insert or update or delete on public.walk_in_visits
  for each row execute function public.guard_reservation_actor();

-- Source-derived replacements retain the same guard in definer RPCs, whose
-- writes bypass RLS. Public availability remains readable without signing in.
do $guards$
declare f record; definition text; replacement text; body text;
begin
  for f in select p.oid,p.prosrc,l.lanname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    join pg_language l on l.oid=p.prolang
    where n.nspname='public' and p.proname=any(array['apply_paymongo_snapshot','approve_paid_reservation','begin_checkout_attempt','can_read_activity','can_read_reservation_proof','cancel_own_free_reservation','check_reservation_slot_available','claim_payment_retirements','confirm_client_venue_inventory','enforce_reservation_insert_boundary','expire_incomplete_reservation_holds','expire_venue_table_holds','finish_payment_retirement','get_reserved_table_ids','get_venue_table_availability','get_venue_table_inventory_availability','guard_online_table_booking','guard_release_reservability','guard_release_reservation','guard_table_inventory_policy','has_active_online_inventory','ingest_paymongo_event','is_venue_owner','lock_related_reservation_venue','owner_complete_reservation_visit','owner_complete_walk_in','owner_mark_table_ready','owner_record_reservation_attendance','owner_seat_walk_in','owner_set_table_booking_policy','physical_venue_tables','prepare_checkout_request','queue_checkout_retirement','record_checkout_session','release_venue_is_reservable','reschedule_own_free_reservation','reservation_blocks_table','reservation_slot_for_time','set_reservation_server_times','submit_reservation_payment_proof','sync_reservation_table_state','table_policy_is_locked','validate_activity_insert','validate_reservation_details','void_unpaid_reservation','void_unpaid_reservation_internal'])
      and p.prosecdef and p.prorettype<>'trigger'::regtype and p.provolatile<>'i'
      and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'))
  loop
    body := case when f.lanname='sql' then 'select public.assert_reservation_account();'||chr(10)||f.prosrc
      else 'begin perform public.assert_reservation_account();'||chr(10)||f.prosrc||chr(10)||'end;' end;
    definition:=pg_get_functiondef(f.oid);
    replacement:=replace(definition,'AS $function$'||f.prosrc||'$function$','AS $function$'||body||'$function$');
    if replacement=definition then raise exception 'Unexpected function format; stop for review.'; end if;
    execute replacement;
  end loop;
end $guards$;
-- Table grants are explicit; current Supabase projects need not inherit defaults.
grant all on public.walk_in_visits,public.venue_table_states to service_role;
revoke all on public.walk_in_visits,public.venue_table_states,public.payment_session_retirements,public.payment_webhook_events from public;
revoke insert,update,delete on public.reservation_payments from public;
-- Legacy admin policy applied to PUBLIC can evaluate an authenticated-only
-- helper during an anonymous activity read. Retain it for authenticated admins.
do $policy_role$ begin
  if exists(select 1 from pg_policies where schemaname='public' and tablename='activities' and policyname='activities_admin_select') then
    alter policy activities_admin_select on public.activities to authenticated;
  end if;
end $policy_role$;
-- Restrictive guards also close legacy explicit column grants/overlapping policies.
drop policy if exists reservations_server_updates on public.reservations;
create policy reservations_server_updates on public.reservations as restrictive for update to anon,authenticated using(false) with check(false);
drop policy if exists reservations_server_deletes on public.reservations;
create policy reservations_server_deletes on public.reservations as restrictive for delete to anon,authenticated using(false);
notify pgrst,'reload schema';
commit;
