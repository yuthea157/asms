-- Legacy ASMS core: normalizes the 20 blob-array entity types that used to
-- live as JSON-stringified arrays inside 20 Firestore documents in the
-- `advisoryDeskShared` collection, into real one-row-per-record tables.
-- IDs are kept as the existing app-generated strings (e.g. "co_xxxxx"),
-- not switched to uuid, so every foreign key transforms mechanically
-- during ETL without an ID-remapping table.

create table companies (
  id text primary key,
  name text not null,
  type text,
  address text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table company_contacts (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  name text,
  position text,
  phone text,
  email text,
  sort_order int
);

create table advisory_info (
  id text primary key,
  company_id text references companies(id),
  cycle_number int,
  start_date date,
  end_date date,
  remark text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table visits (
  id text primary key,
  advisory_info_id text references advisory_info(id),
  visit_number int,
  visit_date date,
  start_time time,
  end_time time,
  log text,
  attachment_count int not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table assessment_plans (
  id text primary key,
  advisory_info_id text references advisory_info(id),
  audit_no text,
  previous_assessment_date date,
  plan_assessment_date date,
  audit_type text,
  status text,
  report_released_date date,
  current_nc int,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

-- NOTE: no `password` column at all -- plaintext passwords are never
-- migrated (see migration plan §Auth). `auth_user_id` is populated once
-- each real user completes the post-cutover password-reset flow.
create table users (
  id text primary key,
  name text,
  email text unique,
  role text check (role in ('admin','manager','officer','user')),
  auth_user_id uuid unique references auth.users(id),
  company_id text references companies(id),
  dashboard_id text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table caps (
  id text primary key,
  assessment_plan_id text references assessment_plans(id),
  nc_number text,
  area text,
  root_cause text,
  corrective_actions text,
  lead_person text,
  support_person text,
  target_date date,
  actual_date date,
  status text,
  progress int,
  recommendations text,
  finding_id text,        -- PAMS additive field, FK added once pams_findings exists
  recommendation_id text, -- PAMS additive field, FK added once pams_recommendations exists
  company_id text references companies(id),
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table meeting_logs (
  id text primary key,
  company_id text references companies(id),
  meeting_date date,
  log text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table meeting_participants (
  id bigserial primary key,
  meeting_log_id text not null references meeting_logs(id) on delete cascade,
  participant_name text
);

create table bipartite_committee (
  id text primary key,
  company_id text references companies(id),
  name text,
  sex text,
  date_joined date,
  committee_role text,
  company_role text,
  union_name text,
  phone text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

-- Singleton rows: hasPerm()/system settings read/write the whole blob at
-- once, no per-cell query pattern exists, so these stay jsonb rather than
-- being normalized into a role x module x action table.
create table permissions (
  id text primary key default 'singleton',
  role_module_matrix jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table system_settings (
  id text primary key default 'singleton',
  time_zone text,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table trainings (
  id text primary key,
  company_id text references companies(id),
  topic text,
  trainer text,
  training_date date,
  start_time time,
  end_time time,
  delivery_mode text,
  status text,
  location text,
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table training_participants (
  id bigserial primary key,
  training_id text not null references trainings(id) on delete cascade,
  participant_name text
);

create table grievances (
  id text primary key,
  company_id text references companies(id),
  date_reported date,
  category text,
  channel text,
  description text,
  reported_by text,
  status text,
  assigned_to text,
  resolution text,
  resolved_date date,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table policies (
  id text primary key,
  company_id text references companies(id),
  code text,
  name text,
  version text,
  released_date date,
  type text,
  remark text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table licenses (
  id text primary key,
  company_id text references companies(id),
  doc_no text,
  name text,
  issued_by text,
  issue_date date,
  expired_date date,
  status text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table audit_checklists (
  id text primary key,
  question_no text,
  question text,
  category text,
  legal_reference text,
  audit_type text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table audit_guidance (
  id text primary key,
  checklist_id text references audit_checklists(id),
  audit_guidance text,
  nc_criteria text,
  root_causes text,
  recommendation text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table audit_tool (
  id text primary key,
  company_id text references companies(id),
  audit_date date,
  audit_type text,
  status text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table audit_tool_questions (
  id bigserial primary key,
  audit_tool_id text not null references audit_tool(id) on delete cascade,
  question_id text,
  question_no text,
  question text,
  category text,
  legal_reference text,
  audit_type text,
  status text check (status in ('NC','C','N/A')),
  findings text,
  rating text
);

create table self_assessments (
  id text primary key,
  company_id text references companies(id),
  assigned_date date,
  due_date date,
  status text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table self_assessment_questions (
  id bigserial primary key,
  self_assessment_id text not null references self_assessments(id) on delete cascade,
  question_id text,
  question_no text,
  question text,
  category text,
  answer text,
  remark text
);

create table risk_assessments (
  id text primary key,
  company_id text references companies(id),
  risk_no text,
  risk_date date,
  area text,
  category text,
  hazard text,
  description text,
  likelihood int check (likelihood between 1 and 5),
  severity int check (severity between 1 and 5),
  existing_controls text,
  recommended_actions text,
  assigned_to text,
  target_date date,
  actual_completion_date date,
  status text,
  objective_id text,  -- PAMS additive field, FK added once pams_objectives exists
  target_id text,     -- PAMS additive field, FK added once pams_targets exists
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table custom_dashboards (
  id text primary key,
  name text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table custom_dashboard_widgets (
  id bigserial primary key,
  dashboard_id text not null references custom_dashboards(id) on delete cascade,
  widget_type text,
  sort_order int
);

alter table users add constraint users_dashboard_id_fkey
  foreign key (dashboard_id) references custom_dashboards(id);

-- Replaces both base64-in-Firestore blobs: attachments:{visitId} and
-- attachments:{auditToolQuestionId}. storage_path points into the
-- Supabase Storage `legacy-attachments` bucket.
create table attachments (
  id text primary key,
  parent_type text not null check (parent_type in ('visit','audit_tool_question')),
  parent_id text not null,
  file_name text,
  storage_path text not null,
  mime_type text,
  size_bytes int,
  created_at timestamptz not null default now()
);

create index on attachments(parent_type, parent_id);

-- Generic updated_at bump trigger, reused by every business table below
-- and by the PAMS migration that follows.
create function bump_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_companies_updated_at before update on companies for each row execute function bump_updated_at();
create trigger trg_advisory_info_updated_at before update on advisory_info for each row execute function bump_updated_at();
create trigger trg_visits_updated_at before update on visits for each row execute function bump_updated_at();
create trigger trg_assessment_plans_updated_at before update on assessment_plans for each row execute function bump_updated_at();
create trigger trg_users_updated_at before update on users for each row execute function bump_updated_at();
create trigger trg_caps_updated_at before update on caps for each row execute function bump_updated_at();
create trigger trg_meeting_logs_updated_at before update on meeting_logs for each row execute function bump_updated_at();
create trigger trg_bipartite_committee_updated_at before update on bipartite_committee for each row execute function bump_updated_at();
create trigger trg_permissions_updated_at before update on permissions for each row execute function bump_updated_at();
create trigger trg_system_settings_updated_at before update on system_settings for each row execute function bump_updated_at();
create trigger trg_trainings_updated_at before update on trainings for each row execute function bump_updated_at();
create trigger trg_grievances_updated_at before update on grievances for each row execute function bump_updated_at();
create trigger trg_policies_updated_at before update on policies for each row execute function bump_updated_at();
create trigger trg_licenses_updated_at before update on licenses for each row execute function bump_updated_at();
create trigger trg_audit_checklists_updated_at before update on audit_checklists for each row execute function bump_updated_at();
create trigger trg_audit_guidance_updated_at before update on audit_guidance for each row execute function bump_updated_at();
create trigger trg_audit_tool_updated_at before update on audit_tool for each row execute function bump_updated_at();
create trigger trg_self_assessments_updated_at before update on self_assessments for each row execute function bump_updated_at();
create trigger trg_risk_assessments_updated_at before update on risk_assessments for each row execute function bump_updated_at();
create trigger trg_custom_dashboards_updated_at before update on custom_dashboards for each row execute function bump_updated_at();
