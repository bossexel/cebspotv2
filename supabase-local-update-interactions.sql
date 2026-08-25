-- CebSpot live comments and spot votes
-- Run this once in the Supabase SQL Editor before testing Activity interactions.

alter table public.local_updates
  add column if not exists media_urls text[] default '{}';

create table if not exists public.local_update_comments (
  id uuid primary key default gen_random_uuid(),
  local_update_id uuid not null references public.local_updates(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  user_name text not null,
  user_photo_url text,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists local_update_comments_update_created_idx
  on public.local_update_comments(local_update_id, created_at);

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

create or replace function public.add_local_update_comment(
  target_local_update_id uuid,
  comment_body text
)
returns public.local_update_comments
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_body text := trim(comment_body);
  created_comment public.local_update_comments%rowtype;
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

  insert into public.local_update_comments (
    local_update_id,
    user_id,
    user_name,
    user_photo_url,
    body
  )
  select
    target_local_update_id,
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

  return created_comment;
end;
$$;

drop function if exists public.toggle_spot_submission_vote(uuid);

create function public.toggle_spot_submission_vote(target_submission_id uuid)
returns table (vote_count integer, voted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  deleted_vote_id uuid;
  next_vote_count integer;
  is_voted boolean;
begin
  if current_user_id is null then
    raise exception 'Authentication is required to vote.';
  end if;

  if not exists (select 1 from public.spot_submissions where id = target_submission_id) then
    raise exception 'Spot submission not found.';
  end if;

  delete from public.spot_submission_votes
  where submission_id = target_submission_id
    and user_id = current_user_id
  returning id into deleted_vote_id;

  if deleted_vote_id is null then
    insert into public.spot_submission_votes (submission_id, user_id, vote_type)
    values (target_submission_id, current_user_id, 'up')
    on conflict (submission_id, user_id) do nothing;
    is_voted := true;
  else
    is_voted := false;
  end if;

  select count(*)::integer
  into next_vote_count
  from public.spot_submission_votes
  where submission_id = target_submission_id;

  update public.local_updates
  set spot_count = next_vote_count,
      updated_at = now()
  where source_type = 'spot_submission'
    and source_id = target_submission_id::text;

  return query select next_vote_count, is_voted;
end;
$$;

revoke all on function public.add_local_update_comment(uuid, text) from public;
revoke all on function public.toggle_spot_submission_vote(uuid) from public;
grant execute on function public.add_local_update_comment(uuid, text) to authenticated;
grant execute on function public.toggle_spot_submission_vote(uuid) to authenticated;

update public.local_updates local_update
set comments_count = (
  select count(*)::integer
  from public.local_update_comments comment
  where comment.local_update_id = local_update.id
);

alter table public.local_updates replica identity full;
alter table public.local_update_comments replica identity full;
alter table public.spot_submission_votes replica identity full;

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
