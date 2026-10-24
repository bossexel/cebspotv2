-- Small keyset pages; caller RLS remains in force. No offsets or full media arrays.
create index if not exists local_updates_feed_newest_idx
  on public.local_updates (created_at desc, id desc);
create index if not exists local_updates_feed_popular_idx
  on public.local_updates ((coalesce(spot_count, 0)::double precision + coalesce(comments_count, 0)::double precision) desc, created_at desc, id desc);

create or replace function public.get_local_updates_page(
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
  image_url text, source_type text, source_id text, spot_count integer, comments_count integer,
  created_at timestamptz, feed_rank double precision, feed_snapshot_at timestamptz
)
language sql stable security invoker set search_path = public, pg_temp
as $$
  with ranked as (
    select u.*,
      case
        when sort_mode = 'popular' then coalesce(u.spot_count, 0)::double precision + coalesce(u.comments_count, 0)::double precision
        when sort_mode = 'nearest' then
          case when u.latitude between -90 and 90 and u.longitude between -180 and 180
            and user_latitude between -90 and 90 and user_longitude between -180 and 180 then
            -- Negative great-circle distance: larger rank means nearer.
            -12742.0 * asin(sqrt(least(1.0, greatest(0.0,
              power(sin(radians(u.latitude::double precision - user_latitude) / 2), 2)
              + cos(radians(user_latitude)) * cos(radians(u.latitude::double precision))
              * power(sin(radians(u.longitude::double precision - user_longitude) / 2), 2)))))
          else -30000::double precision end
        else 0::double precision
      end as rank
    from public.local_updates u
    where u.created_at <= coalesce(snapshot_at, now())
  )
  select r.id, r.user_id, r.user_name::text, r.user_photo_url::text,
    r.title::text, r.body::text, r.location_name::text, r.latitude::double precision, r.longitude::double precision,
    r.image_url::text, r.source_type::text, r.source_id, r.spot_count::integer, r.comments_count::integer,
    r.created_at, r.rank, coalesce(snapshot_at, now())
  from ranked r
  where cursor_id is null or (r.rank, r.created_at, r.id) < (cursor_rank, cursor_created_at, cursor_id)
  order by r.rank desc, r.created_at desc, r.id desc
  limit least(25, greatest(1, coalesce(page_size, 12))) + 1;
$$;

revoke all on function public.get_local_updates_page(integer, text, timestamptz, uuid, double precision, double precision, double precision, timestamptz) from public;
grant execute on function public.get_local_updates_page(integer, text, timestamptz, uuid, double precision, double precision, double precision, timestamptz) to anon, authenticated;
