-- Dedicated CebSpot business-owner account provisioning.
-- Run this in the Supabase SQL Editor before deploying provision-owner-account.

-- Remove prototype-only restrictions that tied Test Cebspot Club to one email.
drop trigger if exists spots_enforce_test_cebspot_owner on public.spots;
drop trigger if exists owner_spot_access_enforce_test_cebspot_owner on public.owner_spot_access;
drop function if exists public.enforce_test_cebspot_spot_owner();
drop function if exists public.enforce_test_cebspot_owner_access();

alter table public.owner_access_requests
  alter column requester_id drop not null,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

create or replace function public.get_owner_business_email_status(candidate_email text)
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $function$
declare
  normalized_email text := lower(trim(coalesce(candidate_email, '')));
begin
  if normalized_email = '' or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return 'invalid';
  end if;

  if exists (
    select 1 from auth.users where lower(trim(email)) = normalized_email
  ) or exists (
    select 1 from public.profiles where lower(trim(email)) = normalized_email
  ) then
    return 'registered';
  end if;

  if exists (
    select 1
    from public.owner_access_requests
    where lower(trim(contact_email)) = normalized_email
      and status = 'pending'
  ) then
    return 'pending';
  end if;

  return 'available';
end;
$function$;

revoke all on function public.get_owner_business_email_status(text) from public;
grant execute on function public.get_owner_business_email_status(text) to anon, authenticated;

create or replace function public.reject_unavailable_owner_business_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  email_status text;
begin
  email_status := public.get_owner_business_email_status(new.contact_email);

  if email_status = 'registered' then
    raise exception 'This email already belongs to a CebSpot user. Use a separate, unregistered business email for the owner account.'
      using errcode = '23505';
  elsif email_status = 'pending' then
    raise exception 'An owner access request for this business email is already pending.'
      using errcode = '23505';
  elsif email_status = 'invalid' then
    raise exception 'Enter a valid business email address.'
      using errcode = '22023';
  end if;

  return new;
end;
$function$;

drop trigger if exists owner_requests_reject_unavailable_email on public.owner_access_requests;
create trigger owner_requests_reject_unavailable_email
before insert on public.owner_access_requests
for each row execute function public.reject_unavailable_owner_business_email();

