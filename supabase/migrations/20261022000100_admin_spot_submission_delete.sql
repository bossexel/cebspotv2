begin;

-- Permanently removes a pending moderation record and its submission-scoped
-- community data. The submitter profile is intentionally preserved. Uploaded
-- files become unlinked and remain subject to bounded storage maintenance.
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

  -- Votes cascade and matched search-event references are set to null by the
  -- schema's foreign-key rules.
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

commit;
