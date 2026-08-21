-- Ports all 21 composite indexes from firestore.indexes.json 1:1 as
-- Postgres B-tree indexes (same field pairs/order the app's real query
-- patterns already rely on).

create index on pams_actions(target_id, created_at);
create index on pams_actions(factory_id, due_date);
create index on pams_advisory_visits(factory_id, visit_date desc);
create index on pams_assessment_items(category_id, sort_order);
create index on pams_assessments(factory_id, assessment_date desc);
create index on pams_findings(factory_id, created_at desc);
create index on pams_findings(source_type, source_id);
create index on pams_goals(project_id, created_at);
create index on pams_issues(factory_id, created_at desc);
create index on pams_measurements(target_id, period desc);
create index on pams_measurements(kpi_link_id, period);
create index on pams_objectives(goal_id, created_at);
create index on pams_projects(factory_id, created_at desc);
create index on pams_rating_levels(rating_scale_id, sort_order);
create index on pams_sub_objectives(objective_id, created_at);
create index on pams_targets(parent_type, parent_id, created_at);
create index on pams_tasks(action_id, sort_order);
create index on pams_notifications(factory_id, created_at desc);

-- Single-column indexes on FK/scoping columns not already covered by a
-- composite index above or by a PK -- added opportunistically for the
-- known query patterns from the app code (App.jsx/pamsStore.js), not an
-- exhaustive guess.
create index on company_contacts(company_id);
create index on advisory_info(company_id);
create index on visits(advisory_info_id);
create index on assessment_plans(advisory_info_id);
create index on caps(assessment_plan_id);
create index on caps(company_id);
create index on meeting_logs(company_id);
create index on bipartite_committee(company_id);
create index on trainings(company_id);
create index on grievances(company_id);
create index on policies(company_id);
create index on licenses(company_id);
create index on audit_guidance(checklist_id);
create index on audit_tool(company_id);
create index on audit_tool_questions(audit_tool_id);
create index on self_assessments(company_id);
create index on self_assessment_questions(self_assessment_id);
create index on risk_assessments(company_id);
create index on users(company_id);
create index on pams_factory_profiles(factory_group_id);
create index on pams_departments(factory_id);
create index on pams_projects(program_id);
create index on pams_kpi_links(target_id);
create index on pams_kpi_links(kpi_id);
create index on pams_recommendations(finding_id);
create index on pams_recommendations(cap_id);