create or replace function public.finalize_dedicated_owner_account(
  target_request_id uuid,
  dedicated_owner_id uuid,
  reviewing_admin_id uuid,
  notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  owner_request public.owner_access_requests%rowtype;
  owner_profile public.profiles%rowtype;
  admin_profile public.profiles%rowtype;
  linked_spot public.spots%rowtype;
  normalized_notes text := nullif(trim(coalesce(notes, '')), '');
  matching_spot_count integer := 0;
begin
  select * into admin_profile
  from public.profiles
  where id = reviewing_admin_id;

  if admin_profile.id is null or admin_profile.role <> 'admin' then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  select * into owner_request
  from public.owner_access_requests
  where id = target_request_id
  for update;

  if not found then
    raise exception 'Owner access request not found.';
  end if;

  if owner_request.status <> 'pending' then
    if owner_request.status = 'approved' then
      return jsonb_build_object(
        'ok', true,
        'requestId', owner_request.id::text,
        'status', owner_request.status,
        'spotId', owner_request.spot_id::text,
        'alreadyReviewed', true
      );
    end if;
    raise exception 'This owner access request has already been reviewed.';
  end if;

  if owner_request.requester_id is not null then
    raise exception 'This request is linked to an existing CebSpot user. A separate business email is required.';
  end if;

  select * into owner_profile
  from public.profiles
  where id = dedicated_owner_id
  for update;

  if owner_profile.id is null then
    raise exception 'The dedicated owner profile was not created.';
  end if;

  if lower(trim(owner_profile.email)) <> lower(trim(owner_request.contact_email)) then
    raise exception 'The invited account email does not match the verified business email.';
  end if;

  if owner_profile.role = 'admin' then
    raise exception 'An admin account cannot be assigned as a venue owner.';
  end if;

  if owner_request.spot_id is not null then
    select * into linked_spot
    from public.spots
    where id = owner_request.spot_id
    for update;
  else
    select count(*)::integer into matching_spot_count
    from public.spots
    where regexp_replace(lower(trim(name)), '[^a-z0-9]+', '', 'g') =
          regexp_replace(lower(trim(owner_request.spot_name)), '[^a-z0-9]+', '', 'g')
      and regexp_replace(lower(trim(address)), '[^a-z0-9]+', '', 'g') =
          regexp_replace(lower(trim(owner_request.spot_address)), '[^a-z0-9]+', '', 'g');

    if matching_spot_count = 0 then
      select count(*)::integer into matching_spot_count
      from public.spots
      where regexp_replace(lower(trim(name)), '[^a-z0-9]+', '', 'g') =
            regexp_replace(lower(trim(owner_request.spot_name)), '[^a-z0-9]+', '', 'g');

      if matching_spot_count = 0 then
        raise exception 'No CebSpot listing matches this spot. Create the listing before approving owner access.';
      elsif matching_spot_count > 1 then
        raise exception 'Multiple listings share this spot name. Link the request to the correct spot before approval.';
      end if;

      select * into linked_spot
      from public.spots
      where regexp_replace(lower(trim(name)), '[^a-z0-9]+', '', 'g') =
            regexp_replace(lower(trim(owner_request.spot_name)), '[^a-z0-9]+', '', 'g')
      for update;
    elsif matching_spot_count > 1 then
      raise exception 'Multiple listings match this request. Resolve the duplicate spots before approval.';
    else
      select * into linked_spot
      from public.spots
      where regexp_replace(lower(trim(name)), '[^a-z0-9]+', '', 'g') =
            regexp_replace(lower(trim(owner_request.spot_name)), '[^a-z0-9]+', '', 'g')
        and regexp_replace(lower(trim(address)), '[^a-z0-9]+', '', 'g') =
            regexp_replace(lower(trim(owner_request.spot_address)), '[^a-z0-9]+', '', 'g')
      for update;
    end if;
  end if;

  if linked_spot.id is null then
    raise exception 'The linked spot no longer exists.';
  end if;

  if linked_spot.owner_id is not null and linked_spot.owner_id <> dedicated_owner_id then
    raise exception 'This spot already belongs to another owner. Resolve the ownership conflict before approval.';
  end if;

  if exists (
    select 1 from public.owner_spot_access
    where spot_id = linked_spot.id
      and owner_id <> dedicated_owner_id
      and role = 'owner'
  ) then
    raise exception 'This spot already has a dedicated owner account.';
  end if;

  update public.profiles
  set role = 'owner',
      display_name = coalesce(nullif(trim(display_name), ''), owner_request.contact_name),
      updated_at = now()
  where id = dedicated_owner_id;

  update public.spots
  set owner_id = dedicated_owner_id,
      updated_at = now()
  where id = linked_spot.id;

  insert into public.owner_spot_access (owner_id, spot_id, role)
  values (dedicated_owner_id, linked_spot.id, 'owner')
  on conflict (owner_id, spot_id) do update
  set role = excluded.role;

  update public.owner_access_requests
  set requester_id = dedicated_owner_id,
      status = 'approved',
      spot_id = linked_spot.id,
      admin_notes = normalized_notes,
      reviewed_by = reviewing_admin_id,
      reviewed_at = now(),
      updated_at = now()
  where id = owner_request.id;

  insert into public.activities (
    user_id, user_name, action, target_id, target_name, type, content, spot_id, spot_name
  ) values (
    dedicated_owner_id,
    'CebSpot Admin',
    'created your dedicated business account',
    owner_request.id::text,
    linked_spot.name,
    'owner_access_approved',
    'Your dedicated owner account for ' || linked_spot.name || ' is ready. Open the invitation email to set your password.',
    linked_spot.id,
    linked_spot.name
  );

  return jsonb_build_object(
    'ok', true,
    'requestId', owner_request.id::text,
    'status', 'approved',
    'spotId', linked_spot.id::text,
    'spotName', linked_spot.name,
    'ownerId', dedicated_owner_id::text,
    'alreadyReviewed', false
  );
end;
$function$;

revoke all on function public.finalize_dedicated_owner_account(uuid, uuid, uuid, text) from public;
revoke all on function public.finalize_dedicated_owner_account(uuid, uuid, uuid, text) from anon, authenticated;
grant execute on function public.finalize_dedicated_owner_account(uuid, uuid, uuid, text) to service_role;
