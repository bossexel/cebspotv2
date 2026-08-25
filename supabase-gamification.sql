-- CebSpot gamification system
-- Run after supabase-schema.sql.
-- If you use admin reports/edit suggestions, run after supabase-admin-dashboard.sql or supabase-spot-edit-suggestions.sql too.

create extension if not exists "pgcrypto";

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.role = 'admin'
      and lower(profile.email) = 'testadmin@cebspot.com'
  );
$$;

revoke all on function public.is_current_user_admin() from public;
grant execute on function public.is_current_user_admin() to authenticated;

alter table public.profiles
  add column if not exists total_xp integer not null default 0,
  add column if not exists current_level integer not null default 1;

create or replace function public.calculate_gamification_level(total_xp integer)
returns integer
language sql
immutable
as $$
  select greatest(1, floor(greatest(coalesce(total_xp, 0), 0)::numeric / 100)::integer + 1);
$$;

update public.profiles
set
  total_xp = greatest(coalesce(total_xp, 0), coalesce(points, 0)),
  current_level = greatest(coalesce(current_level, 1), coalesce(level, 1), public.calculate_gamification_level(greatest(coalesce(total_xp, 0), coalesce(points, 0)))),
  points = greatest(coalesce(points, 0), coalesce(total_xp, 0)),
  level = greatest(coalesce(level, 1), coalesce(current_level, 1), public.calculate_gamification_level(greatest(coalesce(total_xp, 0), coalesce(points, 0))));

create table if not exists public.point_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_type text not null,
  points integer not null check (points <> 0),
  reference_id text not null,
  reference_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists point_transactions_unique_reference_idx
  on public.point_transactions(user_id, activity_type, reference_type, reference_id);

create index if not exists point_transactions_user_created_idx
  on public.point_transactions(user_id, created_at desc);

create index if not exists point_transactions_activity_idx
  on public.point_transactions(activity_type, created_at desc);

create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null,
  icon_name text,
  requirement_type text not null,
  requirement_value integer not null check (requirement_value > 0),
  xp_reward integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists achievements_enabled_idx
  on public.achievements(enabled, requirement_type);

create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  progress integer not null default 0,
  completed boolean not null default false,
  unlocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, achievement_id)
);

create index if not exists user_achievements_user_completed_idx
  on public.user_achievements(user_id, completed, unlocked_at desc);

create table if not exists public.spot_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  spot_id uuid not null references public.spots(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  distance_from_spot numeric(10, 2),
  location_accuracy numeric(10, 2),
  verified boolean not null default false,
  visited_at timestamptz not null default now()
);

create index if not exists spot_visits_user_created_idx
  on public.spot_visits(user_id, visited_at desc);

create index if not exists spot_visits_spot_created_idx
  on public.spot_visits(spot_id, visited_at desc);

create table if not exists public.review_helpful_votes (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(review_id, user_id)
);

create index if not exists review_helpful_votes_review_idx
  on public.review_helpful_votes(review_id, created_at desc);

