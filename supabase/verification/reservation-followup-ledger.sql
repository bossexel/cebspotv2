begin read only;
select jsonb_build_object(
  'booking_alignment_recorded',exists(select 1 from supabase_migrations.schema_migrations where version='20261101192553'),
  'upload_dependencies_recorded',exists(select 1 from supabase_migrations.schema_migrations where version='20261102070521')
) as ledger_check;
rollback;
