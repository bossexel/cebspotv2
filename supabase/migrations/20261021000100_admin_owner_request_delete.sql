begin;

-- Deletes the application/review record and its request-scoped activity notices.
-- Any already-provisioned account, spot assignment, or owner access remains
-- intact. Private verification files become unlinked and are removed by the
-- bounded private-upload maintenance job.
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

commit;
