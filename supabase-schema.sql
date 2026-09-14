-- CebSpot Supabase schema
-- Run this in the Supabase SQL editor for a student prototype.

create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  display_name text,
  email text unique not null,
  role text not null default 'user' check (role in ('admin', 'owner', 'user')),
  photo_url text,
  location jsonb,
  last_location_update timestamptz,
  level integer not null default 1,
  points integer not null default 0,
  friends uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists spots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null,
  categories text[] default '{}',
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  images text[] default '{}',
  rating numeric(3, 1) default 0,
  review_count integer not null default 0,
  reservation_type text not null default 'free' check (reservation_type in ('free', 'paid')),
  reservation_fee numeric(10, 2) not null default 0,
  payment_required boolean not null default false,
  gcash_wallet_number text,
  gcash_wallet_name text,
  gcash_qr_url text,
  gcash_amount numeric(10, 2),
  table_inventory jsonb default '{}'::jsonb,
  opening_hours text,
  website_url text,
  contact_number text,
  is_public boolean not null default false,
  is_reservable boolean not null default false,
  owner_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  guest_name text,
  guest_email text,
  guest_phone text,
  spot_id uuid not null references spots(id) on delete cascade,
  spot_name text not null,
  reservation_date date not null,
  reservation_time time not null,
  guest_count integer not null default 1 check (guest_count > 0),
  guests integer not null default 1 check (guests > 0),
  note text,
  fee numeric(10, 2) not null default 0,
  reservation_type text not null default 'free' check (reservation_type in ('free', 'paid')),
  reservation_fee numeric(10, 2) not null default 0,
  payment_required boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'pending_payment', 'confirmed', 'cancelled', 'rescheduled', 'checked_in', 'completed', 'no_show')),
  payment_status text not null default 'not_required' check (payment_status in ('not_required', 'pending', 'paid', 'failed', 'refunded')),
  payment_method text,
  payment_reference text,
  payment_proof_url text,
  payer_gcash_number text,
  payment_terms_accepted boolean not null default false,
  payment_terms_accepted_at timestamptz,
  qr_code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reservation_payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  spot_id uuid references spots(id) on delete set null,
  provider text not null default 'paymongo' check (provider in ('paymongo', 'manual')),
  payment_method text not null default 'qrph',
  provider_checkout_session_id text unique,
  provider_payment_intent_id text unique,
  provider_payment_method_id text,
  provider_payment_id text,
  amount numeric(10, 2) not null,
  currency text not null default 'PHP',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'expired', 'refunded')),
  qr_image_url text,
  checkout_url text,
  expires_at timestamptz,
  paid_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists role text not null default 'user';

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles
  add constraint profiles_role_check check (role in ('admin', 'owner', 'user'));

update profiles
set role = case
  when lower(email) = 'testadmin@cebspot.com' then 'admin'
  when lower(email) = 'testowner@cebspot.com' then 'owner'
  else role
end;

create or replace function public.assign_profile_role_from_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.email, '')) = 'testadmin@cebspot.com' then
    new.role := 'admin';
  elsif tg_op = 'INSERT' and lower(coalesce(new.email, '')) = 'testowner@cebspot.com' then
    new.role := 'owner';
  elsif tg_op = 'INSERT' then
    new.role := coalesce(new.role, 'user');
  elsif new.email is distinct from old.email and lower(coalesce(new.email, '')) = 'testowner@cebspot.com' then
    new.role := 'owner';
  elsif new.email is distinct from old.email and lower(coalesce(old.email, '')) = 'testowner@cebspot.com' then
    new.role := 'user';
  elsif new.role is null then
    new.role := old.role;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_assign_role_from_email on public.profiles;

create trigger profiles_assign_role_from_email
  before insert or update of email, role on public.profiles
  for each row execute function public.assign_profile_role_from_email();

drop trigger if exists spots_enforce_test_cebspot_owner on public.spots;
drop function if exists public.enforce_test_cebspot_spot_owner();

alter table spots
  add column if not exists reservation_type text not null default 'free',
  add column if not exists payment_required boolean not null default false,
  add column if not exists gcash_wallet_number text,
  add column if not exists gcash_wallet_name text,
  add column if not exists gcash_qr_url text,
  add column if not exists gcash_amount numeric(10, 2),
  add column if not exists table_inventory jsonb default '{}'::jsonb,
  add column if not exists website_url text,
  add column if not exists contact_number text;

alter table reservations
  add column if not exists guest_count integer not null default 1,
  add column if not exists guest_name text,
  add column if not exists guest_email text,
  add column if not exists guest_phone text,
  add column if not exists note text,
  add column if not exists reservation_time_start time,
  add column if not exists reservation_time_end time,
  add column if not exists table_id text,
  add column if not exists slot_id text,
  add column if not exists group_size_type text,
  add column if not exists reservation_type text not null default 'free',
  add column if not exists reservation_fee numeric(10, 2) not null default 0,
  add column if not exists payment_required boolean not null default false,
  add column if not exists payment_method text,
  add column if not exists payment_reference text,
  add column if not exists payment_proof_url text,
  add column if not exists payer_gcash_number text,
  add column if not exists refund_status text not null default 'not_applicable',
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists adjustment_acknowledged boolean not null default false,
  add column if not exists adjustment_acknowledged_at timestamptz,
  add column if not exists payment_terms_accepted boolean not null default false,
  add column if not exists payment_terms_accepted_at timestamptz;

