-- PAMS module: 33 live Firestore collections (per docs/pams/DOMAIN_MODEL.md),
-- ported near-1:1 since PAMS already used one-document-per-record.
-- pams_status_lists, pams_risk_levels, pams_priority_levels,
-- pams_review_periods, pams_programs are documented in DOMAIN_MODEL.md
-- but not yet built in any actual code -- intentionally NOT created here
-- to avoid drift against an undesigned schema.

create table pams_factory_groups (
  id text primary key,
  name text,
  parent_organization text,
  member_factory_ids text[],
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table pams_industry_profiles (
  id text primary key,
  industry_type text,
  default_assessment_category_ids text[],
  default_kpi_ids text[],
  default_department_names text[],
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

-- PK = the existing companies.id (1:1 satellite, per DOMAIN_MODEL.md §1)
create table pams_factory_profiles (
  factory_id text primary key references companies(id),
  industry_type text check (industry_type in ('Garment','Footwear','TravelGoods','Textile','Other')),
  industry_profile_id text references pams_industry_profiles(id),
  legal_name text, brand text, ownership text, parent_company_group text,
  country text, province text, district text,
  general_manager_name text, hr_manager_name text, compliance_manager_name text, production_manager_name text,
  worker_count_total int, worker_count_male int, worker_count_female int,
  production_line_count int, production_capacity text, main_products text, main_export_markets text,
  working_hours text, shift_structure text,
  factory_status text check (factory_status in ('Active','Inactive','Exited')),
  program_enrollment_date date, program_exit_date date,
  advisory_status text, risk_classification text,
  factory_group_id text references pams_factory_groups(id),
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table pams_departments (
  id text primary key,
  factory_id text references companies(id),
  name text,
  code text,
  is_system_default boolean not null default false,
  created_by text,
  created_at timestamptz not null default now()
);

create table pams_projects (
  id text primary key,
  code text, name text, project_type text,
  factory_id text references companies(id),
  program_id text,       -- pams_programs not built yet; left as a plain column
  advisory_info_id text references advisory_info(id),
  client_or_donor text,
  project_manager_user_id text references users(id),
  advisor_user_ids text[],
  start_date date, end_date date, budget numeric, status text, priority text,
  description text, expected_outcomes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table pams_scoring_rule_versions (
  id text primary key,
  version_label text, effective_from date, effective_to date,
  achievement_cap_enabled boolean, achievement_cap_value numeric,
  baseline_to_target_formula_enabled boolean, weighting_rules jsonb, is_active boolean,
  created_by text,
  created_at timestamptz not null default now()
);

-- system-write-only: only the server-side scoring engine may insert;
-- no client update/delete ever (trigger + RLS, see rls migration)
create table pams_scores (
  id text primary key,
  entity_type text, entity_id text not null, factory_id text references companies(id),
  period text, scoring_rule_version_id text references pams_scoring_rule_versions(id),
  baseline numeric, target numeric, actual numeric, weight numeric,
  achievement_pct numeric, score numeric,
  rating_level_id text,  -- FK added below once pams_rating_levels exists
  rag_status text,
  calculation_trace jsonb, calculated_at timestamptz, calculated_by text
);

create index on pams_scores(entity_type, entity_id);

create table pams_goals (
  id text primary key,
  code text, factory_id text references companies(id), project_id text references pams_projects(id),
  title text, description text, strategic_area text, baseline text, expected_outcome text, weight numeric,
  start_date date, end_date date, owner_user_id text references users(id), status text,
  current_achievement numeric, score_id text references pams_scores(id),
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table pams_objectives (
  id text primary key,
  goal_id text references pams_goals(id), code text, title text, description text,
  owner_user_id text references users(id), baseline text, target text, weight numeric,
  start_date date, end_date date, status text, progress numeric, score_id text references pams_scores(id),
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

-- self-referential, arbitrary depth (objective_id denormalized onto every
-- depth per DOMAIN_MODEL.md, for flat "all sub-objectives under this
-- objective" queries without a recursive fetch)
create table pams_sub_objectives (
  id text primary key,
  objective_id text not null references pams_objectives(id),
  parent_sub_objective_id text references pams_sub_objectives(id),
  code text, title text, description text, owner_user_id text references users(id),
  baseline text, target text, weight numeric, start_date date, end_date date,
  status text, progress numeric, score_id text references pams_scores(id),
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table pams_targets (
  id text primary key,
  parent_type text check (parent_type in ('objective','subObjective')), parent_id text not null,
  objective_id text references pams_objectives(id),
  factory_id text references companies(id), project_id text references pams_projects(id),
  code text, title text, description text,
  target_type text, unit text, direction text,
  baseline numeric, target_value numeric, range_min numeric, range_max numeric,
  weight numeric, start_date date, end_date date, owner_user_id text references users(id), status text,
  latest_summary jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table pams_kpis (
  id text primary key,
  code text, name text, definition text, category text, unit text,
  formula_id text,  -- FK added below once pams_kpi_formulas exists
  data_source text, measurement_frequency text,
  direction text, verification_method text, is_system_default boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table pams_kpi_formulas (
  id text primary key,
  kpi_id text references pams_kpis(id), expression text, variables jsonb,
  created_by text,
  created_at timestamptz not null default now()
);

alter table pams_kpis add constraint pams_kpis_formula_id_fkey
  foreign key (formula_id) references pams_kpi_formulas(id);

create table pams_kpi_links (
  id text primary key,
  kpi_id text references pams_kpis(id), target_id text references pams_targets(id),
  factory_id text references companies(id), baseline numeric, target_value numeric, weight numeric,
  created_by text,
  created_at timestamptz not null default now()
);

-- append-only: UPDATE blocked once verified, DELETE always blocked
-- (trigger, see triggers migration)
create table pams_measurements (
  id text primary key,
  kpi_link_id text references pams_kpi_links(id), target_id text references pams_targets(id),
  factory_id text references companies(id), period text,
  planned_value numeric, actual_value numeric, achievement_pct numeric, score_id text references pams_scores(id),
  comment text, submitted_by text references users(id), submitted_at timestamptz,
  verification_status text check (verification_status in ('Submitted','UnderReview','Returned','Resubmitted','Verified')),
  verified_by text references users(id), verified_at timestamptz,
  supersedes_measurement_id text references pams_measurements(id)
);

create table pams_actions (
  id text primary key,
  target_id text references pams_targets(id), factory_id text references companies(id),
  code text, title text, description text, responsible_department_id text references pams_departments(id),
  responsible_user_id text references users(id), supporting_user_id text references users(id),
  start_date date, due_date date, priority text, status text, progress_pct numeric,
  expected_result text, actual_result text, evidence_required boolean,
  budget numeric, risk_note text, depends_on_action_id text references pams_actions(id), remarks text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table pams_tasks (
  id text primary key,
  action_id text references pams_actions(id), title text, description text,
  assigned_to_user_id text references users(id), start_date date, due_date date,
  status text, progress_pct numeric, sort_order int,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

-- polymorphic (entity_type/entity_id covering 9 different parent kinds) --
-- kept as one table matching existing code; entity_id can't be a real FK
-- since it targets 9 different tables, so orphan prevention stays
-- app-enforced, same tradeoff as today's Firestore rules.
create table pams_evidence (
  id text primary key,
  entity_type text check (entity_type in ('Assessment','Goal','Objective','Target','Measurement','Action','Finding','Recommendation','CorrectiveActionPlan')),
  entity_id text not null, factory_id text references companies(id),
  title text, document_type text, period text,
  storage_path text, download_url text, mime_type text, size_bytes int,
  uploaded_by text references users(id), uploaded_at timestamptz,
  verification_status text check (verification_status in ('Submitted','UnderReview','Verified','Returned')),
  verified_by text references users(id), verified_at timestamptz, reviewer_comment text
);

create index on pams_evidence(entity_type, entity_id);

create table pams_advisory_visits (
  id text primary key,
  factory_id text references companies(id), project_id text references pams_projects(id),
  advisor_user_id text references users(id), visit_date date,
  visit_type text check (visit_type in ('InitialAssessment','RoutineAdvisory','TechnicalAssistance','FollowUp','Verification','FinalAssessment','EmergencyAdvisory')),
  purpose text,
  participants jsonb,       -- [{name, role}], small bounded array
  areas_reviewed text[], findings_summary text, recommendations_summary text,
  follow_up_date date, report_evidence_id text references pams_evidence(id), status text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table pams_findings (
  id text primary key,
  factory_id text references companies(id),
  source_type text check (source_type in ('AdvisoryVisit','Assessment','AuditTool')), source_id text not null,
  source_question_id text,
  department_id text references pams_departments(id), category text, description text,
  evidence_ids text[], root_cause text,
  severity text check (severity in ('Critical','High','Medium','Low','Observation')),
  recommendation_ids text[], responsible_user_id text references users(id), due_date date, status text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table pams_recommendations (
  id text primary key,
  finding_id text references pams_findings(id), factory_id text references companies(id),
  recommendation text, rationale text, expected_result text, responsible_user_id text references users(id),
  due_date date, priority text,
  status text check (status in ('Open','Accepted','InProgress','Implemented','PartiallyImplemented','Rejected','Closed')),
  implementation_pct numeric, evidence_ids text[], verification_note text,
  cap_id text references caps(id),
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

-- Now that pams_findings/pams_recommendations exist, complete the two
-- additive FKs on the legacy caps table (DOMAIN_MODEL.md §6).
alter table caps add constraint caps_finding_id_fkey foreign key (finding_id) references pams_findings(id);
alter table caps add constraint caps_recommendation_id_fkey foreign key (recommendation_id) references pams_recommendations(id);

create table pams_issues (
  id text primary key,
  factory_id text references companies(id), department_id text references pams_departments(id),
  related_objective_id text references pams_objectives(id), title text, description text,
  severity text, owner_user_id text references users(id), root_cause text, corrective_action text,
  due_date date, status text, resolution text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table pams_rating_scales (
  id text primary key,
  name text, description text,
  created_by text,
  created_at timestamptz not null default now()
);

create table pams_rating_levels (
  id text primary key,
  rating_scale_id text references pams_rating_scales(id),
  name text, min_score numeric, max_score numeric, description text, rag_status text,
  recommended_response text, sort_order int
);

alter table pams_scores add constraint pams_scores_rating_level_id_fkey
  foreign key (rating_level_id) references pams_rating_levels(id);

create table pams_rag_rules (
  id text primary key,
  name text, green_threshold numeric, amber_threshold numeric, red_threshold numeric,
  applies_to_entity_type text, is_default boolean not null default false,
  created_by text,
  created_at timestamptz not null default now()
);

create table pams_custom_fields (
  id text primary key,
  entity_type text, field_key text, label text, field_type text, options jsonb, is_required boolean,
  created_by text,
  created_at timestamptz not null default now()
);

create table pams_custom_field_values (
  id text primary key,
  entity_type text, entity_id text, field_key text, value jsonb
);

create index on pams_custom_field_values(entity_type, entity_id);
create index on pams_custom_field_values(entity_type, entity_id, field_key);

create table pams_assessment_categories (
  id text primary key,
  name text, description text, weight numeric, sort_order int, is_system_default boolean not null default false,
  created_by text,
  created_at timestamptz not null default now()
);

create table pams_assessment_items (
  id text primary key,
  category_id text references pams_assessment_categories(id), text text, sort_order int
);

create table pams_assessments (
  id text primary key,
  factory_id text references companies(id), project_id text references pams_projects(id),
  assessment_type text check (assessment_type in ('Baseline','Interim','Final')),
  assessment_date date, conducted_by_user_id text references users(id),
  status text check (status in ('Draft','Submitted','Reviewed')),
  overall_score numeric, overall_rating_level_id text references pams_rating_levels(id),
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

-- normalizes assessments.itemResults[] (embedded array in Firestore,
-- size-bounded ~150 by the fixed category/item catalog size)
create table pams_assessment_item_results (
  id bigserial primary key,
  assessment_id text not null references pams_assessments(id) on delete cascade,
  item_id text references pams_assessment_items(id), category_id text references pams_assessment_categories(id),
  score numeric, rating_level_id text references pams_rating_levels(id), evidence_ids text[],
  observation text, finding text, risk text, recommended_action text,
  finding_id text references pams_findings(id)
);

create table pams_notifications (
  id text primary key,
  factory_id text references companies(id), type text, message text,
  entity_type text, entity_id text, read boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

-- append-only (trigger, see triggers migration)
create table pams_audit_logs (
  id bigserial primary key,
  user_id text references users(id), "timestamp" timestamptz,
  action text, entity_type text, entity_id text, old_value jsonb, new_value jsonb, reason text
);

create table pams_factory_summaries (
  id text primary key,
  factory_id text references companies(id), payload jsonb, computed_at timestamptz
);

create table pams_target_summaries (
  id text primary key,
  target_id text references pams_targets(id), payload jsonb, computed_at timestamptz
);

-- Now that pams_objectives/pams_targets exist, complete the two additive
-- FKs on the legacy risk_assessments table (DOMAIN_MODEL.md §6).
alter table risk_assessments add constraint risk_assessments_objective_id_fkey foreign key (objective_id) references pams_objectives(id);
alter table risk_assessments add constraint risk_assessments_target_id_fkey foreign key (target_id) references pams_targets(id);

-- updated_at bump triggers for every PAMS table carrying updated_at
create trigger trg_pams_factory_groups_updated_at before update on pams_factory_groups for each row execute function bump_updated_at();
create trigger trg_pams_industry_profiles_updated_at before update on pams_industry_profiles for each row execute function bump_updated_at();
create trigger trg_pams_factory_profiles_updated_at before update on pams_factory_profiles for each row execute function bump_updated_at();
create trigger trg_pams_projects_updated_at before update on pams_projects for each row execute function bump_updated_at();
create trigger trg_pams_goals_updated_at before update on pams_goals for each row execute function bump_updated_at();
create trigger trg_pams_objectives_updated_at before update on pams_objectives for each row execute function bump_updated_at();
create trigger trg_pams_sub_objectives_updated_at before update on pams_sub_objectives for each row execute function bump_updated_at();
create trigger trg_pams_targets_updated_at before update on pams_targets for each row execute function bump_updated_at();
create trigger trg_pams_kpis_updated_at before update on pams_kpis for each row execute function bump_updated_at();
create trigger trg_pams_actions_updated_at before update on pams_actions for each row execute function bump_updated_at();
create trigger trg_pams_tasks_updated_at before update on pams_tasks for each row execute function bump_updated_at();
create trigger trg_pams_advisory_visits_updated_at before update on pams_advisory_visits for each row execute function bump_updated_at();
create trigger trg_pams_findings_updated_at before update on pams_findings for each row execute function bump_updated_at();
create trigger trg_pams_recommendations_updated_at before update on pams_recommendations for each row execute function bump_updated_at();
create trigger trg_pams_issues_updated_at before update on pams_issues for each row execute function bump_updated_at();
create trigger trg_pams_assessments_updated_at before update on pams_assessments for each row execute function bump_updated_at();
create trigger trg_pams_notifications_updated_at before update on pams_notifications for each row execute function bump_updated_at();
