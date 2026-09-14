-- Run once in the Supabase SQL Editor.
-- It repairs the current Test Cebspot Club branding and makes the owner-access
-- bootstrap function ownership-only so future dashboard loads cannot reset it.

begin;

create or replace function public.claim_test_cebspot_owner_access()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_email text;
  requester_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required to claim Test Cebspot owner access.';
  end if;

  select lower(email), role
  into requester_email, requester_role
  from public.profiles
  where id = auth.uid();

  if requester_email <> 'testowner@cebspot.com' or requester_role <> 'owner' then
    raise exception 'Only the Test Cebspot owner account can claim this owner access.';
  end if;

  delete from public.owner_spot_access access
  using public.profiles owner_profile
  where access.owner_id = owner_profile.id
    and access.spot_id = '66666666-6666-4666-8666-666666666666'
    and (
      access.owner_id <> auth.uid()
      or owner_profile.role <> 'owner'
      or lower(owner_profile.email) <> 'testowner@cebspot.com'
    );

  update public.spots
  set
    owner_id = auth.uid(),
    updated_at = now()
  where id = '66666666-6666-4666-8666-666666666666'
    and owner_id is distinct from auth.uid();

  insert into public.owner_spot_access (owner_id, spot_id, role)
  values (auth.uid(), '66666666-6666-4666-8666-666666666666', 'owner')
  on conflict (owner_id, spot_id) do update
  set role = excluded.role;
end;
$$;

grant execute on function public.claim_test_cebspot_owner_access() to authenticated;

update public.spots
set
  name = 'Test Cebspot Club',
  category = 'Club',
  categories = array['Club', 'Nightlife', 'Reservations'],
  gcash_wallet_name = case
    when gcash_wallet_name is null or lower(gcash_wallet_name) = 'test cebspot restaurant'
      then 'Test Cebspot Club'
    else gcash_wallet_name
  end,
  gcash_qr_url = case
    when gcash_qr_url like '%Test%20Cebspot%20Restaurant%'
      then replace(gcash_qr_url, 'Test%20Cebspot%20Restaurant', 'Test%20Cebspot%20Club')
    else gcash_qr_url
  end,
  updated_at = now()
where id = '66666666-6666-4666-8666-666666666666';

commit;
