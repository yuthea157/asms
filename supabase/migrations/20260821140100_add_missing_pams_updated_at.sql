-- 8 PAMS catalog tables were missing updated_by_user_id/updated_at
-- entirely (only had created_by_user_id/created_at) -- caught by
-- actually running the ETL against real data, which includes real
-- updatedAt/updatedByUserId values for these tables (auditFields.js
-- stamps all 4 audit fields uniformly; the original schema just missed
-- copying the "updated" half for these 8 specific tables).

do $$
declare
  t text;
begin
  for t in (select unnest(array[
    'pams_assessment_categories', 'pams_custom_fields', 'pams_departments',
    'pams_kpi_formulas', 'pams_kpi_links', 'pams_rag_rules',
    'pams_rating_scales', 'pams_scoring_rule_versions'
  ]))
  loop
    execute format('alter table %I add column updated_by_user_id text;', t);
    execute format('alter table %I add column updated_at timestamptz not null default now();', t);
    execute format('create trigger trg_%s_updated_at before update on %I for each row execute function bump_updated_at();', t, t);
  end loop;
end $$;
