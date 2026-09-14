-- CebSpot reservation reminder activity deduplication
-- Run this once in the Supabase SQL editor.

create unique index if not exists activities_reservation_reminder_unique_idx
  on public.activities(user_id, target_id, type)
  where type = 'reservation_reminder' and target_id is not null;

notify pgrst, 'reload schema';
