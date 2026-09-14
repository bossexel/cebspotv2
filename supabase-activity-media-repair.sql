-- CebSpot Activity multi-photo repair
-- Run once in the Supabase SQL Editor. It is safe to run again.

alter table public.local_updates
  add column if not exists media_urls text[] default '{}';

-- Restore complete media galleries for existing spot-submission posts.
update public.local_updates local_update
set
  media_urls = submission.images,
  updated_at = now()
from public.spot_submissions submission
where local_update.source_type = 'spot_submission'
  and local_update.source_id = submission.id::text
  and coalesce(cardinality(local_update.media_urls), 0) = 0
  and coalesce(cardinality(submission.images), 0) > 0;

-- Keep legacy posts usable when their source submission is unavailable.
update public.local_updates
set
  media_urls = array[image_url],
  updated_at = now()
where coalesce(cardinality(media_urls), 0) = 0
  and nullif(trim(image_url), '') is not null;

update public.local_updates
set media_urls = '{}'
where media_urls is null;

alter table public.local_updates
  alter column media_urls set default '{}',
  alter column media_urls set not null;

notify pgrst, 'reload schema';