create table if not exists public.place_questions (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  asked_by uuid references public.profiles(id) on delete set null,
  question text not null check (char_length(trim(question)) between 1 and 500),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.place_question_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.place_questions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  answer text not null check (char_length(trim(answer)) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique(question_id, user_id)
);

alter table public.review_reports
  add column if not exists status text not null default 'pending',
  add column if not exists admin_notes text,
  add column if not exists resolved_at timestamptz,
  add column if not exists updated_at timestamptz;

alter table public.review_reports drop constraint if exists review_reports_status_check;
alter table public.review_reports
  add constraint review_reports_status_check check (status in ('pending', 'dismissed', 'handled'));

create or replace function public.protect_profile_gamification_columns()
returns trigger
language plpgsql
as $$
begin
  if (
    old.total_xp is distinct from new.total_xp
    or old.current_level is distinct from new.current_level
    or old.points is distinct from new.points
    or old.level is distinct from new.level
  ) and coalesce(current_setting('cebspot.gamification_award', true), '') <> 'on' then
    raise exception 'XP and level fields can only be changed by CebSpot gamification functions.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_gamification_columns on public.profiles;
create trigger profiles_protect_gamification_columns
  before update on public.profiles
  for each row execute function public.protect_profile_gamification_columns();

create or replace function public.refresh_user_achievements(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  achievement_record public.achievements%rowtype;
  progress_value integer;
  was_completed boolean;
  now_completed boolean;
begin
  if target_user_id is null then
    return;
  end if;

  for achievement_record in
    select * from public.achievements where enabled order by created_at asc
  loop
    progress_value := 0;

    if achievement_record.requirement_type = 'total_xp' then
      select coalesce(total_xp, 0)
      into progress_value
      from public.profiles
      where id = target_user_id;
    elsif achievement_record.requirement_type = 'reviews_created' then
      select count(*)::integer into progress_value from public.reviews where user_id = target_user_id;
    elsif achievement_record.requirement_type = 'detailed_reviews' then
      select count(*)::integer into progress_value
      from public.reviews
      where user_id = target_user_id
        and char_length(trim(coalesce(comment, ''))) >= 150;
    elsif achievement_record.requirement_type = 'photos_uploaded' then
      select coalesce(count(*), 0)::integer
      into progress_value
      from public.reviews review_row
      cross join unnest(coalesce(review_row.media_urls, '{}'::text[])) with ordinality as media(url, ord)
      left join unnest(coalesce(review_row.media_types, '{}'::text[])) with ordinality as media_type(kind, ord)
        on media_type.ord = media.ord
      where review_row.user_id = target_user_id
        and not (
          coalesce(media_type.kind, '') ilike 'video%'
          or media.url ~* '\.(mp4|mov|m4v|webm)(\?|#|$)'
        );
    elsif achievement_record.requirement_type = 'videos_uploaded' then
      select coalesce(count(*), 0)::integer
      into progress_value
      from public.reviews review_row
      cross join unnest(coalesce(review_row.media_urls, '{}'::text[])) with ordinality as media(url, ord)
      left join unnest(coalesce(review_row.media_types, '{}'::text[])) with ordinality as media_type(kind, ord)
        on media_type.ord = media.ord
      where review_row.user_id = target_user_id
        and (
          coalesce(media_type.kind, '') ilike 'video%'
          or media.url ~* '\.(mp4|mov|m4v|webm)(\?|#|$)'
        );
    elsif achievement_record.requirement_type = 'verified_visits' then
      select count(*)::integer into progress_value
      from public.spot_visits
      where user_id = target_user_id
        and verified;
    elsif achievement_record.requirement_type = 'completed_reservations' then
      select count(*)::integer into progress_value
      from public.reservations
      where user_id = target_user_id
        and status = 'completed';
    elsif achievement_record.requirement_type = 'approved_spot_submissions' then
      select count(*)::integer into progress_value
      from public.spot_submissions
      where submitter_id = target_user_id
        and status = 'approved';
    elsif achievement_record.requirement_type = 'approved_edits' then
      if to_regclass('public.spot_edit_suggestions') is not null then
        execute 'select count(*)::integer from public.spot_edit_suggestions where user_id = $1 and status = ''approved'''
        into progress_value
        using target_user_id;
      end if;
    elsif achievement_record.requirement_type = 'confirmed_reports' then
      select count(*)::integer into progress_value
      from public.review_reports
      where reporter_id = target_user_id
        and status = 'handled'
        and lower(coalesce(reason, '')) ~ '(wrong|incorrect|inaccurate|misleading|address|location|map|pin|website|contact|opening|description|category)';
    elsif achievement_record.requirement_type = 'helpful_votes' then
      select count(*)::integer into progress_value
      from public.review_helpful_votes vote
      join public.reviews review_row on review_row.id = vote.review_id
      where review_row.user_id = target_user_id;
    elsif achievement_record.requirement_type = 'place_answers' then
      select count(*)::integer into progress_value
      from public.place_question_answers
      where user_id = target_user_id;
    end if;

    now_completed := progress_value >= achievement_record.requirement_value;

    select completed
    into was_completed
    from public.user_achievements
    where user_id = target_user_id
      and achievement_id = achievement_record.id;

    insert into public.user_achievements (
      user_id,
      achievement_id,
      progress,
      completed,
      unlocked_at,
      updated_at
    )
    values (
      target_user_id,
      achievement_record.id,
      progress_value,
      now_completed,
      case when now_completed then now() else null end,
      now()
    )
    on conflict (user_id, achievement_id)
    do update set
      progress = greatest(public.user_achievements.progress, excluded.progress),
      completed = public.user_achievements.completed or excluded.completed,
      unlocked_at = coalesce(public.user_achievements.unlocked_at, excluded.unlocked_at),
      updated_at = now();

    if coalesce(was_completed, false) = false
      and now_completed
      and achievement_record.xp_reward <> 0 then
      perform public.award_points(
        target_user_id,
        'ACHIEVEMENT_UNLOCKED',
        achievement_record.xp_reward,
        achievement_record.id::text,
        'achievement',
        jsonb_build_object('achievement_code', achievement_record.code),
        false
      );
    end if;
  end loop;
end;
$$;

create or replace function public.award_points(
  target_user_id uuid,
  reward_activity_type text,
  reward_points integer,
  reward_reference_id text,
  reward_reference_type text,
  reward_metadata jsonb default '{}'::jsonb,
  should_refresh_achievements boolean default true
)
returns public.point_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  created_transaction public.point_transactions%rowtype;
  new_total_xp integer;
begin
  if target_user_id is null then
    raise exception 'A user is required for point awards.';
  end if;

  if nullif(trim(coalesce(reward_activity_type, '')), '') is null then
    raise exception 'An activity type is required for point awards.';
  end if;

  if reward_points = 0 then
    raise exception 'Point awards cannot be zero.';
  end if;

  if nullif(trim(coalesce(reward_reference_id, '')), '') is null
    or nullif(trim(coalesce(reward_reference_type, '')), '') is null then
    raise exception 'A reference id and reference type are required for point awards.';
  end if;

  insert into public.point_transactions (
    user_id,
    activity_type,
    points,
    reference_id,
    reference_type,
    metadata
  )
  values (
    target_user_id,
    upper(trim(reward_activity_type)),
    reward_points,
    trim(reward_reference_id),
    lower(trim(reward_reference_type)),
    coalesce(reward_metadata, '{}'::jsonb)
  )
  on conflict do nothing
  returning * into created_transaction;

  if created_transaction.id is null then
    select *
    into created_transaction
    from public.point_transactions
    where user_id = target_user_id
      and activity_type = upper(trim(reward_activity_type))
      and reference_id = trim(reward_reference_id)
      and reference_type = lower(trim(reward_reference_type))
    limit 1;

    return created_transaction;
  end if;

  perform set_config('cebspot.gamification_award', 'on', true);

  update public.profiles
  set
    total_xp = greatest(0, coalesce(total_xp, 0) + reward_points),
    points = greatest(0, coalesce(points, 0) + reward_points),
    updated_at = now()
  where id = target_user_id
  returning total_xp into new_total_xp;

  update public.profiles
  set
    current_level = public.calculate_gamification_level(new_total_xp),
    level = public.calculate_gamification_level(new_total_xp),
    updated_at = now()
  where id = target_user_id;

  perform set_config('cebspot.gamification_award', 'off', true);

  if should_refresh_achievements then
    perform public.refresh_user_achievements(target_user_id);
  end if;

  return created_transaction;
exception
  when others then
    perform set_config('cebspot.gamification_award', 'off', true);
    raise;
end;
$$;

revoke all on function public.award_points(uuid, text, integer, text, text, jsonb, boolean) from public;

create or replace function public.distance_meters(
  lat_a double precision,
  lon_a double precision,
  lat_b double precision,
  lon_b double precision
)
returns double precision
language sql
immutable
as $$
  select 6371000 * 2 * asin(
    least(
      1,
      sqrt(
        power(sin(radians(lat_b - lat_a) / 2), 2) +
        cos(radians(lat_a)) * cos(radians(lat_b)) *
        power(sin(radians(lon_b - lon_a) / 2), 2)
      )
    )
  );
$$;

create or replace function public.handle_review_gamification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  media_record record;
  normalized_comment text;
  media_is_video boolean;
begin
  if tg_op = 'DELETE' then
    perform public.award_points(
      old.user_id,
      'REVIEW_REMOVED',
      -10,
      old.id::text,
      'review',
      jsonb_build_object('spot_id', old.spot_id),
      true
    );
    return old;
  end if;

  normalized_comment := trim(coalesce(new.comment, ''));

  perform public.award_points(
    new.user_id,
    'RATING_CREATED',
    1,
    new.id::text,
    'review',
    jsonb_build_object('spot_id', new.spot_id, 'rating', new.rating),
    true
  );

  if normalized_comment <> '' then
    perform public.award_points(
      new.user_id,
      'REVIEW_CREATED',
      10,
      new.id::text,
      'review',
      jsonb_build_object('spot_id', new.spot_id),
      true
    );
  end if;

  if char_length(normalized_comment) >= 150 then
    perform public.award_points(
      new.user_id,
      'DETAILED_REVIEW',
      5,
      new.id::text,
      'review',
      jsonb_build_object('spot_id', new.spot_id, 'character_count', char_length(normalized_comment)),
      true
    );
  end if;

  for media_record in
    select media.url, media.ord, media_type.kind
    from unnest(coalesce(new.media_urls, '{}'::text[])) with ordinality as media(url, ord)
    left join unnest(coalesce(new.media_types, '{}'::text[])) with ordinality as media_type(kind, ord)
      on media_type.ord = media.ord
    where nullif(trim(media.url), '') is not null
  loop
    media_is_video :=
      coalesce(media_record.kind, '') ilike 'video%'
      or media_record.url ~* '\.(mp4|mov|m4v|webm)(\?|#|$)';

    perform public.award_points(
      new.user_id,
      case when media_is_video then 'VIDEO_UPLOADED' else 'PHOTO_UPLOADED' end,
      case when media_is_video then 7 else 5 end,
      new.id::text || ':' || md5(media_record.url),
      'review_media',
      jsonb_build_object(
        'review_id', new.id,
        'spot_id', new.spot_id,
        'media_url', media_record.url,
        'media_type', coalesce(media_record.kind, case when media_is_video then 'video' else 'image' end)
      ),
      true
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists reviews_gamification_award on public.reviews;
create trigger reviews_gamification_award
  after insert or update of comment, media_urls, media_types on public.reviews
  for each row execute function public.handle_review_gamification();

drop trigger if exists reviews_gamification_removed on public.reviews;
create trigger reviews_gamification_removed
  after delete on public.reviews
  for each row execute function public.handle_review_gamification();

create or replace function public.handle_reservation_gamification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed'
    and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.award_points(
      new.user_id,
      'RESERVATION_COMPLETED',
      15,
      new.id::text,
      'reservation',
      jsonb_build_object('spot_id', new.spot_id, 'spot_name', new.spot_name),
      true
    );
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_gamification_completed on public.reservations;
create trigger reservations_gamification_completed
  after insert or update of status on public.reservations
  for each row execute function public.handle_reservation_gamification();

create or replace function public.handle_spot_submission_gamification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved'
    and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.award_points(
      new.submitter_id,
      'APPROVED_SPOT_SUBMISSION',
      15,
      new.id::text,
      'spot_submission',
      jsonb_build_object('spot_name', new.name, 'category', new.category),
      true
    );
  end if;

  return new;
end;
$$;

drop trigger if exists spot_submissions_gamification_approved on public.spot_submissions;
create trigger spot_submissions_gamification_approved
  after insert or update of status on public.spot_submissions
  for each row execute function public.handle_spot_submission_gamification();

create or replace function public.handle_spot_edit_gamification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved'
    and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.award_points(
      new.user_id,
      'APPROVED_SPOT_EDIT',
      5,
      new.id::text,
      'spot_edit_suggestion',
      jsonb_build_object('spot_id', new.spot_id, 'field', new.field),
      true
    );
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.spot_edit_suggestions') is not null then
    execute 'drop trigger if exists spot_edit_suggestions_gamification_approved on public.spot_edit_suggestions';
    execute 'create trigger spot_edit_suggestions_gamification_approved after insert or update of status on public.spot_edit_suggestions for each row execute function public.handle_spot_edit_gamification()';
  end if;
end $$;

create or replace function public.handle_review_report_gamification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'handled'
    and (tg_op = 'INSERT' or old.status is distinct from new.status)
    and lower(coalesce(new.reason, '')) ~ '(wrong|incorrect|inaccurate|misleading|address|location|map|pin|website|contact|opening|description|category)' then
    perform public.award_points(
      new.reporter_id,
      'CONFIRMED_INCORRECT_INFO_REPORT',
      3,
      new.id::text,
      'review_report',
      jsonb_build_object('review_id', new.review_id, 'reason', new.reason),
      true
    );
  end if;

  return new;
end;
$$;

drop trigger if exists review_reports_gamification_handled on public.review_reports;
create trigger review_reports_gamification_handled
  after insert or update of status on public.review_reports
  for each row execute function public.handle_review_report_gamification();

create or replace function public.record_spot_visit(
  target_spot_id uuid,
  visit_latitude double precision,
  visit_longitude double precision,
  location_accuracy double precision default null
)
returns public.spot_visits
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  spot_record public.spots%rowtype;
  distance numeric(10, 2);
  verified_visit boolean;
  created_visit public.spot_visits%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication is required to check in.';
  end if;

  select *
  into spot_record
  from public.spots
  where id = target_spot_id
    and is_public = true;

  if not found then
    raise exception 'Spot not found or not public.';
  end if;

  distance := public.distance_meters(visit_latitude, visit_longitude, spot_record.latitude, spot_record.longitude)::numeric(10, 2);
  verified_visit := distance <= 150 and (location_accuracy is null or location_accuracy <= 100);

  insert into public.spot_visits (
    user_id,
    spot_id,
    latitude,
    longitude,
    distance_from_spot,
    location_accuracy,
    verified
  )
  values (
    current_user_id,
    target_spot_id,
    visit_latitude,
    visit_longitude,
    distance,
    location_accuracy,
    verified_visit
  )
  returning * into created_visit;

  if verified_visit then
    perform public.award_points(
      current_user_id,
      'VERIFIED_VISIT',
      10,
      target_spot_id::text || ':' || to_char(created_visit.visited_at, 'YYYY-MM-DD'),
      'spot_visit_day',
      jsonb_build_object('visit_id', created_visit.id, 'spot_id', target_spot_id, 'distance_meters', distance),
      true
    );
  end if;

  return created_visit;
end;
$$;

revoke all on function public.record_spot_visit(uuid, double precision, double precision, double precision) from public;
grant execute on function public.record_spot_visit(uuid, double precision, double precision, double precision) to authenticated;

create or replace function public.mark_review_helpful(target_review_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  review_record public.reviews%rowtype;
  created_vote public.review_helpful_votes%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select *
  into review_record
  from public.reviews
  where id = target_review_id;

  if not found then
    raise exception 'Review not found.';
  end if;

  if review_record.user_id = current_user_id then
    raise exception 'You cannot mark your own review as helpful.';
  end if;

  insert into public.review_helpful_votes (review_id, user_id)
  values (target_review_id, current_user_id)
  on conflict do nothing
  returning * into created_vote;

  if created_vote.id is null then
    return jsonb_build_object('helpful', true, 'awarded', false);
  end if;

  update public.reviews
  set likes_count = likes_count + 1,
      updated_at = now()
  where id = target_review_id;

  perform public.award_points(
    review_record.user_id,
    'REVIEW_MARKED_HELPFUL',
    2,
    created_vote.id::text,
    'review_helpful_vote',
    jsonb_build_object('review_id', target_review_id, 'voter_id', current_user_id),
    true
  );

  return jsonb_build_object('helpful', true, 'awarded', true);
end;
$$;

revoke all on function public.mark_review_helpful(uuid) from public;
grant execute on function public.mark_review_helpful(uuid) to authenticated;

create or replace function public.answer_place_question(target_question_id uuid, answer_body text)
returns public.place_question_answers
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_answer text := trim(coalesce(answer_body, ''));
  question_record public.place_questions%rowtype;
  created_answer public.place_question_answers%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if char_length(normalized_answer) = 0 then
    raise exception 'Write an answer before sending.';
  end if;

  select *
  into question_record
  from public.place_questions
  where id = target_question_id
    and enabled;

  if not found then
    raise exception 'Question not found.';
  end if;

  insert into public.place_question_answers (question_id, user_id, answer)
  values (target_question_id, current_user_id, normalized_answer)
  returning * into created_answer;

  perform public.award_points(
    current_user_id,
    'PLACE_QUESTION_ANSWERED',
    2,
    created_answer.id::text,
    'place_question_answer',
    jsonb_build_object('question_id', target_question_id, 'spot_id', question_record.spot_id),
    true
  );

  return created_answer;
end;
$$;

revoke all on function public.answer_place_question(uuid, text) from public;
grant execute on function public.answer_place_question(uuid, text) to authenticated;

create or replace function public.get_user_gamification_summary(target_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_user_id uuid := coalesce(target_user_id, auth.uid());
  profile_record public.profiles%rowtype;
begin
  if requested_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if requested_user_id <> auth.uid() and not public.is_current_user_admin() then
    raise exception 'You can only view your own gamification summary.';
  end if;

  perform public.refresh_user_achievements(requested_user_id);

  select *
  into profile_record
  from public.profiles
  where id = requested_user_id;

  return jsonb_build_object(
    'totalXp', coalesce(profile_record.total_xp, 0),
    'currentLevel', coalesce(profile_record.current_level, 1),
    'nextLevelXp', public.calculate_gamification_level(coalesce(profile_record.total_xp, 0)) * 100,
    'achievements', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', user_achievements.id::text,
        'achievementId', achievements.id::text,
        'code', achievements.code,
        'name', achievements.name,
        'description', achievements.description,
        'iconName', achievements.icon_name,
        'requirementType', achievements.requirement_type,
        'requirementValue', achievements.requirement_value,
        'xpReward', achievements.xp_reward,
        'progress', user_achievements.progress,
        'completed', user_achievements.completed,
        'unlockedAt', user_achievements.unlocked_at
      ) order by user_achievements.completed desc, user_achievements.unlocked_at desc nulls last, achievements.created_at asc), '[]'::jsonb)
      from public.achievements
      left join public.user_achievements
        on user_achievements.achievement_id = achievements.id
       and user_achievements.user_id = requested_user_id
      where achievements.enabled
    ),
    'recentTransactions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', point_transactions.id::text,
        'activityType', point_transactions.activity_type,
        'points', point_transactions.points,
        'referenceId', point_transactions.reference_id,
        'referenceType', point_transactions.reference_type,
        'metadata', point_transactions.metadata,
        'createdAt', point_transactions.created_at
      ) order by point_transactions.created_at desc), '[]'::jsonb)
      from (
        select *
        from public.point_transactions
        where user_id = requested_user_id
        order by created_at desc
        limit 20
      ) point_transactions
    )
  );
