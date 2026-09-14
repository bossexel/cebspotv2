-- CebSpot email/password authentication support.
-- Run this in the Supabase SQL editor after the base schema, or apply it as a
-- migration. It is idempotent and updates the existing profiles table.
--
-- Hosted Auth requirement (not configurable through database SQL):
-- In Authentication > Sign In / Providers > Email, enable "Confirm email".
-- With confirmation enabled, signUp creates the user without a session and
-- Supabase emails the verification link before password sign-in is allowed.
-- In Authentication > Email Templates > Confirm signup, use subject
-- "Welcome to CebSpot! Confirm your account" and paste
-- supabase/templates/confirmation.html.
-- In Authentication > Email Templates > Reset password, use subject
-- "Reset your CebSpot password" and paste supabase/templates/recovery.html.

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text;

alter table public.profiles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_select_own'
  ) then
    create policy "profiles_select_own"
      on public.profiles for select
      using (auth.uid() = id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_insert_own'
  ) then
    create policy "profiles_insert_own"
      on public.profiles for insert
      with check (auth.uid() = id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_update_own'
  ) then
    create policy "profiles_update_own"
      on public.profiles for update
      using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if nullif(trim(coalesce(new.email, '')), '') is null then
    return new;
  end if;

  insert into public.profiles (id, email, role, first_name, last_name, display_name, photo_url)
  values (
    new.id,
    coalesce(new.email, ''),
    case
      when lower(coalesce(new.email, '')) = 'testadmin6000@gmail.com' then 'admin'
      when lower(coalesce(new.email, '')) = 'testowner@cebspot.com' then 'owner'
      else 'user'
    end,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), ''),
    coalesce(
      nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''),
      nullif(trim(concat_ws(' ', new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data ->> 'last_name')), ''),
      nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
    ),
    coalesce(
      nullif(trim(coalesce(new.raw_user_meta_data ->> 'avatar_url', '')), ''),
      nullif(trim(coalesce(new.raw_user_meta_data ->> 'picture', '')), '')
    )
  )
  on conflict (id) do update set
    email = excluded.email,
    role = case
      when lower(excluded.email) = 'testadmin6000@gmail.com' then 'admin'
      when lower(excluded.email) = 'testadmin@cebspot.com' then 'user'
      when lower(excluded.email) = 'testowner@cebspot.com' then 'owner'
      else public.profiles.role
    end,
    first_name = coalesce(excluded.first_name, public.profiles.first_name),
    last_name = coalesce(excluded.last_name, public.profiles.last_name),
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    photo_url = coalesce(public.profiles.photo_url, excluded.photo_url),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_updated on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger on_auth_user_updated
  after update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_new_user();

-- Repair accounts that existed before the Auth trigger was installed.
insert into public.profiles (id, email, role, first_name, last_name, display_name, photo_url)
select
  auth_user.id,
  trim(auth_user.email),
  case
    when lower(auth_user.email) = 'testadmin6000@gmail.com' then 'admin'
    when lower(auth_user.email) = 'testowner@cebspot.com' then 'owner'
    else 'user'
  end,
  nullif(trim(coalesce(auth_user.raw_user_meta_data ->> 'first_name', '')), ''),
  nullif(trim(coalesce(auth_user.raw_user_meta_data ->> 'last_name', '')), ''),
  coalesce(
    nullif(trim(coalesce(auth_user.raw_user_meta_data ->> 'display_name', '')), ''),
    nullif(trim(concat_ws(' ', auth_user.raw_user_meta_data ->> 'first_name', auth_user.raw_user_meta_data ->> 'last_name')), ''),
    nullif(trim(coalesce(auth_user.raw_user_meta_data ->> 'full_name', '')), ''),
    split_part(auth_user.email, '@', 1)
  ),
  coalesce(
    nullif(trim(coalesce(auth_user.raw_user_meta_data ->> 'avatar_url', '')), ''),
    nullif(trim(coalesce(auth_user.raw_user_meta_data ->> 'picture', '')), '')
  )
from auth.users auth_user
where nullif(trim(coalesce(auth_user.email, '')), '') is not null
on conflict (id) do update set
  email = excluded.email,
  role = excluded.role,
  first_name = coalesce(excluded.first_name, public.profiles.first_name),
  last_name = coalesce(excluded.last_name, public.profiles.last_name),
  display_name = coalesce(excluded.display_name, public.profiles.display_name),
  photo_url = coalesce(public.profiles.photo_url, excluded.photo_url),
  updated_at = now();

grant select, insert, update on table public.profiles to authenticated;

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "profile_photos_read" on storage.objects;
drop policy if exists "profile_photos_insert_own" on storage.objects;
drop policy if exists "profile_photos_update_own" on storage.objects;
drop policy if exists "profile_photos_delete_own" on storage.objects;

create policy "profile_photos_read"
  on storage.objects for select
  using (bucket_id = 'profile-photos');

create policy "profile_photos_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'profile-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "profile_photos_update_own"
  on storage.objects for update
  using (
    bucket_id = 'profile-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'profile-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "profile_photos_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'profile-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

notify pgrst, 'reload schema';

-- Verification:
-- select auth_user.id, auth_user.email, profile.display_name, profile.photo_url
-- from auth.users auth_user
-- left join public.profiles profile on profile.id = auth_user.id
-- order by auth_user.created_at desc;
