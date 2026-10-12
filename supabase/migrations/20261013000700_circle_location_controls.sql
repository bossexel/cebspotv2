begin;
-- Sharing coordinates must not be exposed through general profile/owner reads.
create table public.circle_location_shares(
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,generation uuid not null default gen_random_uuid(),
  latitude double precision,longitude double precision,updated_at timestamptz,
  check(latitude between -90 and 90 and longitude between -180 and 180),
  check(enabled or (latitude is null and longitude is null and updated_at is null))
);
alter table public.circle_location_shares enable row level security;
revoke all on public.circle_location_shares from anon,authenticated;
grant select on public.circle_location_shares to authenticated;
grant all on public.circle_location_shares to service_role;
create policy circle_share_read_own on public.circle_location_shares for select using(user_id=auth.uid());
-- Existing coordinates are removed rather than silently treating old sharing as consent.
update public.profiles set location=location-'lat'-'lng'-'latitude'-'longitude',last_location_update=null
  where last_location_update is not null or location ?| array['lat','lng','latitude','longitude'];
create function public.guard_profile_location() returns trigger language plpgsql set search_path='' as $$
begin
  if new.location ?| array['lat','lng','latitude','longitude'] or new.last_location_update is not null then
    raise exception 'Publish circle coordinates through the consent-bound location operation.' using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger profiles_private_location before insert or update of location,last_location_update on public.profiles
for each row execute function public.guard_profile_location();

create function public.set_circle_location_sharing(share_enabled boolean) returns public.circle_location_shares
language plpgsql security definer set search_path='' as $$
declare result public.circle_location_shares%rowtype; circle_id uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid()) then
    raise exception 'Active account required.' using errcode='42501'; end if;
  if share_enabled is null then raise exception 'Sharing choice required.' using errcode='22023'; end if;
  if share_enabled and not exists(select 1 from public.circles where auth.uid()=any(members)) then
    raise exception 'Join a circle before sharing location.' using errcode='42501'; end if;
  insert into public.circle_location_shares(user_id,enabled) values(auth.uid(),share_enabled)
    on conflict(user_id) do update set enabled=excluded.enabled,generation=gen_random_uuid(),latitude=null,longitude=null,updated_at=null
    returning * into result;
  for circle_id in select id from public.circles where auth.uid()=any(members) order by id loop
    update public.circles set updated_at=now() where id=circle_id;
  end loop;
  return result;
end;
$$;
create function public.publish_circle_location(share_generation uuid,latitude_input double precision,longitude_input double precision)
returns boolean language plpgsql security definer set search_path='' as $$
declare circle_id uuid;
begin
  if latitude_input is null or longitude_input is null or not latitude_input between -90 and 90 or not longitude_input between -180 and 180 then
    raise exception 'Invalid coordinates.' using errcode='22023'; end if;
  update public.circle_location_shares set latitude=latitude_input,longitude=longitude_input,updated_at=now()
    where user_id=auth.uid() and enabled and generation=share_generation
      and exists(select 1 from public.circles where auth.uid()=any(members));
  if not found then raise exception 'Location sharing stopped or membership changed.' using errcode='42501'; end if;
  for circle_id in select id from public.circles where auth.uid()=any(members) order by id loop
    update public.circles set updated_at=now() where id=circle_id;
  end loop;
  return true;
end;
$$;
create or replace function public.get_circle_members(target_circle_id uuid)
returns table(id uuid,display_name text,photo_url text,location jsonb,last_location_update timestamptz,is_owner boolean)
language sql stable security definer set search_path='' as $$
  select p.id,p.display_name,p.photo_url,
    case when s.enabled and s.updated_at>now()-interval '15 minutes' then jsonb_build_object('lat',s.latitude,'lng',s.longitude) else null end,
    case when s.enabled and s.updated_at>now()-interval '15 minutes' then s.updated_at else null end,
    p.id=c.owner_id
  from public.circles c join public.profiles p on p.id=any(c.members)
  left join public.circle_location_shares s on s.user_id=p.id
  where c.id=target_circle_id and auth.uid()=any(c.members)
  order by (p.id=c.owner_id) desc,p.display_name asc nulls last;
$$;
create function public.leave_circle(target_circle_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare circle_record public.circles%rowtype; remaining uuid[];
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  -- Always lock sharing before circles, matching publish/stop operations.
  perform public.set_circle_location_sharing(false);
  select * into circle_record from public.circles where id=target_circle_id for update;
  if not found or not auth.uid()=any(circle_record.members) then raise exception 'Circle unavailable.' using errcode='42501'; end if;
  select coalesce(array_agg(distinct member order by member),'{}') into remaining from unnest(circle_record.members) member where member<>auth.uid();
  if cardinality(remaining)=0 then delete from public.circles where id=target_circle_id;
  else update public.circles set members=remaining,owner_id=case when owner_id=auth.uid() then remaining[1] else owner_id end,
      invite_code=null,invite_expires_at=null,updated_at=now() where id=target_circle_id;
  end if;
  return true;
end;
$$;
revoke update,delete on public.circles from anon,authenticated;
create policy circles_update_guard on public.circles as restrictive for update using(false) with check(false);
create policy circles_delete_guard on public.circles as restrictive for delete using(false);
revoke all on function public.set_circle_location_sharing(boolean),public.publish_circle_location(uuid,double precision,double precision),public.leave_circle(uuid) from public,anon;
grant execute on function public.set_circle_location_sharing(boolean),public.publish_circle_location(uuid,double precision,double precision),public.leave_circle(uuid) to authenticated;
revoke all on function public.guard_profile_location() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
