-- Authoritative schema foundation captured 2026-10-13.
-- Fresh databases only; existing deployments require schema/history alignment first.
-- No venue, user, review, activity, or table-inventory fixture seeds are included.
-- Root SQL files are archived references, not an application/deployment sequence.

-- Captured from supabase-admin-dashboard.sql
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
      and lower(profile.email) = 'testadmin6000@gmail.com'
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

alter table public.owner_access_requests
  alter column requester_id drop not null,
  add column if not exists verification_documents text[] not null default '{}',
  add column if not exists spot_id uuid references public.spots(id) on delete set null,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

create index if not exists owner_access_requests_spot_idx
  on public.owner_access_requests(spot_id, status, created_at desc);

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
                when lower(trim(split_part(coalesce(review_reports.reason, ''), ':', 1))) = 'inaccurate or misleading review' then 'Inaccurate or misleading review'
                when lower(trim(split_part(coalesce(review_reports.reason, ''), ':', 1))) = 'frauds and scams' then 'Frauds and scams'
                when lower(trim(split_part(coalesce(review_reports.reason, ''), ':', 1))) = 'spam' then 'Spam'
                when lower(trim(split_part(coalesce(review_reports.reason, ''), ':', 1))) = 'hate speech' then 'Hate speech'
                when lower(trim(split_part(coalesce(review_reports.reason, ''), ':', 1))) = 'harassment or bullying' then 'Harassment or bullying'
                when lower(trim(split_part(coalesce(review_reports.reason, ''), ':', 1))) = 'pornography and nudity' then 'Pornography and nudity'
                when lower(trim(split_part(coalesce(review_reports.reason, ''), ':', 1))) = 'illegal activities and regulated goods' then 'Illegal activities and regulated goods'
                when lower(trim(split_part(coalesce(review_reports.reason, ''), ':', 1))) = 'child or minor safety' then 'Child or minor safety'
                when lower(trim(split_part(coalesce(review_reports.reason, ''), ':', 1))) = 'others' then 'Others'
                when lower(coalesce(review_reports.reason, '')) ~ '(child|minor)' then 'Child or minor safety'
                when lower(coalesce(review_reports.reason, '')) ~ '(porn|nudity|sexual)' then 'Pornography and nudity'
                when lower(coalesce(review_reports.reason, '')) ~ '(harass|bully)' then 'Harassment or bullying'
                when lower(coalesce(review_reports.reason, '')) ~ '(hate)' then 'Hate speech'
                when lower(coalesce(review_reports.reason, '')) ~ '(illegal|regulated|drug|weapon)' then 'Illegal activities and regulated goods'
                when lower(coalesce(review_reports.reason, '')) ~ '(fake|fraud|scam)' then 'Frauds and scams'
                when lower(coalesce(review_reports.reason, '')) ~ '(spam)' then 'Spam'
                when lower(coalesce(review_reports.reason, '')) ~ '(wrong|incorrect|inaccurate|misleading|address|location|map|pin|website|contact|opening|description|category)' then 'Inaccurate or misleading review'
                else 'Others'
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
              'type', 'Spot edit suggestion',
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
            'avatar', upper(left(coalesce(nullif(trim(profiles.display_name), ''), profiles.email, 'CU'), 1)),
            'photoUrl', profiles.photo_url
          ) as row_payload
        from public.profiles
        order by profiles.created_at desc
      ) user_rows
    ),
    'ownerRequests', (
      select coalesce(jsonb_agg(row_payload order by created_at desc), '[]'::jsonb)
      from (
        select
          owner_access_requests.created_at,
          jsonb_build_object(
            'id', owner_access_requests.id::text,
            'requesterId', owner_access_requests.requester_id::text,
            'spotId', owner_access_requests.spot_id::text,
            'applicant', coalesce(nullif(trim(owner_access_requests.contact_name), ''), split_part(owner_access_requests.contact_email, '@', 1), 'Applicant'),
            'initials', upper(left(coalesce(nullif(trim(owner_access_requests.contact_name), ''), owner_access_requests.contact_email, 'OR'), 2)),
            'email', owner_access_requests.contact_email,
            'phone', owner_access_requests.contact_phone,
            'spot', owner_access_requests.spot_name,
            'fullAddress', owner_access_requests.spot_address,
            'category', owner_access_requests.category,
            'accessNeeds', owner_access_requests.access_needs,
            'verificationDocuments', owner_access_requests.verification_documents,
            'barangay', coalesce(
              nullif(trim(substring(owner_access_requests.spot_address from '(?i)Barangay\s+([^,]+)')), ''),
              nullif(trim(split_part(owner_access_requests.spot_address, ',', 1)), ''),
              'Cebu City'
            ),
            'applied', to_char(owner_access_requests.created_at, 'Mon DD, YYYY'),
            'status', initcap(owner_access_requests.status),
            'message', owner_access_requests.message,
            'adminNotes', owner_access_requests.admin_notes,
            'reviewedAt', owner_access_requests.reviewed_at,
            'expanded', row_number() over (order by owner_access_requests.created_at desc) = 1
          ) as row_payload
        from public.owner_access_requests
        order by owner_access_requests.created_at desc
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
            'categories', spot_submissions.categories,
            'barangay', coalesce(
              nullif(trim(substring(spot_submissions.address from '(?i)Barangay\s+([^,]+)')), ''),
              nullif(trim(split_part(spot_submissions.address, ',', 1)), ''),
              'Cebu City'
            ),
            'address', spot_submissions.address,
            'latitude', spot_submissions.latitude,
            'longitude', spot_submissions.longitude,
            'submitted', to_char(spot_submissions.created_at, 'Mon DD, YYYY'),
            'createdAt', spot_submissions.created_at,
            'status', initcap(spot_submissions.status),
            'image', coalesce(spot_submissions.images[1], 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=240'),
            'images', coalesce(to_jsonb(spot_submissions.images), '[]'::jsonb),
            'voteCount', spot_submissions.vote_count,
            'searchCount', spot_submissions.search_count,
            'similarSubmissionCount', spot_submissions.similar_submission_count,
            'popularityScore', spot_submissions.popularity_score,
            'description', spot_submissions.description,
            'reservationType', spot_submissions.reservation_type,
            'reservationFee', spot_submissions.reservation_fee,
            'paymentRequired', spot_submissions.payment_required,
            'isReservable', spot_submissions.is_reservable,
            'submitterId', spot_submissions.submitter_id::text,
            'submitterName', coalesce(nullif(trim(submitter.display_name), ''), split_part(submitter.email, '@', 1), 'Unknown sender'),
            'submitterEmail', coalesce(submitter.email, 'No email on profile')
          ) as row_payload
        from public.pending_spot_submission_popularity spot_submissions
        left join public.profiles submitter on submitter.id = spot_submissions.submitter_id
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

drop function if exists public.review_owner_access_request(uuid, text, text);

create or replace function public.review_owner_access_request(
  target_request_id uuid,
  decision text,
  notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_request public.owner_access_requests%rowtype;
  requester_profile public.profiles%rowtype;
  linked_spot public.spots%rowtype;
  normalized_decision text := lower(trim(coalesce(decision, '')));
  normalized_notes text := nullif(trim(coalesce(notes, '')), '');
  matching_spot_count integer := 0;
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  if normalized_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected.';
  end if;

  if normalized_decision = 'approved' then
    raise exception 'Owner approvals must use the dedicated business-account provisioning function.';
  end if;

  if normalized_decision = 'rejected' and normalized_notes is null then
    raise exception 'Add a rejection reason before rejecting this request.';
  end if;

  select *
  into owner_request
  from public.owner_access_requests
  where id = target_request_id
  for update;

  if not found then
    raise exception 'Owner access request not found.';
  end if;

  if owner_request.status <> 'pending' then
    if owner_request.status = normalized_decision then
      return jsonb_build_object(
        'ok', true,
        'requestId', owner_request.id::text,
        'status', owner_request.status,
        'spotId', owner_request.spot_id::text,
        'alreadyReviewed', true
      );
    end if;

    raise exception 'This owner access request has already been reviewed.';
  end if;

  if owner_request.requester_id is not null then
    select *
    into requester_profile
    from public.profiles
    where id = owner_request.requester_id
    for update;
  else
    select *
    into requester_profile
    from public.profiles
    where lower(email) = lower(owner_request.contact_email)
    order by created_at asc
    limit 1
    for update;

    if found then
      owner_request.requester_id := requester_profile.id;

      update public.owner_access_requests
      set requester_id = requester_profile.id,
          updated_at = now()
      where id = owner_request.id;
    end if;
  end if;

  if requester_profile.id is null and normalized_decision = 'approved' then
    raise exception 'Create the owner account first, using the applicant email, before approving this request.';
  end if;

  if normalized_decision = 'approved' then
    if owner_request.spot_id is not null then
      select *
      into linked_spot
      from public.spots
      where id = owner_request.spot_id
      for update;
    else
      select count(*)::integer
      into matching_spot_count
      from public.spots
      where regexp_replace(lower(trim(name)), '[^a-z0-9]+', '', 'g') =
            regexp_replace(lower(trim(owner_request.spot_name)), '[^a-z0-9]+', '', 'g')
        and regexp_replace(lower(trim(address)), '[^a-z0-9]+', '', 'g') =
            regexp_replace(lower(trim(owner_request.spot_address)), '[^a-z0-9]+', '', 'g');

      if matching_spot_count = 0 then
        select count(*)::integer
        into matching_spot_count
        from public.spots
        where regexp_replace(lower(trim(name)), '[^a-z0-9]+', '', 'g') =
              regexp_replace(lower(trim(owner_request.spot_name)), '[^a-z0-9]+', '', 'g');

        if matching_spot_count = 0 then
          raise exception 'No CebSpot listing matches this spot. Create the listing before approving owner access.';
        elsif matching_spot_count > 1 then
          raise exception 'Multiple listings share this spot name. Correct the request address or resolve the duplicates before approval.';
        end if;

        select *
        into linked_spot
        from public.spots
        where regexp_replace(lower(trim(name)), '[^a-z0-9]+', '', 'g') =
              regexp_replace(lower(trim(owner_request.spot_name)), '[^a-z0-9]+', '', 'g')
        for update;
      elsif matching_spot_count > 1 then
        raise exception 'Multiple listings match this request. Resolve the duplicate spots before approval.';
      else
        select *
        into linked_spot
        from public.spots
        where regexp_replace(lower(trim(name)), '[^a-z0-9]+', '', 'g') =
              regexp_replace(lower(trim(owner_request.spot_name)), '[^a-z0-9]+', '', 'g')
          and regexp_replace(lower(trim(address)), '[^a-z0-9]+', '', 'g') =
              regexp_replace(lower(trim(owner_request.spot_address)), '[^a-z0-9]+', '', 'g')
        for update;
      end if;
    end if;

    if not found then
      raise exception 'The linked spot no longer exists.';
    end if;

    if linked_spot.owner_id is not null and linked_spot.owner_id <> owner_request.requester_id then
      raise exception 'This spot already belongs to another owner. Resolve the ownership conflict before approval.';
    end if;

    update public.profiles
    set
      role = case when role = 'admin' then role else 'owner' end,
      updated_at = now()
    where id = owner_request.requester_id;

    update public.spots
    set owner_id = owner_request.requester_id,
        updated_at = now()
    where id = linked_spot.id;

    insert into public.owner_spot_access (owner_id, spot_id, role)
    values (owner_request.requester_id, linked_spot.id, 'owner')
    on conflict (owner_id, spot_id) do update
    set role = excluded.role;

    update public.owner_access_requests
    set
      status = 'approved',
      spot_id = linked_spot.id,
      admin_notes = normalized_notes,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
    where id = owner_request.id;

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
    values (
      owner_request.requester_id,
      'CebSpot Admin',
      'approved your owner access request',
      owner_request.id::text,
      linked_spot.name,
      'owner_access_approved',
      'Your owner access for ' || linked_spot.name || ' is ready.',
      linked_spot.id,
      linked_spot.name
    );

    return jsonb_build_object(
      'ok', true,
      'requestId', owner_request.id::text,
      'status', 'approved',
      'spotId', linked_spot.id::text,
      'spotName', linked_spot.name,
      'alreadyReviewed', false
    );
  end if;

  update public.owner_access_requests
  set
    status = 'rejected',
    admin_notes = normalized_notes,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  where id = owner_request.id;

  insert into public.activities (
    user_id,
    user_name,
    action,
    target_id,
    target_name,
    type,
    content,
    spot_name
  )
  select
    owner_request.requester_id,
    'CebSpot Admin',
    'reviewed your owner access request',
    owner_request.id::text,
    owner_request.spot_name,
    'owner_access_rejected',
    'Your owner access request for ' || owner_request.spot_name || ' was not approved.',
    owner_request.spot_name
  where owner_request.requester_id is not null;

  return jsonb_build_object(
    'ok', true,
    'requestId', owner_request.id::text,
    'status', 'rejected',
    'spotId', null,
    'spotName', owner_request.spot_name,
    'alreadyReviewed', false
  );
end;
$$;

revoke all on function public.review_owner_access_request(uuid, text, text) from public;
grant execute on function public.review_owner_access_request(uuid, text, text) to authenticated;

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


-- Captured from supabase-gamification.sql
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
      and lower(profile.email) = 'testadmin6000@gmail.com'
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

-- Visit check-ins were retired because proximity alone cannot prove a visit and
-- could be abused for repeat XP. These drops also disable calls from old builds.
drop function if exists public.record_spot_visit(uuid, double precision, double precision, double precision);
drop function if exists public.distance_meters(double precision, double precision, double precision, double precision);

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

  if coalesce(new.rating, 0) > 0 then
    perform public.award_points(
      new.user_id,
      'RATING_CREATED',
      1,
      new.id::text,
      'review',
      jsonb_build_object('spot_id', new.spot_id, 'rating', new.rating),
      true
    );
  end if;

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

create or replace function public.mark_review_helpful(target_review_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  review_record public.reviews%rowtype;
  existing_vote public.review_helpful_votes%rowtype;
  created_vote public.review_helpful_votes%rowtype;
  spot_record public.spots%rowtype;
  voter_profile public.profiles%rowtype;
  voter_name text;
  reward_reference text;
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

  select *
  into existing_vote
  from public.review_helpful_votes
  where review_id = target_review_id
    and user_id = current_user_id;

  if found then
    delete from public.review_helpful_votes
    where id = existing_vote.id;

    update public.reviews
    set likes_count = greatest(coalesce(likes_count, 0) - 1, 0),
        updated_at = now()
    where id = target_review_id;

    return jsonb_build_object('helpful', false, 'awarded', false);
  end if;

  insert into public.review_helpful_votes (review_id, user_id)
  values (target_review_id, current_user_id)
  on conflict do nothing
  returning * into created_vote;

  if created_vote.id is null then
    return jsonb_build_object('helpful', true, 'awarded', false);
  end if;

  update public.reviews
  set likes_count = coalesce(likes_count, 0) + 1,
      updated_at = now()
  where id = target_review_id;

  select * into voter_profile
  from public.profiles
  where id = current_user_id;

  voter_name := coalesce(
    nullif(trim(voter_profile.display_name), ''),
    split_part(voter_profile.email, '@', 1),
    'CebSpot user'
  );

  select * into spot_record
  from public.spots
  where id = review_record.spot_id;

  insert into public.activities (
    user_id,
    user_name,
    user_photo_url,
    action,
    target_id,
    target_name,
    type,
    content,
    spot_id,
    spot_name
  )
  values (
    review_record.user_id,
    voter_name,
    voter_profile.photo_url,
    'found your review helpful',
    target_review_id::text,
    coalesce(spot_record.name, 'Review'),
    'review_liked',
    voter_name || ' found your review helpful.',
    review_record.spot_id,
    coalesce(spot_record.name, 'CebSpot spot')
  );

  reward_reference := target_review_id::text || ':' || current_user_id::text;
  if not exists (
    select 1
    from public.point_transactions
    where user_id = review_record.user_id
      and activity_type = 'REVIEW_MARKED_HELPFUL'
      and reference_type = 'review_helpful_vote'
      and reference_id = reward_reference
  ) then
    perform public.award_points(
      review_record.user_id,
      'REVIEW_MARKED_HELPFUL',
      2,
      reward_reference,
      'review_helpful_vote',
      jsonb_build_object('review_id', target_review_id, 'voter_id', current_user_id),
      true
    );
  end if;

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

-- Hide the retired achievement when upgrading an existing CebSpot database.
update public.achievements
set enabled = false,
    xp_reward = 0
where code = 'ON_THE_GROUND'
   or requirement_type = 'verified_visits';

alter table public.point_transactions enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
alter table public.review_helpful_votes enable row level security;
alter table public.place_questions enable row level security;
alter table public.place_question_answers enable row level security;

drop policy if exists "point_transactions_select_own" on public.point_transactions;
drop policy if exists "achievements_read_enabled" on public.achievements;
drop policy if exists "user_achievements_select_own" on public.user_achievements;
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
revoke all on table public.review_helpful_votes from public, anon, authenticated;
revoke all on table public.place_question_answers from public, anon, authenticated;

grant select on table public.point_transactions to authenticated;
grant select on table public.achievements to anon, authenticated;
grant select on table public.user_achievements to authenticated;
grant select on table public.review_helpful_votes to authenticated;
grant select, insert on table public.place_questions to authenticated;
grant select on table public.place_question_answers to anon, authenticated;

notify pgrst, 'reload schema';


-- Captured from supabase-review-interactions.sql
-- CebSpot review interaction updates
-- Run this in the Supabase SQL Editor after the base schema and gamification SQL.
-- It allows unrated reviews and makes helpful reactions reversible.

alter table public.reviews drop constraint if exists reviews_rating_check;
alter table public.reviews
  add constraint reviews_rating_check check (rating >= 0 and rating <= 5);

create or replace function public.mark_review_helpful(target_review_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  review_record public.reviews%rowtype;
  existing_vote public.review_helpful_votes%rowtype;
  created_vote public.review_helpful_votes%rowtype;
  spot_record public.spots%rowtype;
  voter_profile public.profiles%rowtype;
  voter_name text;
  reward_reference text;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select * into review_record
  from public.reviews
  where id = target_review_id;

  if not found then
    raise exception 'Review not found.';
  end if;

  if review_record.user_id = current_user_id then
    raise exception 'You cannot mark your own review as helpful.';
  end if;

  select * into existing_vote
  from public.review_helpful_votes
  where review_id = target_review_id
    and user_id = current_user_id;

  if found then
    delete from public.review_helpful_votes where id = existing_vote.id;
    update public.reviews
    set likes_count = greatest(coalesce(likes_count, 0) - 1, 0), updated_at = now()
    where id = target_review_id;
    return jsonb_build_object('helpful', false, 'awarded', false);
  end if;

  insert into public.review_helpful_votes (review_id, user_id)
  values (target_review_id, current_user_id)
  on conflict do nothing
  returning * into created_vote;

  if created_vote.id is null then
    return jsonb_build_object('helpful', true, 'awarded', false);
  end if;

  update public.reviews
  set likes_count = coalesce(likes_count, 0) + 1, updated_at = now()
  where id = target_review_id;

  select * into voter_profile
  from public.profiles
  where id = current_user_id;

  voter_name := coalesce(
    nullif(trim(voter_profile.display_name), ''),
    split_part(voter_profile.email, '@', 1),
    'CebSpot user'
  );

  select * into spot_record
  from public.spots
  where id = review_record.spot_id;

  insert into public.activities (
    user_id,
    user_name,
    user_photo_url,
    action,
    target_id,
    target_name,
    type,
    content,
    spot_id,
    spot_name
  )
  values (
    review_record.user_id,
    voter_name,
    voter_profile.photo_url,
    'found your review helpful',
    target_review_id::text,
    coalesce(spot_record.name, 'Review'),
    'review_liked',
    voter_name || ' found your review helpful.',
    review_record.spot_id,
    coalesce(spot_record.name, 'CebSpot spot')
  );

  reward_reference := target_review_id::text || ':' || current_user_id::text;
  if not exists (
    select 1 from public.point_transactions
    where user_id = review_record.user_id
      and activity_type = 'REVIEW_MARKED_HELPFUL'
      and reference_type = 'review_helpful_vote'
      and reference_id = reward_reference
  ) then
    perform public.award_points(
      review_record.user_id,
      'REVIEW_MARKED_HELPFUL',
      2,
      reward_reference,
      'review_helpful_vote',
      jsonb_build_object('review_id', target_review_id, 'voter_id', current_user_id),
      true
    );
  end if;

  return jsonb_build_object('helpful', true, 'awarded', true);
end;
$$;

revoke all on function public.mark_review_helpful(uuid) from public;
grant execute on function public.mark_review_helpful(uuid) to authenticated;

create or replace function public.add_review_reply(
  target_review_id uuid,
  target_spot_id uuid,
  reply_body text,
  parent_reply_id uuid default null
)
returns public.review_replies
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_body text := trim(coalesce(reply_body, ''));
  review_record public.reviews%rowtype;
  reviewer_profile public.profiles%rowtype;
  created_reply public.review_replies%rowtype;
  spot_record public.spots%rowtype;
  commenter_name text;
begin
  if current_user_id is null then
    raise exception 'Authentication is required to comment.';
  end if;

  if normalized_body = '' then
    raise exception 'Write a comment before sending.';
  end if;

  if char_length(normalized_body) > 500 then
    raise exception 'Comments can contain up to 500 characters.';
  end if;

  select * into review_record
  from public.reviews
  where id = target_review_id;

  if not found or review_record.spot_id <> target_spot_id then
    raise exception 'Review not found.';
  end if;

  if parent_reply_id is not null and not exists (
    select 1 from public.review_replies parent_reply
    where parent_reply.id = add_review_reply.parent_reply_id
      and parent_reply.review_id = target_review_id
  ) then
    raise exception 'Comment thread target not found.';
  end if;

  select * into reviewer_profile
  from public.profiles
  where id = current_user_id;

  if not found then
    raise exception 'Your profile is unavailable.';
  end if;

  commenter_name := coalesce(
    nullif(trim(reviewer_profile.display_name), ''),
    split_part(reviewer_profile.email, '@', 1),
    'CebSpot user'
  );

  insert into public.review_replies (
    spot_id,
    review_id,
    parent_reply_id,
    user_id,
    user_name,
    user_photo_url,
    body
  )
  values (
    target_spot_id,
    target_review_id,
    add_review_reply.parent_reply_id,
    current_user_id,
    commenter_name,
    reviewer_profile.photo_url,
    normalized_body
  )
  returning * into created_reply;

  select * into spot_record
  from public.spots
  where id = target_spot_id;

  if review_record.user_id <> current_user_id then
    insert into public.activities (
      user_id,
      user_name,
      user_photo_url,
      action,
      target_id,
      target_name,
      type,
      content,
      spot_id,
      spot_name
    )
    values (
      review_record.user_id,
      commenter_name,
      reviewer_profile.photo_url,
      'commented on your review',
      target_review_id::text,
      coalesce(spot_record.name, 'Review'),
      'review_comment',
      commenter_name || ' commented on your review.',
      target_spot_id,
      coalesce(spot_record.name, 'CebSpot spot')
    );
  end if;

  return created_reply;
end;
$$;

revoke all on function public.add_review_reply(uuid, uuid, text, uuid) from public;
grant execute on function public.add_review_reply(uuid, uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';


-- Captured from supabase-dedicated-owner-accounts.sql
-- Dedicated CebSpot business-owner account provisioning.
-- Run this in the Supabase SQL Editor before deploying provision-owner-account.

-- Remove prototype-only restrictions that tied Test Cebspot Club to one email.
drop trigger if exists spots_enforce_test_cebspot_owner on public.spots;
drop trigger if exists owner_spot_access_enforce_test_cebspot_owner on public.owner_spot_access;
drop function if exists public.enforce_test_cebspot_spot_owner();
drop function if exists public.enforce_test_cebspot_owner_access();

alter table public.owner_access_requests
  alter column requester_id drop not null,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

create or replace function public.get_owner_business_email_status(candidate_email text)
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $function$
declare
  normalized_email text := lower(trim(coalesce(candidate_email, '')));
begin
  if normalized_email = '' or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return 'invalid';
  end if;

  if exists (
    select 1 from auth.users where lower(trim(email)) = normalized_email
  ) or exists (
    select 1 from public.profiles where lower(trim(email)) = normalized_email
  ) then
    return 'registered';
  end if;

  if exists (
    select 1
    from public.owner_access_requests
    where lower(trim(contact_email)) = normalized_email
      and status = 'pending'
  ) then
    return 'pending';
  end if;

  return 'available';
end;
$function$;

revoke all on function public.get_owner_business_email_status(text) from public;
grant execute on function public.get_owner_business_email_status(text) to anon, authenticated;

create or replace function public.reject_unavailable_owner_business_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  email_status text;
begin
  email_status := public.get_owner_business_email_status(new.contact_email);

  if email_status = 'registered' then
    raise exception 'This email already belongs to a CebSpot user. Use a separate, unregistered business email for the owner account.'
      using errcode = '23505';
  elsif email_status = 'pending' then
    raise exception 'An owner access request for this business email is already pending.'
      using errcode = '23505';
  elsif email_status = 'invalid' then
    raise exception 'Enter a valid business email address.'
      using errcode = '22023';
  end if;

  return new;
end;
$function$;

drop trigger if exists owner_requests_reject_unavailable_email on public.owner_access_requests;
create trigger owner_requests_reject_unavailable_email
before insert on public.owner_access_requests
for each row execute function public.reject_unavailable_owner_business_email();

create or replace function public.finalize_dedicated_owner_account(
  target_request_id uuid,
  dedicated_owner_id uuid,
  reviewing_admin_id uuid,
  notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  owner_request public.owner_access_requests%rowtype;
  owner_profile public.profiles%rowtype;
  admin_profile public.profiles%rowtype;
  linked_spot public.spots%rowtype;
  normalized_notes text := nullif(trim(coalesce(notes, '')), '');
  matching_spot_count integer := 0;
begin
  select * into admin_profile
  from public.profiles
  where id = reviewing_admin_id;

  if admin_profile.id is null or admin_profile.role <> 'admin' then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  select * into owner_request
  from public.owner_access_requests
  where id = target_request_id
  for update;

  if not found then
    raise exception 'Owner access request not found.';
  end if;

  if owner_request.status <> 'pending' then
    if owner_request.status = 'approved' then
      return jsonb_build_object(
        'ok', true,
        'requestId', owner_request.id::text,
        'status', owner_request.status,
        'spotId', owner_request.spot_id::text,
        'alreadyReviewed', true
      );
    end if;
    raise exception 'This owner access request has already been reviewed.';
  end if;

  if owner_request.requester_id is not null then
    raise exception 'This request is linked to an existing CebSpot user. A separate business email is required.';
  end if;

  select * into owner_profile
  from public.profiles
  where id = dedicated_owner_id
  for update;

  if owner_profile.id is null then
    raise exception 'The dedicated owner profile was not created.';
  end if;

  if lower(trim(owner_profile.email)) <> lower(trim(owner_request.contact_email)) then
    raise exception 'The invited account email does not match the verified business email.';
  end if;

  if owner_profile.role = 'admin' then
    raise exception 'An admin account cannot be assigned as a venue owner.';
  end if;

  if owner_request.spot_id is not null then
    select * into linked_spot
    from public.spots
    where id = owner_request.spot_id
    for update;
  else
    select count(*)::integer into matching_spot_count
    from public.spots
    where regexp_replace(lower(trim(name)), '[^a-z0-9]+', '', 'g') =
          regexp_replace(lower(trim(owner_request.spot_name)), '[^a-z0-9]+', '', 'g')
      and regexp_replace(lower(trim(address)), '[^a-z0-9]+', '', 'g') =
          regexp_replace(lower(trim(owner_request.spot_address)), '[^a-z0-9]+', '', 'g');

    if matching_spot_count = 0 then
      select count(*)::integer into matching_spot_count
      from public.spots
      where regexp_replace(lower(trim(name)), '[^a-z0-9]+', '', 'g') =
            regexp_replace(lower(trim(owner_request.spot_name)), '[^a-z0-9]+', '', 'g');

      if matching_spot_count = 0 then
        raise exception 'No CebSpot listing matches this spot. Create the listing before approving owner access.';
      elsif matching_spot_count > 1 then
        raise exception 'Multiple listings share this spot name. Link the request to the correct spot before approval.';
      end if;

      select * into linked_spot
      from public.spots
      where regexp_replace(lower(trim(name)), '[^a-z0-9]+', '', 'g') =
            regexp_replace(lower(trim(owner_request.spot_name)), '[^a-z0-9]+', '', 'g')
      for update;
    elsif matching_spot_count > 1 then
      raise exception 'Multiple listings match this request. Resolve the duplicate spots before approval.';
    else
      select * into linked_spot
      from public.spots
      where regexp_replace(lower(trim(name)), '[^a-z0-9]+', '', 'g') =
            regexp_replace(lower(trim(owner_request.spot_name)), '[^a-z0-9]+', '', 'g')
        and regexp_replace(lower(trim(address)), '[^a-z0-9]+', '', 'g') =
            regexp_replace(lower(trim(owner_request.spot_address)), '[^a-z0-9]+', '', 'g')
      for update;
    end if;
  end if;

  if linked_spot.id is null then
    raise exception 'The linked spot no longer exists.';
  end if;

  if linked_spot.owner_id is not null and linked_spot.owner_id <> dedicated_owner_id then
    raise exception 'This spot already belongs to another owner. Resolve the ownership conflict before approval.';
  end if;

  if exists (
    select 1 from public.owner_spot_access
    where spot_id = linked_spot.id
      and owner_id <> dedicated_owner_id
      and role = 'owner'
  ) then
    raise exception 'This spot already has a dedicated owner account.';
  end if;

  update public.profiles
  set role = 'owner',
      display_name = coalesce(nullif(trim(display_name), ''), owner_request.contact_name),
      updated_at = now()
  where id = dedicated_owner_id;

  update public.spots
  set owner_id = dedicated_owner_id,
      updated_at = now()
  where id = linked_spot.id;

  insert into public.owner_spot_access (owner_id, spot_id, role)
  values (dedicated_owner_id, linked_spot.id, 'owner')
  on conflict (owner_id, spot_id) do update
  set role = excluded.role;

  update public.owner_access_requests
  set requester_id = dedicated_owner_id,
      status = 'approved',
      spot_id = linked_spot.id,
      admin_notes = normalized_notes,
      reviewed_by = reviewing_admin_id,
      reviewed_at = now(),
      updated_at = now()
  where id = owner_request.id;

  insert into public.activities (
    user_id, user_name, action, target_id, target_name, type, content, spot_id, spot_name
  ) values (
    dedicated_owner_id,
    'CebSpot Admin',
    'created your dedicated business account',
    owner_request.id::text,
    linked_spot.name,
    'owner_access_approved',
    'Your dedicated owner account for ' || linked_spot.name || ' is ready. Open the invitation email to set your password.',
    linked_spot.id,
    linked_spot.name
  );

  return jsonb_build_object(
    'ok', true,
    'requestId', owner_request.id::text,
    'status', 'approved',
    'spotId', linked_spot.id::text,
    'spotName', linked_spot.name,
    'ownerId', dedicated_owner_id::text,
    'alreadyReviewed', false
  );
end;
$function$;

revoke all on function public.finalize_dedicated_owner_account(uuid, uuid, uuid, text) from public;
revoke all on function public.finalize_dedicated_owner_account(uuid, uuid, uuid, text) from anon, authenticated;
grant execute on function public.finalize_dedicated_owner_account(uuid, uuid, uuid, text) to service_role;


-- Captured from supabase-fix-owner-request-rejection.sql
-- Run this in the Supabase SQL Editor to fix owner-request approval and rejection.

drop function if exists public.review_owner_access_request(uuid, text, text);

create or replace function public.review_owner_access_request(
  target_request_id uuid,
  decision text,
  notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_request public.owner_access_requests%rowtype;
  requester_profile public.profiles%rowtype;
  linked_spot public.spots%rowtype;
  normalized_decision text := lower(trim(coalesce(decision, '')));
  normalized_notes text := nullif(trim(coalesce(notes, '')), '');
  matching_spot_count integer := 0;
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  if normalized_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected.';
  end if;

  if normalized_decision = 'approved' then
    raise exception 'Owner approvals must use the dedicated business-account provisioning function.';
  end if;

  if normalized_decision = 'rejected' and normalized_notes is null then
    raise exception 'Add a rejection reason before rejecting this request.';
  end if;

  select *
  into owner_request
  from public.owner_access_requests
  where id = target_request_id
  for update;

  if not found then
    raise exception 'Owner access request not found.';
  end if;

  if owner_request.status <> 'pending' then
    if owner_request.status = normalized_decision then
      return jsonb_build_object(
        'ok', true,
        'requestId', owner_request.id::text,
        'status', owner_request.status,
        'spotId', owner_request.spot_id::text,
        'alreadyReviewed', true
      );
    end if;

    raise exception 'This owner access request has already been reviewed.';
  end if;

  if owner_request.requester_id is not null then
    select *
    into requester_profile
    from public.profiles
    where id = owner_request.requester_id
    for update;
  else
    select *
    into requester_profile
    from public.profiles
    where lower(email) = lower(owner_request.contact_email)
    order by created_at asc
    limit 1
    for update;

    if found then
      owner_request.requester_id := requester_profile.id;

      update public.owner_access_requests
      set requester_id = requester_profile.id,
          updated_at = now()
      where id = owner_request.id;
    end if;
  end if;

  if requester_profile.id is null and normalized_decision = 'approved' then
    raise exception 'Create the owner account first, using the applicant email, before approving this request.';
  end if;

  if normalized_decision = 'approved' then
    if owner_request.spot_id is not null then
      select *
      into linked_spot
      from public.spots
      where id = owner_request.spot_id
      for update;
    else
      select count(*)::integer
      into matching_spot_count
      from public.spots
      where regexp_replace(lower(trim(name)), '[^a-z0-9]+', '', 'g') =
            regexp_replace(lower(trim(owner_request.spot_name)), '[^a-z0-9]+', '', 'g')
        and regexp_replace(lower(trim(address)), '[^a-z0-9]+', '', 'g') =
            regexp_replace(lower(trim(owner_request.spot_address)), '[^a-z0-9]+', '', 'g');

      if matching_spot_count = 0 then
        select count(*)::integer
        into matching_spot_count
        from public.spots
        where regexp_replace(lower(trim(name)), '[^a-z0-9]+', '', 'g') =
              regexp_replace(lower(trim(owner_request.spot_name)), '[^a-z0-9]+', '', 'g');

        if matching_spot_count = 0 then
          raise exception 'No CebSpot listing matches this spot. Create the listing before approving owner access.';
        elsif matching_spot_count > 1 then
          raise exception 'Multiple listings share this spot name. Correct the request address or resolve the duplicates before approval.';
        end if;

        select *
        into linked_spot
        from public.spots
        where regexp_replace(lower(trim(name)), '[^a-z0-9]+', '', 'g') =
              regexp_replace(lower(trim(owner_request.spot_name)), '[^a-z0-9]+', '', 'g')
        for update;
      elsif matching_spot_count > 1 then
        raise exception 'Multiple listings match this request. Resolve the duplicate spots before approval.';
      else
        select *
        into linked_spot
        from public.spots
        where regexp_replace(lower(trim(name)), '[^a-z0-9]+', '', 'g') =
              regexp_replace(lower(trim(owner_request.spot_name)), '[^a-z0-9]+', '', 'g')
          and regexp_replace(lower(trim(address)), '[^a-z0-9]+', '', 'g') =
              regexp_replace(lower(trim(owner_request.spot_address)), '[^a-z0-9]+', '', 'g')
        for update;
      end if;
    end if;

    if not found then
      raise exception 'The linked spot no longer exists.';
    end if;

    if linked_spot.owner_id is not null and linked_spot.owner_id <> owner_request.requester_id then
      raise exception 'This spot already belongs to another owner. Resolve the ownership conflict before approval.';
    end if;

    update public.profiles
    set
      role = case when role = 'admin' then role else 'owner' end,
      updated_at = now()
    where id = owner_request.requester_id;

    update public.spots
    set owner_id = owner_request.requester_id,
        updated_at = now()
    where id = linked_spot.id;

    insert into public.owner_spot_access (owner_id, spot_id, role)
    values (owner_request.requester_id, linked_spot.id, 'owner')
    on conflict (owner_id, spot_id) do update
    set role = excluded.role;

    update public.owner_access_requests
    set
      status = 'approved',
      spot_id = linked_spot.id,
      admin_notes = normalized_notes,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
    where id = owner_request.id;

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
    values (
      owner_request.requester_id,
      'CebSpot Admin',
      'approved your owner access request',
      owner_request.id::text,
      linked_spot.name,
      'owner_access_approved',
      'Your owner access for ' || linked_spot.name || ' is ready.',
      linked_spot.id,
      linked_spot.name
    );

    return jsonb_build_object(
      'ok', true,
      'requestId', owner_request.id::text,
      'status', 'approved',
      'spotId', linked_spot.id::text,
      'spotName', linked_spot.name,
      'alreadyReviewed', false
    );
  end if;

  update public.owner_access_requests
  set
    status = 'rejected',
    admin_notes = normalized_notes,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  where id = owner_request.id;

  insert into public.activities (
    user_id,
    user_name,
    action,
    target_id,
    target_name,
    type,
    content,
    spot_name
  )
  select
    owner_request.requester_id,
    'CebSpot Admin',
    'reviewed your owner access request',
    owner_request.id::text,
    owner_request.spot_name,
    'owner_access_rejected',
    'Your owner access request for ' || owner_request.spot_name || ' was not approved.',
    owner_request.spot_name
  where owner_request.requester_id is not null;

  return jsonb_build_object(
    'ok', true,
    'requestId', owner_request.id::text,
    'status', 'rejected',
    'spotId', null,
    'spotName', owner_request.spot_name,
    'alreadyReviewed', false
  );
end;
$$;

revoke all on function public.review_owner_access_request(uuid, text, text) from public;
grant execute on function public.review_owner_access_request(uuid, text, text) to authenticated;


-- Captured from supabase-remove-visit-checkins.sql
-- CebSpot visit check-in retirement
-- Run once in the Supabase SQL Editor to stop visit XP calls from every app build.
-- Historical visits and XP are intentionally retained for audit consistency.

begin;

drop function if exists public.record_spot_visit(
  uuid,
  double precision,
  double precision,
  double precision
);

drop function if exists public.distance_meters(
  double precision,
  double precision,
  double precision,
  double precision
);

update public.achievements
set
  enabled = false,
  xp_reward = 0
where code = 'ON_THE_GROUND'
   or requirement_type = 'verified_visits';

notify pgrst, 'reload schema';

commit;

-- Verification queries:
-- select to_regprocedure('public.record_spot_visit(uuid,double precision,double precision,double precision)') as visit_rpc;
-- select code, enabled, xp_reward from public.achievements where code = 'ON_THE_GROUND';
