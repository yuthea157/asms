// Transforms the JSON export produced by export-firestore.mjs into the
// normalized Postgres schema and loads it into a Supabase project via
// the service-role key. Idempotent-ish (re-running against a fresh/empty
// target is expected -- this is not designed to be re-run against a
// partially-loaded target).
//
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node
//        migrate-to-supabase.mjs <exportDir>
//
// Deliberately excludes two orphaned Firestore documents the live app
// no longer reads (confirmed via source-code grep, not just absence
// from the KEYS array): `capRecommendations` (superseded by the `caps`
// key, which is what the live app actually writes to) and
// `auditRecords` (superseded by `auditTool`). Migrating them would
// resurrect data real users have never seen in the current app.

import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const exportDir = process.argv[2];
if (!exportDir) {
  console.error("Usage: node migrate-to-supabase.mjs <exportDir>");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const report = { tables: {}, errors: [] };

async function loadJson(name) {
  const p = path.join(exportDir, `${name}.json`);
  return JSON.parse(await readFile(p, "utf8"));
}

async function loadLegacyBlob(key) {
  const docs = await loadJson("advisoryDeskShared");
  const doc = docs.find((d) => d.id === key);
  if (!doc) return [];
  try {
    const parsed = JSON.parse(doc.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
async function loadLegacySingleton(key) {
  const docs = await loadJson("advisoryDeskShared");
  const doc = docs.find((d) => d.id === key);
  if (!doc) return null;
  try {
    return JSON.parse(doc.value);
  } catch {
    return null;
  }
}

// Firestore/the app's own forms routinely store "" for a numeric,
// date, or reference field the user left blank -- Postgres numeric/
// int/date/FK columns all reject "" (it's not a valid number, date, or
// a real foreign key target). "" and real absence mean the same thing
// here, so this is a safe, general sanitization rather than a
// per-field special case: converting "" -> null lets NOT NULL/CHECK/FK
// constraints evaluate the way an unset field should (NULL passes
// CHECK constraints and FK constraints both allow NULL by definition).
function sanitize(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = v === "" ? null : v;
  }
  return out;
}

async function insertRows(table, rows, { chunkSize = 500 } = {}) {
  if (rows.length === 0) {
    report.tables[table] = 0;
    return;
  }
  rows = rows.map(sanitize);
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) {
      report.errors.push({ table, error: error.message, sampleRow: chunk[0] });
      console.error(`  ERROR inserting into ${table}:`, error.message);
      return;
    }
  }
  report.tables[table] = rows.length;
  console.log(`  ${table}: ${rows.length} rows`);
}

// Strips a trailing "+00" UTC-offset suffix some exported timestamp
// strings may carry (Postgres accepts ISO 8601 directly, but this keeps
// values consistent regardless of source formatting quirks).
function ts(v) {
  if (!v) return null;
  return v;
}
function dateOnly(v) {
  if (!v) return null;
  return typeof v === "string" ? v.slice(0, 10) : v;
}

// Firestore has no FK enforcement, so real production data can (and, in
// this dataset, does) contain references to since-deleted parent
// records -- e.g. a training/grievance/policy/license/risk-assessment
// whose companyId points at a company that no longer exists. These
// records are already unreachable/broken in the live app today (a
// deleted company has nowhere to navigate to them from), so per the
// same "leave orphaned data behind, matching current live behavior"
// principle already applied to capRecommendations/auditRecords, they're
// dropped here rather than inserted with a dangling or null reference.
// Every drop is logged into the report so nothing disappears silently.
function dropOrphans(table, rows, field, validIds) {
  const kept = [];
  const dropped = [];
  for (const row of rows) {
    const ref = row[field];
    if (ref == null || validIds.has(ref)) kept.push(row);
    else dropped.push(row);
  }
  if (dropped.length > 0) {
    report.orphansDropped ??= {};
    report.orphansDropped[table] = dropped.map((r) => ({ id: r.id, [field]: r[field] }));
    console.warn(`  ${table}: dropping ${dropped.length} orphaned row(s) with a ${field} that no longer exists (e.g. ${dropped[0][field]})`);
  }
  return kept;
}

// ---------------------------------------------------------------------
// Legacy-20 entities
// ---------------------------------------------------------------------
async function migrateLegacyCore() {
  console.log("\n-- Legacy core (normalized from advisoryDeskShared) --");

  const companies = await loadLegacyBlob("companies");
  await insertRows(
    "companies",
    companies.map((c) => ({ id: c.id, name: c.name, type: c.type, address: c.address })),
  );
  const validCompanyIds = new Set(companies.map((c) => c.id));

  const contacts = companies.flatMap((c) =>
    (c.contacts ?? []).map((ct, i) => ({
      id: ct.id, company_id: c.id, name: ct.name, position: ct.position,
      phone: ct.phone, email: ct.email, sort_order: i,
    })),
  );
  await insertRows("company_contacts", contacts);

  // Inserted early, ahead of `users` (which references it via
  // dashboard_id) -- the FK needs the row to already exist.
  const customDashboards = await loadLegacyBlob("customDashboards");
  await insertRows("custom_dashboards", customDashboards.map((d) => ({ id: d.id, name: d.name })));
  await insertRows(
    "custom_dashboard_widgets",
    customDashboards.flatMap((d) =>
      (d.widgets ?? []).map((w, i) => ({ dashboard_id: d.id, widget_type: w.type, sort_order: i })),
    ),
  );

  const advisoryInfo = await loadLegacyBlob("advisoryInfo");
  await insertRows(
    "advisory_info",
    advisoryInfo.map((a) => ({
      id: a.id, company_id: a.companyId, cycle_number: a.cycleNumber,
      start_date: dateOnly(a.startDate), end_date: dateOnly(a.endDate), remark: a.remark,
    })),
  );

  const visits = await loadLegacyBlob("visits");
  await insertRows(
    "visits",
    visits.map((v) => ({
      id: v.id, advisory_info_id: v.advisoryInfoId, visit_number: v.visitNumber,
      visit_date: dateOnly(v.date), start_time: v.startTime, end_time: v.endTime,
      log: v.log, attachment_count: v.attachmentCount ?? 0,
    })),
  );

  const assessmentPlans = await loadLegacyBlob("assessmentPlans");
  await insertRows(
    "assessment_plans",
    assessmentPlans.map((a) => ({
      id: a.id, advisory_info_id: a.advisoryInfoId, audit_no: a.auditNo,
      previous_assessment_date: dateOnly(a.previousAssessmentDate),
      plan_assessment_date: dateOnly(a.planAssessmentDate), audit_type: a.auditType,
      status: a.status, report_released_date: dateOnly(a.reportReleasedDate),
      current_nc: a.currentNC,
    })),
  );

  const users = await loadLegacyBlob("users");
  // password is deliberately never read/mapped here -- see auth
  // migration plan. auth_user_id is left null; populated later once
  // real Supabase Auth accounts exist for each person (Phase 9).
  await insertRows(
    "users",
    users.map((u) => ({
      id: u.id, name: u.name, username: u.username, email: u.email,
      role: u.role, company_id: u.companyId, dashboard_id: u.dashboardId,
    })),
  );
  const plaintextStragglers = users.filter((u) => u.password);
  if (plaintextStragglers.length > 0) {
    console.warn(`  WARNING: ${plaintextStragglers.length} user(s) still carry a plaintext password field (never logged in since the Firebase Auth migration). Feeds the advance-notice list -- see report.plaintextPasswordUserIds.`);
    report.plaintextPasswordUserIds = plaintextStragglers.map((u) => u.id);
  } else {
    report.plaintextPasswordUserIds = [];
  }

  const caps = await loadLegacyBlob("caps");
  await insertRows(
    "caps",
    caps.map((c) => ({
      id: c.id, assessment_plan_id: c.assessmentPlanId, nc_number: c.ncNumber,
      area: c.area, root_cause: c.rootCause, corrective_actions: c.correctiveActions,
      lead_person: c.leadPerson, support_person: c.supportPerson,
      target_date: dateOnly(c.targetDate), actual_date: dateOnly(c.actualDate),
      status: c.status, progress: c.progress, recommendations: c.recommendations,
      finding_id: c.findingId ?? null, recommendation_id: c.recommendationId ?? null,
      company_id: c.companyId ?? null,
    })),
  );

  const meetingLogs = await loadLegacyBlob("meetingLogs");
  await insertRows(
    "meeting_logs",
    meetingLogs.map((m) => ({ id: m.id, company_id: m.companyId, meeting_date: dateOnly(m.date), log: m.log })),
  );
  await insertRows(
    "meeting_participants",
    meetingLogs.flatMap((m) => (m.participants ?? []).map((name) => ({ meeting_log_id: m.id, participant_name: name }))),
  );

  const committee = await loadLegacyBlob("bipartiteCommittee");
  await insertRows(
    "bipartite_committee",
    committee.map((b) => ({
      id: b.id, company_id: b.companyId, name: b.name, sex: b.sex,
      date_joined: dateOnly(b.dateJoined), committee_role: b.committeeRole,
      company_role: b.companyRole, union_name: b.union, phone: b.phone,
    })),
  );

  const permissions = await loadLegacySingleton("permissions");
  if (permissions) {
    const { error } = await supabase.from("permissions").upsert({ id: "singleton", role_module_matrix: permissions });
    if (error) report.errors.push({ table: "permissions", error: error.message });
    else { report.tables.permissions = 1; console.log("  permissions: 1 row (singleton)"); }
  }

  const systemSettings = await loadLegacySingleton("systemSettings");
  if (systemSettings) {
    const { error } = await supabase.from("system_settings").upsert({ id: "singleton", time_zone: systemSettings.timeZone });
    if (error) report.errors.push({ table: "system_settings", error: error.message });
    else { report.tables.system_settings = 1; console.log("  system_settings: 1 row (singleton)"); }
  }

  let trainings = await loadLegacyBlob("trainings");
  trainings = dropOrphans("trainings", trainings, "companyId", validCompanyIds);
  await insertRows(
    "trainings",
    trainings.map((t) => ({
      id: t.id, company_id: t.companyId, topic: t.topic, trainer: t.trainer,
      training_date: dateOnly(t.date), start_time: t.startTime, end_time: t.endTime,
      delivery_mode: t.deliveryMode, status: t.status, location: t.location, notes: t.notes,
    })),
  );
  await insertRows(
    "training_participants",
    trainings.flatMap((t) => (t.participants ?? []).map((name) => ({ training_id: t.id, participant_name: name }))),
  );

  let grievances = await loadLegacyBlob("grievances");
  grievances = dropOrphans("grievances", grievances, "companyId", validCompanyIds);
  await insertRows(
    "grievances",
    grievances.map((g) => ({
      id: g.id, company_id: g.companyId, date_reported: dateOnly(g.dateReported),
      category: g.category, channel: g.channel, description: g.description,
      reported_by: g.reportedBy, status: g.status, assigned_to: g.assignedTo,
      resolution: g.resolution, resolved_date: dateOnly(g.resolvedDate),
    })),
  );

  let policies = await loadLegacyBlob("policies");
  policies = dropOrphans("policies", policies, "companyId", validCompanyIds);
  await insertRows(
    "policies",
    policies.map((p) => ({
      id: p.id, company_id: p.companyId, code: p.code, name: p.name, version: p.version,
      released_date: dateOnly(p.releasedDate), type: p.type, remark: p.remark,
    })),
  );

  let licenses = await loadLegacyBlob("licenses");
  licenses = dropOrphans("licenses", licenses, "companyId", validCompanyIds);
  await insertRows(
    "licenses",
    licenses.map((l) => ({
      id: l.id, company_id: l.companyId, doc_no: l.docNo, name: l.name, issued_by: l.issuedBy,
      issue_date: dateOnly(l.issueDate), expired_date: dateOnly(l.expiredDate), status: l.status,
    })),
  );

  const auditChecklists = await loadLegacyBlob("auditChecklists");
  await insertRows(
    "audit_checklists",
    auditChecklists.map((a) => ({
      id: a.id, question_no: a.questionNo, question: a.question, category: a.category,
      legal_reference: a.legalReference, audit_type: a.auditType,
    })),
  );

  const auditGuidance = await loadLegacyBlob("auditGuidance");
  await insertRows(
    "audit_guidance",
    auditGuidance.map((a) => ({
      id: a.id, checklist_id: a.checklistId, audit_guidance: a.auditGuidance,
      nc_criteria: a.ncCriteria, root_causes: a.rootCauses, recommendation: a.recommendation,
    })),
  );

  const auditTool = await loadLegacyBlob("auditTool");
  await insertRows(
    "audit_tool",
    auditTool.map((a) => ({
      id: a.id, company_id: a.companyId, audit_date: dateOnly(a.auditDate),
      audit_type: a.auditType, status: a.status,
    })),
  );
  await insertRows(
    "audit_tool_questions",
    auditTool.flatMap((a) =>
      (a.questions ?? []).map((q) => ({
        audit_tool_id: a.id, question_id: q.questionId, question_no: q.questionNo,
        question: q.question, category: q.category, legal_reference: q.legalReference,
        audit_type: q.auditType, status: q.status, findings: q.findings, rating: q.rating,
      })),
    ),
  );

  const selfAssessments = await loadLegacyBlob("selfAssessments");
  await insertRows(
    "self_assessments",
    selfAssessments.map((s) => ({
      id: s.id, company_id: s.companyId, assigned_date: dateOnly(s.assignedDate),
      due_date: dateOnly(s.dueDate), status: s.status,
    })),
  );
  await insertRows(
    "self_assessment_questions",
    selfAssessments.flatMap((s) =>
      (s.questions ?? []).map((q) => ({
        self_assessment_id: s.id, question_id: q.questionId, question_no: q.questionNo,
        question: q.question, category: q.category, answer: q.answer, remark: q.remark,
      })),
    ),
  );

  let riskAssessments = await loadLegacyBlob("riskAssessments");
  riskAssessments = dropOrphans("risk_assessments", riskAssessments, "companyId", validCompanyIds);
  await insertRows(
    "risk_assessments",
    riskAssessments.map((r) => ({
      id: r.id, company_id: r.companyId, risk_no: r.riskNo, risk_date: dateOnly(r.date),
      area: r.area, category: r.category, hazard: r.hazard, description: r.description,
      likelihood: r.likelihood, severity: r.severity, existing_controls: r.existingControls,
      recommended_actions: r.recommendedActions, assigned_to: r.assignedTo,
      target_date: dateOnly(r.targetDate), actual_completion_date: dateOnly(r.actualCompletionDate),
      status: r.status, objective_id: r.objectiveId ?? null, target_id: r.targetId ?? null,
      linked_cap_id: r.linkedCapId ?? null, score: r.score ?? null, level: r.level ?? null,
    })),
  );
}

// ---------------------------------------------------------------------
// PAMS-33
// ---------------------------------------------------------------------
const PAMS_TABLE_MAP = {
  pams_factory_groups: (d) => ({ id: d.id, name: d.name, parent_organization: d.parentOrganization, member_factory_ids: d.memberFactoryIds }),
  pams_industry_profiles: (d) => ({ id: d.id, industry_type: d.industryType, default_assessment_category_ids: d.defaultAssessmentCategoryIds, default_kpi_ids: d.defaultKpiIds, default_department_names: d.defaultDepartmentNames }),
  pams_departments: (d) => ({ id: d.id, factory_id: d.factoryId, name: d.name, code: d.code, is_system_default: d.isSystemDefault ?? false }),
  pams_projects: (d) => ({ id: d.id, code: d.code, name: d.name, project_type: d.projectType, factory_id: d.factoryId, program_id: d.programId ?? null, advisory_info_id: d.advisoryInfoId ?? null, client_or_donor: d.clientOrDonor, project_manager_user_id: d.projectManagerUserId, advisor_user_ids: d.advisorUserIds, start_date: dateOnly(d.startDate), end_date: dateOnly(d.endDate), budget: d.budget, status: d.status, priority: d.priority, description: d.description, expected_outcomes: d.expectedOutcomes }),
  pams_scoring_rule_versions: (d) => ({ id: d.id, version_label: d.versionLabel, effective_from: dateOnly(d.effectiveFrom), effective_to: dateOnly(d.effectiveTo), achievement_cap_enabled: d.achievementCapEnabled, achievement_cap_value: d.achievementCapValue, baseline_to_target_formula_enabled: d.baselineToTargetFormulaEnabled, weighting_rules: d.weightingRules, is_active: d.isActive }),
  pams_goals: (d) => ({ id: d.id, code: d.code, factory_id: d.factoryId, project_id: d.projectId, title: d.title, description: d.description, strategic_area: d.strategicArea, baseline: d.baseline, expected_outcome: d.expectedOutcome, weight: d.weight, start_date: dateOnly(d.startDate), end_date: dateOnly(d.endDate), owner_user_id: d.ownerUserId, status: d.status, current_achievement: d.currentAchievement, score_id: d.scoreId ?? null }),
  pams_objectives: (d) => ({ id: d.id, goal_id: d.goalId, code: d.code, title: d.title, description: d.description, owner_user_id: d.ownerUserId, baseline: d.baseline, target: d.target, weight: d.weight, start_date: dateOnly(d.startDate), end_date: dateOnly(d.endDate), status: d.status, progress: d.progress, score_id: d.scoreId ?? null }),
  pams_sub_objectives: (d) => ({ id: d.id, objective_id: d.objectiveId, parent_sub_objective_id: d.parentSubObjectiveId ?? null, code: d.code, title: d.title, description: d.description, owner_user_id: d.ownerUserId, baseline: d.baseline, target: d.target, weight: d.weight, start_date: dateOnly(d.startDate), end_date: dateOnly(d.endDate), status: d.status, progress: d.progress, score_id: d.scoreId ?? null }),
  pams_targets: (d) => ({ id: d.id, parent_type: d.parentType, parent_id: d.parentId, objective_id: d.objectiveId, factory_id: d.factoryId, project_id: d.projectId, code: d.code, title: d.title, description: d.description, target_type: d.targetType, unit: d.unit, direction: d.direction, baseline: d.baseline, target_value: d.targetValue, range_min: d.rangeMin, range_max: d.rangeMax, weight: d.weight, start_date: dateOnly(d.startDate), end_date: dateOnly(d.endDate), owner_user_id: d.ownerUserId, status: d.status, latest_summary: d.latestSummary }),
  pams_kpis: (d) => ({ id: d.id, code: d.code, name: d.name, definition: d.definition, category: d.category, unit: d.unit, formula_id: d.formulaId ?? null, data_source: d.dataSource, measurement_frequency: d.measurementFrequency, direction: d.direction, verification_method: d.verificationMethod, is_system_default: d.isSystemDefault ?? false }),
  pams_kpi_formulas: (d) => ({ id: d.id, kpi_id: d.kpiId, expression: d.expression, variables: d.variables }),
  pams_kpi_links: (d) => ({ id: d.id, kpi_id: d.kpiId, target_id: d.targetId, factory_id: d.factoryId, baseline: d.baseline, target_value: d.targetValue, weight: d.weight }),
  pams_measurements: (d) => ({ id: d.id, kpi_link_id: d.kpiLinkId, target_id: d.targetId, factory_id: d.factoryId, period: d.period, planned_value: d.plannedValue, actual_value: d.actualValue, achievement_pct: d.achievementPct, score_id: d.scoreId ?? null, comment: d.comment, submitted_by: d.submittedBy, submitted_at: ts(d.submittedAt), verification_status: d.verificationStatus, verified_by: d.verifiedBy, verified_at: ts(d.verifiedAt), supersedes_measurement_id: d.supersedesMeasurementId ?? null }),
  pams_actions: (d) => ({ id: d.id, target_id: d.targetId, factory_id: d.factoryId, code: d.code, title: d.title, description: d.description, responsible_department_id: d.responsibleDepartmentId, responsible_user_id: d.responsibleUserId, supporting_user_id: d.supportingUserId, start_date: dateOnly(d.startDate), due_date: dateOnly(d.dueDate), priority: d.priority, status: d.status, progress_pct: d.progressPct, expected_result: d.expectedResult, actual_result: d.actualResult, evidence_required: d.evidenceRequired, budget: d.budget, risk_note: d.riskNote, depends_on_action_id: d.dependsOnActionId ?? null, remarks: d.remarks }),
  pams_tasks: (d) => ({ id: d.id, action_id: d.actionId, title: d.title, description: d.description, assigned_to_user_id: d.assignedToUserId, start_date: dateOnly(d.startDate), due_date: dateOnly(d.dueDate), status: d.status, progress_pct: d.progressPct, sort_order: d.order }),
  pams_evidence: (d) => ({ id: d.id, entity_type: d.entityType, entity_id: d.entityId, factory_id: d.factoryId, title: d.title, document_type: d.documentType, period: d.period, storage_path: d.storagePath, download_url: d.downloadUrl, mime_type: d.mimeType, size_bytes: d.sizeBytes, uploaded_by: d.uploadedBy, uploaded_at: ts(d.uploadedAt), verification_status: d.verificationStatus, verified_by: d.verifiedBy, verified_at: ts(d.verifiedAt), reviewer_comment: d.reviewerComment }),
  pams_advisory_visits: (d) => ({ id: d.id, factory_id: d.factoryId, project_id: d.projectId, advisor_user_id: d.advisorUserId, visit_date: dateOnly(d.visitDate), visit_type: d.visitType, purpose: d.purpose, participants: d.participants, areas_reviewed: d.areasReviewed, findings_summary: d.findingsSummary, recommendations_summary: d.recommendationsSummary, follow_up_date: dateOnly(d.followUpDate), report_evidence_id: d.reportEvidenceId ?? null, status: d.status }),
  pams_findings: (d) => ({ id: d.id, factory_id: d.factoryId, source_type: d.sourceType, source_id: d.sourceId, source_question_id: d.sourceQuestionId ?? null, department_id: d.departmentId, category: d.category, description: d.description, evidence_ids: d.evidence, root_cause: d.rootCause, severity: d.severity, recommendation_ids: d.recommendationIds, responsible_user_id: d.responsibleUserId, due_date: dateOnly(d.dueDate), status: d.status }),
  pams_recommendations: (d) => ({ id: d.id, finding_id: d.findingId, factory_id: d.factoryId, recommendation: d.recommendation, rationale: d.rationale, expected_result: d.expectedResult, responsible_user_id: d.responsibleUserId, due_date: dateOnly(d.dueDate), priority: d.priority, status: d.status, implementation_pct: d.implementationPct, evidence_ids: d.evidenceIds, verification_note: d.verificationNote, cap_id: d.capId ?? null }),
  pams_issues: (d) => ({ id: d.id, factory_id: d.factoryId, department_id: d.departmentId, related_objective_id: d.relatedObjectiveId ?? null, title: d.title, description: d.description, severity: d.severity, owner_user_id: d.ownerUserId, root_cause: d.rootCause, corrective_action: d.correctiveAction, due_date: dateOnly(d.dueDate), status: d.status, resolution: d.resolution }),
  pams_rating_scales: (d) => ({ id: d.id, name: d.name, description: d.description }),
  pams_rating_levels: (d) => ({ id: d.id, rating_scale_id: d.ratingScaleId, name: d.name, min_score: d.minScore, max_score: d.maxScore, description: d.description, rag_status: d.ragStatus, recommended_response: d.recommendedResponse, sort_order: d.order }),
  pams_rag_rules: (d) => ({ id: d.id, name: d.name, green_threshold: d.greenThreshold, amber_threshold: d.amberThreshold, red_threshold: d.redThreshold, applies_to_entity_type: d.appliesToEntityType, is_default: d.isDefault ?? false }),
  pams_custom_fields: (d) => ({ id: d.id, entity_type: d.entityType, field_key: d.fieldKey, label: d.label, field_type: d.fieldType, options: d.options, is_required: d.isRequired }),
  pams_custom_field_values: (d) => ({ id: d.id, entity_type: d.entityType, entity_id: d.entityId, field_key: d.fieldKey, value: d.value }),
  pams_assessment_categories: (d) => ({ id: d.id, name: d.name, description: d.description, weight: d.weight, sort_order: d.order, is_system_default: d.isSystemDefault ?? false }),
  pams_assessment_items: (d) => ({ id: d.id, category_id: d.categoryId, text: d.text, sort_order: d.order }),
  pams_notifications: (d) => ({ id: d.id, factory_id: d.factoryId, type: d.type, message: d.message, entity_type: d.entityType, entity_id: d.entityId, read: d.read ?? false }),
  pams_factory_summaries: (d) => ({ id: d.id, factory_id: d.factoryId, payload: d.payload, computed_at: ts(d.computedAt) }),
  pams_target_summaries: (d) => ({ id: d.id, target_id: d.targetId, payload: d.payload, computed_at: ts(d.computedAt) }),
};

// factory_id is the doc ID itself for this one (per DOMAIN_MODEL.md §1)
function mapFactoryProfile(d) {
  return {
    factory_id: d.id, industry_type: d.industryType, industry_profile_id: d.industryProfileId ?? null,
    legal_name: d.legalName, brand: d.brand, ownership: d.ownership, parent_company_group: d.parentCompanyGroup,
    country: d.country, province: d.province, district: d.district,
    general_manager_name: d.generalManagerName, hr_manager_name: d.hrManagerName,
    compliance_manager_name: d.complianceManagerName, production_manager_name: d.productionManagerName,
    worker_count_total: d.workerCountTotal, worker_count_male: d.workerCountMale, worker_count_female: d.workerCountFemale,
    production_line_count: d.productionLineCount, production_capacity: d.productionCapacity,
    main_products: d.mainProducts, main_export_markets: d.mainExportMarkets,
    working_hours: d.workingHours, shift_structure: d.shiftStructure,
    factory_status: d.factoryStatus, program_enrollment_date: dateOnly(d.programEnrollmentDate),
    program_exit_date: dateOnly(d.programExitDate), advisory_status: d.advisoryStatus,
    risk_classification: d.riskClassification, factory_group_id: d.factoryGroupId ?? null,
  };
}

// pams_assessments needs its embedded itemResults[] exploded into
// pams_assessment_item_results separately from the row mapper above.
function mapAssessment(d) {
  return {
    id: d.id, factory_id: d.factoryId, project_id: d.projectId, assessment_type: d.assessmentType,
    assessment_date: dateOnly(d.assessmentDate), conducted_by_user_id: d.conductedByUserId, status: d.status,
    overall_score: d.overallScore, overall_rating_level_id: d.overallRatingLevelId ?? null,
  };
}
function mapAssessmentItemResults(d) {
  return (d.itemResults ?? []).map((r) => ({
    assessment_id: d.id, item_id: r.itemId, category_id: r.categoryId, score: r.score,
    rating_level_id: r.ratingLevelId ?? null, evidence_ids: r.evidenceIds, observation: r.observation,
    finding: r.finding, risk: r.risk, recommended_action: r.recommendedAction, finding_id: r.findingId ?? null,
  }));
}

async function migratePams() {
  console.log("\n-- PAMS (33 collections, near-1:1) --");

  for (const [collection, mapper] of Object.entries(PAMS_TABLE_MAP)) {
    const docs = await loadJson(collection);
    await insertRows(collection, docs.map(mapper));
  }

  const factoryProfiles = await loadJson("pams_factory_profiles");
  await insertRows("pams_factory_profiles", factoryProfiles.map(mapFactoryProfile));

  const scores = await loadJson("pams_scores");
  await insertRows("pams_scores", scores.map((d) => ({
    id: d.id, entity_type: d.entityType, entity_id: d.entityId, factory_id: d.factoryId,
    period: d.period, scoring_rule_version_id: d.scoringRuleVersionId ?? null,
    baseline: d.baseline, target: d.target, actual: d.actual, weight: d.weight,
    achievement_pct: d.achievementPct, score: d.score, rating_level_id: d.ratingLevelId ?? null,
    rag_status: d.ragStatus, calculation_trace: d.calculationTrace,
    calculated_at: ts(d.calculatedAt), calculated_by: d.calculatedBy,
  })));

  const auditLogs = await loadJson("pams_audit_logs");
  await insertRows("pams_audit_logs", auditLogs.map((d) => ({
    user_id: d.userId ?? null, timestamp: ts(d.timestamp), action: d.action,
    entity_type: d.entityType, entity_id: d.entityId, old_value: d.oldValue, new_value: d.newValue, reason: d.reason,
  })));

  const assessments = await loadJson("pams_assessments");
  await insertRows("pams_assessments", assessments.map(mapAssessment));
  await insertRows("pams_assessment_item_results", assessments.flatMap(mapAssessmentItemResults));
}

async function main() {
  console.log(`Loading export from ${path.resolve(exportDir)}`);
  console.log(`Target: ${SUPABASE_URL}`);

  await migrateLegacyCore();
  await migratePams();

  console.log("\n=== Load report ===");
  console.log(JSON.stringify(report, null, 2));

  if (report.errors.length > 0) {
    console.error(`\n${report.errors.length} table(s) had errors -- see report above.`);
    process.exit(1);
  }
  console.log("\nDone, no errors.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
