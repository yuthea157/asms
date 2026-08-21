-- Fixes "infinite recursion detected in policy for relation profiles"
-- (SQLSTATE 42P17), discovered during Phase 2 verification.
--
-- Root cause: every policy in 20260821120400_rls.sql looked up the
-- caller's role/company via a raw `exists (select 1 from profiles p
-- where p.auth_user_id = auth.uid() and ...)` subquery. For policies
-- defined ON profiles itself (profiles_select_admin, profiles_write_admin)
-- this subquery re-triggers profiles' own RLS evaluation, which
-- re-triggers itself again -- Postgres detects this self-reference
-- statically and refuses to plan the query at all, for ANY table whose
-- policy touches profiles (not just profiles' own policies).
--
-- Fix: route every profile lookup through current_profile(), the
-- existing SECURITY DEFINER function (already defined in the previous
-- migration) -- SECURITY DEFINER functions run with the privileges of
-- their owner (the migration role, which bypasses RLS in Supabase), so
-- the lookup inside current_profile() never re-enters profiles' RLS,
-- breaking the recursion at its source.

drop policy profiles_select_admin on profiles;
drop policy profiles_write_admin on profiles;

create policy profiles_select_admin on profiles for select using (
  (select role from current_profile()) = 'admin'
);
create policy profiles_write_admin on profiles for all using (
  (select role from current_profile()) = 'admin'
) with check (
  (select role from current_profile()) = 'admin'
);

-- ---------------------------------------------------------------------
-- Baseline company/factory-scoped tables: drop + recreate using
-- current_profile() instead of the raw profiles subquery.
-- ---------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in (select * from (values
    ('companies','id'),
    ('company_contacts','company_id'),
    ('advisory_info','company_id'),
    ('bipartite_committee','company_id'),
    ('trainings','company_id'),
    ('grievances','company_id'),
    ('policies','company_id'),
    ('licenses','company_id'),
    ('audit_tool','company_id'),
    ('self_assessments','company_id'),
    ('risk_assessments','company_id'),
    ('caps','company_id'),
    ('meeting_logs','company_id'),
    ('pams_factory_profiles','factory_id'),
    ('pams_departments','factory_id'),
    ('pams_projects','factory_id'),
    ('pams_goals','factory_id'),
    ('pams_targets','factory_id'),
    ('pams_kpi_links','factory_id'),
    ('pams_actions','factory_id'),
    ('pams_evidence','factory_id'),
    ('pams_advisory_visits','factory_id'),
    ('pams_findings','factory_id'),
    ('pams_recommendations','factory_id'),
    ('pams_issues','factory_id'),
    ('pams_assessments','factory_id'),
    ('pams_notifications','factory_id'),
    ('pams_factory_summaries','factory_id')
  ) as x(tbl, col))
  loop
    execute format('drop policy %I on %I;', t.tbl || '_scoped', t.tbl);
    execute format(
      'create policy %I on %I for all using ('
      || '(select role from current_profile()) in (''admin'',''manager'',''officer'') '
      || 'or (select company_id from current_profile()) = %I.%I'
      || ') with check ('
      || '(select role from current_profile()) in (''admin'',''manager'',''officer'') '
      || 'or (select company_id from current_profile()) = %I.%I'
      || ');',
      t.tbl || '_scoped', t.tbl, t.tbl, t.col, t.tbl, t.col
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Join-scoped tables
-- ---------------------------------------------------------------------
drop policy visits_scoped on visits;
create policy visits_scoped on visits for all using (
  exists (select 1 from advisory_info a where a.id = visits.advisory_info_id
    and ((select role from current_profile()) in ('admin','manager','officer')
      or (select company_id from current_profile()) = a.company_id))
) with check (
  exists (select 1 from advisory_info a where a.id = visits.advisory_info_id
    and ((select role from current_profile()) in ('admin','manager','officer')
      or (select company_id from current_profile()) = a.company_id))
);

drop policy assessment_plans_scoped on assessment_plans;
create policy assessment_plans_scoped on assessment_plans for all using (
  exists (select 1 from advisory_info a where a.id = assessment_plans.advisory_info_id
    and ((select role from current_profile()) in ('admin','manager','officer')
      or (select company_id from current_profile()) = a.company_id))
) with check (
  exists (select 1 from advisory_info a where a.id = assessment_plans.advisory_info_id
    and ((select role from current_profile()) in ('admin','manager','officer')
      or (select company_id from current_profile()) = a.company_id))
);

drop policy audit_tool_questions_scoped on audit_tool_questions;
create policy audit_tool_questions_scoped on audit_tool_questions for all using (
  exists (select 1 from audit_tool t where t.id = audit_tool_questions.audit_tool_id
    and ((select role from current_profile()) in ('admin','manager','officer')
      or (select company_id from current_profile()) = t.company_id))
) with check (
  exists (select 1 from audit_tool t where t.id = audit_tool_questions.audit_tool_id
    and ((select role from current_profile()) in ('admin','manager','officer')
      or (select company_id from current_profile()) = t.company_id))
);

drop policy self_assessment_questions_scoped on self_assessment_questions;
create policy self_assessment_questions_scoped on self_assessment_questions for all using (
  exists (select 1 from self_assessments s where s.id = self_assessment_questions.self_assessment_id
    and ((select role from current_profile()) in ('admin','manager','officer')
      or (select company_id from current_profile()) = s.company_id))
) with check (
  exists (select 1 from self_assessments s where s.id = self_assessment_questions.self_assessment_id
    and ((select role from current_profile()) in ('admin','manager','officer')
      or (select company_id from current_profile()) = s.company_id))
);

drop policy meeting_participants_scoped on meeting_participants;
create policy meeting_participants_scoped on meeting_participants for all using (
  exists (select 1 from meeting_logs m where m.id = meeting_participants.meeting_log_id
    and ((select role from current_profile()) in ('admin','manager','officer')
      or (select company_id from current_profile()) = m.company_id))
) with check (
  exists (select 1 from meeting_logs m where m.id = meeting_participants.meeting_log_id
    and ((select role from current_profile()) in ('admin','manager','officer')
      or (select company_id from current_profile()) = m.company_id))
);

drop policy training_participants_scoped on training_participants;
create policy training_participants_scoped on training_participants for all using (
  exists (select 1 from trainings tr where tr.id = training_participants.training_id
    and ((select role from current_profile()) in ('admin','manager','officer')
      or (select company_id from current_profile()) = tr.company_id))
) with check (
  exists (select 1 from trainings tr where tr.id = training_participants.training_id
    and ((select role from current_profile()) in ('admin','manager','officer')
      or (select company_id from current_profile()) = tr.company_id))
);

drop policy pams_tasks_scoped on pams_tasks;
create policy pams_tasks_scoped on pams_tasks for all using (
  exists (select 1 from pams_actions a where a.id = pams_tasks.action_id
    and ((select role from current_profile()) in ('admin','manager','officer')
      or (select company_id from current_profile()) = a.factory_id))
) with check (
  exists (select 1 from pams_actions a where a.id = pams_tasks.action_id
    and ((select role from current_profile()) in ('admin','manager','officer')
      or (select company_id from current_profile()) = a.factory_id))
);

drop policy pams_assessment_item_results_scoped on pams_assessment_item_results;
create policy pams_assessment_item_results_scoped on pams_assessment_item_results for all using (
  exists (select 1 from pams_assessments a where a.id = pams_assessment_item_results.assessment_id
    and ((select role from current_profile()) in ('admin','manager','officer')
      or (select company_id from current_profile()) = a.factory_id))
) with check (
  exists (select 1 from pams_assessments a where a.id = pams_assessment_item_results.assessment_id
    and ((select role from current_profile()) in ('admin','manager','officer')
      or (select company_id from current_profile()) = a.factory_id))
);

drop policy pams_objectives_scoped on pams_objectives;
create policy pams_objectives_scoped on pams_objectives for all using (
  exists (select 1 from pams_goals g where g.id = pams_objectives.goal_id
    and ((select role from current_profile()) in ('admin','manager','officer')
      or (select company_id from current_profile()) = g.factory_id))
) with check (
  exists (select 1 from pams_goals g where g.id = pams_objectives.goal_id
    and ((select role from current_profile()) in ('admin','manager','officer')
      or (select company_id from current_profile()) = g.factory_id))
);

drop policy pams_sub_objectives_scoped on pams_sub_objectives;
create policy pams_sub_objectives_scoped on pams_sub_objectives for all using (
  (select role from current_profile()) in ('admin','manager','officer')
  or (select company_id from current_profile()) = pams_objective_factory_id(pams_sub_objectives.objective_id)
) with check (
  (select role from current_profile()) in ('admin','manager','officer')
  or (select company_id from current_profile()) = pams_objective_factory_id(pams_sub_objectives.objective_id)
);

drop policy pams_target_summaries_select on pams_target_summaries;
create policy pams_target_summaries_select on pams_target_summaries for select using (
  exists (select 1 from pams_targets t where t.id = pams_target_summaries.target_id
    and ((select role from current_profile()) in ('admin','manager','officer')
      or (select company_id from current_profile()) = t.factory_id))
);
drop policy pams_target_summaries_write on pams_target_summaries;
create policy pams_target_summaries_write on pams_target_summaries for insert with check (
  (select role from current_profile()) in ('admin','manager')
);
drop policy pams_target_summaries_update on pams_target_summaries;
create policy pams_target_summaries_update on pams_target_summaries for update using (
  (select role from current_profile()) in ('admin','manager')
);

-- ---------------------------------------------------------------------
-- Org-wide catalogs
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in (select unnest(array[
    'audit_checklists','audit_guidance',
    'custom_dashboards','custom_dashboard_widgets',
    'pams_factory_groups','pams_industry_profiles','pams_kpis','pams_kpi_formulas',
    'pams_rating_scales','pams_rating_levels','pams_rag_rules',
    'pams_custom_fields','pams_custom_field_values',
    'pams_assessment_categories','pams_assessment_items',
    'pams_scoring_rule_versions'
  ]))
  loop
    execute format('drop policy %I on %I;', t || '_read', t);
    execute format(
      'create policy %I on %I for select using (current_profile() is not null);',
      t || '_read', t
    );
    execute format('drop policy %I on %I;', t || '_write', t);
    execute format(
      'create policy %I on %I for all using ('
      || '(select role from current_profile()) in (''admin'',''manager'')'
      || ') with check ('
      || '(select role from current_profile()) in (''admin'',''manager'')'
      || ');',
      t || '_write', t
    );
  end loop;
end $$;

-- users
drop policy users_select on users;
create policy users_select on users for select using (current_profile() is not null);
drop policy users_write_admin on users;
create policy users_write_admin on users for all using (
  (select role from current_profile()) = 'admin'
) with check (
  (select role from current_profile()) = 'admin'
);

-- permissions / system_settings
drop policy permissions_select on permissions;
create policy permissions_select on permissions for select using (current_profile() is not null);
drop policy permissions_write_admin on permissions;
create policy permissions_write_admin on permissions for all using (
  (select role from current_profile()) = 'admin'
) with check (
  (select role from current_profile()) = 'admin'
);

drop policy system_settings_select on system_settings;
create policy system_settings_select on system_settings for select using (current_profile() is not null);
drop policy system_settings_write_admin on system_settings;
create policy system_settings_write_admin on system_settings for all using (
  (select role from current_profile()) = 'admin'
) with check (
  (select role from current_profile()) = 'admin'
);

-- ---------------------------------------------------------------------
-- Structural-integrity special cases
-- ---------------------------------------------------------------------
drop policy pams_measurements_select on pams_measurements;
create policy pams_measurements_select on pams_measurements for select using (
  (select role from current_profile()) in ('admin','manager','officer')
  or (select company_id from current_profile()) = pams_measurements.factory_id
);
drop policy pams_measurements_insert on pams_measurements;
create policy pams_measurements_insert on pams_measurements for insert with check (
  (select role from current_profile()) in ('admin','manager','officer')
  or (select company_id from current_profile()) = pams_measurements.factory_id
);
drop policy pams_measurements_update on pams_measurements;
create policy pams_measurements_update on pams_measurements for update using (
  verification_status is distinct from 'Verified'
  and ((select role from current_profile()) in ('admin','manager','officer')
    or (select company_id from current_profile()) = pams_measurements.factory_id)
) with check (verification_status is distinct from 'Verified');

drop policy pams_scores_select on pams_scores;
create policy pams_scores_select on pams_scores for select using (current_profile() is not null);

drop policy pams_audit_logs_insert on pams_audit_logs;
create policy pams_audit_logs_insert on pams_audit_logs for insert with check (current_profile() is not null);
drop policy pams_audit_logs_select on pams_audit_logs;
create policy pams_audit_logs_select on pams_audit_logs for select using (
  (select role from current_profile()) in ('admin','manager')
);

drop policy attachments_all on attachments;
create policy attachments_all on attachments for all using (
  current_profile() is not null
) with check (
  current_profile() is not null
);
