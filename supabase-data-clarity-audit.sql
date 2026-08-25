-- CebSpot data clarity audit
-- Read-only checks for spot/map/card-carousel and leaderboard consistency.
-- Run in Supabase SQL Editor. This script does not update or delete data.

-- 1. Spot visibility totals. The user map/card carousel should match public_spots.
select
  count(*)::integer as total_spots,
  count(*) filter (where is_public)::integer as public_spots,
  count(*) filter (where not is_public)::integer as hidden_spots,
  count(*) filter (where is_public and is_reservable)::integer as public_reservable_spots
from public.spots;

-- 2. Published category leaderboard used by the admin dashboard and map-visible inventory.
select
  coalesce(nullif(trim(category), ''), 'Uncategorized') as category,
  count(*)::integer as public_spots
from public.spots
where is_public
group by 1
order by public_spots desc, category;

-- 3. Compare all-spots vs public-only category counts to expose hidden spots affecting totals.
select
  coalesce(nullif(trim(category), ''), 'Uncategorized') as category,
  count(*)::integer as all_spots,
  count(*) filter (where is_public)::integer as public_spots,
  count(*) filter (where not is_public)::integer as hidden_spots
from public.spots
group by 1
having count(*) filter (where not is_public) > 0
order by hidden_spots desc, category;

-- 4. Published barangay leaderboard used by the admin dashboard.
select
  coalesce(
    nullif(trim(substring(address from '(?i)Barangay\s+([^,]+)')), ''),
    nullif(trim(split_part(address, ',', 1)), ''),
    'Cebu City'
  ) as barangay,
  count(*)::integer as public_spots
from public.spots
where is_public
group by 1
order by public_spots desc, barangay;

-- 5. Pending submissions and their popularity signals.
select
  id,
  name,
  category,
  status,
  vote_count,
  search_count,
  similar_submission_count,
  popularity_score,
  created_at
from public.pending_spot_submission_popularity
order by popularity_score desc, created_at desc;

-- 6. Approved submissions that do not appear to have a matching published spot.
select
  submissions.id,
  submissions.name,
  submissions.address,
  submissions.updated_at
from public.spot_submissions submissions
where submissions.status = 'approved'
  and not exists (
    select 1
    from public.spots spots
    where spots.is_public
      and lower(trim(spots.name)) = lower(trim(submissions.name))
      and lower(trim(spots.address)) = lower(trim(submissions.address))
  )
order by submissions.updated_at desc;

-- 7. Duplicate published spots by name/address.
select
  lower(trim(name)) as normalized_name,
  lower(trim(address)) as normalized_address,
  count(*)::integer as duplicate_count,
  array_agg(id order by created_at desc) as spot_ids
from public.spots
where is_public
group by 1, 2
having count(*) > 1
order by duplicate_count desc, normalized_name;

-- 8. Published spots with suspicious coordinates for Cebu City map usage.
select
  id,
  name,
  address,
  latitude,
  longitude
from public.spots
where is_public
  and (
    latitude is null
    or longitude is null
    or latitude not between 10.20 and 10.45
    or longitude not between 123.75 and 124.05
  )
order by created_at desc;

-- 9. Spot-submission local updates whose source submission no longer exists.
select
  updates.id,
  updates.title,
  updates.source_id,
  updates.created_at
from public.local_updates updates
left join public.spot_submissions submissions
  on submissions.id::text = updates.source_id
where updates.source_type = 'spot_submission'
  and submissions.id is null
order by updates.created_at desc;

-- 10. Owner access links for published spots.
select
  spots.id as spot_id,
  spots.name,
  spots.owner_id,
  count(access.id)::integer as delegated_owner_access_count
from public.spots spots
left join public.owner_spot_access access
  on access.spot_id = spots.id
where spots.is_public
group by spots.id, spots.name, spots.owner_id
order by spots.name;

-- 11. Reservable published spots with incomplete reservation/pricing setup.
select
  id,
  name,
  reservation_type,
  reservation_fee,
  payment_required,
  gcash_amount,
  gcash_wallet_name,
  gcash_wallet_number,
  table_inventory
from public.spots
where is_public
  and is_reservable
  and (
    table_inventory is null
    or table_inventory = '{}'::jsonb
    or (reservation_type = 'paid' and coalesce(reservation_fee, 0) <= 0)
    or (payment_required and (gcash_wallet_name is null or gcash_wallet_number is null))
  )
order by updated_at desc;

-- 12. Current spot pricing seen by users before checkout.
select
  id,
  name,
  is_public,
  is_reservable,
  reservation_type,
  reservation_fee,
  payment_required,
  gcash_amount,
  updated_at
from public.spots
where is_public
order by updated_at desc;

-- 13. Active reservation snapshots compared with the current spot price.
-- A difference can be normal for older bookings, but it is useful while testing pricing changes.
select
  reservations.id as reservation_id,
  reservations.spot_id,
  reservations.spot_name,
  reservations.status,
  reservations.payment_status,
  reservations.reservation_fee as reservation_snapshot_fee,
  spots.reservation_fee as current_spot_fee,
  spots.gcash_amount as current_gcash_amount,
  reservations.created_at
from public.reservations reservations
join public.spots spots on spots.id = reservations.spot_id
where reservations.status not in ('cancelled', 'completed', 'no_show')
  and coalesce(reservations.reservation_fee, reservations.fee, 0) <> coalesce(spots.gcash_amount, spots.reservation_fee, 0)
order by reservations.created_at desc;

-- 14. Duplicate active table bookings that should be blocked by the reservation lock.
select
  spot_id,
  reservation_date,
  slot_id,
  table_id,
  count(*)::integer as active_reservations,
  array_agg(id order by created_at) as reservation_ids
from public.reservations
where slot_id is not null
  and table_id is not null
  and status not in ('cancelled', 'completed', 'no_show')
group by spot_id, reservation_date, slot_id, table_id
having count(*) > 1
order by reservation_date desc, spot_id;
