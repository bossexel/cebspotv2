-- CebSpot replies repair
-- Run this in Supabase SQL Editor if the app still says replies need the updated SQL.
-- It only installs threaded Activity comments and Spot review replies.

create extension if not exists "pgcrypto";

alter table public.local_update_comments
  add column if not exists parent_comment_id uuid references public.local_update_comments(id) on delete cascade;

create index if not exists local_update_comments_parent_idx
  on public.local_update_comments(parent_comment_id, created_at);

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

revoke all on function public.add_local_update_comment(uuid, text, uuid) from public;
grant execute on function public.add_local_update_comment(uuid, text, uuid) to authenticated;
grant select on table public.local_update_comments to anon, authenticated;

create table if not exists public.review_replies (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  review_id uuid not null references public.reviews(id) on delete cascade,
  parent_reply_id uuid references public.review_replies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  user_name text not null,
  user_photo_url text,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.review_replies
  add column if not exists parent_reply_id uuid references public.review_replies(id) on delete cascade;

create index if not exists review_replies_spot_idx on public.review_replies(spot_id, created_at);
create index if not exists review_replies_review_idx on public.review_replies(review_id, created_at);
create index if not exists review_replies_parent_idx on public.review_replies(parent_reply_id, created_at);

alter table public.review_replies enable row level security;

drop policy if exists "review_replies_read" on public.review_replies;
drop policy if exists "review_replies_insert_own" on public.review_replies;
drop policy if exists "review_replies_delete_own" on public.review_replies;

create policy "review_replies_read"
  on public.review_replies for select
  using (true);

create policy "review_replies_insert_own"
  on public.review_replies for insert
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

create policy "review_replies_delete_own"
  on public.review_replies for delete
  using (user_id = auth.uid());

grant select on table public.review_replies to anon, authenticated;
grant insert, delete on table public.review_replies to authenticated;

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

revoke all on function public.vote_on_spot_submission(uuid, text) from public;
revoke all on function public.toggle_spot_submission_vote(uuid) from public;
grant execute on function public.vote_on_spot_submission(uuid, text) to authenticated;
grant execute on function public.toggle_spot_submission_vote(uuid) to authenticated;

alter table public.activities replica identity full;
alter table public.local_update_comments replica identity full;
alter table public.review_replies replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.activities;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.local_update_comments;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.review_replies;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';

-- Verification queries:
-- select column_name from information_schema.columns where table_schema = 'public' and table_name = 'local_update_comments' and column_name = 'parent_comment_id';
-- select to_regclass('public.review_replies') as review_replies_table;
-- select proname, oidvectortypes(proargtypes) as args from pg_proc join pg_namespace on pg_namespace.oid = pg_proc.pronamespace where nspname = 'public' and proname = 'add_local_update_comment';