end;
$$;

revoke all on function public.get_user_gamification_summary(uuid) from public;
grant execute on function public.get_user_gamification_summary(uuid) to authenticated;

create or replace function public.get_gamification_leaderboard(leaderboard_limit integer default 20)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ranked_profiles as (
    select
      row_number() over (order by coalesce(profile.total_xp, 0) desc, profile.created_at asc) as rank,
      profile.id,
      coalesce(nullif(trim(profile.display_name), ''), split_part(profile.email, '@', 1), 'CebSpot Explorer') as display_name,
      upper(left(coalesce(nullif(trim(profile.display_name), ''), profile.email, 'CE'), 2)) as avatar,
      coalesce(profile.total_xp, 0) as total_xp,
      coalesce(profile.current_level, 1) as current_level,
      (
        select count(*)::integer
        from public.user_achievements achieved
        where achieved.user_id = profile.id
          and achieved.completed
      ) as achievements_unlocked
    from public.profiles profile
    where profile.role = 'user'
      and coalesce(profile.total_xp, 0) > 0
  ),
  limited_profiles as (
    select *
    from ranked_profiles
    order by rank
    limit greatest(1, least(coalesce(leaderboard_limit, 20), 50))
  ),
  current_user_rank as (
    select *
    from ranked_profiles
    where id = auth.uid()
    limit 1
  )
  select jsonb_build_object(
    'leaders', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'rank', limited_profiles.rank,
        'userId', limited_profiles.id::text,
        'displayName', limited_profiles.display_name,
        'avatar', limited_profiles.avatar,
        'totalXp', limited_profiles.total_xp,
        'currentLevel', limited_profiles.current_level,
        'achievementsUnlocked', limited_profiles.achievements_unlocked
      ) order by limited_profiles.rank), '[]'::jsonb)
      from limited_profiles
    ),
    'myRank', (
      select jsonb_build_object(
        'rank', current_user_rank.rank,
        'userId', current_user_rank.id::text,
        'displayName', current_user_rank.display_name,
        'avatar', current_user_rank.avatar,
        'totalXp', current_user_rank.total_xp,
        'currentLevel', current_user_rank.current_level,
        'achievementsUnlocked', current_user_rank.achievements_unlocked
      )
      from current_user_rank
    )
  );
