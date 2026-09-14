-- Run this in the Supabase SQL Editor to fix owner-request approval and rejection.

drop function if exists public.review_owner_access_request(uuid, text, text);

create or replace function public.review_owner_access_request(
  target_request_id uuid,
  decision text,
  notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_request public.owner_access_requests%rowtype;
  requester_profile public.profiles%rowtype;
  linked_spot public.spots%rowtype;
  normalized_decision text := lower(trim(coalesce(decision, '')));
  normalized_notes text := nullif(trim(coalesce(notes, '')), '');
  matching_spot_count integer := 0;
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  if normalized_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected.';
  end if;

  if normalized_decision = 'approved' then
    raise exception 'Owner approvals must use the dedicated business-account provisioning function.';
  end if;

  if normalized_decision = 'rejected' and normalized_notes is null then
    raise exception 'Add a rejection reason before rejecting this request.';
  end if;

  select *
  into owner_request
  from public.owner_access_requests
  where id = target_request_id
  for update;

  if not found then
    raise exception 'Owner access request not found.';
  end if;

  if owner_request.status <> 'pending' then
    if owner_request.status = normalized_decision then
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
    select *
    into requester_profile
    from public.profiles
    where id = owner_request.requester_id
    for update;
  else
    select *
    into requester_profile
    from public.profiles
    where lower(email) = lower(owner_request.contact_email)
    order by created_at asc
    limit 1
    for update;

    if found then
      owner_request.requester_id := requester_profile.id;

      update public.owner_access_requests
      set requester_id = requester_profile.id,
          updated_at = now()
      where id = owner_request.id;
    end if;
  end if;

  if requester_profile.id is null and normalized_decision = 'approved' then
    raise exception 'Create the owner account first, using the applicant email, before approving this request.';
  end if;

  if normalized_decision = 'approved' then
    if owner_request.spot_id is not null then
      select *
      into linked_spot
      from public.spots
      where id = owner_request.spot_id
      for update;
    else
      select count(*)::integer
      into matching_spot_count
      from public.spots
      where regexp_replace(lower(trim(name)), '[^a-z0-9]+', '', 'g') =
            regexp_replace(lower(trim(owner_request.spot_name)), '[^a-z0-9]+', '', 'g')
        and regexp_replace(lower(trim(address)), '[^a-z0-9]+', '', 'g') =
            regexp_replace(lower(trim(owner_request.spot_address)), '[^a-z0-9]+', '', 'g');

      if matching_spot_count = 0 then
        select count(*)::integer
        into matching_spot_count
        from public.spots
        where regexp_replace(lower(trim(name)), '[^a-z0-9]+', '', 'g') =
              regexp_replace(lower(trim(owner_request.spot_name)), '[^a-z0-9]+', '', 'g');

        if matching_spot_count = 0 then
          raise exception 'No CebSpot listing matches this spot. Create the listing before approving owner access.';
        elsif matching_spot_count > 1 then
          raise exception 'Multiple listings share this spot name. Correct the request address or resolve the duplicates before approval.';
        end if;

        select *
        into linked_spot
        from public.spots
        where regexp_replace(lower(trim(name)), '[^a-z0-9]+', '', 'g') =
              regexp_replace(lower(trim(owner_request.spot_name)), '[^a-z0-9]+', '', 'g')
        for update;
      elsif matching_spot_count > 1 then
        raise exception 'Multiple listings match this request. Resolve the duplicate spots before approval.';
      else
        select *
        into linked_spot
        from public.spots
        where regexp_replace(lower(trim(name)), '[^a-z0-9]+', '', 'g') =
              regexp_replace(lower(trim(owner_request.spot_name)), '[^a-z0-9]+', '', 'g')
          and regexp_replace(lower(trim(address)), '[^a-z0-9]+', '', 'g') =
              regexp_replace(lower(trim(owner_request.spot_address)), '[^a-z0-9]+', '', 'g')
        for update;
      end if;
    end if;

    if not found then
      raise exception 'The linked spot no longer exists.';
    end if;

    if linked_spot.owner_id is not null and linked_spot.owner_id <> owner_request.requester_id then
      raise exception 'This spot already belongs to another owner. Resolve the ownership conflict before approval.';
    end if;

    update public.profiles
    set
      role = case when role = 'admin' then role else 'owner' end,
      updated_at = now()
    where id = owner_request.requester_id;

    update public.spots
    set owner_id = owner_request.requester_id,
        updated_at = now()
    where id = linked_spot.id;

    insert into public.owner_spot_access (owner_id, spot_id, role)
    values (owner_request.requester_id, linked_spot.id, 'owner')
    on conflict (owner_id, spot_id) do update
    set role = excluded.role;

    update public.owner_access_requests
    set
      status = 'approved',
      spot_id = linked_spot.id,
      admin_notes = normalized_notes,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
    where id = owner_request.id;

    insert into public.activities (
      user_id,
      user_name,
      action,
      target_id,
      target_name,
      type,
      content,
      spot_id,
      spot_name
    )
    values (
      owner_request.requester_id,
      'CebSpot Admin',
      'approved your owner access request',
      owner_request.id::text,
      linked_spot.name,
      'owner_access_approved',
      'Your owner access for ' || linked_spot.name || ' is ready.',
      linked_spot.id,
      linked_spot.name
    );

    return jsonb_build_object(
      'ok', true,
      'requestId', owner_request.id::text,
      'status', 'approved',
      'spotId', linked_spot.id::text,
      'spotName', linked_spot.name,
      'alreadyReviewed', false
    );
  end if;

  update public.owner_access_requests
  set
    status = 'rejected',
    admin_notes = normalized_notes,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  where id = owner_request.id;

  insert into public.activities (
    user_id,
    user_name,
    action,
    target_id,
    target_name,
    type,
    content,
    spot_name
  )
  select
    owner_request.requester_id,
    'CebSpot Admin',
    'reviewed your owner access request',
    owner_request.id::text,
    owner_request.spot_name,
    'owner_access_rejected',
    'Your owner access request for ' || owner_request.spot_name || ' was not approved.',
    owner_request.spot_name
  where owner_request.requester_id is not null;

  return jsonb_build_object(
    'ok', true,
    'requestId', owner_request.id::text,
    'status', 'rejected',
    'spotId', null,
    'spotName', owner_request.spot_name,
    'alreadyReviewed', false
  );
end;
$$;

revoke all on function public.review_owner_access_request(uuid, text, text) from public;
grant execute on function public.review_owner_access_request(uuid, text, text) to authenticated;
