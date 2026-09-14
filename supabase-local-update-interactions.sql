-- CebSpot live comments and spot votes
-- Run this once in the Supabase SQL Editor before testing Activity interactions.

alter table public.local_updates
  add column if not exists media_urls text[] default '{}';

-- Preserve every uploaded spot photo in public Activity posts. This also
-- repairs legacy rows that were created with only the first cover image.
update public.local_updates local_update
set
  media_urls = submission.images,
  updated_at = now()
from public.spot_submissions submission
where local_update.source_type = 'spot_submission'
  and local_update.source_id = submission.id::text
  and coalesce(cardinality(local_update.media_urls), 0) = 0
  and coalesce(cardinality(submission.images), 0) > 0;

update public.local_updates
set
  media_urls = array[image_url],
  updated_at = now()
where coalesce(cardinality(media_urls), 0) = 0
  and nullif(trim(image_url), '') is not null;

update public.local_updates
set media_urls = '{}'
where media_urls is null;

alter table public.local_updates
  alter column media_urls set default '{}',
  alter column media_urls set not null;

create table if not exists public.local_update_comments (
  id uuid primary key default gen_random_uuid(),
  local_update_id uuid not null references public.local_updates(id) on delete cascade,
  parent_comment_id uuid references public.local_update_comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  user_name text not null,
  user_photo_url text,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.local_update_comments
  add column if not exists parent_comment_id uuid references public.local_update_comments(id) on delete cascade;

create index if not exists local_update_comments_update_created_idx
  on public.local_update_comments(local_update_id, created_at);
create index if not exists local_update_comments_parent_idx
  on public.local_update_comments(parent_comment_id, created_at);

alter table public.local_update_comments enable row level security;

drop policy if exists "local_update_comments_read" on public.local_update_comments;
drop policy if exists "local_update_comments_delete_own" on public.local_update_comments;

create policy "local_update_comments_read"
  on public.local_update_comments for select
  using (true);

create policy "local_update_comments_delete_own"
  on public.local_update_comments for delete
  using (user_id = auth.uid());

grant select on table public.local_update_comments to anon, authenticated;
grant delete on table public.local_update_comments to authenticated;

create or replace function public.sync_local_update_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_update_id uuid;
begin
  if tg_op = 'DELETE' then
    target_update_id := old.local_update_id;
  else
    target_update_id := new.local_update_id;
  end if;

  update public.local_updates
  set comments_count = (
        select count(*)::integer
        from public.local_update_comments
        where local_update_id = target_update_id
      ),
      updated_at = now()
  where id = target_update_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists local_update_comments_sync_count on public.local_update_comments;

create trigger local_update_comments_sync_count
  after insert or delete on public.local_update_comments
  for each row execute function public.sync_local_update_comment_count();

drop function if exists public.add_local_update_comment(uuid, text);
drop function if exists public.add_local_update_comment(uuid, text, uuid);

create function public.add_local_update_comment(
  target_local_update_id uuid,
  comment_body text,
  parent_comment_id uuid default null
)
returns public.local_update_comments
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_body text := trim(comment_body);
  target_parent_comment_id uuid := $3;
  created_comment public.local_update_comments%rowtype;
  commented_update public.local_updates%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication is required to comment.';
  end if;

  if normalized_body is null or char_length(normalized_body) = 0 then
    raise exception 'Write a comment before sending.';
  end if;

  if char_length(normalized_body) > 500 then
    raise exception 'Comments can contain up to 500 characters.';
  end if;

  if not exists (select 1 from public.local_updates where id = target_local_update_id) then
    raise exception 'Local update not found.';
  end if;

  if target_parent_comment_id is not null and not exists (
    select 1
    from public.local_update_comments parent
    where parent.id = target_parent_comment_id
      and parent.local_update_id = target_local_update_id
      and parent.parent_comment_id is null
  ) then
    raise exception 'Reply target not found.';
  end if;

  insert into public.local_update_comments (
    local_update_id,
    parent_comment_id,
    user_id,
    user_name,
    user_photo_url,
    body
  )
  select
    target_local_update_id,
    target_parent_comment_id,
    profile.id,
    coalesce(nullif(trim(profile.display_name), ''), split_part(profile.email, '@', 1), 'CebSpot user'),
    profile.photo_url,
    normalized_body
  from public.profiles profile
  where profile.id = current_user_id
  returning * into created_comment;

  if not found then
    raise exception 'Your profile is unavailable.';
  end if;

  select *
  into commented_update
  from public.local_updates
  where id = target_local_update_id;

  if commented_update.source_type = 'spot_submission'
    and commented_update.user_id is not null
    and commented_update.user_id <> current_user_id then
    insert into public.activities (
      user_id,
      user_name,
      user_photo_url,
      action,
      target_id,
      target_name,
      type,
      content,
      spot_name
    )
    values (
      commented_update.user_id,
      created_comment.user_name,
      created_comment.user_photo_url,
      'commented on your spot',
      coalesce(commented_update.source_id, commented_update.id::text),
      commented_update.title,
      'spot_comment',
      created_comment.user_name || ' commented on your spot.',
      commented_update.title
    );
  end if;

  return created_comment;
end;
$$;

drop function if exists public.get_spot_submission_group_media(uuid);

create function public.get_spot_submission_group_media(target_submission_id uuid)
returns table (media_url text)
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select *
    from public.spot_submissions
    where id = target_submission_id
  ),
  related as (
    select submission.*
    from public.spot_submissions submission
    cross join target
    where submission.status = 'pending'
      and (
        submission.id = target.id
        or lower(trim(submission.name)) = lower(trim(target.name))
        or (
          submission.category = target.category
          and public.distance_km(submission.latitude, submission.longitude, target.latitude, target.longitude) <= 0.25
        )
      )
  ),
  media as (
    select
      nullif(trim(uploaded.media_url), '') as media_url,
      min(related.created_at) as first_seen,
      min(uploaded.ordinality) as first_index
    from related
    cross join lateral unnest(coalesce(related.images, '{}'::text[])) with ordinality as uploaded(media_url, ordinality)
    group by nullif(trim(uploaded.media_url), '')
  )
  select media.media_url
  from media
  where media.media_url is not null
  order by media.first_seen, media.first_index;
