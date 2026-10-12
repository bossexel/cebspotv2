begin;

-- RLS policies combine permissively by OR. This predicate is also installed as
-- a restrictive policy so older/overlapping permissive policies cannot leak.
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
create policy activities_read on public.activities for select to anon, authenticated
  using (public.can_read_activity(user_id,type,target_id,spot_id));
create policy activities_private_visibility_guard on public.activities as restrictive for select to anon, authenticated
  using (public.can_read_activity(user_id,type,target_id,spot_id));

-- A private event must not be made public by renaming its type/target afterward.
revoke update, delete on public.activities from anon, authenticated;
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
create trigger activities_validate_insert before insert on public.activities
  for each row execute function public.validate_activity_insert();

-- Administrative activity access must not be obtainable by editing a profile.
create or replace function public.guard_profile_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon','authenticated') then
    if tg_op = 'UPDATE' and (
      new.id is distinct from old.id or new.email is distinct from old.email or new.role is distinct from old.role
    ) then raise exception 'Profile identity and role are server-owned.' using errcode = '42501'; end if;
    if tg_op = 'INSERT' then
      raise exception 'Profiles are created by the authenticated identity service.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_identity_boundary on public.profiles;
create trigger profiles_identity_boundary before insert or update on public.profiles
  for each row execute function public.guard_profile_identity();

notify pgrst, 'reload schema';
commit;
