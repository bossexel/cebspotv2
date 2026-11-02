begin read only;
select version from supabase_migrations.schema_migrations
where version='20261101192553';
rollback;
