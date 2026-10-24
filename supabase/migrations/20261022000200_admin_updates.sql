begin;

create table if not exists public.admin_updates (
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(trim(message)) between 1 and 1000),
  is_published boolean not null default false,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_updates_published_at_idx
  on public.admin_updates (published_at desc)
  where is_published = true;

alter table public.admin_updates enable row level security;

create or replace function public.sync_admin_update_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.message := trim(new.message);
  new.updated_at := now();

  if new.is_published then
    if tg_op = 'INSERT' then
      new.published_at := coalesce(new.published_at, now());
    elsif old.is_published = false or new.published_at is null then
      new.published_at := now();
    end if;
  elsif not new.is_published then
    new.published_at := null;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists admin_updates_sync_publication on public.admin_updates;
create trigger admin_updates_sync_publication
  before insert or update on public.admin_updates
  for each row execute function public.sync_admin_update_publication();

drop policy if exists admin_updates_published_read on public.admin_updates;
create policy admin_updates_published_read
  on public.admin_updates for select
  to anon, authenticated
  using (is_published = true and published_at is not null and published_at <= now());

drop policy if exists admin_updates_admin_read on public.admin_updates;
create policy admin_updates_admin_read
  on public.admin_updates for select
  to authenticated
  using (public.is_current_user_admin());

drop policy if exists admin_updates_admin_insert on public.admin_updates;
create policy admin_updates_admin_insert
  on public.admin_updates for insert
  to authenticated
  with check (public.is_current_user_admin() and created_by = auth.uid());

drop policy if exists admin_updates_admin_update on public.admin_updates;
create policy admin_updates_admin_update
  on public.admin_updates for update
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

drop policy if exists admin_updates_admin_delete on public.admin_updates;
create policy admin_updates_admin_delete
  on public.admin_updates for delete
  to authenticated
  using (public.is_current_user_admin());

revoke all on table public.admin_updates from public;
grant select on table public.admin_updates to anon;
grant select, insert, update, delete on table public.admin_updates to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.admin_updates;
exception
  when duplicate_object then null;
end;
$$;

notify pgrst, 'reload schema';

commit;
