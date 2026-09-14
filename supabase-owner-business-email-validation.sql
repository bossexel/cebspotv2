-- Reject owner-access requests that use an existing CebSpot identity.
-- Run this once in the Supabase SQL Editor for an existing deployment.

create or replace function public.get_owner_business_email_status(candidate_email text)
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $function$
declare
  normalized_email text := lower(trim(coalesce(candidate_email, '')));
begin
  if normalized_email = '' or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return 'invalid';
  end if;

  if exists (
    select 1 from auth.users where lower(trim(email)) = normalized_email
  ) or exists (
    select 1 from public.profiles where lower(trim(email)) = normalized_email
  ) then
    return 'registered';
  end if;

  if exists (
    select 1
    from public.owner_access_requests
    where lower(trim(contact_email)) = normalized_email
      and status = 'pending'
  ) then
    return 'pending';
  end if;

  return 'available';
end;
$function$;

revoke all on function public.get_owner_business_email_status(text) from public;
grant execute on function public.get_owner_business_email_status(text) to anon, authenticated;

create or replace function public.reject_unavailable_owner_business_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  email_status text;
begin
  email_status := public.get_owner_business_email_status(new.contact_email);

  if email_status = 'registered' then
    raise exception 'This email already belongs to a CebSpot user. Use a separate, unregistered business email for the owner account.'
      using errcode = '23505';
  elsif email_status = 'pending' then
    raise exception 'An owner access request for this business email is already pending.'
      using errcode = '23505';
  elsif email_status = 'invalid' then
    raise exception 'Enter a valid business email address.'
      using errcode = '22023';
  end if;

  return new;
end;
$function$;

drop trigger if exists owner_requests_reject_unavailable_email on public.owner_access_requests;
create trigger owner_requests_reject_unavailable_email
before insert on public.owner_access_requests
for each row execute function public.reject_unavailable_owner_business_email();