create or replace function public.enforce_paid_reservation_checkout_details()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.payment_required then
    if not coalesce(new.payment_terms_accepted, false) then
      raise exception 'Deposit terms must be accepted before creating a paid reservation.';
    end if;
    if nullif(trim(coalesce(new.guest_name, '')), '') is null
      or nullif(trim(coalesce(new.guest_email, '')), '') is null
      or nullif(trim(coalesce(new.guest_phone, '')), '') is null then
      raise exception 'Guest name, email, and phone are required for paid reservations.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_require_checkout_details on public.reservations;
create trigger reservations_require_checkout_details
  before insert or update of payment_required, payment_terms_accepted on public.reservations
  for each row execute function public.enforce_paid_reservation_checkout_details();

alter table reservation_payments
  add column if not exists user_id uuid references profiles(id) on delete set null,
  add column if not exists spot_id uuid references spots(id) on delete set null,
  add column if not exists provider text not null default 'paymongo',
  add column if not exists payment_method text not null default 'qrph',
  add column if not exists provider_checkout_session_id text,
  add column if not exists provider_payment_intent_id text unique,
  add column if not exists provider_payment_method_id text,
  add column if not exists provider_payment_id text,
  add column if not exists amount numeric(10, 2) not null default 0,
  add column if not exists currency text not null default 'PHP',
  add column if not exists status text not null default 'pending',
  add column if not exists qr_image_url text,
  add column if not exists checkout_url text,
  add column if not exists expires_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists raw_payload jsonb not null default '{}'::jsonb;

alter table reservation_payments drop constraint if exists reservation_payments_provider_check;
alter table reservation_payments drop constraint if exists reservation_payments_status_check;
alter table reservation_payments
  add constraint reservation_payments_provider_check check (provider in ('paymongo', 'manual')),
  add constraint reservation_payments_status_check check (status in ('pending', 'paid', 'failed', 'expired', 'refunded'));

alter table spots drop constraint if exists spots_reservation_type_check;
alter table spots
  add constraint spots_reservation_type_check check (reservation_type in ('free', 'paid'));

alter table reservations drop constraint if exists reservations_status_check;
alter table reservations drop constraint if exists reservations_payment_status_check;
alter table reservations drop constraint if exists reservations_reservation_type_check;
alter table reservations
  add constraint reservations_status_check check (status in ('pending', 'pending_payment', 'confirmed', 'cancelled', 'rescheduled', 'checked_in', 'completed', 'no_show')),
  add constraint reservations_payment_status_check check (payment_status in ('not_required', 'pending', 'paid', 'failed', 'refund_pending', 'refunded', 'non_refundable', 'unpaid', 'on-site')),
  add constraint reservations_reservation_type_check check (reservation_type in ('free', 'paid'));

alter table reservations drop constraint if exists reservations_refund_status_check;
alter table reservations
  add constraint reservations_refund_status_check check (refund_status in ('not_applicable', 'pending_review', 'approved', 'rejected', 'completed'));

update spots
set reservation_type = case when reservation_fee > 0 then 'paid' else 'free' end,
    payment_required = reservation_fee > 0
where reservation_type is null or reservation_type = 'free';

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  user_name text not null,
  user_photo_url text,
  user_avatar text,
  action text,
  target_id text,
  target_name text,
  type text not null,
  content text,
  spot_id uuid references spots(id) on delete set null,
  spot_name text,
  created_at timestamptz not null default now()
);

create table if not exists local_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  user_name text not null,
  user_photo_url text,
  title text not null,
  body text,
  location_name text not null,
  latitude double precision,
  longitude double precision,
  image_url text,
  media_urls text[] default '{}',
  spot_count integer not null default 0,
  comments_count integer not null default 0,
  source_type text not null default 'community' check (source_type in ('recommendation', 'spot_submission', 'community')),
  source_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table local_updates
  add column if not exists media_urls text[] default '{}';

