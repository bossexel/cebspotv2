-- Read-only counts only. No customer, payment identifier or checkout URL output.
begin read only;
select jsonb_build_object(
  'pending_count',count(*) filter(where status='pending'),
  'pending_recorded_test',count(*) filter(where status='pending' and coalesce(raw_payload#>'{data,attributes,livemode}',raw_payload#>'{attributes,livemode}',raw_payload->'livemode')='false'::jsonb),
  'pending_recorded_live',count(*) filter(where status='pending' and coalesce(raw_payload#>'{data,attributes,livemode}',raw_payload#>'{attributes,livemode}',raw_payload->'livemode')='true'::jsonb),
  'pending_with_saved_checkout',count(*) filter(where status='pending' and provider_checkout_session_id~'^cs_[A-Za-z0-9_]+$'),
  'pending_without_durable_request',count(*) filter(where status='pending' and checkout_request is null),
  'pending_with_durable_request',count(*) filter(where status='pending' and checkout_request is not null),
  'pending_test_bookings_with_mixed_modes',(select count(*) from public.reservation_payments target where target.status='pending'
    and coalesce(target.raw_payload#>'{data,attributes,livemode}',target.raw_payload#>'{attributes,livemode}',target.raw_payload->'livemode')='false'::jsonb
    and exists(select 1 from public.reservation_payments sibling where sibling.reservation_id=target.reservation_id and sibling.id<>target.id and sibling.provider='paymongo'
      and coalesce(sibling.raw_payload#>'{data,attributes,livemode}',sibling.raw_payload#>'{attributes,livemode}',sibling.raw_payload->'livemode') is distinct from 'false'::jsonb))
) as legacy_preflight
from public.reservation_payments;
rollback;
