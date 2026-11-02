-- READ ONLY: no event contents, record IDs, or customer details are returned.
begin read only;
set local statement_timeout='30s';
set local role anon;
select jsonb_build_object(
  'private_event_rows_visible',(select count(*) from public.activities where type in (
    'reservation','reservation_approved','reservation_checked_in','reservation_no_show',
    'reservation_reminder','reservation_cancelled','reservation_rescheduled','payment_received','payment_failed')),
  'availability_rows',(select count(*) from public.get_venue_table_availability('66666666-6666-4666-8666-666666666666',current_date+1,'prime')),
  'online_available_rows',(select count(*) from public.get_venue_table_availability('66666666-6666-4666-8666-666666666666',current_date+1,'prime') where online_available)
) as anonymous_check;
rollback;
