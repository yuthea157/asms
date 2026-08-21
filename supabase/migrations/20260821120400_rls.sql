-- Row Level Security: implements the factory/company scoping the app has
-- always intended (inScope()/scopeCompanyId in src/App.jsx and src/ui.jsx)
-- but never enforced at the database layer (Firestore rules today only
-- check "authenticated and non-anonymous", nothing role/company-aware).
--
-- Scope of this migration, per the approved plan: company/factory
-- scoping + the 3 structural-integrity cases only. The existing 15-module
-- x 3-action hasPerm() UI matrix stays UI-only, not replicated as RLS
-- policies here (RLS is per-row; that matrix isn't a per-row concept).

create table profiles (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  legacy_user_id text unique references users(id),
  role text not null check (role in ('admin','manager','officer','user')),
  company_id text references companies(id)
);

alter table profiles enable row level security;

create function current_profile() returns profiles as $$
  select * from profiles where auth_user_id = auth.uid();
$$ language sql stable security definer set search_path = public;

-- Every authenticated user can read their own profile row (needed to
-- bootstrap role/company on login); only admins can read/manage others'.
create policy profiles_select_self on profiles for select using (auth_user_id = auth.uid());
create policy profiles_select_admin on profiles for select using (
  exists (select 1 from profiles p where p.auth_user_id = auth.uid() and p.role = 'admin')
);
create policy profiles_write_admin on profiles for all using (
  exists (select 1 from profiles p where p.auth_user_id = auth.uid() and p.role = 'admin')
) with check (
  exists (select 1 from profiles p where p.auth_user_id = auth.uid() and p.role = 'admin')
);

-- ---------------------------------------------------------------------
-- Baseline scoping for every table with a direct company_id/factory_id
-- column: admin/manager/officer see and write everything; a 'user' role
-- is additionally gated to their own profile.company_id.
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
    execute format('alter table %I enable row level security;', t.tbl);
    execute format(
      'create policy %I on %I for all using ('
      || 'exists (select 1 from profiles p where p.auth_user_id = auth.uid() '
      || 'and (p.role in (''admin'',''manager'',''officer'') or p.company_id = %I.%I))'
      || ') with check ('
      || 'exists (select 1 from profiles p where p.auth_user_id = auth.uid() '
      || 'and (p.role in (''admin'',''manager'',''officer'') or p.company_id = %I.%I))'
      || ');',
      t.tbl || '_scoped', t.tbl, t.tbl, t.col, t.tbl, t.col
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Join-scoped tables: no company_id/factory_id column of their own, one
-- hop from a parent that has one.
-- ---------------------------------------------------------------------
alter table visits enable row level security;
create policy visits_scoped on visits for all using (
  exists (select 1 from advisory_info a join profiles p on p.auth_user_id = auth.uid()
    where a.id = visits.advisory_info_id
    and (p.role in ('admin','manager','officer') or p.company_id = a.company_id))
) with check (
  exists (select 1 from advisory_info a join profiles p on p.auth_user_id = auth.uid()
    where a.id = visits.advisory_info_id
    and (p.role in ('admin','manager','officer') or p.company_id = a.company_id))
);

alter table assessment_plans enable row level security;
create policy assessment_plans_scoped on assessment_plans for all using (
  exists (select 1 from advisory_info a join profiles p on p.auth_user_id = auth.uid()
    where a.id = assessment_plans.advisory_info_id
    and (p.role in ('admin','manager','officer') or p.company_id = a.company_id))
) with check (
  exists (select 1 from advisory_info a join profiles p on p.auth_user_id = auth.uid()
    where a.id = assessment_plans.advisory_info_id
    and (p.role in ('admin','manager','officer') or p.company_id = a.company_id))
);

alter table audit_tool_questions enable row level security;
create policy audit_tool_questions_scoped on audit_tool_questions for all using (
  exists (select 1 from audit_tool t join profiles p on p.auth_user_id = auth.uid()
    where t.id = audit_tool_questions.audit_tool_id
    and (p.role in ('admin','manager','officer') or p.company_id = t.company_id))
) with check (
  exists (select 1 from audit_tool t join profiles p on p.auth_user_id = auth.uid()
    where t.id = audit_tool_questions.audit_tool_id
    and (p.role in ('admin','manager','officer') or p.company_id = t.company_id))
);

alter table self_assessment_questions enable row level security;
create policy self_assessment_questions_scoped on self_assessment_questions for all using (
  exists (select 1 from self_assessments s join profiles p on p.auth_user_id = auth.uid()
    where s.id = self_assessment_questions.self_assessment_id
    and (p.role in ('admin','manager','officer') or p.company_id = s.company_id))
) with check (
  exists (select 1 from self_assessments s join profiles p on p.auth_user_id = auth.uid()
    where s.id = self_assessment_questions.self_assessment_id
    and (p.role in ('admin','manager','officer') or p.company_id = s.company_id))
);

alter table meeting_participants enable row level security;
create policy meeting_participants_scoped on meeting_participants for all using (
  exists (select 1 from meeting_logs m join profiles p on p.auth_user_id = auth.uid()
    where m.id = meeting_participants.meeting_log_id
    and (p.role in ('admin','manager','officer') or p.company_id = m.company_id))
) with check (
  exists (select 1 from meeting_logs m join profiles p on p.auth_user_id = auth.uid()
    where m.id = meeting_participants.meeting_log_id
    and (p.role in ('admin','manager','officer') or p.company_id = m.company_id))
);

alter table training_participants enable row level security;
create policy training_participants_scoped on training_participants for all using (
  exists (select 1 from trainings tr join profiles p on p.auth_user_id = auth.uid()
    where tr.id = training_participants.training_id
    and (p.role in ('admin','manager','officer') or p.company_id = tr.company_id))
) with check (
  exists (select 1 from trainings tr join profiles p on p.auth_user_id = auth.uid()
    where tr.id = training_participants.training_id
    and (p.role in ('admin','manager','officer') or p.company_id = tr.company_id))
);

alter table pams_tasks enable row level security;
create policy pams_tasks_scoped on pams_tasks for all using (
  exists (select 1 from pams_actions a join profiles p on p.auth_user_id = auth.uid()
    where a.id = pams_tasks.action_id
    and (p.role in ('admin','manager','officer') or p.company_id = a.factory_id))
) with check (
  exists (select 1 from pams_actions a join profiles p on p.auth_user_id = auth.uid()
    where a.id = pams_tasks.action_id
    and (p.role in ('admin','manager','officer') or p.company_id = a.factory_id))
);

alter table pams_assessment_item_results enable row level security;
create policy pams_assessment_item_results_scoped on pams_assessment_item_results for all using (
  exists (select 1 from pams_assessments a join profiles p on p.auth_user_id = auth.uid()
    where a.id = pams_assessment_item_results.assessment_id
    and (p.role in ('admin','manager','officer') or p.company_id = a.factory_id))
) with check (
  exists (select 1 from pams_assessments a join profiles p on p.auth_user_id = auth.uid()
    where a.id = pams_assessment_item_results.assessment_id
    and (p.role in ('admin','manager','officer') or p.company_id = a.factory_id))
);

-- pams_objectives/pams_sub_objectives denormalize no factory_id of their
-- own (per DOMAIN_MODEL.md) -- resolve scoping via helper functions
-- rather than repeating a 2-hop join inline in every policy.
create function pams_objective_factory_id(obj_id text) returns text as $$
  select g.factory_id from pams_objectives o join pams_goals g on g.id = o.goal_id where o.id = obj_id;
$$ language sql stable;

create function pams_sub_objective_factory_id(sub_id text) returns text as $$
  select pams_objective_factory_id(s.objective_id) from pams_sub_objectives s where s.id = sub_id;
$$ language sql stable;

alter table pams_objectives enable row level security;
create policy pams_objectives_scoped on pams_objectives for all using (
  exists (select 1 from pams_goals g join profiles p on p.auth_user_id = auth.uid()
    where g.id = pams_objectives.goal_id
    and (p.role in ('admin','manager','officer') or p.company_id = g.factory_id))
) with check (
  exists (select 1 from pams_goals g join profiles p on p.auth_user_id = auth.uid()
    where g.id = pams_objectives.goal_id
    and (p.role in ('admin','manager','officer') or p.company_id = g.factory_id))
);

alter table pams_sub_objectives enable row level security;
create policy pams_sub_objectives_scoped on pams_sub_objectives for all using (
  exists (select 1 from profiles p where p.auth_user_id = auth.uid()
    and (p.role in ('admin','manager','officer') or p.company_id = pams_objective_factory_id(pams_sub_objectives.objective_id)))
) with check (
  exists (select 1 from profiles p where p.auth_user_id = auth.uid()
    and (p.role in ('admin','manager','officer') or p.company_id = pams_objective_factory_id(pams_sub_objectives.objective_id)))
);

-- pams_target_summaries: internal computed cache, one hop from
-- pams_targets.factory_id -- scoped for read, write reserved to
-- admin/manager (matches its "system-computed" nature).
alter table pams_target_summaries enable row level security;
create policy pams_target_summaries_select on pams_target_summaries for select using (
  exists (select 1 from pams_targets t join profiles p on p.auth_user_id = auth.uid()
    where t.id = pams_target_summaries.target_id
    and (p.role in ('admin','manager','officer') or p.company_id = t.factory_id))
);
create policy pams_target_summaries_write on pams_target_summaries for insert with check (
  exists (select 1 from profiles p where p.auth_user_id = auth.uid() and p.role in ('admin','manager'))
);
create policy pams_target_summaries_update on pams_target_summaries for update using (
  exists (select 1 from profiles p where p.auth_user_id = auth.uid() and p.role in ('admin','manager'))
);

-- ---------------------------------------------------------------------
-- Org-wide catalogs / config: read for any authenticated non-anonymous
-- user, write restricted to admin/manager (today this is UI-only --
-- this closes a real gap).
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
    execute format('alter table %I enable row level security;', t);
    execute format(
      'create policy %I on %I for select using (exists (select 1 from profiles p where p.auth_user_id = auth.uid()));',
      t || '_read', t
    );
    execute format(
      'create policy %I on %I for all using ('
      || 'exists (select 1 from profiles p where p.auth_user_id = auth.uid() and p.role in (''admin'',''manager''))'
      || ') with check ('
      || 'exists (select 1 from profiles p where p.auth_user_id = auth.uid() and p.role in (''admin'',''manager''))'
      || ');',
      t || '_write', t
    );
  end loop;
end $$;

-- users: admin-only writes to role/company assignment; any authenticated
-- non-anonymous user can read (needed for name lookups/dropdowns
-- throughout the app, matches today's Firestore rules exactly).
alter table users enable row level security;
create policy users_select on users for select using (
  exists (select 1 from profiles p where p.auth_user_id = auth.uid())
);
create policy users_write_admin on users for all using (
  exists (select 1 from profiles p where p.auth_user_id = auth.uid() and p.role = 'admin')
) with check (
  exists (select 1 from profiles p where p.auth_user_id = auth.uid() and p.role = 'admin')
);

-- permissions/system_settings: singleton config rows, admin-only write
-- (today only an admin sees the Permission Matrix/Settings screen in the
-- UI, but nothing stopped a crafted request -- this closes that gap).
alter table permissions enable row level security;
create policy permissions_select on permissions for select using (
  exists (select 1 from profiles p where p.auth_user_id = auth.uid())
);
create policy permissions_write_admin on permissions for all using (
  exists (select 1 from profiles p where p.auth_user_id = auth.uid() and p.role = 'admin')
) with check (
  exists (select 1 from profiles p where p.auth_user_id = auth.uid() and p.role = 'admin')
);

alter table system_settings enable row level security;
create policy system_settings_select on system_settings for select using (
  exists (select 1 from profiles p where p.auth_user_id = auth.uid())
);
create policy system_settings_write_admin on system_settings for all using (
  exists (select 1 from profiles p where p.auth_user_id = auth.uid() and p.role = 'admin')
) with check (
  exists (select 1 from profiles p where p.auth_user_id = auth.uid() and p.role = 'admin')
);

-- ---------------------------------------------------------------------
-- Structural-integrity special cases (doubled up with the triggers in
-- the previous migration, for defense in depth).
-- ---------------------------------------------------------------------

-- pams_measurements: read is factory-scoped like any PAMS entity; UPDATE
-- only permitted while still unverified (trigger blocks the verified
-- case too); DELETE has no policy at all -> always denied.
alter table pams_measurements enable row level security;
create policy pams_measurements_select on pams_measurements for select using (
  exists (select 1 from profiles p where p.auth_user_id = auth.uid()
    and (p.role in ('admin','manager','officer') or p.company_id = pams_measurements.factory_id))
);
create policy pams_measurements_insert on pams_measurements for insert with check (
  exists (select 1 from profiles p where p.auth_user_id = auth.uid()
    and (p.role in ('admin','manager','officer') or p.company_id = pams_measurements.factory_id))
);
create policy pams_measurements_update on pams_measurements for update using (
  verification_status is distinct from 'Verified'
  and exists (select 1 from profiles p where p.auth_user_id = auth.uid()
    and (p.role in ('admin','manager','officer') or p.company_id = pams_measurements.factory_id))
) with check (verification_status is distinct from 'Verified');

-- pams_scores: any authenticated user may read (dashboards depend on
-- it); no INSERT/UPDATE/DELETE policy for the authenticated/anon roles
-- at all -- the only way to write is via the service-role key (which
-- bypasses RLS entirely), used exclusively by the server-side scoring
-- engine. This, plus the trigger, makes "system-write-only" real rather
-- than nominal.
alter table pams_scores enable row level security;
create policy pams_scores_select on pams_scores for select using (
  exists (select 1 from profiles p where p.auth_user_id = auth.uid())
);

-- pams_audit_logs: any authenticated user may append an entry (matches
-- today's client-side logAudit() calls); only admin/manager may read the
-- trail; no UPDATE/DELETE policy -> always denied (plus the trigger).
alter table pams_audit_logs enable row level security;
create policy pams_audit_logs_insert on pams_audit_logs for insert with check (
  exists (select 1 from profiles p where p.auth_user_id = auth.uid())
);
create policy pams_audit_logs_select on pams_audit_logs for select using (
  exists (select 1 from profiles p where p.auth_user_id = auth.uid() and p.role in ('admin','manager'))
);

-- attachments: no company/factory scoping today either (matches current
-- Firestore rules -- "authenticated, non-anonymous" is the whole check).
alter table attachments enable row level security;
create policy attachments_all on attachments for all using (
  exists (select 1 from profiles p where p.auth_user_id = auth.uid())
) with check (
  exists (select 1 from profiles p where p.auth_user_id = auth.uid())
);
