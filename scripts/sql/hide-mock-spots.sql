-- Run in the connected project's Supabase SQL Editor with database admin access.
-- Hide only the known mock fixtures; preserve all records and booking history.
-- Test Cebspot Club remains unchanged, including its reservation settings.
-- This is an operational data update, not a schema migration.

begin;

with mock_spot_ids(id) as (
  values
    ('11111111-1111-4111-8111-111111111111'::uuid),
    ('22222222-2222-4222-8222-222222222222'::uuid),
    ('33333333-3333-4333-8333-333333333333'::uuid),
    ('44444444-4444-4444-8444-444444444444'::uuid),
    ('55555555-5555-4555-8555-555555555555'::uuid),
    ('55c91f2e-444c-4a24-9911-c896aaf8549e'::uuid)
  union all
  select ('90000000-0000-4000-8000-' || lpad(seq::text, 12, '0'))::uuid
  from generate_series(1, 60) as seed(seq)
)
update public.spots as spot
set is_public = false,
    updated_at = now()
from mock_spot_ids as mock
where spot.id = mock.id
  and spot.id <> '66666666-6666-4666-8666-666666666666'::uuid
  and spot.is_public is true
returning spot.id, spot.name, spot.is_public;

commit;
