-- CebSpot spot edit suggestions
-- Run this in the Supabase SQL Editor after the base schema.

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

drop policy if exists "spot_edit_suggestions_insert_own" on public.spot_edit_suggestions;
drop policy if exists "spot_edit_suggestions_select_own" on public.spot_edit_suggestions;
drop policy if exists "spot_edit_suggestions_admin_select" on public.spot_edit_suggestions;
drop policy if exists "spot_edit_suggestions_admin_update" on public.spot_edit_suggestions;

create policy "spot_edit_suggestions_insert_own"
  on public.spot_edit_suggestions for insert
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

create policy "spot_edit_suggestions_select_own"
  on public.spot_edit_suggestions for select
  using (user_id = auth.uid());

create policy "spot_edit_suggestions_admin_select"
  on public.spot_edit_suggestions for select
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
        and lower(profile.email) = 'testadmin@cebspot.com'
    )
  );

create policy "spot_edit_suggestions_admin_update"
  on public.spot_edit_suggestions for update
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
        and lower(profile.email) = 'testadmin@cebspot.com'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
        and lower(profile.email) = 'testadmin@cebspot.com'
    )
  );

grant insert, select, update on table public.spot_edit_suggestions to authenticated;

notify pgrst, 'reload schema';
