begin;

-- The hardened insert boundary locks the venue. A guest's RLS correctly denies
-- spots UPDATE, so the trigger must read/lock it with its own privileges instead
-- of granting guests venue-edit access. Reservation INSERT RLS remains in force.
do $$ begin
  if to_regprocedure('public.enforce_reservation_insert_boundary()') is not null then
    alter function public.enforce_reservation_insert_boundary() security definer;
    alter function public.enforce_reservation_insert_boundary() set search_path = public;
  end if;
end $$;

-- Policy belongs to the existing physical table inventory, never to its state.
-- Walk-ins have no reservation/payment row: no fabricated payer or deposit.
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
create policy walk_in_visits_owner_read on public.walk_in_visits for select to authenticated
  using (public.is_venue_owner(spot_id));
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

-- This is the existing five-minute PayMongo hold rule, shared by every reader.
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

create or replace function public.get_venue_table_availability(
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
revoke all on function public.get_venue_table_availability(uuid, date, text) from public;
grant execute on function public.get_venue_table_availability(uuid, date, text) to anon, authenticated;

-- Guard ALL inventory writes, including an old app's direct spots PATCH.
-- Missing policy fields in an older client preserve the policy already saved.
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

-- Retain both sides of the existing PayMongo timeout: release the reservation
-- and expire its pending payment record. Limit cleanup to the locked venue.
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

-- The same venue row lock serializes online inserts, policy edits, and walk-ins.
-- A preliminary availability response can never authorize a later write.
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
  select * into available_table from public.get_venue_table_availability(target_spot_id) t where t.table_id = target_table_id;
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

-- Keep the old guest contracts safe for clients released before this feature.
create or replace function public.get_reserved_table_ids(target_spot_id uuid, target_reservation_date date, target_slot_id text)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(t.table_id order by t.table_id), '{}'::text[])
  from public.get_venue_table_availability(target_spot_id, target_reservation_date, target_slot_id) t
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
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.venue_table_states;
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