$$;

revoke all on function public.get_gamification_leaderboard(integer) from public;
grant execute on function public.get_gamification_leaderboard(integer) to authenticated;

insert into public.achievements (
  code,
  name,
  description,
  icon_name,
  requirement_type,
  requirement_value,
  xp_reward,
  enabled
)
values
  ('FIRST_REVIEW', 'First Voice', 'Write your first CebSpot review.', 'message-circle', 'reviews_created', 1, 0, true),
  ('DETAILED_GUIDE', 'Detailed Guide', 'Write 5 detailed reviews with at least 150 characters.', 'file-text', 'detailed_reviews', 5, 10, true),
  ('PHOTO_SCOUT', 'Photo Scout', 'Upload 10 helpful spot photos.', 'camera', 'photos_uploaded', 10, 10, true),
  ('VIDEO_SCOUT', 'Video Scout', 'Upload 5 spot videos.', 'video', 'videos_uploaded', 5, 10, true),
  ('ON_THE_GROUND', 'On the Ground', 'Complete 5 verified spot visits.', 'map-pin', 'verified_visits', 5, 10, true),
  ('BOOKED_EXPLORER', 'Booked Explorer', 'Complete 3 reservations.', 'calendar-check', 'completed_reservations', 3, 10, true),
  ('HIDDEN_GEM_SCOUT', 'Hidden Gem Scout', 'Get 3 submitted spots approved.', 'sparkles', 'approved_spot_submissions', 3, 15, true),
  ('CLEAN_MAP_HELPER', 'Clean Map Helper', 'Get 5 spot edits approved.', 'shield-check', 'approved_edits', 5, 10, true),
  ('FACT_CHECKER', 'Fact Checker', 'Get 5 incorrect-information reports confirmed.', 'badge-check', 'confirmed_reports', 5, 10, true),
  ('HELPFUL_REVIEWER', 'Helpful Reviewer', 'Receive 10 helpful marks on your reviews.', 'thumbs-up', 'helpful_votes', 10, 10, true),
  ('LOCAL_EXPERT_L2', 'Local Expert II', 'Reach 100 total XP.', 'award', 'total_xp', 100, 0, true),
  ('LOCAL_EXPERT_L5', 'Local Expert V', 'Reach 400 total XP.', 'trophy', 'total_xp', 400, 25, true)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  icon_name = excluded.icon_name,
  requirement_type = excluded.requirement_type,
  requirement_value = excluded.requirement_value,
  xp_reward = excluded.xp_reward,
  enabled = excluded.enabled;