create table if not exists local_update_comments (
  id uuid primary key default gen_random_uuid(),
  local_update_id uuid not null references local_updates(id) on delete cascade,
  parent_comment_id uuid references local_update_comments(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  user_name text not null,
  user_photo_url text,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table local_update_comments
  add column if not exists parent_comment_id uuid references local_update_comments(id) on delete cascade;

create table if not exists circles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references profiles(id) on delete cascade,
  members uuid[] not null default '{}',
  invite_code text,
  invite_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table circles
  add column if not exists invite_code text,
  add column if not exists invite_expires_at timestamptz;

update circles
set members = array_append(members, owner_id)
where not (owner_id = any(members));

create table if not exists spot_submissions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null,
  categories text[] default '{}',
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  images text[] default '{}',
  reservation_type text not null default 'free' check (reservation_type in ('free', 'paid')),
  reservation_fee numeric(10, 2) not null default 0,
  payment_required boolean not null default false,
  is_reservable boolean not null default false,
  submitter_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table spot_submissions
  add column if not exists categories text[] default '{}',
  add column if not exists reservation_type text not null default 'free',
  add column if not exists payment_required boolean not null default false,
  add column if not exists is_reservable boolean not null default false;

alter table spot_submissions drop constraint if exists spot_submissions_reservation_type_check;
alter table spot_submissions
  add constraint spot_submissions_reservation_type_check check (reservation_type in ('free', 'paid'));

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

create table if not exists owner_access_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references profiles(id) on delete set null,
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  spot_name text not null,
  spot_address text not null,
  category text not null,
  access_needs text[] not null default '{}',
  verification_documents text[] not null default '{}',
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table owner_access_requests
  alter column requester_id drop not null,
  add column if not exists verification_documents text[] not null default '{}';

create table if not exists owner_spot_access (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  spot_id uuid not null references spots(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'manager')),
  created_at timestamptz not null default now(),
  unique(owner_id, spot_id)
);

create or replace function public.get_spot_claim_status(target_spot_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  target_spot public.spots%rowtype;
  primary_owner_id uuid;
  primary_owner_email text;
  local_part text;
  domain_part text;
  masked_owner_email text;
  current_user_has_access boolean := false;
begin
  select *
  into target_spot
  from public.spots
  where id = target_spot_id;

  if not found then
    raise exception 'Spot not found.';
  end if;

  primary_owner_id := target_spot.owner_id;

  if primary_owner_id is null then
    select access.owner_id
    into primary_owner_id
    from public.owner_spot_access access
    where access.spot_id = target_spot.id
    order by case when access.role = 'owner' then 0 else 1 end, access.created_at asc
    limit 1;
  end if;

  if primary_owner_id is not null then
    select lower(trim(profile.email))
    into primary_owner_email
    from public.profiles profile
    where profile.id = primary_owner_id;

    if primary_owner_email is not null and position('@' in primary_owner_email) > 1 then
      local_part := split_part(primary_owner_email, '@', 1);
      domain_part := split_part(primary_owner_email, '@', 2);
      masked_owner_email :=
        left(local_part, least(2, length(local_part))) || '•••@' || domain_part;
    else
      masked_owner_email := 'a verified account';
    end if;
  end if;

  if auth.uid() is not null then
    current_user_has_access :=
      primary_owner_id = auth.uid()
      or exists (
        select 1
        from public.owner_spot_access access
        where access.spot_id = target_spot.id
          and access.owner_id = auth.uid()
      );
  end if;

  return jsonb_build_object(
    'spotId', target_spot.id::text,
    'spotName', target_spot.name,
    'managed', primary_owner_id is not null,
    'ownerHint', masked_owner_email,
    'hasAccess', current_user_has_access
  );
end;
$function$;

revoke all on function public.get_spot_claim_status(uuid) from public;
grant execute on function public.get_spot_claim_status(uuid) to anon, authenticated;

drop trigger if exists owner_spot_access_enforce_test_cebspot_owner on public.owner_spot_access;
drop function if exists public.enforce_test_cebspot_owner_access();

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references spots(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  user_name text,
  user_photo_url text,
  rating numeric(2, 1) not null default 0 check (rating >= 0 and rating <= 5),
  comment text,
  media_urls text[] default '{}',
  media_types text[] default '{}',
  likes_count integer not null default 0,
  reports_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table reviews drop constraint if exists reviews_rating_check;
alter table reviews add constraint reviews_rating_check check (rating >= 0 and rating <= 5);

create table if not exists review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references reviews(id) on delete cascade,
  reporter_id uuid not null references profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique(review_id, reporter_id)
);

create table if not exists review_replies (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references spots(id) on delete cascade,
  review_id uuid not null references reviews(id) on delete cascade,
  parent_reply_id uuid references review_replies(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  user_name text not null,
  user_photo_url text,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table review_replies
  add column if not exists parent_reply_id uuid references review_replies(id) on delete cascade;

create index if not exists spots_public_idx on spots(is_public);
create index if not exists spots_category_idx on spots(category);
create index if not exists reservations_user_idx on reservations(user_id);
create index if not exists reservations_spot_idx on reservations(spot_id);
create unique index if not exists reservations_active_table_slot_unique_idx
  on reservations(spot_id, reservation_date, slot_id, table_id)
  where slot_id is not null
    and table_id is not null
    and status not in ('cancelled', 'completed', 'no_show');
create index if not exists reservation_payments_reservation_idx on reservation_payments(reservation_id);
create index if not exists reservation_payments_user_idx on reservation_payments(user_id, created_at desc);
create index if not exists reservation_payments_spot_idx on reservation_payments(spot_id, created_at desc);
create unique index if not exists reservation_payments_checkout_session_idx on reservation_payments(provider_checkout_session_id);
create index if not exists reservation_payments_provider_intent_idx on reservation_payments(provider_payment_intent_id);
with ranked_pending_payments as (
  select
    id,
    row_number() over (partition by reservation_id order by created_at desc, id desc) as duplicate_rank
  from reservation_payments
  where provider = 'paymongo'
    and payment_method = 'gcash'
    and status = 'pending'
)
update reservation_payments
set status = 'expired',
    updated_at = now()
where id in (
  select id
  from ranked_pending_payments
  where duplicate_rank > 1
);
create unique index if not exists reservation_payments_one_pending_paymongo_gcash_idx
  on reservation_payments(reservation_id)
  where provider = 'paymongo'
    and payment_method = 'gcash'
    and status = 'pending';
create unique index if not exists reservation_payments_one_pending_paymongo_qrph_idx
  on reservation_payments(reservation_id)
  where provider = 'paymongo'
    and payment_method = 'qrph'
    and status = 'pending';
create index if not exists activities_created_idx on activities(created_at desc);
create unique index if not exists activities_reservation_reminder_unique_idx
  on activities(user_id, target_id, type)
  where type = 'reservation_reminder' and target_id is not null;
create index if not exists local_updates_created_idx on local_updates(created_at desc);
create index if not exists local_updates_source_idx on local_updates(source_type, source_id);
create index if not exists local_update_comments_update_created_idx
  on local_update_comments(local_update_id, created_at);
create index if not exists local_update_comments_parent_idx
  on local_update_comments(parent_comment_id, created_at);
create index if not exists circles_owner_idx on circles(owner_id);
create unique index if not exists circles_invite_code_unique_idx
  on circles(invite_code)
  where invite_code is not null;
create index if not exists spot_submissions_submitter_idx on spot_submissions(submitter_id);
create index if not exists spot_submission_votes_submission_idx on spot_submission_votes(submission_id);
create index if not exists spot_search_events_submission_idx on spot_search_events(matched_submission_id, created_at desc);
create index if not exists spot_submissions_status_created_idx on spot_submissions(status, created_at desc);
create index if not exists owner_access_requests_requester_idx on owner_access_requests(requester_id);
create index if not exists owner_access_requests_status_idx on owner_access_requests(status);
create index if not exists owner_spot_access_owner_idx on owner_spot_access(owner_id);
create index if not exists owner_spot_access_spot_idx on owner_spot_access(spot_id);
create index if not exists reviews_spot_idx on reviews(spot_id, created_at desc);
create index if not exists review_reports_review_idx on review_reports(review_id);
create index if not exists review_replies_spot_idx on review_replies(spot_id, created_at);
create index if not exists review_replies_review_idx on review_replies(review_id, created_at);
create index if not exists review_replies_parent_idx on review_replies(parent_reply_id, created_at);

insert into storage.buckets (id, name, public)
values ('spot-images', 'spot-images', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public)
values ('owner-verification-documents', 'owner-verification-documents', false)
on conflict (id) do update set public = false;

alter table profiles enable row level security;
alter table spots enable row level security;
alter table reservations enable row level security;
alter table reservation_payments enable row level security;
alter table activities enable row level security;
alter table local_updates enable row level security;
alter table local_update_comments enable row level security;
alter table circles enable row level security;
alter table spot_submissions enable row level security;
alter table spot_submission_votes enable row level security;
alter table spot_search_events enable row level security;
alter table owner_access_requests enable row level security;
alter table owner_spot_access enable row level security;
alter table reviews enable row level security;
alter table review_reports enable row level security;
alter table review_replies enable row level security;

drop policy if exists "profiles_select_own" on profiles;
drop policy if exists "profiles_insert_own" on profiles;
drop policy if exists "profiles_update_own" on profiles;
drop policy if exists "spots_public_read" on spots;
drop policy if exists "spots_owner_insert" on spots;
drop policy if exists "spots_owner_update" on spots;
drop policy if exists "profiles_select_owned_reservation_guests" on profiles;
drop policy if exists "reservations_insert_own" on reservations;
drop policy if exists "reservations_select_own" on reservations;
drop policy if exists "reservations_select_owner" on reservations;
drop policy if exists "reservations_update_owner" on reservations;
drop policy if exists "reservation_payments_select_own" on reservation_payments;
drop policy if exists "reservation_payments_select_owner" on reservation_payments;
drop policy if exists "activities_read" on activities;
drop policy if exists "activities_insert_own" on activities;
drop policy if exists "local_updates_read" on local_updates;
drop policy if exists "local_updates_insert_own" on local_updates;
drop policy if exists "local_update_comments_read" on local_update_comments;
drop policy if exists "local_update_comments_delete_own" on local_update_comments;
drop policy if exists "spot_images_read" on storage.objects;
drop policy if exists "spot_images_insert_own" on storage.objects;
drop policy if exists "profile_photos_read" on storage.objects;
drop policy if exists "profile_photos_insert_own" on storage.objects;
drop policy if exists "profile_photos_update_own" on storage.objects;
drop policy if exists "profile_photos_delete_own" on storage.objects;
drop policy if exists "payment_proofs_read_related" on storage.objects;
drop policy if exists "payment_proofs_insert_own" on storage.objects;
drop policy if exists "owner_verification_documents_insert" on storage.objects;
drop policy if exists "owner_verification_documents_read_admin" on storage.objects;
drop policy if exists "circles_member_read" on circles;
drop policy if exists "circles_insert_own" on circles;
drop policy if exists "spot_submissions_insert_own" on spot_submissions;
drop policy if exists "spot_submissions_select_own" on spot_submissions;
drop policy if exists "spot_submission_votes_read" on spot_submission_votes;
drop policy if exists "spot_submission_votes_upsert_own" on spot_submission_votes;
drop policy if exists "spot_search_events_insert_any_auth" on spot_search_events;
drop policy if exists "spot_search_events_read_own" on spot_search_events;
drop policy if exists "owner_access_requests_insert_own" on owner_access_requests;
drop policy if exists "owner_access_requests_public_insert" on owner_access_requests;
drop policy if exists "owner_access_requests_select_own" on owner_access_requests;
drop policy if exists "owner_spot_access_select_own" on owner_spot_access;
drop policy if exists "reviews_read" on reviews;
drop policy if exists "reviews_insert_own" on reviews;
drop policy if exists "reviews_update_own" on reviews;
drop policy if exists "review_reports_insert_own" on review_reports;
drop policy if exists "review_replies_read" on review_replies;
drop policy if exists "review_replies_insert_own" on review_replies;
drop policy if exists "review_replies_delete_own" on review_replies;

create policy "profiles_select_own"
  on profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on profiles for insert
  with check (auth.uid() = id);

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

revoke all on function public.current_profile_role() from public;
grant execute on function public.current_profile_role() to authenticated;

create policy "profiles_update_own"
  on profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = public.current_profile_role()
  );

create policy "profiles_select_owned_reservation_guests"
  on profiles for select
  using (
    exists (
      select 1
      from reservations
      join spots on spots.id = reservations.spot_id
      left join owner_spot_access access on access.spot_id = reservations.spot_id
      where reservations.user_id = profiles.id
        and (spots.owner_id = auth.uid() or access.owner_id = auth.uid())
    )
  );

create policy "spots_public_read"
  on spots for select
  using (is_public = true);

create policy "spots_owner_insert"
  on spots for insert
  with check (auth.role() = 'authenticated' and owner_id = auth.uid());

create policy "spots_owner_update"
  on spots for update
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from owner_spot_access access
      where access.spot_id = spots.id
        and access.owner_id = auth.uid()
    )
  )
  with check (
    owner_id = auth.uid()
    or exists (
      select 1 from owner_spot_access access
      where access.spot_id = spots.id
        and access.owner_id = auth.uid()
    )
  );

create policy "reservations_insert_own"
  on reservations for insert
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

create policy "reservations_select_own"
  on reservations for select
  using (user_id = auth.uid());

create policy "reservations_select_owner"
  on reservations for select
  using (
    exists (
      select 1
      from spots
      left join owner_spot_access access on access.spot_id = spots.id
      where spots.id = reservations.spot_id
        and (spots.owner_id = auth.uid() or access.owner_id = auth.uid())
    )
  );

create policy "reservations_update_owner"
  on reservations for update
  using (
    exists (
      select 1
      from spots
      left join owner_spot_access access on access.spot_id = spots.id
      where spots.id = reservations.spot_id
        and (spots.owner_id = auth.uid() or access.owner_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from spots
      left join owner_spot_access access on access.spot_id = spots.id
      where spots.id = reservations.spot_id
        and (spots.owner_id = auth.uid() or access.owner_id = auth.uid())
    )
  );

create policy "reservation_payments_select_own"
  on reservation_payments for select
  using (user_id = auth.uid());

create policy "reservation_payments_select_owner"
  on reservation_payments for select
  using (
    exists (
      select 1
      from spots
      left join owner_spot_access access on access.spot_id = spots.id
      where spots.id = reservation_payments.spot_id
        and (spots.owner_id = auth.uid() or access.owner_id = auth.uid())
    )
  );

create policy "activities_read"
  on activities for select
  using (true);

create policy "activities_insert_own"
  on activities for insert
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

create policy "local_updates_read"
  on local_updates for select
  using (true);

create policy "local_updates_insert_own"
  on local_updates for insert
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

create policy "local_update_comments_read"
  on local_update_comments for select
  using (true);

create policy "local_update_comments_delete_own"
  on local_update_comments for delete
  using (user_id = auth.uid());

grant select on table public.local_update_comments to anon, authenticated;
grant delete on table public.local_update_comments to authenticated;

create policy "spot_images_read"
  on storage.objects for select
  using (bucket_id = 'spot-images');

create policy "spot_images_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'spot-images' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "profile_photos_read"
  on storage.objects for select
  using (bucket_id = 'profile-photos');

create policy "profile_photos_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'profile-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "profile_photos_update_own"
  on storage.objects for update
  using (bucket_id = 'profile-photos' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'profile-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "profile_photos_delete_own"
  on storage.objects for delete
  using (bucket_id = 'profile-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "payment_proofs_read_related"
  on storage.objects for select
  using (
    bucket_id = 'payment-proofs'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or exists (
        select 1
        from reservations
        join spots on spots.id = reservations.spot_id
        left join owner_spot_access access on access.spot_id = reservations.spot_id
        where reservations.payment_proof_url = storage.objects.name
          and (spots.owner_id = auth.uid() or access.owner_id = auth.uid())
      )
    )
  );

create policy "payment_proofs_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'payment-proofs' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "owner_verification_documents_insert"
  on storage.objects for insert
  with check (bucket_id = 'owner-verification-documents' and auth.role() in ('anon', 'authenticated'));

create policy "owner_verification_documents_read_admin"
  on storage.objects for select
  using (
    bucket_id = 'owner-verification-documents'
    and exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
        and lower(profile.email) = 'testadmin@cebspot.com'
    )
  );

create policy "circles_member_read"
  on circles for select
  using (owner_id = auth.uid() or auth.uid() = any(members));

create policy "circles_insert_own"
  on circles for insert
  with check (
    auth.role() = 'authenticated'
    and owner_id = auth.uid()
    and auth.uid() = any(members)
  );

drop function if exists public.get_circle_members(uuid);

create function public.get_circle_members(target_circle_id uuid)
returns table (
  id uuid,
  display_name text,
  photo_url text,
  location jsonb,
  last_location_update timestamptz,
  is_owner boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    member_profile.id,
    member_profile.display_name,
    member_profile.photo_url,
    member_profile.location,
    member_profile.last_location_update,
    member_profile.id = circle_record.owner_id
  from public.circles circle_record
  join public.profiles member_profile
    on member_profile.id = any(circle_record.members)
  where circle_record.id = target_circle_id
    and (
      circle_record.owner_id = auth.uid()
      or auth.uid() = any(circle_record.members)
    )
  order by (member_profile.id = circle_record.owner_id) desc,
    member_profile.display_name asc nulls last;
$$;

create or replace function public.get_or_create_circle_invite_code(target_circle_id uuid)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_code text;
  current_expiry timestamptz;
  generated_code text;
  generated_expiry timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select circle_record.invite_code, circle_record.invite_expires_at
  into current_code, current_expiry
  from public.circles circle_record
  where circle_record.id = target_circle_id
    and (
      circle_record.owner_id = auth.uid()
      or auth.uid() = any(circle_record.members)
    )
  for update;

  if not found then
    raise exception 'Circle not found or access denied.';
  end if;

  if current_code is not null and current_expiry > now() then
    return query select current_code, current_expiry;
    return;
  end if;

  loop
    generated_code :=
      chr(65 + floor(random() * 26)::integer) ||
      chr(65 + floor(random() * 26)::integer) ||
      chr(65 + floor(random() * 26)::integer) || '-' ||
      lpad(floor(random() * 1000)::integer::text, 3, '0');
    exit when not exists (
      select 1 from public.circles where invite_code = generated_code
    );
  end loop;

  generated_expiry := now() + interval '1 day';

  update public.circles
  set invite_code = generated_code,
      invite_expires_at = generated_expiry,
      updated_at = now()
  where circles.id = target_circle_id;

  return query select generated_code, generated_expiry;
end;
$$;

create or replace function public.join_circle_by_code(submitted_code text)
returns public.circles
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_code text := upper(trim(submitted_code));
  joined_circle public.circles%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if normalized_code !~ '^[A-Z]{3}-[0-9]{3}$' then
    raise exception 'Enter a valid invitation code such as ABC-123.';
  end if;

  select *
  into joined_circle
  from public.circles
  where invite_code = normalized_code
    and invite_expires_at > now()
  for update;

  if not found then
    raise exception 'Invitation code is invalid or expired.';
  end if;

  update public.circles
  set members = case
        when current_user_id = any(members) then members
        else array_append(members, current_user_id)
      end,
      updated_at = now()
  where id = joined_circle.id
  returning * into joined_circle;

  return joined_circle;
end;
$$;

revoke all on function public.get_circle_members(uuid) from public;
revoke all on function public.get_or_create_circle_invite_code(uuid) from public;
revoke all on function public.join_circle_by_code(text) from public;

grant execute on function public.get_circle_members(uuid) to authenticated;
grant execute on function public.get_or_create_circle_invite_code(uuid) to authenticated;
grant execute on function public.join_circle_by_code(text) to authenticated;

create policy "spot_submissions_insert_own"
  on spot_submissions for insert
  with check (auth.role() = 'authenticated' and submitter_id = auth.uid());

create policy "spot_submissions_select_own"
  on spot_submissions for select
  using (submitter_id = auth.uid());

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

create policy "owner_access_requests_public_insert"
  on owner_access_requests for insert
  with check (requester_id is null or requester_id = auth.uid());

create policy "owner_access_requests_select_own"
  on owner_access_requests for select
  using (requester_id = auth.uid());

grant insert on table owner_access_requests to anon, authenticated;
grant select on table owner_access_requests to authenticated;

create policy "owner_spot_access_select_own"
  on owner_spot_access for select
  using (owner_id = auth.uid());

create policy "reviews_read"
  on reviews for select
  using (true);

create policy "reviews_insert_own"
  on reviews for insert
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

create policy "reviews_update_own"
  on reviews for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "review_reports_insert_own"
  on review_reports for insert
  with check (auth.role() = 'authenticated' and reporter_id = auth.uid());

create policy "review_replies_read"
  on review_replies for select
  using (true);

create policy "review_replies_insert_own"
  on review_replies for insert
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

create policy "review_replies_delete_own"
  on review_replies for delete
  using (user_id = auth.uid());

grant select on table public.review_replies to anon, authenticated;
grant insert, delete on table public.review_replies to authenticated;

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

revoke all on function public.add_local_update_comment(uuid, text, uuid) from public;
grant execute on function public.add_local_update_comment(uuid, text, uuid) to authenticated;

create or replace function public.check_reservation_slot_available(
  target_spot_id uuid,
  target_reservation_date date,
  target_slot_id text,
  target_table_id text,
  excluded_reservation_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reservations
  set
    status = 'cancelled',
    payment_status = 'failed',
    refund_status = 'not_applicable',
    cancellation_reason = 'PayMongo checkout expired without payment.',
    cancelled_at = now(),
    updated_at = now()
  where status = 'pending_payment'
    and payment_status in ('pending', 'unpaid')
    and payment_method in ('paymongo_gcash', 'paymongo_qrph')
      and created_at < now() - interval '5 minutes';

  update public.reservation_payments
  set
    status = 'expired',
    updated_at = now()
  where reservation_id in (
    select id
    from public.reservations
    where status = 'cancelled'
      and cancellation_reason = 'PayMongo checkout expired without payment.'
      and cancelled_at >= now() - interval '1 minute'
  )
    and status = 'pending';

  return not exists (
    select 1
    from public.reservations
    where spot_id = target_spot_id
      and reservation_date = target_reservation_date
      and slot_id = target_slot_id
      and table_id = target_table_id
      and status not in ('cancelled', 'completed', 'no_show')
      and (excluded_reservation_id is null or id <> excluded_reservation_id)
  );
end;
$$;

grant execute on function public.check_reservation_slot_available(uuid, date, text, text, uuid) to authenticated;

create or replace function public.get_reserved_table_ids(
  target_spot_id uuid,
  target_reservation_date date,
  target_slot_id text
)
returns text[]
language sql
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct table_id order by table_id), '{}'::text[])
  from public.reservations
  where spot_id = target_spot_id
    and reservation_date = target_reservation_date
    and slot_id = target_slot_id
    and table_id is not null
    and status not in ('cancelled', 'completed', 'no_show')
    and not (
      status = 'pending_payment'
      and payment_status in ('pending', 'unpaid')
      and payment_method in ('paymongo_gcash', 'paymongo_qrph')
        and created_at < now() - interval '5 minutes'
    );
$$;

revoke all on function public.get_reserved_table_ids(uuid, date, text) from public;
grant execute on function public.get_reserved_table_ids(uuid, date, text) to anon, authenticated;

create or replace function public.void_unpaid_reservation(
  target_reservation_id uuid,
  cancellation_reason text default 'Payment was not completed.'
)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  current_reservation public.reservations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required to void a reservation.';
  end if;

  select *
  into current_reservation
  from public.reservations
  where id = target_reservation_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Reservation not found.';
  end if;

  if current_reservation.payment_status = 'paid' then
    raise exception 'A paid reservation cannot be voided.';
  end if;

  if current_reservation.status in ('confirmed', 'completed', 'no_show') then
    raise exception 'This reservation can no longer be voided.';
  end if;

  if current_reservation.status <> 'cancelled' then
    update public.reservations
    set
      status = 'cancelled',
      payment_status = 'failed',
      refund_status = 'not_applicable',
      cancellation_reason = coalesce(nullif(trim(void_unpaid_reservation.cancellation_reason), ''), 'Payment was not completed.'),
      cancelled_at = now(),
      updated_at = now()
    where id = target_reservation_id;
  end if;

  update public.reservation_payments
  set
    status = 'expired',
    updated_at = now()
  where reservation_id = target_reservation_id
    and status = 'pending';

  select *
  into current_reservation
  from public.reservations
  where id = target_reservation_id;

  return current_reservation;
end;
$$;

grant execute on function public.void_unpaid_reservation(uuid, text) to authenticated;

create or replace function public.cancel_own_free_reservation(
  target_reservation_id uuid,
  cancellation_reason_input text default null
)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  current_reservation public.reservations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required to cancel a reservation.' using errcode = '42501';
  end if;

  select *
  into current_reservation
  from public.reservations
  where id = target_reservation_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Reservation not found.' using errcode = 'P0002';
  end if;

  if current_reservation.payment_required or current_reservation.reservation_type = 'paid' then
    raise exception 'This spot does not allow self-service cancellation for this reservation.' using errcode = '42501';
  end if;

  if current_reservation.status in ('cancelled', 'completed', 'no_show') then
    raise exception 'This reservation can no longer be cancelled.';
  end if;

  update public.reservations
  set
    status = 'cancelled',
    payment_status = 'not_required',
    refund_status = 'not_applicable',
    cancellation_reason = nullif(trim(cancellation_reason_input), ''),
    cancelled_at = now(),
    updated_at = now()
  where id = target_reservation_id
  returning * into current_reservation;

  return current_reservation;
end;
$$;

revoke all on function public.cancel_own_free_reservation(uuid, text) from public;
grant execute on function public.cancel_own_free_reservation(uuid, text) to authenticated;

create or replace function public.reschedule_own_free_reservation(
  target_reservation_id uuid,
  reservation_date_input date
)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  current_reservation public.reservations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required to adjust a reservation.' using errcode = '42501';
  end if;

  select *
  into current_reservation
  from public.reservations
  where id = target_reservation_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Reservation not found.' using errcode = 'P0002';
  end if;

  if current_reservation.payment_required or current_reservation.reservation_type = 'paid' then
    raise exception 'This spot does not allow self-service adjustments for this reservation.' using errcode = '42501';
  end if;

  if current_reservation.status in ('cancelled', 'completed', 'no_show') then
    raise exception 'This reservation can no longer be adjusted.';
  end if;

  if reservation_date_input < current_date then
    raise exception 'Reservation date cannot be in the past.';
  end if;

  update public.reservations
  set
    reservation_date = reservation_date_input,
    status = 'rescheduled',
    updated_at = now()
  where id = target_reservation_id
  returning * into current_reservation;

  return current_reservation;
end;
$$;

revoke all on function public.reschedule_own_free_reservation(uuid, date) from public;
grant execute on function public.reschedule_own_free_reservation(uuid, date) to authenticated;

create or replace function public.owner_record_reservation_attendance(
  reservation_id uuid,
  attendance_status text
)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  current_reservation public.reservations%rowtype;
  owner_label text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required to update attendance.' using errcode = '42501';
  end if;

  if attendance_status not in ('checked_in', 'no_show') then
    raise exception 'Attendance status must be checked_in or no_show.';
  end if;

  select *
  into current_reservation
  from public.reservations
  where id = reservation_id
  for update;

  if not found then
    raise exception 'Reservation not found.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.spots
    left join public.owner_spot_access access on access.spot_id = spots.id
    where spots.id = current_reservation.spot_id
      and (spots.owner_id = auth.uid() or access.owner_id = auth.uid())
  ) then
    raise exception 'Only the spot owner can update reservation attendance.' using errcode = '42501';
  end if;

  if current_reservation.status in ('cancelled', 'checked_in', 'completed', 'no_show') then
    raise exception 'Attendance was already resolved for this reservation.';
  end if;

  if current_reservation.payment_required and current_reservation.payment_status <> 'paid' then
    raise exception 'Attendance cannot be recorded before the required payment is confirmed.';
  end if;

  if current_reservation.status not in ('pending', 'confirmed', 'rescheduled') then
    raise exception 'This reservation is not ready for an attendance decision.';
  end if;

  update public.reservations
  set status = attendance_status,
      updated_at = now()
  where id = reservation_id
  returning * into current_reservation;

  select coalesce(nullif(trim(spots.name), ''), 'CebSpot venue')
  into owner_label
  from public.spots
  where spots.id = current_reservation.spot_id;

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
    current_reservation.user_id,
    owner_label,
    case when attendance_status = 'checked_in' then 'confirmed your arrival' else 'marked your reservation as no show' end,
    current_reservation.id::text,
    current_reservation.spot_name,
    case when attendance_status = 'checked_in' then 'reservation_checked_in' else 'reservation_no_show' end,
    case
      when attendance_status = 'checked_in'
        then current_reservation.spot_name || ' confirmed that you arrived. Your table remains assigned to your reservation.'
      else current_reservation.spot_name || ' marked your reservation as a no-show. The table has been released under the reservation policy.'
    end,
    current_reservation.spot_id,
    current_reservation.spot_name
  );

  return current_reservation;
