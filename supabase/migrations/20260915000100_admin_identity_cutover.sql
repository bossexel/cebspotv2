-- Move super-admin access to the verified Gmail account and revoke the former
-- demo account's administrative privileges.

begin;

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.role = 'admin'
      and lower(trim(profile.email)) = 'testadmin6000@gmail.com'
  );
$$;

revoke all on function public.is_current_user_admin() from public;
grant execute on function public.is_current_user_admin() to authenticated;

create or replace function public.assign_profile_role_from_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(trim(coalesce(new.email, ''))) = 'testadmin6000@gmail.com' then
    new.role := 'admin';
  elsif lower(trim(coalesce(new.email, ''))) = 'testadmin@cebspot.com' and new.role = 'admin' then
    new.role := 'user';
  elsif tg_op = 'INSERT' and lower(trim(coalesce(new.email, ''))) = 'testowner@cebspot.com' then
    new.role := 'owner';
  elsif tg_op = 'INSERT' then
    new.role := coalesce(new.role, 'user');
  elsif new.email is distinct from old.email and lower(trim(coalesce(new.email, ''))) = 'testowner@cebspot.com' then
    new.role := 'owner';
  elsif new.email is distinct from old.email
    and lower(trim(coalesce(old.email, ''))) in ('testowner@cebspot.com', 'testadmin6000@gmail.com') then
    new.role := 'user';
  elsif new.role is null then
    new.role := old.role;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_assign_role_from_email on public.profiles;
create trigger profiles_assign_role_from_email
  before insert or update of email, role on public.profiles
  for each row execute function public.assign_profile_role_from_email();

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
    trim(new.email),
    case
      when lower(trim(new.email)) = 'testadmin6000@gmail.com' then 'admin'
      when lower(trim(new.email)) = 'testowner@cebspot.com' then 'owner'
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

update public.profiles
set role = 'user', updated_at = now()
where lower(trim(email)) = 'testadmin@cebspot.com'
  and role = 'admin';

update public.profiles
set role = 'admin', updated_at = now()
where lower(trim(email)) = 'testadmin6000@gmail.com';

drop policy if exists "spot_edit_suggestions_admin_select" on public.spot_edit_suggestions;
drop policy if exists "spot_edit_suggestions_admin_update" on public.spot_edit_suggestions;

create policy "spot_edit_suggestions_admin_select"
  on public.spot_edit_suggestions for select
  using (public.is_current_user_admin());

create policy "spot_edit_suggestions_admin_update"
  on public.spot_edit_suggestions for update
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

drop policy if exists "owner_verification_documents_read_admin" on storage.objects;
create policy "owner_verification_documents_read_admin"
  on storage.objects for select
  using (
    bucket_id = 'owner-verification-documents'
    and public.is_current_user_admin()
  );

notify pgrst, 'reload schema';

commit;
