-- Run this in the Supabase SQL Editor to enable privacy-safe spot ownership checks.

create or replace function public.get_spot_claim_status(target_spot_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  target_spot public.spots%rowtype;
  primary_owner_id uuid;
  primary_owner_email text;
  local_part text;
  domain_part text;
  masked_owner_email text;
  current_user_has_access boolean := false;
begin
  select *
  into target_spot
  from public.spots
  where id = target_spot_id;

  if not found then
    raise exception 'Spot not found.';
  end if;

  primary_owner_id := target_spot.owner_id;

  if primary_owner_id is null then
    select access.owner_id
    into primary_owner_id
    from public.owner_spot_access access
    where access.spot_id = target_spot.id
    order by case when access.role = 'owner' then 0 else 1 end, access.created_at asc
    limit 1;
  end if;

  if primary_owner_id is not null then
    select lower(trim(profile.email))
    into primary_owner_email
    from public.profiles profile
    where profile.id = primary_owner_id;

    if primary_owner_email is not null and position('@' in primary_owner_email) > 1 then
      local_part := split_part(primary_owner_email, '@', 1);
      domain_part := split_part(primary_owner_email, '@', 2);
      masked_owner_email :=
        left(local_part, least(2, length(local_part))) || '•••@' || domain_part;
    else
      masked_owner_email := 'a verified account';
    end if;
  end if;

  if auth.uid() is not null then
    current_user_has_access :=
      primary_owner_id = auth.uid()
      or exists (
        select 1
        from public.owner_spot_access access
        where access.spot_id = target_spot.id
          and access.owner_id = auth.uid()
      );
  end if;

  return jsonb_build_object(
    'spotId', target_spot.id::text,
    'spotName', target_spot.name,
    'managed', primary_owner_id is not null,
    'ownerHint', masked_owner_email,
    'hasAccess', current_user_has_access
  );
end;
$function$;

revoke all on function public.get_spot_claim_status(uuid) from public;
grant execute on function public.get_spot_claim_status(uuid) to anon, authenticated;
