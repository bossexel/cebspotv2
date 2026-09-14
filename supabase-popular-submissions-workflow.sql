-- CebSpot submitted spot workflow
-- Run this in Supabase SQL Editor after supabase-schema.sql.
-- Purpose:
-- 1. Store "Found a New Spot" photos in public Supabase Storage.
-- 2. Keep submitted spots in local updates first.
-- 3. Measure popularity with votes, searches, and similar submissions.
-- 4. Promote popular pending submissions into public Explore spots.

create extension if not exists "pgcrypto";

insert into storage.buckets (id, name, public)
values ('spot-images', 'spot-images', true)
on conflict (id) do update set public = true;

drop policy if exists "spot_images_read" on storage.objects;
drop policy if exists "spot_images_insert_own" on storage.objects;

create policy "spot_images_read"
  on storage.objects for select
  using (bucket_id = 'spot-images');

create policy "spot_images_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'spot-images'
    and auth.role() = 'authenticated'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create table if not exists spot_submission_votes (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references spot_submissions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  vote_type text not null default 'up' check (vote_type in ('up', 'down')),
  created_at timestamptz not null default now(),
  unique(submission_id, user_id)
);

alter table spot_submission_votes drop constraint if exists spot_submission_votes_vote_type_check;
alter table spot_submission_votes
  add constraint spot_submission_votes_vote_type_check check (vote_type in ('up', 'down'));

