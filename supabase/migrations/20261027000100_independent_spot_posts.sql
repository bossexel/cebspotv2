begin;

-- A submission is the durable source of one community post. Its optional
-- spot_id is a confirmed place, never another author's submission or review.
alter table public.spot_submissions
  add column spot_id uuid references public.spots(id) on delete set null,
  add column different_place boolean not null default false;
alter table public.local_updates add column spot_id uuid references public.spots(id) on delete set null;
create index spot_submissions_spot_idx on public.spot_submissions(spot_id);
create index local_updates_spot_idx on public.local_updates(spot_id, created_at desc);

create function public.spot_post_workflow_version() returns integer
language sql immutable as $$ select 1 $$;
revoke all on function public.spot_post_workflow_version() from public;
grant execute on function public.spot_post_workflow_version() to authenticated;

-- Retain evidence rather than guessing which historical votes/comments/media
-- belonged to a later author. This queue is admin-only; no interactions move.
create table public.spot_post_relationship_audit (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.spot_submissions(id) on delete cascade,
  local_update_id uuid references public.local_updates(id) on delete cascade,
  reason text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.spot_post_relationship_audit enable row level security;
create policy spot_post_audit_admin on public.spot_post_relationship_audit
  for select to authenticated using (public.is_current_user_admin());
revoke all on public.spot_post_relationship_audit from anon, authenticated;
grant select on public.spot_post_relationship_audit to authenticated;

insert into public.spot_post_relationship_audit(submission_id, local_update_id, reason, snapshot)
select s.id, u.id,
  case when u.id is null then 'missing_independent_post'
    when u.user_id is distinct from s.submitter_id then 'historical_author_mismatch'
    else 'historical_grouped_media' end,
  jsonb_build_object('submission', to_jsonb(s), 'post', to_jsonb(u))
from public.spot_submissions s
left join public.local_updates u on u.source_id = s.id::text and u.source_type in ('spot_submission','community')
where u.id is null or u.user_id is distinct from s.submitter_id
  or exists (select 1 from unnest(coalesce(u.media_urls,'{}')) m where not (m = any(coalesce(s.images,'{}'))));
insert into public.spot_post_relationship_audit(submission_id, reason, snapshot)
select id, 'approved_listing_link_unconfirmed', to_jsonb(s)
from public.spot_submissions s where status = 'approved';

-- Restore only missing posts from their own immutable source fields. Existing
-- post IDs, captions, media, votes, comments and timestamps remain untouched.
insert into public.local_updates(user_id,user_name,user_photo_url,title,body,location_name,
  latitude,longitude,image_url,media_urls,source_type,source_id,spot_count,created_at)
select s.submitter_id, coalesce(nullif(p.display_name,''),'Explorer'), p.photo_url,
  s.name,s.description,s.address,s.latitude,s.longitude,s.images[1],s.images,
  'spot_submission',s.id::text,
  (select coalesce(sum(case v.vote_type when 'up' then 1 else -1 end),0)::integer
    from public.spot_submission_votes v where v.submission_id=s.id),s.created_at
from public.spot_submissions s join public.profiles p on p.id=s.submitter_id
where not exists (select 1 from public.local_updates u
  where u.source_id=s.id::text and u.source_type in ('spot_submission','community'));

create or replace function public.find_matching_spots(spot_name text, spot_latitude double precision, spot_longitude double precision)
returns table(id uuid,name text,address text,latitude double precision,longitude double precision,distance_m double precision)
language sql stable security invoker set search_path = '' as $$
  select s.id,s.name::text,s.address::text,s.latitude::double precision,s.longitude::double precision,
    public.distance_km(s.latitude,s.longitude,spot_latitude,spot_longitude)*1000
  from public.spots s
  where s.is_public and length(trim(spot_name)) >= 2
    and spot_latitude between -90 and 90 and spot_longitude between -180 and 180
    and public.distance_km(s.latitude,s.longitude,spot_latitude,spot_longitude) <= 2
    and (lower(s.name) like '%' || lower(trim(spot_name)) || '%'
      or lower(trim(spot_name)) like '%' || lower(s.name) || '%'
      or public.distance_km(s.latitude,s.longitude,spot_latitude,spot_longitude) <= 0.15)
  order by (lower(trim(s.name))=lower(trim(spot_name))) desc,
    public.distance_km(s.latitude,s.longitude,spot_latitude,spot_longitude),s.id limit 8;
$$;
revoke all on function public.find_matching_spots(text,double precision,double precision) from public;
grant execute on function public.find_matching_spots(text,double precision,double precision) to authenticated;

create or replace function public.validate_submission_place()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.spot_id is not null and not exists(select 1 from public.spots where id=new.spot_id and is_public) then
    raise exception 'Choose an existing public spot.';
  end if;
  if new.spot_id is not null and new.different_place then
    raise exception 'A different place cannot be linked to an existing spot.';
  end if;
  return new;
end;
$$;
create trigger submission_validate_place before insert or update of spot_id,different_place on public.spot_submissions
  for each row execute function public.validate_submission_place();

-- Called by a trigger so saving the submission and its independent post is
-- atomic, including old clients. Map approval never governs future posts.
create or replace function public.create_submission_post()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.local_updates(user_id,user_name,user_photo_url,title,body,location_name,
    latitude,longitude,image_url,media_urls,source_type,source_id,spot_id,created_at)
  select new.submitter_id,coalesce(nullif(p.display_name,''),'Explorer'),p.photo_url,
    new.name,new.description,new.address,new.latitude,new.longitude,new.images[1],new.images,
    'spot_submission',new.id::text,new.spot_id,new.created_at
  from public.profiles p where p.id=new.submitter_id;
  return new;
end;
$$;
create trigger submission_create_independent_post after insert on public.spot_submissions
  for each row execute function public.create_submission_post();

-- Compatibility for installed clients: never find a canonical neighbour,
-- mutate an existing post, or cast a vote on behalf of the submitter.
create or replace function public.publish_spot_submission_local_update(target_submission_id uuid)
returns table(local_update_id uuid, canonical_submission_id uuid, similar_submission_count integer, vote_count integer, grouped boolean)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_active_account();
  if not exists(select 1 from public.spot_submissions where id=target_submission_id and submitter_id=auth.uid()) then
    raise exception 'Spot submission not found.';
  end if;
  return query select u.id,target_submission_id,0,u.spot_count,false
    from public.local_updates u where u.source_id=target_submission_id::text
      and u.source_type in ('spot_submission','community') order by u.created_at limit 1;
end;
$$;
-- Compatibility name; only that submission's media is returned. Invoker RLS
-- applies, unlike the old security-definer neighbour aggregation.
create or replace function public.get_spot_submission_group_media(target_submission_id uuid)
returns table(media_url text) language sql stable security invoker set search_path = '' as $$
  select m from public.local_updates u cross join lateral unnest(u.media_urls) m
    where u.source_id=target_submission_id::text and u.source_type in ('spot_submission','community');
$$;

-- Prevent a direct client insert from bypassing the atomic post publisher.
create or replace function public.guard_submission_post_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon','authenticated') and
    (new.spot_id is not null or new.source_type='spot_submission' or exists(
      select 1 from public.spot_submissions s where s.id::text=new.source_id)) then
    raise exception 'Publish spot posts through a spot submission.' using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger local_updates_guard_submission before insert on public.local_updates
  for each row execute function public.guard_submission_post_insert();

create or replace function public.link_spot_submission(target_submission_id uuid, target_spot_id uuid)
returns public.spots language plpgsql security definer set search_path = '' as $$
declare s public.spot_submissions%rowtype; place public.spots%rowtype;
begin
  perform public.require_active_account();
  if not public.is_current_user_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
  select * into s from public.spot_submissions where id=target_submission_id for update;
  if not found then raise exception 'Spot submission not found.'; end if;
  if s.status='rejected' then raise exception 'Rejected posts cannot be linked.'; end if;
  select * into place from public.spots where id=target_spot_id and is_public for share;
  if not found then raise exception 'Public spot not found.'; end if;
  update public.spot_submissions set spot_id=place.id,different_place=false,updated_at=now() where id=s.id;
  update public.local_updates set spot_id=place.id where source_id=s.id::text and source_type in ('spot_submission','community');
  -- Linking is place identification only. It does not approve the post.
  return place;
end;
$$;
revoke all on function public.link_spot_submission(uuid,uuid) from public,anon;
grant execute on function public.link_spot_submission(uuid,uuid) to authenticated;

create or replace function public.approve_spot_submission(target_submission_id uuid)
returns public.spots language plpgsql security definer set search_path = '' as $$
declare s public.spot_submissions%rowtype; place public.spots%rowtype;
begin
  perform public.require_active_account();
  if not public.is_current_user_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
  -- Serialize approvals to make duplicate detection reliable across admins.
  perform pg_advisory_xact_lock(270001);
  select * into s from public.spot_submissions where id=target_submission_id for update;
  if not found then raise exception 'Spot submission not found.'; end if;
  if s.spot_id is not null then
    select * into place from public.spots where id=s.spot_id and is_public;
    if not found then raise exception 'Linked listing is unavailable. Review its visibility or link to another confirmed place.'; end if;
  end if;
  if s.status='approved' then
    if place.id is not null then return place; end if;
    raise exception 'Historical listing relationship needs review. Link to existing spot first.';
  end if;
  if s.status <> 'pending' then raise exception 'Only pending spot submissions can be approved.'; end if;
  if place.id is null then
    -- Suggestions require an explicit admin decision, including same-name
    -- branches. Never silently merge a post or create a second confirmed pin.
    if not s.different_place and exists(select 1 from public.find_matching_spots(s.name,s.latitude,s.longitude)) then
      raise exception 'Possible existing spot. Link to existing spot or confirm this is a different place.';
    end if;
    insert into public.spots(name,description,category,categories,address,latitude,longitude,images,
      reservation_type,reservation_fee,payment_required,is_public,is_reservable,owner_id)
    values(s.name,s.description,s.category,s.categories,s.address,s.latitude,s.longitude,s.images,
      'free',0,false,true,false,null) returning * into place;
  end if;
  update public.spot_submissions set status='approved',spot_id=place.id,different_place=false,updated_at=now() where id=s.id;
  update public.local_updates set spot_id=place.id where source_id=s.id::text and source_type in ('spot_submission','community');
  insert into public.activities(user_id,user_name,action,target_id,target_name,type,content,spot_id,spot_name)
  values(s.submitter_id,'CebSpot','approved your spot submission',place.id::text,place.name,
    'submission_approved','Your post is approved and linked to ' || place.name || '.',place.id,place.name);
  return place;
end;
$$;

create or replace function public.confirm_distinct_spot_submission(target_submission_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_active_account();
  if not public.is_current_user_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
  update public.spot_submissions set different_place=true where id=target_submission_id and status='pending' and spot_id is null;
  if not found then raise exception 'Only unlinked pending submissions can be confirmed as distinct.'; end if;
end;
$$;
revoke all on function public.confirm_distinct_spot_submission(uuid) from public,anon;
grant execute on function public.confirm_distinct_spot_submission(uuid) to authenticated;

-- Automated popularity promotion must use the same place checks. A linked
-- future post still needs its own admin decision and cannot be auto-approved.
create or replace function public.promote_popular_spot_submissions(minimum_score integer default 5, maximum_rows integer default 10)
returns table(submission_id uuid,spot_id uuid,popularity_score integer)
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'Use individual admin approval with place matching.' using errcode='55000';
end;
$$;

-- Keep existing public/pending community visibility and reporting policies.
-- Only rejected submissions are additionally excluded; a spot link never
-- grants post moderation status or resurrects a rejected post.
create function public.is_visible_submission_post(post_source_type text,post_source_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists(select 1 from public.spot_submissions s where s.id::text=post_source_id
    and post_source_type in ('spot_submission','community') and s.status='rejected');
$$;
revoke all on function public.is_visible_submission_post(text,text) from public;
grant execute on function public.is_visible_submission_post(text,text) to anon,authenticated;
create policy local_updates_submission_moderation on public.local_updates as restrictive for select to anon,authenticated
using (public.is_visible_submission_post(source_type,source_id));

notify pgrst, 'reload schema';
commit;
