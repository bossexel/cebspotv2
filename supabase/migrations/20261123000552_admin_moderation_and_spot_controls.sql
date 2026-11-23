begin;

alter table public.profiles
  add column if not exists is_flagged boolean not null default false,
  add column if not exists flag_reason text,
  add column if not exists flagged_at timestamptz,
  add column if not exists flagged_by uuid references public.profiles(id) on delete set null;

create or replace function public.flag_reported_review_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reported_author uuid;
begin
  select reviews.user_id into reported_author
  from public.reviews
  where reviews.id = new.review_id;

  if reported_author is not null and reported_author is distinct from new.reporter_id then
    update public.profiles
    set is_flagged = true,
        flag_reason = coalesce(
          nullif(flag_reason, ''),
          'A published review or comment was reported and requires admin review.'
        ),
        flagged_at = coalesce(flagged_at, now()),
        flagged_by = null
    where id = reported_author
      and role <> 'admin';
  end if;
  return new;
end;
$$;

drop trigger if exists review_reports_flag_author on public.review_reports;
create trigger review_reports_flag_author
  after insert on public.review_reports
  for each row execute function public.flag_reported_review_author();

create or replace function public.set_admin_user_flag(
  target_user_id uuid,
  should_flag boolean,
  moderation_reason text default null
)
returns table(
  user_id uuid,
  is_flagged boolean,
  flag_reason text,
  flagged_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_role text;
  normalized_reason text := nullif(trim(coalesce(moderation_reason, '')), '');
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  select role into target_role from public.profiles where id = target_user_id for update;
  if not found then raise exception 'User not found.' using errcode = 'P0002'; end if;
  if target_role = 'admin' then raise exception 'Administrator accounts cannot be flagged here.' using errcode = '42501'; end if;
  if should_flag and normalized_reason is null then
    raise exception 'Add a moderation reason before flagging this user.' using errcode = '22023';
  end if;

  update public.profiles
  set is_flagged = should_flag,
      flag_reason = case when should_flag then normalized_reason else null end,
      flagged_at = case when should_flag then now() else null end,
      flagged_by = case when should_flag then auth.uid() else null end
  where id = target_user_id;

  return query
  select profiles.id, profiles.is_flagged, profiles.flag_reason, profiles.flagged_at
  from public.profiles
  where profiles.id = target_user_id;
end;
$$;

create or replace function public.get_admin_user_moderation()
returns table(
  user_id uuid,
  is_flagged boolean,
  flag_reason text,
  flagged_at timestamptz,
  reported_comment_count bigint,
  deletion_state text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  return query
  select
    profiles.id,
    profiles.is_flagged,
    profiles.flag_reason,
    profiles.flagged_at,
    count(distinct review_reports.id)::bigint,
    account_deletion_requests.state
  from public.profiles
  left join public.reviews on reviews.user_id = profiles.id
  left join public.review_reports on review_reports.review_id = reviews.id
  left join public.account_deletion_requests on account_deletion_requests.user_id = profiles.id
  group by profiles.id, profiles.is_flagged, profiles.flag_reason, profiles.flagged_at, account_deletion_requests.state
  order by profiles.created_at desc, profiles.id;
end;
$$;

create or replace function public.update_admin_spot(
  target_spot_id uuid,
  spot_name text,
  spot_description text,
  spot_category text,
  spot_address text,
  spot_latitude double precision,
  spot_longitude double precision,
  spot_is_public boolean,
  spot_is_reservable boolean
)
returns public.spots
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_spot public.spots%rowtype;
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if length(trim(coalesce(spot_name, ''))) < 2 then
    raise exception 'Spot name must contain at least 2 characters.' using errcode = '22023';
  end if;
  if length(trim(coalesce(spot_category, ''))) < 2 then
    raise exception 'Choose a valid spot category.' using errcode = '22023';
  end if;
  if length(trim(coalesce(spot_address, ''))) < 4 then
    raise exception 'Enter a complete spot address.' using errcode = '22023';
  end if;
  if spot_latitude not between -90 and 90 or spot_longitude not between -180 and 180 then
    raise exception 'Enter valid map coordinates.' using errcode = '22023';
  end if;

  update public.spots
  set name = trim(spot_name),
      description = nullif(trim(coalesce(spot_description, '')), ''),
      category = trim(spot_category),
      address = trim(spot_address),
      latitude = spot_latitude,
      longitude = spot_longitude,
      is_public = spot_is_public,
      is_reservable = spot_is_reservable
  where id = target_spot_id
  returning * into updated_spot;

  if not found then raise exception 'Spot not found.' using errcode = 'P0002'; end if;
  return updated_spot;
end;
$$;

revoke all on function public.flag_reported_review_author() from public, anon, authenticated;
revoke all on function public.set_admin_user_flag(uuid, boolean, text) from public, anon;
revoke all on function public.get_admin_user_moderation() from public, anon;
revoke all on function public.update_admin_spot(uuid, text, text, text, text, double precision, double precision, boolean, boolean) from public, anon;
grant execute on function public.set_admin_user_flag(uuid, boolean, text) to authenticated;
grant execute on function public.get_admin_user_moderation() to authenticated;
grant execute on function public.update_admin_spot(uuid, text, text, text, text, double precision, double precision, boolean, boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
