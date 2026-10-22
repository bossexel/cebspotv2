begin;

-- Hard deletion is deliberately exposed only through this audited admin RPC.
-- Booking and payment history must remain intact, so a spot with any
-- reservation history cannot be deleted from the dashboard.
create or replace function public.delete_admin_spot(target_spot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_spot jsonb;
begin
  perform public.require_active_account();

  if not public.is_current_user_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', spot.id,
    'name', spot.name,
    'category', spot.category
  )
  into deleted_spot
  from public.spots spot
  where spot.id = target_spot_id
  for update;

  if deleted_spot is null then
    raise exception 'Spot not found.' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.reservations reservation
    where reservation.spot_id = target_spot_id
  ) then
    raise exception 'This spot has booking history and cannot be permanently deleted. Hide it from discovery instead.'
      using errcode = '55000';
  end if;

  delete from public.spots where id = target_spot_id;

  return deleted_spot || jsonb_build_object('deleted', true, 'deletedAt', now());
end;
$$;

revoke all on function public.delete_admin_spot(uuid) from public, anon;
grant execute on function public.delete_admin_spot(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
