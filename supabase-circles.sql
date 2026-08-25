-- CebSpot circle membership and 24-hour invitation support
-- Run this once in the Supabase SQL Editor before testing Circle invitations.

alter table public.circles
  add column if not exists invite_code text,
  add column if not exists invite_expires_at timestamptz;

update public.circles
set members = array_append(members, owner_id)
where not (owner_id = any(members));

create unique index if not exists circles_invite_code_unique_idx
  on public.circles(invite_code)
  where invite_code is not null;

alter table public.circles enable row level security;

drop policy if exists "circles_member_read" on public.circles;
drop policy if exists "circles_insert_own" on public.circles;

create policy "circles_member_read"
  on public.circles for select
  using (owner_id = auth.uid() or auth.uid() = any(members));

create policy "circles_insert_own"
  on public.circles for insert
  with check (
    auth.role() = 'authenticated'
    and owner_id = auth.uid()
    and auth.uid() = any(members)
  );

drop function if exists public.get_circle_members(uuid);

create function public.get_circle_members(target_circle_id uuid)
returns table (
  id uuid,
  display_name text,
  photo_url text,
  location jsonb,
  last_location_update timestamptz,
  is_owner boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    member_profile.id,
    member_profile.display_name,
    member_profile.photo_url,
    member_profile.location,
    member_profile.last_location_update,
    member_profile.id = circle_record.owner_id
  from public.circles circle_record
  join public.profiles member_profile
    on member_profile.id = any(circle_record.members)
  where circle_record.id = target_circle_id
    and (
      circle_record.owner_id = auth.uid()
      or auth.uid() = any(circle_record.members)
    )
  order by (member_profile.id = circle_record.owner_id) desc,
    member_profile.display_name asc nulls last;
$$;

create or replace function public.get_or_create_circle_invite_code(target_circle_id uuid)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_code text;
  current_expiry timestamptz;
  generated_code text;
  generated_expiry timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select circle_record.invite_code, circle_record.invite_expires_at
  into current_code, current_expiry
  from public.circles circle_record
  where circle_record.id = target_circle_id
    and (
      circle_record.owner_id = auth.uid()
      or auth.uid() = any(circle_record.members)
    )
  for update;

  if not found then
    raise exception 'Circle not found or access denied.';
  end if;

  if current_code is not null and current_expiry > now() then
    return query select current_code, current_expiry;
    return;
  end if;

  loop
    generated_code :=
      chr(65 + floor(random() * 26)::integer) ||
      chr(65 + floor(random() * 26)::integer) ||
      chr(65 + floor(random() * 26)::integer) || '-' ||
      lpad(floor(random() * 1000)::integer::text, 3, '0');
    exit when not exists (
      select 1 from public.circles where invite_code = generated_code
    );
  end loop;

  generated_expiry := now() + interval '1 day';

  update public.circles
  set invite_code = generated_code,
      invite_expires_at = generated_expiry,
      updated_at = now()
  where circles.id = target_circle_id;

  return query select generated_code, generated_expiry;
end;
$$;

create or replace function public.join_circle_by_code(submitted_code text)
returns public.circles
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_code text := upper(trim(submitted_code));
  joined_circle public.circles%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if normalized_code !~ '^[A-Z]{3}-[0-9]{3}$' then
    raise exception 'Enter a valid invitation code such as ABC-123.';
  end if;

  select *
  into joined_circle
  from public.circles
  where invite_code = normalized_code
    and invite_expires_at > now()
  for update;

  if not found then
    raise exception 'Invitation code is invalid or expired.';
  end if;

  update public.circles
  set members = case
        when current_user_id = any(members) then members
        else array_append(members, current_user_id)
      end,
      updated_at = now()
  where id = joined_circle.id
  returning * into joined_circle;

  return joined_circle;
end;
$$;

revoke all on function public.get_circle_members(uuid) from public;
revoke all on function public.get_or_create_circle_invite_code(uuid) from public;
revoke all on function public.join_circle_by_code(text) from public;

grant execute on function public.get_circle_members(uuid) to authenticated;
grant execute on function public.get_or_create_circle_invite_code(uuid) to authenticated;
grant execute on function public.join_circle_by_code(text) to authenticated;

notify pgrst, 'reload schema';
