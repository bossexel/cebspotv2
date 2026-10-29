-- Catalog reads only. No migration, business-data query or history repair.
-- Keep the result in a private local review file; policies can include IDs.
-- Run against a target only after independently checking its project identity.
begin read only;

select current_database() as database_name, current_user as connected_role,
       current_setting('server_version') as server_version;

with required(table_name,column_name,expected_udt_name) as (values
  ('activities','user_id','uuid'),('activities','type','text'),
  ('activities','target_id','text'),('activities','spot_id','uuid'),
  ('activities','created_at','timestamptz'),
  ('profiles','id','uuid'),('profiles','email','text'),('profiles','role','text'),
  ('reservations','id','uuid'),('reservations','user_id','uuid'),('reservations','spot_id','uuid'),
  ('spots','id','uuid'),('spots','owner_id','uuid'),('spots','is_public','bool'),
  ('owner_spot_access','spot_id','uuid'),('owner_spot_access','owner_id','uuid'),
  ('spot_submissions','id','uuid'),('spot_submissions','submitter_id','uuid'),('spot_submissions','status','text'),
  ('owner_access_requests','id','uuid'),('owner_access_requests','requester_id','uuid')
)
select required.*, actual.udt_name as actual_udt_name,
       coalesce(actual.udt_name=required.expected_udt_name,false) as prerequisite_matches
from required left join information_schema.columns actual
  on actual.table_schema='public' and actual.table_name=required.table_name
  and actual.column_name=required.column_name
order by required.table_name,required.column_name;

select to_regprocedure('auth.uid()') as auth_identity_function,
       to_regprocedure('public.is_current_user_admin()') as admin_identity_function,
       to_regprocedure('public.can_read_activity(uuid,text,text,uuid)') as existing_activity_predicate,
       to_regprocedure('public.require_active_account()') as existing_account_prerequisite,
       to_regclass('public.account_deletion_requests') as account_deletion_contract;

select c.relname,c.relrowsecurity,c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='activities';

select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname='public' and tablename in
  ('activities','profiles','spots','reservations','owner_spot_access','spot_submissions','owner_access_requests')
order by tablename,policyname;

select c.relname as table_name,t.tgname,t.tgenabled,p.proname as trigger_function
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid
where not t.tgisinternal and n.nspname='public' and c.relname in ('activities','profiles')
order by c.relname,t.tgname;

select p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,p.proconfig as function_settings,p.proacl as function_acl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
  ('is_current_user_admin','can_read_activity','guard_profile_identity','require_active_account')
order by p.proname;

select grantee,table_name,privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name in
  ('activities','profiles','spots','reservations','owner_spot_access','spot_submissions','owner_access_requests')
  and grantee in ('PUBLIC','anon','authenticated','service_role')
order by table_name,grantee,privilege_type;

rollback;
