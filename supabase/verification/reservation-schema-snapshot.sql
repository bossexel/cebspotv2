-- READ ONLY. Catalog metadata only; no application rows or credentials.
-- Save output locally outside git. This is a schema snapshot, not a data backup.
begin read only;
set local statement_timeout = '30s';
select jsonb_build_object(
  'server_version', current_setting('server_version'),
  'tables', (select jsonb_agg(to_jsonb(t) order by name) from (
    select c.relname name, c.relrowsecurity rls, c.relforcerowsecurity force_rls
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
  ) t),
  'views', (select jsonb_agg(to_jsonb(t) order by name) from (
    select c.relname name,pg_get_viewdef(c.oid) definition,c.reloptions options
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='v'
  ) t),
  'columns', (select jsonb_agg(to_jsonb(t) order by table_name, position) from (
    select c.relname table_name, a.attname name, a.attnum position,
      format_type(a.atttypid,a.atttypmod) type, a.attnotnull not_null,
      pg_get_expr(d.adbin,d.adrelid) default_expr, a.attidentity identity_kind,
      a.attgenerated generated_kind
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
    where n.nspname='public' and c.relkind='r'
  ) t),
  'constraints', (select jsonb_agg(to_jsonb(t) order by table_name,name) from (
    select c.relname table_name, co.conname name, co.contype kind,
      pg_get_constraintdef(co.oid) definition
    from pg_constraint co join pg_class c on c.oid=co.conrelid
    join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
  ) t),
  'indexes', (select jsonb_agg(to_jsonb(t) order by table_name,name) from (
    select c.relname table_name, i.relname name, pg_get_indexdef(x.indexrelid) definition,
      exists(select 1 from pg_constraint co where co.conindid=x.indexrelid) constraint_owned
    from pg_index x join pg_class c on c.oid=x.indrelid
    join pg_class i on i.oid=x.indexrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
  ) t),
  'functions', (select jsonb_agg(to_jsonb(t) order by name,args) from (
    select p.proname name, pg_get_function_identity_arguments(p.oid) args,
      pg_get_functiondef(p.oid) definition, p.prosecdef security_definer,
      (select jsonb_agg(jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
        'privilege',a.privilege_type,'grantable',a.is_grantable))
        from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) grants
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and not exists(
      select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
  ) t),
  'triggers', (select jsonb_agg(to_jsonb(t) order by table_name,name) from (
    select c.relname table_name, t.tgname name, pg_get_triggerdef(t.oid) definition
    from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal
  ) t),
  'policies', (select jsonb_agg(to_jsonb(t) order by tablename,policyname) from (
    select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
    from pg_policies where schemaname='public'
  ) t),
  'storage_policies', (select jsonb_agg(to_jsonb(t) order by tablename,policyname) from (
    select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
    from pg_policies where schemaname='storage'
  ) t),
  'table_grants', (select jsonb_agg(to_jsonb(t) order by table_name,grantee,privilege_type) from (
    select table_name,grantee,privilege_type,is_grantable
    from information_schema.table_privileges where table_schema='public'
  ) t),
  'column_grants', (select jsonb_agg(to_jsonb(t) order by table_name,column_name,grantee,privilege_type) from (
    select c.relname table_name,a.attname column_name,
      case when acl.grantee=0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end grantee,
      acl.privilege_type,case when acl.is_grantable then 'YES' else 'NO' end is_grantable
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    cross join lateral aclexplode(a.attacl) acl
    where n.nspname='public'
  ) t),
  'publication_tables', (select jsonb_agg(to_jsonb(t)) from (
    select pubname,schemaname,tablename from pg_publication_tables where schemaname='public'
  ) t),
  'enums', (select jsonb_agg(to_jsonb(t)) from (
    select ty.typname name, array_agg(e.enumlabel order by e.enumsortorder) labels
    from pg_type ty join pg_namespace n on n.oid=ty.typnamespace
    join pg_enum e on e.enumtypid=ty.oid where n.nspname='public' group by ty.typname
  ) t),
  'sequences', (select jsonb_agg(to_jsonb(t)) from (
    select sequencename name from pg_sequences where schemaname='public'
  ) t)
) as catalog;
rollback;
