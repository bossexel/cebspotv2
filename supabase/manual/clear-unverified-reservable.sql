-- MANUAL ONLY. Never add this file to supabase/migrations or run it automatically.
-- Dry-run mode counts affected public venues. A human must review the count and
-- explicitly change apply_manual_change to true before any data is updated.
\set apply_manual_change false
begin;

create temporary table manual_reservable_review on commit drop as
select s.id
from public.spots s
where s.is_public is true
  and s.is_reservable is true
  and (
    s.id <> '66666666-6666-4666-8666-666666666666'::uuid
    or s.reservation_inventory_verified_at is null
    or not (
      coalesce(s.reservation_fee, s.gcash_amount, 0) > 0
      and jsonb_typeof(s.table_inventory) = 'object'
      and exists (
        select 1
        from jsonb_each(s.table_inventory) slot(key, value)
        cross join lateral jsonb_array_elements(case when jsonb_typeof(slot.value) = 'array' then slot.value else '[]'::jsonb end) item(value)
        where case when coalesce(item.value->>'capacity', '') ~ '^[0-9]+$'
          then (item.value->>'capacity')::integer else 0 end > 0
          and coalesce((item.value->>'isReserved')::boolean, false) is false
          and coalesce(item.value->>'bookingPolicy', 'online_and_walk_ins') <> 'walk_in_only'
      )
    )
  );

select count(*) as affected_public_reservable_venues from manual_reservable_review;

\if :apply_manual_change
update public.spots s
set is_reservable = false, updated_at = now()
from manual_reservable_review r
where s.id = r.id and s.is_reservable is true;
\else
\echo 'Dry run only. No venue flags were changed.'
\endif

commit;