end;
$$;

revoke all on function public.owner_record_reservation_attendance(uuid, text) from public;
grant execute on function public.owner_record_reservation_attendance(uuid, text) to authenticated;

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
    raise exception 'Authentication required to approve a reservation.';
  end if;

  select *
  into approved_reservation
  from public.reservations
  where id = reservation_id
  for update;

  if not found then
    raise exception 'Reservation not found.';
  end if;

  if not exists (
    select 1
    from public.spots
    left join public.owner_spot_access access on access.spot_id = spots.id
    where spots.id = approved_reservation.spot_id
      and (spots.owner_id = auth.uid() or access.owner_id = auth.uid())
  ) then
    raise exception 'Only the spot owner can approve this reservation.';
  end if;

  update public.reservations
  set
    status = 'confirmed',
    payment_status = 'paid',
    updated_at = now()
  where id = reservation_id
  returning * into approved_reservation;

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

grant execute on function public.approve_paid_reservation(uuid) to authenticated;

drop function if exists public.claim_test_cebspot_owner_access();

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

revoke all on function public.vote_on_spot_submission(uuid, text) from public;
grant execute on function public.vote_on_spot_submission(uuid, text) to authenticated;

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

-- Create profile rows from Supabase Auth using a security definer trigger.
-- This avoids client-side RLS failures when email confirmation is enabled and
-- signUp returns a user before it returns an authenticated session.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if nullif(trim(coalesce(new.email, '')), '') is null then
    return new;
  end if;

  insert into public.profiles (id, email, role, first_name, last_name, display_name, photo_url)
  values (
    new.id,
    coalesce(new.email, ''),
    case
      when lower(coalesce(new.email, '')) = 'testadmin@cebspot.com' then 'admin'
      when lower(coalesce(new.email, '')) = 'testowner@cebspot.com' then 'owner'
      else 'user'
    end,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), ''),
    coalesce(
      nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''),
      nullif(trim(concat_ws(' ', new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data ->> 'last_name')), ''),
      nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
    ),
    coalesce(
      nullif(trim(coalesce(new.raw_user_meta_data ->> 'avatar_url', '')), ''),
      nullif(trim(coalesce(new.raw_user_meta_data ->> 'picture', '')), '')
    )
  )
  on conflict (id) do update set
    email = excluded.email,
      role = case
        when lower(excluded.email) = 'testadmin@cebspot.com' then 'admin'
        when lower(excluded.email) = 'testowner@cebspot.com' then 'owner'
        else public.profiles.role
      end,
    first_name = coalesce(excluded.first_name, public.profiles.first_name),
    last_name = coalesce(excluded.last_name, public.profiles.last_name),
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    photo_url = coalesce(public.profiles.photo_url, excluded.photo_url),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_updated on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger on_auth_user_updated
  after update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, email, role, first_name, last_name, display_name, photo_url)
