begin;

-- Existing hosted installations may predate the account-erasure rollout. Add
-- only the identity boundary required by Account Details and post publishing;
-- never replace an existing deletion-aware account guard or change bookings.
do $migration$
begin
  if to_regprocedure('public.require_active_account()') is null then
    execute $definition$
      create function public.require_active_account() returns void
      language plpgsql security definer set search_path='' as $body$
      begin
        if auth.uid() is null or not exists (
          select 1 from public.profiles p join auth.users u on u.id=p.id
          where p.id=auth.uid() and u.email_confirmed_at is not null
        ) then
          raise exception 'A confirmed signed-in account is required.' using errcode='42501';
        end if;
      end;
      $body$;
    $definition$;
    revoke all on function public.require_active_account() from public,anon;
    grant execute on function public.require_active_account() to authenticated,service_role;
  end if;

  if to_regprocedure('public.guard_profile_identity()') is null then
    execute $definition$
      create function public.guard_profile_identity() returns trigger
      language plpgsql set search_path='' as $body$
      begin
        if current_user in ('anon','authenticated') then
          if tg_op='INSERT' then
            raise exception 'Profiles are created by the authenticated identity service.' using errcode='42501';
          end if;
          if new.id is distinct from old.id or new.email is distinct from old.email or new.role is distinct from old.role then
            raise exception 'Profile identity and role are server-owned.' using errcode='42501';
          end if;
        end if;
        return new;
      end;
      $body$;
    $definition$;
    revoke all on function public.guard_profile_identity() from public,anon,authenticated;
    create trigger profiles_identity_boundary before insert or update on public.profiles
      for each row execute function public.guard_profile_identity();
  end if;
end;
$migration$;

notify pgrst,'reload schema';
commit;
