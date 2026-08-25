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
  vote_type text not null default 'up' check (vote_type in ('up')),
  created_at timestamptz not null default now(),
  unique(submission_id, user_id)
);

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

create or replace view public.pending_spot_submission_popularity as
select
  s.*,
  coalesce(v.vote_count, 0) as vote_count,
  coalesce(se.search_count, 0) as search_count,
  coalesce(sim.similar_submission_count, 0) as similar_submission_count,
  (
    coalesce(v.vote_count, 0) * 3 +
    coalesce(se.search_count, 0) +
    coalesce(sim.similar_submission_count, 0) * 2
  ) as popularity_score
from spot_submissions s
left join (
  select submission_id, count(*)::integer as vote_count
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

create or replace function public.vote_for_spot_submission(target_submission_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  next_vote_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required to vote for a spot submission.';
  end if;

  insert into spot_submission_votes (submission_id, user_id, vote_type)
  values (target_submission_id, current_user_id, 'up')
  on conflict (submission_id, user_id) do nothing;

  select count(*)::integer
  into next_vote_count
  from spot_submission_votes
  where submission_id = target_submission_id;

  update local_updates
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
