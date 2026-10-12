begin;

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
      and lower(trim(profile.email)) = 'testadmin6000@gmail.com'
  );
$$;

revoke all on function public.is_current_user_admin() from public;
grant execute on function public.is_current_user_admin() to authenticated, service_role;

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (id = auth.uid() and role = 'user');

drop policy if exists "profiles_select_owned_reservation_guests" on public.profiles;

drop policy if exists "spots_owner_insert" on public.spots;
create policy "spots_owner_insert"
  on public.spots for insert
  with check (
    (
      owner_id = auth.uid()
      and is_public = false
      and exists (
        select 1
        from public.profiles profile
        where profile.id = auth.uid()
          and profile.role = 'owner'
      )
    )
    or public.is_current_user_admin()
  );

drop policy if exists "reservations_update_owner" on public.reservations;

create or replace function public.enforce_reservation_insert_boundary()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  authoritative_spot public.spots%rowtype;
  authoritative_fee numeric(10, 2);
  requires_payment boolean;
  slot_tables jsonb;
begin
  select *
  into authoritative_spot
  from public.spots
  where id = new.spot_id
    and is_public
    and is_reservable
  for key share;

  if not found then
    raise exception 'This venue is not available for reservations.';
  end if;

  if new.reservation_date < current_date then
    raise exception 'Reservation date must be today or later.';
  end if;

  if coalesce(new.slot_id, '') not in ('sunset', 'prime', 'late') then
    raise exception 'Select a valid reservation time slot.';
  end if;

  if nullif(trim(coalesce(new.table_id, '')), '') is null then
    raise exception 'A valid table must be selected.';
  end if;

  slot_tables := authoritative_spot.table_inventory -> new.slot_id;
  if jsonb_typeof(slot_tables) is distinct from 'array' then
    raise exception 'No reservation tables are configured for this time slot.';
  end if;
  if jsonb_array_length(slot_tables) = 0 then
    raise exception 'No reservation tables are configured for this time slot.';
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(slot_tables) table_entry
    where coalesce(table_entry ->> 'tableId', table_entry ->> 'table_id') = new.table_id
      and coalesce(table_entry ->> 'capacity', '0') ~ '^[0-9]+$'
      and (table_entry ->> 'capacity')::integer >= greatest(new.guest_count, new.guests, 1)
  ) then
    raise exception 'The selected table is not valid for this venue or group size.';
  end if;

  authoritative_fee := greatest(
    coalesce(nullif(authoritative_spot.gcash_amount, 0), authoritative_spot.reservation_fee, 0),
    0
  );
  requires_payment := authoritative_spot.payment_required
    or authoritative_spot.reservation_type = 'paid'
    or authoritative_fee > 0;

  new.spot_name := authoritative_spot.name;
  new.fee := case when requires_payment then authoritative_fee else 0 end;
  new.reservation_fee := case when requires_payment then authoritative_fee else 0 end;
  new.reservation_type := case when requires_payment then 'paid' else 'free' end;
  new.payment_required := requires_payment;
  new.payment_status := case when requires_payment then 'pending' else 'not_required' end;
  new.status := case when requires_payment then 'pending_payment' else 'pending' end;
  new.payment_method := null;
  new.payment_reference := null;
  new.payment_proof_url := null;
  new.payer_gcash_number := null;

  if requires_payment and not coalesce(new.payment_terms_accepted, false) then
    raise exception 'Deposit terms must be accepted before creating a paid reservation.';
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_enforce_booking_insert on public.reservations;
create trigger reservations_enforce_booking_insert
  before insert on public.reservations
  for each row execute function public.enforce_reservation_insert_boundary();

drop policy if exists "activities_read" on public.activities;
create policy "activities_read"
  on public.activities for select
  using (
    user_id = auth.uid()
    or type not in (
      'reservation_approved',
      'reservation_checked_in',
      'reservation_no_show',
      'reservation_reminder',
      'reservation_cancelled',
      'reservation_rescheduled',
      'payment_received',
      'payment_failed'
    )
  );

