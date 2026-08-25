-- CebSpot admin dashboard live data
-- Run this once in the Supabase SQL Editor after the base schema.

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

create table if not exists public.spot_edit_suggestions (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  field text not null check (char_length(trim(field)) between 1 and 80),
  current_value text,
  suggested_value text not null check (char_length(trim(suggested_value)) between 1 and 1200),
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists spot_edit_suggestions_spot_idx
  on public.spot_edit_suggestions(spot_id, created_at desc);

create index if not exists spot_edit_suggestions_status_idx
  on public.spot_edit_suggestions(status, created_at desc);

alter table public.spot_edit_suggestions enable row level security;

alter table public.review_reports
  add column if not exists status text not null default 'pending',
  add column if not exists admin_notes text,
  add column if not exists resolved_at timestamptz,
  add column if not exists updated_at timestamptz;

alter table public.review_reports drop constraint if exists review_reports_status_check;
alter table public.review_reports
  add constraint review_reports_status_check check (status in ('pending', 'dismissed', 'handled'));

drop policy if exists "profiles_admin_select" on public.profiles;
drop policy if exists "spots_admin_select" on public.spots;
drop policy if exists "reservations_admin_select" on public.reservations;
drop policy if exists "reservation_payments_admin_select" on public.reservation_payments;
drop policy if exists "activities_admin_select" on public.activities;
drop policy if exists "spot_submissions_admin_select" on public.spot_submissions;
drop policy if exists "owner_access_requests_admin_select" on public.owner_access_requests;
drop policy if exists "owner_spot_access_admin_select" on public.owner_spot_access;
drop policy if exists "review_reports_admin_select" on public.review_reports;
drop policy if exists "review_reports_admin_update" on public.review_reports;
drop policy if exists "spot_edit_suggestions_insert_own" on public.spot_edit_suggestions;
drop policy if exists "spot_edit_suggestions_select_own" on public.spot_edit_suggestions;
drop policy if exists "spot_edit_suggestions_admin_select" on public.spot_edit_suggestions;
drop policy if exists "spot_edit_suggestions_admin_update" on public.spot_edit_suggestions;

create policy "profiles_admin_select"
  on public.profiles for select
  using (public.is_current_user_admin());

create policy "spots_admin_select"
  on public.spots for select
  using (public.is_current_user_admin());

create policy "reservations_admin_select"
  on public.reservations for select
  using (public.is_current_user_admin());

create policy "reservation_payments_admin_select"
  on public.reservation_payments for select
  using (public.is_current_user_admin());

create policy "activities_admin_select"
  on public.activities for select
  using (public.is_current_user_admin());

create policy "spot_submissions_admin_select"
  on public.spot_submissions for select
  using (public.is_current_user_admin());

create policy "owner_access_requests_admin_select"
  on public.owner_access_requests for select
  using (public.is_current_user_admin());

create policy "owner_spot_access_admin_select"
  on public.owner_spot_access for select
  using (public.is_current_user_admin());

create policy "review_reports_admin_select"
  on public.review_reports for select
  using (public.is_current_user_admin());

create policy "review_reports_admin_update"
  on public.review_reports for update
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

create policy "spot_edit_suggestions_insert_own"
  on public.spot_edit_suggestions for insert
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

create policy "spot_edit_suggestions_select_own"
  on public.spot_edit_suggestions for select
  using (user_id = auth.uid());

create policy "spot_edit_suggestions_admin_select"
  on public.spot_edit_suggestions for select
  using (public.is_current_user_admin());

create policy "spot_edit_suggestions_admin_update"
  on public.spot_edit_suggestions for update
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

grant insert, select, update on table public.spot_edit_suggestions to authenticated;
grant select, update on table public.review_reports to authenticated;

drop function if exists public.get_admin_dashboard();

create or replace function public.get_admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  payload jsonb;
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  with day_series as (
    select generate_series(current_date - interval '9 days', current_date, interval '1 day')::date as day
  ),
  reservation_daily as (
    select
      day_series.day,
      to_char(day_series.day, 'Mon DD') as label,
      count(reservations.id)::integer as row_count,
      coalesce(sum(
        case
          when reservations.status in ('confirmed', 'completed')
            and reservations.payment_status = 'paid'
          then coalesce(reservations.reservation_fee, reservations.fee, 0)
          else 0
        end
      ), 0)::integer as estimated_revenue
    from day_series
    left join public.reservations reservations
      on reservations.created_at::date = day_series.day
    group by day_series.day
    order by day_series.day
  ),
  spot_daily as (
    select
      day_series.day,
      to_char(day_series.day, 'Mon DD') as label,
      count(spots.id)::integer as row_count
    from day_series
    left join public.spots spots
      on spots.created_at::date = day_series.day
      and spots.is_public
    group by day_series.day
    order by day_series.day
  ),
  category_totals as (
    select coalesce(nullif(trim(category), ''), 'Uncategorized') as label, count(*)::integer as row_count
    from public.spots
    where is_public
    group by coalesce(nullif(trim(category), ''), 'Uncategorized')
    order by count(*) desc, label
    limit 5
  ),
  category_progress as (
    select
      label,
      greatest(8, round((row_count::numeric / greatest(max(row_count) over (), 1)) * 100)::integer) as value,
      row_count::text || case when row_count = 1 then ' spot' else ' spots' end as copy
    from category_totals
  ),
  barangay_totals as (
    select
      coalesce(
        nullif(trim(substring(address from '(?i)Barangay\s+([^,]+)')), ''),
        nullif(trim(split_part(address, ',', 1)), ''),
        'Cebu City'
      ) as label,
      count(*)::integer as row_count
    from public.spots
    where is_public
    group by 1
    order by count(*) desc, label
    limit 5
  ),
  barangay_progress as (
    select
      label,
      greatest(8, round((row_count::numeric / greatest(max(row_count) over (), 1)) * 100)::integer) as value,
      row_count::text || case when row_count = 1 then ' spot' else ' spots' end as copy
    from barangay_totals
  ),
  daily_insights as (
    select
      day_series.day,
      to_char(day_series.day, 'YYYY-MM-DD') as key,
      to_char(day_series.day, 'Mon DD') as label,
      coalesce(reservation_daily.row_count, 0)::integer as reservations,
      coalesce(reservation_daily.estimated_revenue, 0)::integer as estimated_revenue,
      coalesce(spot_daily.row_count, 0)::integer as new_spots,
      (
        select count(*)::integer
        from public.spots
        where is_public
          and created_at < day_series.day + interval '1 day'
      ) as total_spots,
      (
        select count(*)::integer
        from public.profiles
        where role = 'owner'
          and created_at < day_series.day + interval '1 day'
      ) as active_owners,
      (
        (select count(*)::integer from public.review_reports where status = 'pending' and created_at::date = day_series.day) +
        (select count(*)::integer from public.spot_edit_suggestions where status = 'pending' and created_at::date = day_series.day)
      ) as reports_filed
    from day_series
    left join reservation_daily on reservation_daily.day = day_series.day
    left join spot_daily on spot_daily.day = day_series.day
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'metrics', jsonb_build_object(
      'totalSpots', (select count(*)::integer from public.spots),
      'publicSpots', (select count(*)::integer from public.spots where is_public),
      'reservableSpots', (select count(*)::integer from public.spots where is_reservable),
      'spotsToday', (select count(*)::integer from public.spots where created_at >= current_date),
      'totalReservations', (select count(*)::integer from public.reservations),
      'reservationsToday', (select count(*)::integer from public.reservations where created_at >= current_date),
      'reservations30d', (select count(*)::integer from public.reservations where created_at >= current_date - interval '29 days'),
      'confirmedReservations', (
        select count(*)::integer
        from public.reservations
        where status in ('confirmed', 'completed')
      ),
      'estimatedRevenue', (
        select coalesce(sum(coalesce(reservation_fee, fee, 0)), 0)::integer
        from public.reservations
        where status in ('confirmed', 'completed')
          and payment_status = 'paid'
      ),
      'activeOwners', (select count(*)::integer from public.profiles where role = 'owner'),
      'totalUsers', (select count(*)::integer from public.profiles),
      'reportsFiled', (
        (select count(*)::integer from public.review_reports where status = 'pending') +
        (select count(*)::integer from public.spot_edit_suggestions where status = 'pending')
      ),
      'pendingOwnerRequests', (select count(*)::integer from public.owner_access_requests where status = 'pending'),
      'pendingSpotSubmissions', (select count(*)::integer from public.spot_submissions where status = 'pending')
    ),
    'reservationsDaily', (
      select coalesce(jsonb_agg(jsonb_build_object('label', label, 'count', row_count) order by day), '[]'::jsonb)
      from reservation_daily
    ),
    'newSpotsDaily', (
      select coalesce(jsonb_agg(jsonb_build_object('label', label, 'count', row_count) order by day), '[]'::jsonb)
      from spot_daily
    ),
    'dailyInsights', (
      select coalesce(
        jsonb_agg(jsonb_build_object(
          'key', key,
          'label', label,
          'reservations', reservations,
          'newSpots', new_spots,
          'estimatedRevenue', estimated_revenue,
          'totalSpots', total_spots,
          'activeOwners', active_owners,
          'reportsFiled', reports_filed
        ) order by day),
        '[]'::jsonb
      )
      from daily_insights
    ),
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object('label', label, 'value', value, 'copy', copy)), '[]'::jsonb)
      from category_progress
    ),
    'barangays', (
      select coalesce(jsonb_agg(jsonb_build_object('label', label, 'value', value, 'copy', copy)), '[]'::jsonb)
      from barangay_progress
    ),
    'recentListings', (
      select coalesce(jsonb_agg(row_payload order by created_at desc), '[]'::jsonb)
      from (
        select
          spots.created_at,
          jsonb_build_object(
            'id', spots.id::text,
            'name', spots.name,
            'category', spots.category,
            'barangay', coalesce(
              nullif(trim(substring(spots.address from '(?i)Barangay\s+([^,]+)')), ''),
              nullif(trim(split_part(spots.address, ',', 1)), ''),
              'Cebu City'
            ),
            'status', case when spots.is_public then 'Verified' else 'Pending' end,
            'date', to_char(spots.created_at, 'Mon DD, YYYY'),
            'image', coalesce(spots.images[1], 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=240')
          ) as row_payload
        from public.spots
        order by spots.created_at desc
        limit 8
      ) listings
    ),
    'livePulse', (
      select coalesce(jsonb_agg(row_payload order by created_at desc), '[]'::jsonb)
      from (
        select
          reservations.created_at,
          jsonb_build_object(
            'id', reservations.id::text,
            'action', 'New Reservation',
            'user', coalesce(nullif(trim(profiles.display_name), ''), split_part(profiles.email, '@', 1), 'Guest'),
            'location', reservations.spot_name,
            'value', 'P ' || trim(to_char(coalesce(reservations.reservation_fee, reservations.fee, 0), 'FM999G999G990')),
            'status', initcap(replace(reservations.status, '_', ' '))
          ) as row_payload
        from public.reservations
        left join public.profiles on profiles.id = reservations.user_id
        order by reservations.created_at desc
        limit 6
      ) pulse
    ),
    'reports', (
      select coalesce(
        jsonb_agg(row_payload || jsonb_build_object('expanded', row_rank = 1) order by created_at desc),
        '[]'::jsonb
      )
      from (
        select
          report_rows.*,
          row_number() over (order by report_rows.created_at desc) as row_rank
        from (
          select
            review_reports.created_at,
            jsonb_build_object(
              'id', review_reports.id::text,
              'source', 'review_report',
              'spotId', spots.id::text,
              'reviewId', reviews.id::text,
              'type', case
                when lower(coalesce(review_reports.reason, '')) ~ '(hate|harass|bully|porn|nudity|offensive|child|minor)' then 'Offensive Content'
                when lower(coalesce(review_reports.reason, '')) ~ '(wrong|incorrect|inaccurate|misleading|address|location|map|pin|website|contact|opening|description|category)' then 'Wrong Info'
                when lower(coalesce(review_reports.reason, '')) ~ '(fake|fraud|scam|spam)' then 'Fake Review'
                else 'Spot Issue'
              end,
              'spot', coalesce(spots.name, 'Reported review'),
              'area', coalesce(spots.address, 'Cebu City'),
              'reporter', upper(coalesce(
                nullif(left(regexp_replace(coalesce(reporter.display_name, ''), '\s+', '', 'g'), 2), ''),
                left(split_part(coalesce(reporter.email, 'AN'), '@', 1), 2),
                'AN'
              )),
              'date', to_char(review_reports.created_at, 'Mon DD, YYYY'),
              'description', coalesce(reviews.comment, review_reports.reason, 'A community member flagged this review.'),
              'reviewAuthor', coalesce(nullif(trim(reviews.user_name), ''), 'CebSpot user'),
              'reviewRating', reviews.rating,
              'reviewComment', reviews.comment,
              'reviewDate', to_char(reviews.created_at, 'Mon DD, YYYY'),
              'reviewMediaUrls', coalesce(to_jsonb(reviews.media_urls), '[]'::jsonb),
              'reviewThread', (
                select coalesce(
                  jsonb_agg(
                    jsonb_build_object(
                      'id', review_thread.id::text,
                      'author', coalesce(nullif(trim(review_thread.user_name), ''), 'CebSpot user'),
                      'rating', review_thread.rating,
                      'comment', coalesce(review_thread.comment, ''),
                      'date', to_char(review_thread.created_at, 'Mon DD, YYYY'),
                      'flagged', review_thread.id = reviews.id,
                      'mediaUrls', coalesce(to_jsonb(review_thread.media_urls), '[]'::jsonb)
                    )
                    order by (review_thread.id = reviews.id) desc, review_thread.created_at desc
                  ),
                  '[]'::jsonb
                )
                from (
                  select spot_reviews.*
                  from public.reviews spot_reviews
                  where spot_reviews.spot_id = reviews.spot_id
                  order by (spot_reviews.id = reviews.id) desc, spot_reviews.created_at desc
                  limit 12
                ) review_thread
              ),
              'note', review_reports.reason
            ) as row_payload
          from public.review_reports
          left join public.reviews on reviews.id = review_reports.review_id
          left join public.spots on spots.id = reviews.spot_id
          left join public.profiles reporter on reporter.id = review_reports.reporter_id
          where review_reports.status = 'pending'

          union all

          select
            spot_edit_suggestions.created_at,
            jsonb_build_object(
              'id', spot_edit_suggestions.id::text,
              'source', 'spot_edit_suggestion',
              'spotId', spots.id::text,
              'field', spot_edit_suggestions.field,
              'currentValue', spot_edit_suggestions.current_value,
              'suggestedValue', spot_edit_suggestions.suggested_value,
              'type', 'Wrong Info',
              'spot', coalesce(spots.name, 'Spot edit suggestion'),
              'area', coalesce(spots.address, 'Cebu City'),
              'reporter', upper(coalesce(
                nullif(left(regexp_replace(coalesce(suggester.display_name, ''), '\s+', '', 'g'), 2), ''),
                left(split_part(coalesce(suggester.email, 'AN'), '@', 1), 2),
                'AN'
              )),
              'date', to_char(spot_edit_suggestions.created_at, 'Mon DD, YYYY'),
              'description', case
                when lower(spot_edit_suggestions.field) ~ '(location|map|pin)' then
                  'Suggested a corrected map pin.' ||
                    coalesce(' Note: ' || nullif(trim(spot_edit_suggestions.note), ''), '')
                else
                  'Suggested ' || spot_edit_suggestions.field || ': ' ||
                    left(spot_edit_suggestions.suggested_value, 260) ||
                    coalesce(' Note: ' || nullif(trim(spot_edit_suggestions.note), ''), '')
              end,
              'note', spot_edit_suggestions.note
            ) as row_payload
          from public.spot_edit_suggestions
          left join public.spots on spots.id = spot_edit_suggestions.spot_id
          left join public.profiles suggester on suggester.id = spot_edit_suggestions.user_id
          where spot_edit_suggestions.status = 'pending'
        ) report_rows
        order by report_rows.created_at desc
        limit 20
      ) ranked_report_rows
    ),
    'users', (
      select coalesce(jsonb_agg(row_payload order by created_at desc), '[]'::jsonb)
      from (
        select
          profiles.created_at,
          jsonb_build_object(
            'id', profiles.id::text,
            'name', coalesce(nullif(trim(profiles.display_name), ''), split_part(profiles.email, '@', 1), 'CebSpot user'),
            'email', profiles.email,
            'role', initcap(profiles.role),
            'location', coalesce(profiles.location->>'address', 'Cebu City'),
            'joined', to_char(profiles.created_at, 'Mon DD, YYYY'),
            'avatar', upper(left(coalesce(nullif(trim(profiles.display_name), ''), profiles.email, 'CU'), 1))
          ) as row_payload
        from public.profiles
        order by profiles.created_at desc
        limit 12
      ) user_rows
    ),
    'ownerRequests', (
      select coalesce(jsonb_agg(row_payload order by created_at desc), '[]'::jsonb)
      from (
        select
          owner_access_requests.created_at,
          jsonb_build_object(
            'id', owner_access_requests.id::text,
            'applicant', coalesce(nullif(trim(owner_access_requests.contact_name), ''), split_part(owner_access_requests.contact_email, '@', 1), 'Applicant'),
            'initials', upper(left(coalesce(nullif(trim(owner_access_requests.contact_name), ''), owner_access_requests.contact_email, 'OR'), 2)),
            'email', owner_access_requests.contact_email,
            'spot', owner_access_requests.spot_name,
            'category', owner_access_requests.category,
            'barangay', coalesce(
              nullif(trim(substring(owner_access_requests.spot_address from '(?i)Barangay\s+([^,]+)')), ''),
              nullif(trim(split_part(owner_access_requests.spot_address, ',', 1)), ''),
              'Cebu City'
            ),
            'applied', to_char(owner_access_requests.created_at, 'Mon DD, YYYY'),
            'status', initcap(owner_access_requests.status),
            'message', owner_access_requests.message,
            'adminNotes', owner_access_requests.admin_notes,
            'expanded', row_number() over (order by owner_access_requests.created_at desc) = 1
          ) as row_payload
        from public.owner_access_requests
        order by owner_access_requests.created_at desc
        limit 10
      ) request_rows
    ),
    'pendingSubmissions', (
      select coalesce(jsonb_agg(row_payload order by created_at desc), '[]'::jsonb)
      from (
        select
          spot_submissions.created_at,
          jsonb_build_object(
            'id', spot_submissions.id::text,
            'name', spot_submissions.name,
            'category', spot_submissions.category,
            'barangay', coalesce(
              nullif(trim(substring(spot_submissions.address from '(?i)Barangay\s+([^,]+)')), ''),
              nullif(trim(split_part(spot_submissions.address, ',', 1)), ''),
              'Cebu City'
            ),
            'submitted', to_char(spot_submissions.created_at, 'Mon DD, YYYY'),
            'status', initcap(spot_submissions.status),
            'image', coalesce(spot_submissions.images[1], 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=240'),
            'voteCount', spot_submissions.vote_count,
            'searchCount', spot_submissions.search_count,
            'similarSubmissionCount', spot_submissions.similar_submission_count,
            'popularityScore', spot_submissions.popularity_score,
            'description', spot_submissions.description
          ) as row_payload
        from public.pending_spot_submission_popularity spot_submissions
        where spot_submissions.status = 'pending'
        order by spot_submissions.popularity_score desc, spot_submissions.created_at desc
        limit 20
      ) submission_rows
    )
  ) into payload;

  return payload;
end;
$$;

revoke all on function public.get_admin_dashboard() from public;
grant execute on function public.get_admin_dashboard() to authenticated;

drop function if exists public.approve_spot_submission(uuid);

create or replace function public.approve_spot_submission(target_submission_id uuid)
returns public.spots
language plpgsql
security definer
set search_path = public
as $$
declare
  submission public.spot_submissions%rowtype;
  approved_spot public.spots%rowtype;
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  select *
  into submission
  from public.spot_submissions
  where id = target_submission_id
  for update;

  if not found then
    raise exception 'Spot submission not found.';
  end if;

  if submission.status = 'approved' then
    select *
    into approved_spot
    from public.spots
    where name = submission.name
      and address = submission.address
    order by created_at desc
    limit 1;

    if found then
      return approved_spot;
    end if;
  elsif submission.status <> 'pending' then
    raise exception 'Only pending spot submissions can be approved.';
  end if;

  insert into public.spots (
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
    submission.name,
    submission.description,
    submission.category,
    submission.categories,
    submission.address,
    submission.latitude,
    submission.longitude,
    submission.images,
    'free',
    0,
    false,
    true,
    false,
    null
  )
  returning * into approved_spot;

  update public.spot_submissions
  set
    status = 'approved',
    updated_at = now()
  where id = target_submission_id;

  update public.local_updates
  set
    source_type = 'community',
    updated_at = now()
  where source_type = 'spot_submission'
    and source_id = target_submission_id::text;

  insert into public.activities (
    user_id,
    user_name,
    action,
    target_id,
    target_name,
    type,
    content,
    spot_id,
    spot_name
  )
  select
    submission.submitter_id,
    coalesce(nullif(trim(profile.display_name), ''), split_part(profile.email, '@', 1), 'CebSpot user'),
    'approved your spot submission',
    approved_spot.id::text,
    approved_spot.name,
    'submission_approved',
    approved_spot.name || ' is now live on the CebSpot map.',
    approved_spot.id,
    approved_spot.name
  from public.profiles profile
  where profile.id = submission.submitter_id;

  return approved_spot;
end;
$$;

revoke all on function public.approve_spot_submission(uuid) from public;
grant execute on function public.approve_spot_submission(uuid) to authenticated;

drop function if exists public.dismiss_admin_report(text, uuid, text);

create or replace function public.dismiss_admin_report(
  report_source text,
  target_report_id uuid,
  notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  if report_source = 'spot_edit_suggestion' then
    update public.spot_edit_suggestions
    set
      status = 'rejected',
      admin_notes = notes,
      updated_at = now()
    where id = target_report_id
      and status = 'pending';

    if not found then
      raise exception 'Pending spot edit suggestion not found.';
    end if;

    return jsonb_build_object('ok', true, 'source', report_source, 'status', 'rejected');
  elsif report_source = 'review_report' then
    update public.review_reports
    set
      status = case when nullif(trim(coalesce(notes, '')), '') is null then 'dismissed' else 'handled' end,
      admin_notes = notes,
      resolved_at = now(),
      updated_at = now()
    where id = target_report_id
      and status = 'pending';

    if not found then
      raise exception 'Pending review report not found.';
    end if;

    return jsonb_build_object('ok', true, 'source', report_source, 'status', 'handled');
  end if;

  raise exception 'Unsupported report source: %', report_source;
end;
$$;

revoke all on function public.dismiss_admin_report(text, uuid, text) from public;
grant execute on function public.dismiss_admin_report(text, uuid, text) to authenticated;

drop function if exists public.apply_spot_edit_suggestion(uuid, text);

create or replace function public.apply_spot_edit_suggestion(
  target_suggestion_id uuid,
  notes text default null
)
returns public.spots
language plpgsql
security definer
set search_path = public
as $$
declare
  suggestion public.spot_edit_suggestions%rowtype;
  updated_spot public.spots%rowtype;
  normalized_field text;
  next_latitude double precision;
  next_longitude double precision;
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  select *
  into suggestion
  from public.spot_edit_suggestions
  where id = target_suggestion_id
  for update;

  if not found then
    raise exception 'Spot edit suggestion not found.';
  end if;

  if suggestion.status <> 'pending' then
    raise exception 'Only pending spot edit suggestions can be applied.';
  end if;

  normalized_field := lower(coalesce(suggestion.field, ''));

  if normalized_field ~ '(location|map|pin)' then
    begin
      next_latitude := (suggestion.suggested_value::jsonb ->> 'latitude')::double precision;
      next_longitude := (suggestion.suggested_value::jsonb ->> 'longitude')::double precision;
    exception when others then
      raise exception 'Suggested pin is invalid.';
    end;

    if next_latitude is null or next_longitude is null then
      raise exception 'Suggested pin is missing latitude or longitude.';
    end if;

    update public.spots
    set
      latitude = next_latitude,
      longitude = next_longitude,
      updated_at = now()
    where id = suggestion.spot_id
    returning * into updated_spot;
  elsif normalized_field like '%address%' then
    update public.spots
    set address = trim(suggestion.suggested_value), updated_at = now()
    where id = suggestion.spot_id
    returning * into updated_spot;
  elsif normalized_field like '%opening%' then
    update public.spots
    set opening_hours = trim(suggestion.suggested_value), updated_at = now()
    where id = suggestion.spot_id
    returning * into updated_spot;
  elsif normalized_field like '%website%' then
    update public.spots
    set website_url = trim(suggestion.suggested_value), updated_at = now()
    where id = suggestion.spot_id
    returning * into updated_spot;
  elsif normalized_field like '%contact%' then
    update public.spots
    set contact_number = trim(suggestion.suggested_value), updated_at = now()
    where id = suggestion.spot_id
    returning * into updated_spot;
  elsif normalized_field like '%description%' then
    update public.spots
    set description = trim(suggestion.suggested_value), updated_at = now()
    where id = suggestion.spot_id
    returning * into updated_spot;
  elsif normalized_field like '%category%' then
    update public.spots
    set category = trim(suggestion.suggested_value), updated_at = now()
    where id = suggestion.spot_id
    returning * into updated_spot;
  else
    raise exception 'This suggestion field cannot be applied automatically.';
  end if;

  if not found then
    raise exception 'Linked spot not found.';
  end if;

  update public.spot_edit_suggestions
  set
    status = 'approved',
    admin_notes = notes,
    updated_at = now()
  where id = target_suggestion_id;

  return updated_spot;
end;
$$;

revoke all on function public.apply_spot_edit_suggestion(uuid, text) from public;
grant execute on function public.apply_spot_edit_suggestion(uuid, text) to authenticated;

notify pgrst, 'reload schema';
