begin;

-- Keep the RPC contract used by installed Android clients. Historical approved
-- posts retain their community type, captions, threads, source IDs and votes.
create or replace function public.vote_on_spot_submission(target_submission_id uuid, next_vote_type text)
returns table(vote_count integer, up_count integer, down_count integer, vote_type text, voted boolean)
language plpgsql security definer set search_path = '' as $$
declare
  voter_id uuid := auth.uid();
  requested_type text := lower(trim(next_vote_type));
  previous_type text;
  selected_type text;
  submission public.spot_submissions%rowtype;
  voter_profile public.profiles%rowtype;
  voter_name text;
begin
  if voter_id is null then
    raise exception 'Authentication is required to vote.' using errcode='42501';
  end if;
  -- Preserve whichever active-account guard this installation already uses,
  -- including deletion-aware guards. Never replace it with a weaker version.
  perform public.require_active_account();
  if requested_type is null or requested_type not in ('up','down') then
    raise exception 'Vote type must be up or down.' using errcode='22023';
  end if;

  -- Serialize toggles for this submission so counters and notifications reflect
  -- a single committed vote state, including concurrent calls by one user.
  select s.* into submission from public.spot_submissions s
    where s.id=target_submission_id for update;
  if not found then
    raise exception 'Spot post is unavailable.' using errcode='P0002';
  end if;
  if submission.status not in ('pending','approved') or not exists(
    select 1 from public.local_updates u
    where u.source_id=submission.id::text
      and u.source_type in ('spot_submission','community')
      and u.user_id=submission.submitter_id
  ) then
    raise exception 'Spot post is unavailable.' using errcode='P0002';
  end if;

  select v.vote_type into previous_type from public.spot_submission_votes v
    where v.submission_id=submission.id and v.user_id=voter_id;
  if previous_type=requested_type then
    delete from public.spot_submission_votes v
      where v.submission_id=submission.id and v.user_id=voter_id;
    selected_type := null;
  else
    insert into public.spot_submission_votes(submission_id,user_id,vote_type)
      values(submission.id,voter_id,requested_type)
      on conflict(submission_id,user_id) do update
        set vote_type=excluded.vote_type,created_at=now();
    selected_type := requested_type;
  end if;

  select count(*) filter(where v.vote_type='up')::integer,
    count(*) filter(where v.vote_type='down')::integer
    into up_count,down_count from public.spot_submission_votes v
    where v.submission_id=submission.id;
  vote_count := up_count-down_count;
  update public.local_updates u set spot_count=vote_count,updated_at=now()
    where u.source_id=submission.id::text
      and u.source_type in ('spot_submission','community')
      and u.user_id=submission.submitter_id;

  if selected_type='up' and previous_type is distinct from 'up'
    and submission.submitter_id<>voter_id then
    select p.* into voter_profile from public.profiles p where p.id=voter_id;
    voter_name := coalesce(nullif(trim(voter_profile.display_name),''),
      split_part(voter_profile.email,'@',1),'CebSpot user');
    insert into public.activities(user_id,user_name,user_photo_url,action,
      target_id,target_name,type,content,spot_name)
    values(submission.submitter_id,voter_name,voter_profile.photo_url,
      'liked your spot',submission.id::text,submission.name,'spot_liked',
      voter_name || ' liked your spot.',submission.name);
  end if;
  return query select vote_count,up_count,down_count,selected_type,selected_type is not null;
end;
$$;
revoke all on function public.vote_on_spot_submission(uuid,text) from public,anon;
grant execute on function public.vote_on_spot_submission(uuid,text) to authenticated;

-- Older clients use the toggle endpoint; both entry points share validation,
-- locking, counters, notification behavior and the active-account guard.
create or replace function public.toggle_spot_submission_vote(target_submission_id uuid)
returns table(vote_count integer,voted boolean)
language sql security definer set search_path = '' as $$
  select v.vote_count,v.voted
  from public.vote_on_spot_submission(target_submission_id,'up') v;
$$;
revoke all on function public.toggle_spot_submission_vote(uuid) from public,anon;
grant execute on function public.toggle_spot_submission_vote(uuid) to authenticated;

-- Client writes must use these RPCs so eligibility, counters and notifications
-- cannot be bypassed with a direct table insert. Own-vote reads remain.
revoke insert,update,delete on public.spot_submission_votes from public,anon,authenticated;
-- The old read policy exposed each voter's selected state to every account.
-- The feed uses aggregate counters; only the current user's own selection is
-- needed to render the selected button state.
drop policy if exists "spot_submission_votes_read" on public.spot_submission_votes;
drop policy if exists spot_submission_votes_read_own on public.spot_submission_votes;
create policy spot_submission_votes_read_own on public.spot_submission_votes
  for select to authenticated using (user_id=auth.uid());

-- Older approvals may have persisted votes while leaving the relabelled
-- community post's cached counter stale. Rebuild only counters backed by a
-- matching, non-rejected submission; do not touch post content or timestamps.
update public.local_updates u set spot_count=(
  select coalesce(sum(case v.vote_type when 'up' then 1 else -1 end),0)::integer
  from public.spot_submission_votes v
  where v.submission_id=s.id
)
from public.spot_submissions s
where u.source_id=s.id::text
  and u.source_type in ('spot_submission','community')
  and u.user_id=s.submitter_id
  and s.status in ('pending','approved');

notify pgrst,'reload schema';
commit;
