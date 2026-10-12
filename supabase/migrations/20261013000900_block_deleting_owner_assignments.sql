begin;
-- Do not attach new responsibilities after the deletion obligation check.
create function public.guard_owner_account_assignment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.owner_id is not null then
  -- Match venue -> profile ordering. SHARE conflicts with the deletion check's
  -- NO KEY UPDATE lock, including assignments to a different discovery venue.
  if tg_table_name='owner_spot_access' then
   perform 1 from public.spots where id=new.spot_id for update;
  end if;
  perform 1 from public.profiles where id=new.owner_id for share;
  if not public.account_is_active(new.owner_id) then
   raise exception 'Assign venue responsibilities only to an active account.' using errcode='42501';
  end if;
 end if;
 return new;
end;
$$;
create trigger spots_owner_active before insert or update of owner_id on public.spots
 for each row execute function public.guard_owner_account_assignment();
create trigger owner_access_account_active before insert or update of owner_id on public.owner_spot_access
 for each row execute function public.guard_owner_account_assignment();
revoke all on function public.guard_owner_account_assignment() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