select
  auth_user.id,
  trim(auth_user.email),
  case
    when lower(auth_user.email) = 'testadmin@cebspot.com' then 'admin'
    when lower(auth_user.email) = 'testowner@cebspot.com' then 'owner'
    else 'user'
  end,
  nullif(trim(coalesce(auth_user.raw_user_meta_data ->> 'first_name', '')), ''),
  nullif(trim(coalesce(auth_user.raw_user_meta_data ->> 'last_name', '')), ''),
  coalesce(
    nullif(trim(coalesce(auth_user.raw_user_meta_data ->> 'display_name', '')), ''),
    nullif(trim(concat_ws(' ', auth_user.raw_user_meta_data ->> 'first_name', auth_user.raw_user_meta_data ->> 'last_name')), ''),
    nullif(trim(coalesce(auth_user.raw_user_meta_data ->> 'full_name', '')), ''),
    split_part(auth_user.email, '@', 1)
  ),
  coalesce(
    nullif(trim(coalesce(auth_user.raw_user_meta_data ->> 'avatar_url', '')), ''),
    nullif(trim(coalesce(auth_user.raw_user_meta_data ->> 'picture', '')), '')
  )
from auth.users auth_user
where nullif(trim(coalesce(auth_user.email, '')), '') is not null
on conflict (id) do update set
  email = excluded.email,
    role = case
      when lower(excluded.email) = 'testadmin@cebspot.com' then 'admin'
      when lower(excluded.email) = 'testowner@cebspot.com' then 'owner'
      else public.profiles.role
    end,
  first_name = coalesce(excluded.first_name, public.profiles.first_name),
  last_name = coalesce(excluded.last_name, public.profiles.last_name),
  display_name = coalesce(excluded.display_name, public.profiles.display_name),
  photo_url = coalesce(public.profiles.photo_url, excluded.photo_url),
  updated_at = now();

grant select, insert, update on table public.profiles to authenticated;

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
alter table public.review_replies replica identity full;

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

do $$
begin
  alter publication supabase_realtime add table public.review_replies;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