$$;

drop function if exists public.publish_spot_submission_local_update(uuid);

create function public.publish_spot_submission_local_update(target_submission_id uuid)
returns table (
  local_update_id uuid,
  canonical_submission_id uuid,
  similar_submission_count integer,
  vote_count integer,
  grouped boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  submitted public.spot_submissions%rowtype;
  canonical public.spot_submissions%rowtype;
  submitter public.profiles%rowtype;
  v_local_update_id uuid;
  v_media_urls text[];
  v_similar_submission_count integer;
  v_vote_count integer;
  v_up_count integer;
  v_down_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication is required to submit a spot.';
  end if;

  select *
  into submitted
  from public.spot_submissions
  where id = target_submission_id
    and submitter_id = current_user_id;

  if not found then
    raise exception 'Spot submission not found.';
  end if;

  select candidate.*
  into canonical
  from public.spot_submissions candidate
  where candidate.status = 'pending'
    and (
      lower(trim(candidate.name)) = lower(trim(submitted.name))
      or (
        candidate.category = submitted.category
        and public.distance_km(candidate.latitude, candidate.longitude, submitted.latitude, submitted.longitude) <= 0.25
      )
    )
  order by candidate.created_at asc, candidate.id asc
  limit 1;

  if not found then
    canonical := submitted;
  end if;

  select *
  into submitter
  from public.profiles
  where id = canonical.submitter_id;

  insert into public.spot_submission_votes (submission_id, user_id, vote_type)
  values (canonical.id, current_user_id, 'up')
  on conflict (submission_id, user_id) do update
    set vote_type = 'up',
        created_at = now();

  select
    count(*) filter (where spot_submission_votes.vote_type = 'up')::integer,
    count(*) filter (where spot_submission_votes.vote_type = 'down')::integer
  into v_up_count, v_down_count
  from public.spot_submission_votes
  where submission_id = canonical.id;

  v_vote_count := v_up_count - v_down_count;

  select coalesce(array_agg(group_media.media_url), '{}'::text[])
  into v_media_urls
  from public.get_spot_submission_group_media(canonical.id) group_media;

  select greatest(count(*)::integer - 1, 0)
  into v_similar_submission_count
  from public.spot_submissions related
  where related.status = 'pending'
    and (
      related.id = canonical.id
      or lower(trim(related.name)) = lower(trim(canonical.name))
      or (
        related.category = canonical.category
        and public.distance_km(related.latitude, related.longitude, canonical.latitude, canonical.longitude) <= 0.25
      )
    );

  select id
  into v_local_update_id
  from public.local_updates
  where source_type = 'spot_submission'
    and source_id = canonical.id::text
  order by created_at asc
  limit 1;

  if v_local_update_id is null then
    insert into public.local_updates (
      user_id,
      user_name,
      user_photo_url,
      title,
      body,
      location_name,
      latitude,
      longitude,
      image_url,
      media_urls,
      source_type,
      source_id,
      spot_count,
      comments_count
    )
    values (
      canonical.submitter_id,
      coalesce(nullif(trim(submitter.display_name), ''), split_part(submitter.email, '@', 1), 'Explorer'),
      submitter.photo_url,
      canonical.name,
      coalesce(canonical.description, 'Shared a new spot for the CebSpot community.'),
      canonical.address,
      canonical.latitude,
      canonical.longitude,
      v_media_urls[1],
      v_media_urls,
      'spot_submission',
      canonical.id::text,
      v_vote_count,
      0
    )
    returning id into v_local_update_id;
  else
    update public.local_updates
    set image_url = coalesce(v_media_urls[1], image_url),
        media_urls = v_media_urls,
        spot_count = v_vote_count,
        updated_at = now()
    where id = v_local_update_id;
  end if;

  update public.local_updates
  set spot_count = v_vote_count,
      media_urls = v_media_urls,
      image_url = coalesce(v_media_urls[1], image_url),
      updated_at = now()
  where source_type = 'spot_submission'
    and source_id = canonical.id::text;

  local_update_id := v_local_update_id;
  canonical_submission_id := canonical.id;
  similar_submission_count := v_similar_submission_count;
  vote_count := v_vote_count;
  grouped := canonical.id <> submitted.id;
  return next;
end;
$$;

alter table public.spot_submission_votes drop constraint if exists spot_submission_votes_vote_type_check;
alter table public.spot_submission_votes
  add constraint spot_submission_votes_vote_type_check check (vote_type in ('up', 'down'));

drop function if exists public.vote_on_spot_submission(uuid, text);
drop function if exists public.toggle_spot_submission_vote(uuid);

create function public.vote_on_spot_submission(target_submission_id uuid, next_vote_type text)
returns table (vote_count integer, up_count integer, down_count integer, vote_type text, voted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  requested_vote_type text := lower(trim(next_vote_type));
  previous_vote_type text;
  selected_vote_type text;
  voted_submission public.spot_submissions%rowtype;
  voter_profile public.profiles%rowtype;
  voter_name text;
begin
  if current_user_id is null then
    raise exception 'Authentication is required to vote.';
  end if;

  if requested_vote_type not in ('up', 'down') then
    raise exception 'Vote type must be up or down.';
  end if;

  select *
  into voted_submission
  from public.spot_submissions
  where id = target_submission_id;

  if not found then
    raise exception 'Spot submission not found.';
  end if;

  select spot_submission_votes.vote_type
  into previous_vote_type
  from public.spot_submission_votes
  where submission_id = target_submission_id
    and user_id = current_user_id;

  if previous_vote_type = requested_vote_type then
    delete from public.spot_submission_votes
    where submission_id = target_submission_id
      and user_id = current_user_id;
    selected_vote_type := null;
  elsif previous_vote_type is null then
    insert into public.spot_submission_votes (submission_id, user_id, vote_type)
    values (target_submission_id, current_user_id, requested_vote_type);
    selected_vote_type := requested_vote_type;
  else
    update public.spot_submission_votes
    set vote_type = requested_vote_type,
        created_at = now()
    where submission_id = target_submission_id
      and user_id = current_user_id;
    selected_vote_type := requested_vote_type;
  end if;

  select
    count(*) filter (where spot_submission_votes.vote_type = 'up')::integer,
    count(*) filter (where spot_submission_votes.vote_type = 'down')::integer
  into up_count, down_count
  from public.spot_submission_votes
  where submission_id = target_submission_id;

  vote_count := up_count - down_count;

  update public.local_updates
  set spot_count = vote_count,
      updated_at = now()
  where source_type = 'spot_submission'
    and source_id = target_submission_id::text;

  if selected_vote_type = 'up'
    and previous_vote_type is distinct from 'up'
    and voted_submission.submitter_id <> current_user_id then
    select *
    into voter_profile
    from public.profiles
    where id = current_user_id;

    voter_name := coalesce(
      nullif(trim(voter_profile.display_name), ''),
      split_part(voter_profile.email, '@', 1),
      'CebSpot user'
    );

    insert into public.activities (
      user_id,
      user_name,
      user_photo_url,
      action,
      target_id,
      target_name,
      type,
      content,
      spot_name
    )
    values (
      voted_submission.submitter_id,
      voter_name,
      voter_profile.photo_url,
      'liked your spot',
      voted_submission.id::text,
      voted_submission.name,
      'spot_liked',
      voter_name || ' liked your spot.',
      voted_submission.name
    );
  end if;

  return query select vote_count, up_count, down_count, selected_vote_type, selected_vote_type is not null;
end;
$$;

create function public.toggle_spot_submission_vote(target_submission_id uuid)
returns table (vote_count integer, voted boolean)
language sql
security definer
set search_path = public
as $$
  select vote_count, voted
  from public.vote_on_spot_submission(target_submission_id, 'up');
$$;

revoke all on function public.add_local_update_comment(uuid, text, uuid) from public;
revoke all on function public.get_spot_submission_group_media(uuid) from public;
revoke all on function public.publish_spot_submission_local_update(uuid) from public;
revoke all on function public.vote_on_spot_submission(uuid, text) from public;
revoke all on function public.toggle_spot_submission_vote(uuid) from public;
grant execute on function public.add_local_update_comment(uuid, text, uuid) to authenticated;
grant execute on function public.get_spot_submission_group_media(uuid) to anon, authenticated;
grant execute on function public.publish_spot_submission_local_update(uuid) to authenticated;
grant execute on function public.vote_on_spot_submission(uuid, text) to authenticated;
grant execute on function public.toggle_spot_submission_vote(uuid) to authenticated;

update public.local_updates local_update
set comments_count = (
  select count(*)::integer
  from public.local_update_comments comment
  where comment.local_update_id = local_update.id
);

alter table public.local_updates replica identity full;
alter table public.activities replica identity full;
alter table public.local_update_comments replica identity full;
alter table public.spot_submission_votes replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.activities;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.local_updates;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.local_update_comments;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.spot_submission_votes;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
