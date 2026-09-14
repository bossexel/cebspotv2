-- CebSpot visit check-in retirement
-- Run once in the Supabase SQL Editor to stop visit XP calls from every app build.
-- Historical visits and XP are intentionally retained for audit consistency.

begin;

drop function if exists public.record_spot_visit(
  uuid,
  double precision,
  double precision,
  double precision
);

drop function if exists public.distance_meters(
  double precision,
  double precision,
  double precision,
  double precision
);

update public.achievements
set
  enabled = false,
  xp_reward = 0
where code = 'ON_THE_GROUND'
   or requirement_type = 'verified_visits';

notify pgrst, 'reload schema';

commit;

-- Verification queries:
-- select to_regprocedure('public.record_spot_visit(uuid,double precision,double precision,double precision)') as visit_rpc;
-- select code, enabled, xp_reward from public.achievements where code = 'ON_THE_GROUND';