drop policy if exists "activities_private_visibility_guard" on public.activities;
create policy "activities_private_visibility_guard"
  on public.activities as restrictive for select
  using (
    user_id = auth.uid()
    or type not in (
      'reservation_approved',
      'reservation_checked_in',
      'reservation_no_show',
      'reservation_reminder',
      'reservation_cancelled',
      'reservation_rescheduled',
      'payment_received',
      'payment_failed'
    )
  );

drop policy if exists "circles_insert_own" on public.circles;
create policy "circles_insert_own"
  on public.circles for insert
  with check (
    auth.uid() is not null
    and owner_id = auth.uid()
    and members = array[auth.uid()]
  );

alter table public.review_reports
  add column if not exists status text not null default 'pending';
alter table public.review_reports drop constraint if exists review_reports_status_check;
alter table public.review_reports
  add constraint review_reports_status_check check (status in ('pending', 'dismissed', 'handled'));

create or replace function public.normalize_moderation_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.status := 'pending';
  if tg_table_name = 'spot_submissions' then
    new.rejection_reason := null;
  elsif tg_table_name = 'owner_access_requests' then
    new.admin_notes := null;
    if auth.uid() is not null and new.requester_id is distinct from auth.uid() then
      raise exception 'A request must belong to the authenticated caller.' using errcode = '42501';
    end if;
    if auth.uid() is null then
      new.requester_id := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists spot_submissions_normalize_initial_review on public.spot_submissions;
create trigger spot_submissions_normalize_initial_review
  before insert on public.spot_submissions
  for each row execute function public.normalize_moderation_insert();

drop trigger if exists owner_access_requests_normalize_initial_review on public.owner_access_requests;
create trigger owner_access_requests_normalize_initial_review
  before insert on public.owner_access_requests
  for each row execute function public.normalize_moderation_insert();

drop trigger if exists review_reports_normalize_initial_review on public.review_reports;
create trigger review_reports_normalize_initial_review
  before insert on public.review_reports
  for each row execute function public.normalize_moderation_insert();

drop policy if exists "spot_images_delete_own" on storage.objects;
create policy "spot_images_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'spot-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create or replace function public.owner_business_email_status_internal(candidate_email text)
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  normalized_email text := lower(trim(coalesce(candidate_email, '')));
begin
  if normalized_email = '' or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return 'invalid';
  end if;
  if exists (select 1 from auth.users where lower(trim(email)) = normalized_email)
    or exists (select 1 from public.profiles where lower(trim(email)) = normalized_email) then
    return 'registered';
  end if;
  if exists (
    select 1 from public.owner_access_requests
    where lower(trim(contact_email)) = normalized_email and status = 'pending'
  ) then
    return 'pending';
  end if;
  return 'available';
end;
$$;

revoke all on function public.owner_business_email_status_internal(text) from public, anon, authenticated;

