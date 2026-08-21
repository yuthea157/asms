-- Real exported PAMS data confirms the actual field names are
-- createdByUserId/updatedByUserId (stamped by src/pams/auditFields.js),
-- not createdBy/updatedBy as the schema originally assumed from field
-- name guessing. Renaming to created_by_user_id/updated_by_user_id so
-- the new pamsStore.js rewrite (Phase 6) can use a fully generic,
-- mechanical camelCase<->snake_case field-name converter for every PAMS
-- table, instead of a hand-maintained per-table field list that could
-- silently drift from the real Firestore field names the way the
-- original created_by/updated_by guess did.
--
-- Also adds latest_summary (jsonb) to pams_projects and pams_goals --
-- confirmed present in real exported data on both, not just
-- pams_targets as the original schema assumed.

do $$
declare
  t record;
begin
  for t in (
    select table_name from information_schema.columns
    where table_schema = 'public' and table_name like 'pams_%' and column_name = 'created_by'
  )
  loop
    execute format('alter table %I rename column created_by to created_by_user_id;', t.table_name);
  end loop;

  for t in (
    select table_name from information_schema.columns
    where table_schema = 'public' and table_name like 'pams_%' and column_name = 'updated_by'
  )
  loop
    execute format('alter table %I rename column updated_by to updated_by_user_id;', t.table_name);
  end loop;
end $$;

alter table pams_projects add column latest_summary jsonb;
alter table pams_goals add column latest_summary jsonb;
