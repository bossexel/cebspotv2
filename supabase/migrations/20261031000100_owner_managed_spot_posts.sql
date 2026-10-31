begin;

-- Store the submitter-selected category on the Activity row so the feed can
-- show it without exposing another user's private submission record.
alter table public.local_updates
  add column if not exists category text,
  add column if not exists categories text[];

update public.local_updates u
set category = s.category
from public.spot_submissions s
where u.category is null
  and u.source_id = s.id::text
  and u.source_type in ('spot_submission', 'community');

update public.local_updates u
set categories = coalesce(s.categories,array[s.category])
from public.spot_submissions s
where u.categories is null
  and u.source_id = s.id::text
  and u.source_type in ('spot_submission', 'community');

create or replace function public.create_submission_post()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.local_updates(user_id,user_name,user_photo_url,title,body,location_name,
    latitude,longitude,image_url,media_urls,source_type,source_id,spot_id,category,categories,created_at)
  select new.submitter_id,coalesce(nullif(p.display_name,''),'Explorer'),p.photo_url,
    new.name,new.description,new.address,new.latitude,new.longitude,new.images[1],new.images,
    'spot_submission',new.id::text,new.spot_id,new.category,new.categories,new.created_at
  from public.profiles p where p.id=new.submitter_id;
  return new;
end;
$$;

-- Keep the installed feed RPC contract intact and expose the additional field
-- through a new additive wrapper for updated clients.
create or replace function public.get_local_updates_page_with_category(
  page_size integer default 12,
  sort_mode text default 'newest',
  cursor_created_at timestamptz default null,
  cursor_id uuid default null,
  cursor_rank double precision default null,
  user_latitude double precision default null,
  user_longitude double precision default null,
  snapshot_at timestamptz default now()
)
returns table (
  id uuid, user_id uuid, user_name text, user_photo_url text,
  title text, body text, location_name text, latitude double precision, longitude double precision,
  image_url text, category text, categories text[], source_type text, source_id text, spot_count integer, comments_count integer,
  created_at timestamptz, feed_rank double precision, feed_snapshot_at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  select p.id,p.user_id,p.user_name,p.user_photo_url,
    p.title,p.body,p.location_name,p.latitude,p.longitude,p.image_url,u.category,u.categories,
    p.source_type,p.source_id,p.spot_count,p.comments_count,p.created_at,p.feed_rank,p.feed_snapshot_at
  from public.get_local_updates_page(page_size,sort_mode,cursor_created_at,cursor_id,
    cursor_rank,user_latitude,user_longitude,snapshot_at) p
  join public.local_updates u on u.id=p.id;
$$;
revoke all on function public.get_local_updates_page_with_category(integer,text,timestamptz,uuid,double precision,double precision,double precision,timestamptz) from public;
grant execute on function public.get_local_updates_page_with_category(integer,text,timestamptz,uuid,double precision,double precision,double precision,timestamptz) to anon, authenticated;

-- Authors can edit their submission. Every edit returns it to moderation; the
-- linked public map listing is deliberately not changed by this client action.
create or replace function public.update_own_spot_submission(
  target_submission_id uuid,
  new_name text,
  new_description text,
  new_category text,
  new_categories text[],
  new_address text,
  new_latitude double precision,
  new_longitude double precision,
  new_is_reservable boolean
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  submission public.spot_submissions%rowtype;
  cleaned_categories text[];
begin
  perform public.require_active_account();
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode='42501'; end if;
  if nullif(trim(new_name),'') is null or char_length(trim(new_name)) > 100 then
    raise exception 'Spot name must be between 1 and 100 characters.' using errcode='22023';
  end if;
  if nullif(trim(new_category),'') is null or char_length(trim(new_category)) > 50 then
    raise exception 'Choose a valid category.' using errcode='22023';
  end if;
  if nullif(trim(new_address),'') is null or char_length(trim(new_address)) > 300 then
    raise exception 'Address must be between 1 and 300 characters.' using errcode='22023';
  end if;
  if new_latitude is null or new_latitude not between -90 and 90
    or new_longitude is null or new_longitude not between -180 and 180 then
    raise exception 'Enter valid coordinates.' using errcode='22023';
  end if;
  select array_agg(distinct trim(value) order by trim(value)) into cleaned_categories
  from unnest(coalesce(new_categories, array[]::text[])) value
  where nullif(trim(value),'') is not null and char_length(trim(value)) <= 50;
  if coalesce(cardinality(cleaned_categories),0) > 8
    or char_length(trim(new_category)) > 50
    or not (trim(new_category) = any(coalesce(cleaned_categories,array[]::text[]))) then
    raise exception 'Choose up to eight valid categories, including the primary category.' using errcode='22023';
  end if;

  select * into submission from public.spot_submissions
    where id=target_submission_id and submitter_id=auth.uid() for update;
  if not found then raise exception 'Your spot submission was not found.' using errcode='P0002'; end if;
  update public.spot_submissions set
    name=trim(new_name), description=nullif(trim(coalesce(new_description,'')),''),
    category=trim(new_category), categories=coalesce(cleaned_categories,array[trim(new_category)]),
    address=trim(new_address), latitude=new_latitude, longitude=new_longitude,
    is_reservable=coalesce(new_is_reservable,false),
    status='pending', rejection_reason=null, updated_at=now()
  where id=target_submission_id;

  update public.local_updates set
    title=trim(new_name), body=nullif(trim(coalesce(new_description,'')),''),
    location_name=trim(new_address), latitude=new_latitude, longitude=new_longitude,
    category=trim(new_category), categories=coalesce(cleaned_categories,array[trim(new_category)]), updated_at=now()
  where source_id=target_submission_id::text
    and source_type in ('spot_submission','community')
    and user_id=auth.uid();

  return jsonb_build_object('id',target_submission_id,'status','pending');
end;
$$;
revoke all on function public.update_own_spot_submission(uuid,text,text,text,text[],text,double precision,double precision,boolean) from public, anon;
grant execute on function public.update_own_spot_submission(uuid,text,text,text,text[],text,double precision,double precision,boolean) to authenticated;

create or replace function public.delete_own_spot_submission(target_submission_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare submission public.spot_submissions%rowtype;
begin
  perform public.require_active_account();
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode='42501'; end if;
  select * into submission from public.spot_submissions
    where id=target_submission_id and submitter_id=auth.uid() for update;
  if not found then raise exception 'Your spot submission was not found.' using errcode='P0002'; end if;
  if submission.status not in ('pending','rejected') then
    raise exception 'Approved spots cannot be deleted here because they may be live listings. Contact an admin.' using errcode='55000';
  end if;

  delete from public.activities
    where target_id=target_submission_id::text
      and type in ('spot_liked','spot_comment','submission');
  delete from public.local_updates
    where source_id=target_submission_id::text
      and source_type in ('spot_submission','community')
      and user_id=auth.uid();
  delete from public.spot_submissions where id=target_submission_id and submitter_id=auth.uid();
  return jsonb_build_object('id',target_submission_id,'deleted',true);
end;
$$;
revoke all on function public.delete_own_spot_submission(uuid) from public, anon;
grant execute on function public.delete_own_spot_submission(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