create or replace function public.get_owner_business_email_status(candidate_email text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  email_status text;
begin
  email_status := public.owner_business_email_status_internal(candidate_email);
  if email_status = 'invalid' then return 'invalid'; end if;
  return 'unknown';
end;
$$;

revoke all on function public.get_owner_business_email_status(text) from public;
grant execute on function public.get_owner_business_email_status(text) to anon, authenticated;

create or replace function public.reject_unavailable_owner_business_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  email_status text;
begin
  email_status := public.owner_business_email_status_internal(new.contact_email);
  if email_status <> 'available' then
    raise exception 'This business email cannot be used for an owner request.';
  end if;
  return new;
end;
$$;

drop trigger if exists owner_requests_reject_unavailable_email on public.owner_access_requests;
create trigger owner_requests_reject_unavailable_email
  before insert on public.owner_access_requests
  for each row execute function public.reject_unavailable_owner_business_email();

create or replace function public.approve_paid_reservation(reservation_id uuid)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  approved_reservation public.reservations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required to approve a reservation.' using errcode = '42501';
  end if;

  select * into approved_reservation
  from public.reservations
  where id = reservation_id
  for update;
  if not found then raise exception 'Reservation not found.' using errcode = 'P0002'; end if;

  if not exists (
    select 1 from public.spots
    left join public.owner_spot_access access on access.spot_id = spots.id
    where spots.id = approved_reservation.spot_id
      and (spots.owner_id = auth.uid() or access.owner_id = auth.uid())
  ) then
    raise exception 'Only the spot owner can approve this reservation.' using errcode = '42501';
  end if;

  if approved_reservation.status not in ('pending', 'pending_payment', 'rescheduled')
    or not approved_reservation.payment_required
    or approved_reservation.payment_status not in ('pending', 'failed')
    or approved_reservation.payment_method is distinct from 'gcash'
    or (nullif(trim(coalesce(approved_reservation.payment_proof_url, '')), '') is null
      and nullif(trim(coalesce(approved_reservation.payment_reference, '')), '') is null) then
    raise exception 'Only eligible manual GCash payments with submitted proof can be approved.';
  end if;

  update public.reservations
  set status = 'confirmed', payment_status = 'paid', updated_at = now()
  where id = reservation_id
  returning * into approved_reservation;

  insert into public.activities (
    user_id, user_name, action, target_id, target_name, type, content, spot_id, spot_name
  )
  values (
    approved_reservation.user_id,
    coalesce(
      (select nullif(trim(display_name), '') from public.profiles where id = approved_reservation.user_id),
      (select email from public.profiles where id = approved_reservation.user_id),
      'Guest'
    ),
    'approved your reservation',
    approved_reservation.id::text,
    approved_reservation.spot_name,
    'reservation_approved',
    'Your reservation at ' || approved_reservation.spot_name || ' is now approved.',
    approved_reservation.spot_id,
    approved_reservation.spot_name
  );
  return approved_reservation;
end;
$$;

revoke all on function public.approve_paid_reservation(uuid) from public;
grant execute on function public.approve_paid_reservation(uuid) to authenticated;

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
  if auth.role() <> 'service_role' and not public.is_current_user_admin() then
    raise exception 'Administrative authorization is required.' using errcode = '42501';
  end if;
  if minimum_score < 0 or maximum_rows < 1 or maximum_rows > 100 then
    raise exception 'Promotion limits are outside the permitted range.' using errcode = '22023';
  end if;

  for candidate in
    select popularity.*
    from public.pending_spot_submission_popularity popularity
    join public.spot_submissions submission on submission.id = popularity.id
    where submission.status = 'pending'
      and popularity.popularity_score >= minimum_score
    order by popularity.popularity_score desc, popularity.created_at asc
    limit maximum_rows
    for update of submission skip locked
  loop
    insert into public.spots (
      name, description, category, categories, address, latitude, longitude, images,
      reservation_type, reservation_fee, payment_required, is_public, is_reservable, owner_id
    )
    values (
      candidate.name, candidate.description, candidate.category, candidate.categories,
      candidate.address, candidate.latitude, candidate.longitude, candidate.images,
      candidate.reservation_type, candidate.reservation_fee, candidate.payment_required,
      true, candidate.is_reservable, null
    )
    returning id into created_spot_id;

    update public.spot_submissions
    set status = 'approved', updated_at = now()
    where id = candidate.id and status = 'pending';

    update public.local_updates
    set spot_count = candidate.vote_count, updated_at = now()
    where source_type = 'spot_submission' and source_id = candidate.id::text;

    submission_id := candidate.id;
    spot_id := created_spot_id;
    popularity_score := candidate.popularity_score;
    return next;
  end loop;
end;
$$;

revoke all on function public.promote_popular_spot_submissions(integer, integer) from public, anon;
grant execute on function public.promote_popular_spot_submissions(integer, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
