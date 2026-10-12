begin;
-- A draft allocates the eventual owner_access_requests.id before documents are
-- uploaded. It contains no parallel moderation/application record.
create table public.owner_application_drafts(
  id uuid primary key default gen_random_uuid(),requester_id uuid not null references public.profiles(id),
  business_email text not null,created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '30 minutes',submitted_at timestamptz
);
create index owner_application_drafts_user_time on public.owner_application_drafts(requester_id,created_at desc);
create table public.private_upload_admissions(
  id uuid primary key default gen_random_uuid(),requester_id uuid not null references public.profiles(id),
  kind text not null check(kind in ('reservation_proof','owner_document')),resource_id uuid not null,
  created_at timestamptz not null default now()
);
create index private_upload_admissions_user_time on public.private_upload_admissions(requester_id,created_at desc);
create index private_upload_admissions_resource on public.private_upload_admissions(resource_id,kind);
alter table public.owner_application_drafts enable row level security;
alter table public.private_upload_admissions enable row level security;
revoke all on public.owner_application_drafts,public.private_upload_admissions from anon,authenticated;
grant select on public.owner_application_drafts to authenticated;
create policy owner_application_drafts_read_own on public.owner_application_drafts for select using(requester_id=auth.uid());
grant all on public.owner_application_drafts,public.private_upload_admissions to service_role;

create function public.create_owner_application_draft(candidate_email text) returns public.owner_application_drafts
language plpgsql security definer set search_path='' as $$
declare draft public.owner_application_drafts%rowtype; email text:=lower(trim(candidate_email));
begin
  if auth.uid() is null then raise exception 'Sign in before uploading verification documents.' using errcode='42501'; end if;
  perform 1 from public.profiles where id=auth.uid() for update;
  if not found then raise exception 'Active applicant account required.' using errcode='42501'; end if;
  if public.owner_business_email_status_internal(email) <> 'available' then raise exception 'Use an available unregistered business email.' using errcode='22023'; end if;
  select * into draft from public.owner_application_drafts where requester_id=auth.uid() and business_email=email
    and submitted_at is null and expires_at>now() order by created_at desc limit 1;
  if found then return draft; end if;
  if (select count(*) from public.owner_application_drafts where requester_id=auth.uid() and created_at>now()-interval '1 hour')>=5 then
    raise exception 'Owner application rate limit reached. Retry later.' using errcode='54000'; end if;
  insert into public.owner_application_drafts(requester_id,business_email) values(auth.uid(),email) returning * into draft;
  return draft;
end;
$$;
revoke all on function public.create_owner_application_draft(text) from public,anon;
grant execute on function public.create_owner_application_draft(text) to authenticated;

