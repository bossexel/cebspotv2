-- CebSpot Supabase schema
-- Run this in the Supabase SQL editor for a student prototype.

create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text unique not null,
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
  status text not null default 'pending' check (status in ('pending', 'pending_payment', 'confirmed', 'cancelled', 'rescheduled', 'completed', 'no_show')),
  payment_status text not null default 'not_required' check (payment_status in ('not_required', 'pending', 'paid', 'failed', 'refunded')),
  payment_method text,
  payment_reference text,
  qr_code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table spots
  add column if not exists reservation_type text not null default 'free',
  add column if not exists payment_required boolean not null default false,
  add column if not exists website_url text,
  add column if not exists contact_number text;

alter table reservations
  add column if not exists guest_count integer not null default 1,
  add column if not exists note text,
  add column if not exists reservation_type text not null default 'free',
  add column if not exists reservation_fee numeric(10, 2) not null default 0,
  add column if not exists payment_required boolean not null default false,
  add column if not exists payment_method text,
  add column if not exists payment_reference text;

alter table spots drop constraint if exists spots_reservation_type_check;
alter table spots
  add constraint spots_reservation_type_check check (reservation_type in ('free', 'paid'));

alter table reservations drop constraint if exists reservations_status_check;
alter table reservations drop constraint if exists reservations_payment_status_check;
alter table reservations drop constraint if exists reservations_reservation_type_check;
alter table reservations
  add constraint reservations_status_check check (status in ('pending', 'pending_payment', 'confirmed', 'cancelled', 'rescheduled', 'completed', 'no_show')),
  add constraint reservations_payment_status_check check (payment_status in ('not_required', 'pending', 'paid', 'failed', 'refunded', 'unpaid', 'on-site')),
  add constraint reservations_reservation_type_check check (reservation_type in ('free', 'paid'));

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
  spot_count integer not null default 0,
  comments_count integer not null default 0,
  source_type text not null default 'community' check (source_type in ('recommendation', 'spot_submission', 'community')),
  source_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists circles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references profiles(id) on delete cascade,
  members uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists owner_access_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) on delete cascade,
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  spot_name text not null,
  spot_address text not null,
  category text not null,
  access_needs text[] not null default '{}',
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references spots(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  user_name text,
  user_photo_url text,
  rating numeric(2, 1) not null default 5 check (rating >= 1 and rating <= 5),
  comment text,
  media_urls text[] default '{}',
  media_types text[] default '{}',
  likes_count integer not null default 0,
  reports_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references reviews(id) on delete cascade,
  reporter_id uuid not null references profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique(review_id, reporter_id)
);

create index if not exists spots_public_idx on spots(is_public);
create index if not exists spots_category_idx on spots(category);
create index if not exists reservations_user_idx on reservations(user_id);
create index if not exists reservations_spot_idx on reservations(spot_id);
create index if not exists activities_created_idx on activities(created_at desc);
create index if not exists local_updates_created_idx on local_updates(created_at desc);
create index if not exists local_updates_source_idx on local_updates(source_type, source_id);
create index if not exists circles_owner_idx on circles(owner_id);
create index if not exists spot_submissions_submitter_idx on spot_submissions(submitter_id);
create index if not exists owner_access_requests_requester_idx on owner_access_requests(requester_id);
create index if not exists owner_access_requests_status_idx on owner_access_requests(status);
create index if not exists reviews_spot_idx on reviews(spot_id, created_at desc);
create index if not exists review_reports_review_idx on review_reports(review_id);

alter table profiles enable row level security;
alter table spots enable row level security;
alter table reservations enable row level security;
alter table activities enable row level security;
alter table local_updates enable row level security;
alter table circles enable row level security;
alter table spot_submissions enable row level security;
alter table owner_access_requests enable row level security;
alter table reviews enable row level security;
alter table review_reports enable row level security;

drop policy if exists "profiles_select_own" on profiles;
drop policy if exists "profiles_insert_own" on profiles;
drop policy if exists "profiles_update_own" on profiles;
drop policy if exists "spots_public_read" on spots;
drop policy if exists "spots_owner_insert" on spots;
drop policy if exists "reservations_insert_own" on reservations;
drop policy if exists "reservations_select_own" on reservations;
drop policy if exists "activities_read" on activities;
drop policy if exists "activities_insert_own" on activities;
drop policy if exists "local_updates_read" on local_updates;
drop policy if exists "local_updates_insert_own" on local_updates;
drop policy if exists "circles_member_read" on circles;
drop policy if exists "spot_submissions_insert_own" on spot_submissions;
drop policy if exists "spot_submissions_select_own" on spot_submissions;
drop policy if exists "owner_access_requests_insert_own" on owner_access_requests;
drop policy if exists "owner_access_requests_select_own" on owner_access_requests;
drop policy if exists "reviews_read" on reviews;
drop policy if exists "reviews_insert_own" on reviews;
drop policy if exists "reviews_update_own" on reviews;
drop policy if exists "review_reports_insert_own" on review_reports;

create policy "profiles_select_own"
  on profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "spots_public_read"
  on spots for select
  using (is_public = true);

create policy "spots_owner_insert"
  on spots for insert
  with check (auth.role() = 'authenticated' and owner_id = auth.uid());

create policy "reservations_insert_own"
  on reservations for insert
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

create policy "reservations_select_own"
  on reservations for select
  using (user_id = auth.uid());

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

create policy "circles_member_read"
  on circles for select
  using (owner_id = auth.uid() or auth.uid() = any(members));

create policy "spot_submissions_insert_own"
  on spot_submissions for insert
  with check (auth.role() = 'authenticated' and submitter_id = auth.uid());

create policy "spot_submissions_select_own"
  on spot_submissions for select
  using (submitter_id = auth.uid());

create policy "owner_access_requests_insert_own"
  on owner_access_requests for insert
  with check (auth.role() = 'authenticated' and requester_id = auth.uid());

create policy "owner_access_requests_select_own"
  on owner_access_requests for select
  using (requester_id = auth.uid());

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

-- Create profile rows from Supabase Auth using a security definer trigger.
-- This avoids client-side RLS failures when email confirmation is enabled and
-- signUp returns a user before it returns an authenticated session.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, photo_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    photo_url = coalesce(public.profiles.photo_url, excluded.photo_url),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
