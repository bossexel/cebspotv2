-- Restore the protected admin delete RPCs expected by the deployed dashboard.
-- Each function performs both an active-account check and an admin-role check.

create or replace function public.delete_admin_spot(target_spot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_spot jsonb;
begin
  perform public.require_active_account();

  if not public.is_current_user_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', spot.id,
    'name', spot.name,
    'category', spot.category
  )
  into deleted_spot
  from public.spots spot
  where spot.id = target_spot_id
  for update;

  if deleted_spot is null then
    raise exception 'Spot not found.' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.reservations reservation
    where reservation.spot_id = target_spot_id
  ) then
    raise exception 'This spot has booking history and cannot be permanently deleted. Hide it from discovery instead.'
      using errcode = '55000';
  end if;

  delete from public.spots where id = target_spot_id;

  return deleted_spot || jsonb_build_object('deleted', true, 'deletedAt', now());
end;
$$;

revoke all on function public.delete_admin_spot(uuid) from public, anon;
grant execute on function public.delete_admin_spot(uuid) to authenticated, service_role;

create or replace function public.delete_admin_owner_request(target_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_request public.owner_access_requests%rowtype;
  deleted_activity_count integer := 0;
begin
  perform public.require_active_account();

  if not public.is_current_user_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  select *
  into deleted_request
  from public.owner_access_requests
  where id = target_request_id
  for update;

  if not found then
    raise exception 'Owner access request not found.' using errcode = 'P0002';
  end if;

  delete from public.activities
  where target_id = target_request_id::text
    and type in ('owner_access', 'owner_access_approved', 'owner_access_rejected');
  get diagnostics deleted_activity_count = row_count;

  delete from public.owner_access_requests where id = target_request_id;

  return to_jsonb(deleted_request) || jsonb_build_object(
    'deleted', true,
    'deletedAt', now(),
    'deletedActivityCount', deleted_activity_count
  );
end;
$$;

revoke all on function public.delete_admin_owner_request(uuid) from public, anon;
grant execute on function public.delete_admin_owner_request(uuid) to authenticated, service_role;

create or replace function public.delete_admin_spot_submission(target_submission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_submission public.spot_submissions%rowtype;
  deleted_activity_count integer := 0;
  deleted_update_count integer := 0;
  deleted_vote_count integer := 0;
begin
  perform public.require_active_account();

  if not public.is_current_user_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  select *
  into deleted_submission
  from public.spot_submissions
  where id = target_submission_id
  for update;

  if not found then
    raise exception 'Spot submission not found.' using errcode = 'P0002';
  end if;

  if deleted_submission.status <> 'pending' then
    raise exception 'Only pending spot submissions can be permanently deleted.' using errcode = '55000';
  end if;

  select count(*)::integer
  into deleted_vote_count
  from public.spot_submission_votes
  where submission_id = target_submission_id;

  delete from public.activities
  where target_id = target_submission_id::text
    and type in ('spot_liked', 'spot_comment', 'submission');
  get diagnostics deleted_activity_count = row_count;

  delete from public.local_updates
  where source_type = 'spot_submission'
    and source_id = target_submission_id::text;
  get diagnostics deleted_update_count = row_count;

  delete from public.spot_submissions where id = target_submission_id;

  return jsonb_build_object(
    'id', deleted_submission.id::text,
    'name', deleted_submission.name,
    'status', deleted_submission.status,
    'deleted', true,
    'deletedAt', now(),
    'deletedVoteCount', deleted_vote_count,
    'deletedActivityCount', deleted_activity_count,
    'deletedCommunityPostCount', deleted_update_count
  );
end;
$$;

revoke all on function public.delete_admin_spot_submission(uuid) from public, anon;
grant execute on function public.delete_admin_spot_submission(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
