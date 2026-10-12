begin;
-- Retain exact arrival minutes; derive existing inventory/locking keys server-side.
create function public.reservation_slot_for_time(arrival time,club_floor_plan boolean)
returns text language sql immutable set search_path='' as $$
  select case when club_floor_plan then
    case when arrival>=time '23:00' or arrival<time '02:00' then 'prime'
         when arrival>=time '20:00' then 'sunset' else 'late' end
    else case when arrival>=time '20:00' and arrival<time '23:00' then 'prime'
              when arrival>=time '17:00' and arrival<time '20:00' then 'sunset' else 'late' end end;
$$;
create function public.validate_reservation_details() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  new.guest_name:=trim(new.guest_name);
  new.guest_email:=lower(trim(new.guest_email));
  new.guest_phone:=regexp_replace(new.guest_phone,'[ ()-]','','g');
  if coalesce(length(new.guest_name),0) not between 2 and 120
    or coalesce(length(new.guest_email),0) not between 5 and 254
    or coalesce(new.guest_email,'') !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$'
    or coalesce(new.guest_phone,'') !~ '^(09[0-9]{9}|\+639[0-9]{9})$' then
    raise exception 'Provide a valid guest name, email and Philippine mobile number.' using errcode='22023';
  end if;
  if new.reservation_time is null or new.reservation_time>=time '24:00'
    or extract(second from new.reservation_time)<>0
    or new.reservation_date is null or new.reservation_date<(now() at time zone 'Asia/Manila')::date then
    raise exception 'Select a valid arrival date and exact minute.' using errcode='22023';
  end if;
  if new.reservation_date=(now() at time zone 'Asia/Manila')::date
    and new.reservation_time<=(now() at time zone 'Asia/Manila')::time then
    raise exception 'Arrival time must be in the future.' using errcode='22023';
  end if;
  new.slot_id:=public.reservation_slot_for_time(new.reservation_time,new.spot_id='66666666-6666-4666-8666-666666666666'::uuid);
  new.reservation_time_start:=new.reservation_time;
  new.reservation_time_end:=null;
  if tg_op='INSERT' then
    new.payment_terms_accepted_at:=case when new.payment_terms_accepted then now() else null end;
  end if;
  return new;
end;
$$;
-- Alphabetical BEFORE-trigger order derives the key before price and inventory guards.
create trigger reservations_00_server_details before insert or update of
  guest_name,guest_email,guest_phone,reservation_time,reservation_date,slot_id on public.reservations
  for each row execute function public.validate_reservation_details();
revoke all on function public.validate_reservation_details() from public,anon,authenticated;
revoke all on function public.reservation_slot_for_time(time,boolean) from public;
grant execute on function public.reservation_slot_for_time(time,boolean) to authenticated,service_role;
commit;