create table if not exists spot_search_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  query text not null,
  matched_submission_id uuid references spot_submissions(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists spot_submission_votes_submission_idx on spot_submission_votes(submission_id);
create index if not exists spot_search_events_submission_idx on spot_search_events(matched_submission_id, created_at desc);
create index if not exists spot_submissions_status_created_idx on spot_submissions(status, created_at desc);

alter table spot_submission_votes enable row level security;
alter table spot_search_events enable row level security;

drop policy if exists "spot_submission_votes_read" on spot_submission_votes;
drop policy if exists "spot_submission_votes_upsert_own" on spot_submission_votes;
drop policy if exists "spot_search_events_insert_any_auth" on spot_search_events;
drop policy if exists "spot_search_events_read_own" on spot_search_events;

create policy "spot_submission_votes_read"
  on spot_submission_votes for select
  using (true);

create policy "spot_submission_votes_upsert_own"
  on spot_submission_votes for insert
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

create policy "spot_search_events_insert_any_auth"
  on spot_search_events for insert
  with check (auth.role() = 'authenticated' and (user_id is null or user_id = auth.uid()));

create policy "spot_search_events_read_own"
  on spot_search_events for select
  using (user_id = auth.uid());

create or replace function public.distance_km(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
)
returns double precision
language sql
immutable
as $$
  select 6371 * 2 * asin(
    least(
      1,
      sqrt(
        power(sin(radians((lat2 - lat1) / 2)), 2) +
        cos(radians(lat1)) * cos(radians(lat2)) *
        power(sin(radians((lon2 - lon1) / 2)), 2)
      )
    )
  );
$$;

drop view if exists public.pending_spot_submission_popularity;

create or replace view public.pending_spot_submission_popularity as
select
  s.*,
  coalesce(v.up_count, 0) as up_count,
  coalesce(v.down_count, 0) as down_count,
  (coalesce(v.up_count, 0) - coalesce(v.down_count, 0)) as vote_count,
  coalesce(se.search_count, 0) as search_count,
  coalesce(sim.similar_submission_count, 0) as similar_submission_count,
  (
    greatest(coalesce(v.up_count, 0) - coalesce(v.down_count, 0), 0) * 3 +
    coalesce(se.search_count, 0) +
    coalesce(sim.similar_submission_count, 0) * 2
  ) as popularity_score
from spot_submissions s
left join (
  select
    submission_id,
    count(*) filter (where vote_type = 'up')::integer as up_count,
    count(*) filter (where vote_type = 'down')::integer as down_count
  from spot_submission_votes
  group by submission_id
) v on v.submission_id = s.id
left join (
  select matched_submission_id as submission_id, count(*)::integer as search_count
  from spot_search_events
  where matched_submission_id is not null
    and created_at >= now() - interval '30 days'
  group by matched_submission_id
) se on se.submission_id = s.id
left join lateral (
  select count(*)::integer as similar_submission_count
  from spot_submissions other
  where other.id <> s.id
    and other.status = 'pending'
    and (
      lower(trim(other.name)) = lower(trim(s.name))
      or (
        other.category = s.category
        and public.distance_km(other.latitude, other.longitude, s.latitude, s.longitude) <= 0.25
      )
    )
) sim on true
where s.status = 'pending';

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

revoke all on function public.get_spot_submission_group_media(uuid) from public;
grant execute on function public.get_spot_submission_group_media(uuid) to anon, authenticated;

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

revoke all on function public.publish_spot_submission_local_update(uuid) from public;
grant execute on function public.publish_spot_submission_local_update(uuid) to authenticated;

drop function if exists public.vote_on_spot_submission(uuid, text);

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
begin
  if current_user_id is null then
    raise exception 'Authentication is required to vote.';
  end if;

  if requested_vote_type not in ('up', 'down') then
    raise exception 'Vote type must be up or down.';
  end if;

  if not exists (select 1 from public.spot_submissions where id = target_submission_id) then
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

  return query select vote_count, up_count, down_count, selected_vote_type, selected_vote_type is not null;
end;
$$;

revoke all on function public.vote_on_spot_submission(uuid, text) from public;
grant execute on function public.vote_on_spot_submission(uuid, text) to authenticated;

drop function if exists public.toggle_spot_submission_vote(uuid);

create function public.toggle_spot_submission_vote(target_submission_id uuid)
returns table (vote_count integer, voted boolean)
language sql
security definer
set search_path = public
as $$
  select vote_count, voted
  from public.vote_on_spot_submission(target_submission_id, 'up');
$$;

revoke all on function public.toggle_spot_submission_vote(uuid) from public;
grant execute on function public.toggle_spot_submission_vote(uuid) to authenticated;

create or replace function public.vote_for_spot_submission(target_submission_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  next_vote_count integer;
  next_up_count integer;
  next_down_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required to vote for a spot submission.';
  end if;

  if not exists (select 1 from public.spot_submissions where id = target_submission_id) then
    raise exception 'Spot submission not found.';
  end if;

  insert into public.spot_submission_votes (submission_id, user_id, vote_type)
  values (target_submission_id, current_user_id, 'up')
  on conflict (submission_id, user_id) do update
    set vote_type = 'up',
        created_at = now();

  select
    count(*) filter (where spot_submission_votes.vote_type = 'up')::integer,
    count(*) filter (where spot_submission_votes.vote_type = 'down')::integer
  into next_up_count, next_down_count
  from public.spot_submission_votes
  where submission_id = target_submission_id;

  next_vote_count := next_up_count - next_down_count;

  update public.local_updates
  set spot_count = next_vote_count,
      updated_at = now()
  where source_type = 'spot_submission'
    and source_id = target_submission_id::text;

  return next_vote_count;
end;
$$;

create or replace function public.promote_popular_spot_submissions(
  minimum_score integer default 5,
  maximum_rows integer default 10
)
returns table(submission_id uuid, spot_id uuid, popularity_score integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate record;
  created_spot_id uuid;
begin
  for candidate in
    select p.*
    from public.pending_spot_submission_popularity p
    where p.popularity_score >= minimum_score
    order by p.popularity_score desc, p.created_at asc
    limit maximum_rows
  loop
    insert into spots (
      name,
      description,
      category,
      categories,
      address,
      latitude,
      longitude,
      images,
      reservation_type,
      reservation_fee,
      payment_required,
      is_public,
      is_reservable,
      owner_id
    )
    values (
      candidate.name,
      candidate.description,
      candidate.category,
      candidate.categories,
      candidate.address,
      candidate.latitude,
      candidate.longitude,
      candidate.images,
      candidate.reservation_type,
      candidate.reservation_fee,
      candidate.payment_required,
      true,
      candidate.is_reservable,
      null
    )
    returning id into created_spot_id;

    update spot_submissions
    set status = 'approved',
        updated_at = now()
    where id = candidate.id;

    update local_updates
    set spot_count = candidate.vote_count,
        updated_at = now()
    where source_type = 'spot_submission'
      and source_id = candidate.id::text;

    submission_id := candidate.id;
    spot_id := created_spot_id;
    popularity_score := candidate.popularity_score;
    return next;
  end loop;
end;
$$;

-- Optional manual check:
-- select id, name, vote_count, search_count, similar_submission_count, popularity_score
-- from public.pending_spot_submission_popularity
-- order by popularity_score desc;

-- Optional manual promotion:
-- select * from public.promote_popular_spot_submissions(5, 10);