create function public.claim_private_upload(customer_id uuid,upload_kind text,target_resource_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare admission_id uuid; eligible boolean:=false; retry_seconds int;
begin
  perform 1 from public.profiles where id=customer_id for update;
  if not found then raise exception 'Active account required.' using errcode='42501'; end if;
  if upload_kind='reservation_proof' then
    select exists(select 1 from public.reservations r where r.id=target_resource_id and r.user_id=customer_id
      and r.payment_required and r.status in ('pending','pending_payment','rescheduled')
      and r.payment_status in ('pending','unpaid','failed') and (r.payment_method is null or r.payment_method='gcash')
      and r.hold_expires_at>now()) into eligible;
  elsif upload_kind='owner_document' then
    select exists(select 1 from public.owner_application_drafts d where d.id=target_resource_id and d.requester_id=customer_id
      and d.submitted_at is null and d.expires_at>now()) into eligible;
  end if;
  if not eligible then raise exception 'Upload request unavailable or expired.' using errcode='42501'; end if;
  if (select count(*) from public.private_upload_admissions where requester_id=customer_id and created_at>now()-interval '1 hour')>=10
    or (select count(*) from public.private_upload_admissions where resource_id=target_resource_id and kind=upload_kind)>=5 then
    select greatest(1,ceil(extract(epoch from min(created_at)+interval '1 hour'-now())))::int into retry_seconds
      from public.private_upload_admissions where requester_id=customer_id and created_at>now()-interval '1 hour';
    return jsonb_build_object('allowed',false,'retry_after',coalesce(retry_seconds,60));
  end if;
  insert into public.private_upload_admissions(requester_id,kind,resource_id) values(customer_id,upload_kind,target_resource_id) returning id into admission_id;
  return jsonb_build_object('allowed',true,'id',admission_id);
end;
$$;
revoke all on function public.claim_private_upload(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.claim_private_upload(uuid,text,uuid) to service_role;

revoke insert,update,delete on public.owner_access_requests from anon,authenticated;
drop policy if exists owner_access_requests_public_insert on public.owner_access_requests;
drop policy if exists owner_access_requests_insert_own on public.owner_access_requests;
create policy owner_access_requests_insert_guard on public.owner_access_requests as restrictive for insert with check(false);
update storage.buckets set public=false,file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','application/pdf'] where id='owner-verification-documents';
drop policy if exists owner_verification_documents_insert on storage.objects;
drop policy if exists owner_verification_documents_read_admin on storage.objects;
create function public.can_read_owner_document(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and ((public.is_current_user_admin() and exists(
    select 1 from public.owner_access_requests r where object_name=any(r.verification_documents))) or exists(select 1 from public.owner_application_drafts d
    where object_name ~ ('^'||d.requester_id::text||'/'||d.id::text||'/[0-9a-f-]{36}\.(jpg|png|pdf)$')
      and (d.requester_id=auth.uid() or (public.is_current_user_admin() and exists(
        select 1 from public.owner_access_requests r where r.id=d.id and object_name=any(r.verification_documents))))));
$$;
revoke all on function public.can_read_owner_document(text) from public;
grant execute on function public.can_read_owner_document(text) to anon,authenticated,service_role;
create policy owner_documents_read_related on storage.objects for select
  using(bucket_id='owner-verification-documents' and public.can_read_owner_document(name));
create policy owner_documents_read_guard on storage.objects as restrictive for select
  using(bucket_id<>'owner-verification-documents' or public.can_read_owner_document(name));
create policy owner_documents_insert_guard on storage.objects as restrictive for insert with check(bucket_id<>'owner-verification-documents');
create policy owner_documents_update_guard on storage.objects as restrictive for update
  using(bucket_id<>'owner-verification-documents') with check(bucket_id<>'owner-verification-documents');
create policy owner_documents_delete_guard on storage.objects as restrictive for delete using(bucket_id<>'owner-verification-documents');

create function public.submit_owner_application(draft_id uuid,application jsonb)
returns public.owner_access_requests language plpgsql security definer set search_path='' as $$
declare draft public.owner_application_drafts%rowtype; submitted public.owner_access_requests%rowtype;
  documents text[]; needs text[]; document text; candidate_spot uuid;
begin
  select * into draft from public.owner_application_drafts where id=draft_id and requester_id=auth.uid() for update;
  if not found then raise exception 'Owned application draft required.' using errcode='42501'; end if;
  if draft.submitted_at is not null then select * into submitted from public.owner_access_requests where id=draft.id;return submitted; end if;
  if draft.expires_at<=now() then raise exception 'Application draft expired. Start again.' using errcode='55000'; end if;
  if lower(trim(application->>'contact_email')) is distinct from draft.business_email
    or length(trim(coalesce(application->>'contact_name',''))) not between 2 and 120
    or length(trim(coalesce(application->>'spot_name',''))) not between 2 and 160
    or length(trim(coalesce(application->>'spot_address',''))) not between 5 and 500
    or coalesce(application->>'category','') not in ('Restaurant','Cafe','Bar','Club','Lounge','Food Park')
    or length(coalesce(application->>'message',''))>2000 then raise exception 'Invalid application details.' using errcode='22023'; end if;
  if nullif(trim(application->>'contact_phone'),'') is not null and replace(trim(application->>'contact_phone'),' ','') !~ '^(09[0-9]{9}|\+639[0-9]{9})$' then
    raise exception 'Invalid contact phone.' using errcode='22023'; end if;
  select array_agg(value) into documents from jsonb_array_elements_text(application->'verification_documents');
  select array_agg(value) into needs from jsonb_array_elements_text(application->'access_needs');
  if coalesce(cardinality(documents),0) not between 1 and 3 or cardinality(documents)<>(select count(distinct x) from unnest(documents) x)
    or coalesce(cardinality(needs),0) not between 1 and 4
    or not needs <@ array['Reservations','Down Payments','Guest Reviews','Tables & Pricing'] then
    raise exception 'Provide 1 to 3 verification files and valid access needs.' using errcode='22023'; end if;
  foreach document in array documents loop
    if document !~ ('^'||draft.requester_id::text||'/'||draft.id::text||'/[0-9a-f-]{36}\.(jpg|png|pdf)$')
      or not exists(select 1 from storage.objects o where o.bucket_id='owner-verification-documents' and o.name=document
        and o.metadata->>'mimetype' in ('image/jpeg','image/png','application/pdf')
        and coalesce(o.metadata->>'size','')~'^[0-9]{1,7}$' and (o.metadata->>'size')::bigint between 1 and 5242880) then
      raise exception 'Verification document is missing or belongs to another request.' using errcode='22023'; end if;
  end loop;
  -- Serialize pending applications for the same business email without deleting
  -- or guessing legacy duplicates during migration.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(draft.business_email,713));
  candidate_spot:=nullif(application->>'spot_id','')::uuid;
  if candidate_spot is not null and not exists(select 1 from public.spots where id=candidate_spot and is_public) then
    raise exception 'Requested venue is unavailable.' using errcode='22023'; end if;
  insert into public.owner_access_requests(id,requester_id,spot_id,contact_name,contact_email,contact_phone,spot_name,spot_address,
    category,access_needs,verification_documents,message)
    values(draft.id,auth.uid(),candidate_spot,trim(application->>'contact_name'),draft.business_email,nullif(trim(application->>'contact_phone'),''),
      trim(application->>'spot_name'),trim(application->>'spot_address'),application->>'category',needs,documents,nullif(trim(application->>'message'),''))
    returning * into submitted;
  update public.owner_application_drafts set submitted_at=now() where id=draft.id;
  return submitted;
end;
$$;
revoke all on function public.submit_owner_application(uuid,jsonb) from public,anon;
grant execute on function public.submit_owner_application(uuid,jsonb) to authenticated;

create function public.list_expired_private_uploads(batch_size integer default 50)
returns table(bucket_id text,object_name text) language sql stable security definer set search_path='' as $$
  select o.bucket_id,o.name from storage.objects o where o.created_at<now()-interval '24 hours' and (
    (o.bucket_id='payment-proofs' and not exists(select 1 from public.reservations r where r.payment_proof_url=o.name))
    or (o.bucket_id='owner-verification-documents' and not exists(select 1 from public.owner_access_requests r where o.name=any(r.verification_documents))))
  order by o.created_at limit least(greatest(batch_size,1),50);
$$;
revoke all on function public.list_expired_private_uploads(integer) from public,anon,authenticated;
grant execute on function public.list_expired_private_uploads(integer) to service_role;
commit;
