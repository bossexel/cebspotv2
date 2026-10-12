begin;
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
create trigger spots_release_reservability before insert or update on public.spots
  for each row execute function public.guard_release_reservability();

-- Existing flags are not evidence that an inventory template matches the venue.
update public.spots set is_reservable = false;

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
create trigger reservations_release_scope before insert or update of spot_id on public.reservations
  for each row execute function public.guard_release_reservation();

alter function public.get_venue_table_availability(uuid,date,text) rename to get_venue_table_inventory_availability;
revoke all on function public.get_venue_table_inventory_availability(uuid,date,text) from public,anon,authenticated;
create function public.get_venue_table_availability(target_spot_id uuid,target_reservation_date date default null,target_slot_id text default null)
returns table(table_id text,capacity integer,booking_policy text,operational_state text,online_available boolean,policy_locked boolean,walk_in_visit_id uuid,walk_in_party_size integer)
language sql stable security definer set search_path = '' as $$
  select t.table_id,t.capacity,t.booking_policy,t.operational_state,
    t.online_available and public.release_venue_is_reservable(target_spot_id),
    t.policy_locked,t.walk_in_visit_id,t.walk_in_party_size
  from public.get_venue_table_inventory_availability(target_spot_id,target_reservation_date,target_slot_id) t;
$$;
revoke all on function public.get_venue_table_availability(uuid,date,text) from public;
grant execute on function public.get_venue_table_availability(uuid,date,text) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