alter table public.point_transactions enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
alter table public.spot_visits enable row level security;
alter table public.review_helpful_votes enable row level security;
alter table public.place_questions enable row level security;
alter table public.place_question_answers enable row level security;

drop policy if exists "point_transactions_select_own" on public.point_transactions;
drop policy if exists "achievements_read_enabled" on public.achievements;
drop policy if exists "user_achievements_select_own" on public.user_achievements;
drop policy if exists "spot_visits_select_own" on public.spot_visits;
drop policy if exists "review_helpful_votes_select_own" on public.review_helpful_votes;
drop policy if exists "place_questions_read" on public.place_questions;
drop policy if exists "place_questions_insert_own" on public.place_questions;
drop policy if exists "place_question_answers_read" on public.place_question_answers;

create policy "point_transactions_select_own"
  on public.point_transactions for select
  using (user_id = auth.uid() or public.is_current_user_admin());

create policy "achievements_read_enabled"
  on public.achievements for select
  using (enabled or public.is_current_user_admin());

create policy "user_achievements_select_own"
  on public.user_achievements for select
  using (user_id = auth.uid() or public.is_current_user_admin());

create policy "spot_visits_select_own"
  on public.spot_visits for select
  using (user_id = auth.uid() or public.is_current_user_admin());

create policy "review_helpful_votes_select_own"
  on public.review_helpful_votes for select
  using (user_id = auth.uid() or public.is_current_user_admin());

create policy "place_questions_read"
  on public.place_questions for select
  using (enabled or asked_by = auth.uid() or public.is_current_user_admin());

create policy "place_questions_insert_own"
  on public.place_questions for insert
  with check (auth.role() = 'authenticated' and asked_by = auth.uid());

create policy "place_question_answers_read"
  on public.place_question_answers for select
  using (true);

revoke all on table public.point_transactions from public, anon, authenticated;
revoke all on table public.user_achievements from public, anon, authenticated;
revoke all on table public.spot_visits from public, anon, authenticated;
revoke all on table public.review_helpful_votes from public, anon, authenticated;
revoke all on table public.place_question_answers from public, anon, authenticated;

grant select on table public.point_transactions to authenticated;
grant select on table public.achievements to anon, authenticated;
grant select on table public.user_achievements to authenticated;
grant select on table public.spot_visits to authenticated;
grant select on table public.review_helpful_votes to authenticated;
grant select, insert on table public.place_questions to authenticated;
grant select on table public.place_question_answers to anon, authenticated;

notify pgrst, 'reload schema';
