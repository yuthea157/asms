// pams_kpis / pams_kpi_formulas / pams_kpi_links — the reusable KPI
// library (brief §16), the controlled formula engine's stored definitions
// (brief §17, see formulaEngine.js), and per-Target KPI attachments. See
// docs/pams/DOMAIN_MODEL.md §3.

import { createRecord, createRecordWithId, deleteRecord, getRecord, listRecords, orderBy, updateRecord, where } from "./pamsStore.js";
import { parseFormula } from "./formulaEngine.js";

export const KPI_CATEGORIES = ["Productivity", "Quality", "HR", "LaborCompliance", "OSH", "WorkerWelfare", "Environment"];
export const KPI_DIRECTIONS = ["HigherIsBetter", "LowerIsBetter", "TargetExact", "Range", "Milestone"];
export const MEASUREMENT_FREQUENCIES = ["Weekly", "Monthly", "Quarterly", "Semiannual", "Annual", "Custom"];

// Fixed IDs, same idempotent-seed pattern as assessmentCategories.js.
const DEFAULT_KPIS = [
  // Productivity
  { id: "kpi_line_efficiency", name: "Line Efficiency", category: "Productivity", unit: "%", direction: "HigherIsBetter" },
  { id: "kpi_labor_productivity", name: "Labor Productivity", category: "Productivity", unit: "units/worker", direction: "HigherIsBetter" },
  { id: "kpi_output_per_worker", name: "Output per Worker", category: "Productivity", unit: "units", direction: "HigherIsBetter" },
  { id: "kpi_production_efficiency", name: "Production Efficiency", category: "Productivity", unit: "%", direction: "HigherIsBetter" },
  { id: "kpi_machine_utilization", name: "Machine Utilization", category: "Productivity", unit: "%", direction: "HigherIsBetter" },
  { id: "kpi_capacity_utilization", name: "Capacity Utilization", category: "Productivity", unit: "%", direction: "HigherIsBetter" },
  { id: "kpi_downtime", name: "Downtime", category: "Productivity", unit: "hours", direction: "LowerIsBetter" },
  { id: "kpi_overtime_hours", name: "Overtime Hours", category: "Productivity", unit: "hours", direction: "LowerIsBetter" },
  // Quality
  { id: "kpi_defect_rate", name: "Defect Rate", category: "Quality", unit: "%", direction: "LowerIsBetter" },
  { id: "kpi_first_pass_yield", name: "First Pass Yield", category: "Quality", unit: "%", direction: "HigherIsBetter" },
  { id: "kpi_rework_rate", name: "Rework Rate", category: "Quality", unit: "%", direction: "LowerIsBetter" },
  { id: "kpi_reject_rate", name: "Reject Rate", category: "Quality", unit: "%", direction: "LowerIsBetter" },
  { id: "kpi_customer_complaint_rate", name: "Customer Complaint Rate", category: "Quality", unit: "%", direction: "LowerIsBetter" },
  // HR
  { id: "kpi_absenteeism", name: "Absenteeism", category: "HR", unit: "%", direction: "LowerIsBetter" },
  { id: "kpi_turnover", name: "Turnover", category: "HR", unit: "%", direction: "LowerIsBetter" },
  { id: "kpi_training_completion", name: "Training Completion", category: "HR", unit: "%", direction: "HigherIsBetter" },
  { id: "kpi_worker_retention", name: "Worker Retention", category: "HR", unit: "%", direction: "HigherIsBetter" },
  { id: "kpi_recruitment_lead_time", name: "Recruitment Lead Time", category: "HR", unit: "days", direction: "LowerIsBetter" },
  // Labor Compliance
  { id: "kpi_compliance_score", name: "Compliance Score", category: "LaborCompliance", unit: "%", direction: "HigherIsBetter" },
  { id: "kpi_cap_closure_rate", name: "Corrective Action Closure Rate", category: "LaborCompliance", unit: "%", direction: "HigherIsBetter" },
  { id: "kpi_grievance_resolution_rate", name: "Grievance Resolution Rate", category: "LaborCompliance", unit: "%", direction: "HigherIsBetter" },
  { id: "kpi_working_hour_compliance", name: "Working-Hour Compliance", category: "LaborCompliance", unit: "%", direction: "HigherIsBetter" },
  { id: "kpi_contract_coverage", name: "Contract Coverage", category: "LaborCompliance", unit: "%", direction: "HigherIsBetter" },
  // OSH
  { id: "kpi_accident_frequency", name: "Accident Frequency", category: "OSH", unit: "per 1000 workers", direction: "LowerIsBetter" },
  { id: "kpi_lost_time_injury_rate", name: "Lost-Time Injury Rate", category: "OSH", unit: "%", direction: "LowerIsBetter" },
  { id: "kpi_ppe_compliance", name: "PPE Compliance", category: "OSH", unit: "%", direction: "HigherIsBetter" },
  { id: "kpi_safety_training_completion", name: "Safety Training Completion", category: "OSH", unit: "%", direction: "HigherIsBetter" },
  { id: "kpi_risk_assessment_completion", name: "Risk Assessment Completion", category: "OSH", unit: "%", direction: "HigherIsBetter" },
  // Worker Welfare
  { id: "kpi_grievance_closure", name: "Grievance Closure", category: "WorkerWelfare", unit: "%", direction: "HigherIsBetter" },
  { id: "kpi_welfare_activity_completion", name: "Welfare Activity Completion", category: "WorkerWelfare", unit: "%", direction: "HigherIsBetter" },
  { id: "kpi_daycare_utilization", name: "Daycare Utilization", category: "WorkerWelfare", unit: "%", direction: "HigherIsBetter" },
  { id: "kpi_worker_satisfaction", name: "Worker Satisfaction", category: "WorkerWelfare", unit: "%", direction: "HigherIsBetter" },
  // Environment
  { id: "kpi_energy_per_unit", name: "Energy Consumption per Unit", category: "Environment", unit: "kWh/unit", direction: "LowerIsBetter" },
  { id: "kpi_water_per_unit", name: "Water Consumption per Unit", category: "Environment", unit: "L/unit", direction: "LowerIsBetter" },
  { id: "kpi_waste_recycling_rate", name: "Waste Recycling Rate", category: "Environment", unit: "%", direction: "HigherIsBetter" },
  { id: "kpi_chemical_compliance", name: "Chemical Compliance", category: "Environment", unit: "%", direction: "HigherIsBetter" },
];

export async function ensureDefaultKpiLibrarySeeded(ctx) {
  for (const kpi of DEFAULT_KPIS) {
    const existing = await getRecord("pams_kpis", kpi.id);
    if (!existing) {
      await createRecordWithId("pams_kpis", kpi.id, {
        code: kpi.id, name: kpi.name, definition: "", category: kpi.category, unit: kpi.unit,
        formulaId: null, dataSource: "", measurementFrequency: "Monthly", direction: kpi.direction,
        verificationMethod: "", isSystemDefault: true,
      }, ctx);
    }
  }
}

export function listKpis() {
  return listRecords("pams_kpis", [orderBy("category")]);
}
export function listKpisByCategory(category) {
  return listRecords("pams_kpis", [where("category", "==", category)]);
}
export function getKpi(id) {
  return getRecord("pams_kpis", id);
}
export function createKpi(data, ctx) {
  return createRecord("pams_kpis", { ...data, isSystemDefault: false }, ctx);
}
export function updateKpi(id, patch, ctx) {
  return updateRecord("pams_kpis", id, patch, ctx);
}
export function deleteKpi(id, ctx) {
  return deleteRecord("pams_kpis", id, ctx);
}

/**
 * Validates the formula (via the controlled expression parser — brief
 * §17) BEFORE ever writing it to Firestore, so an invalid formula can
 * never be saved in the first place.
 */
export async function createKpiFormula(kpiId, expression, variables, ctx) {
  parseFormula(expression, variables.map((v) => v.name)); // throws FormulaError if invalid
  const id = await createRecord("pams_kpi_formulas", { kpiId, expression, variables }, ctx);
  await updateKpi(kpiId, { formulaId: id }, ctx);
  return id;
}
export function getKpiFormula(id) {
  return getRecord("pams_kpi_formulas", id);
}

export function createKpiLink(kpiId, targetId, factoryId, { baseline, targetValue, weight }, ctx) {
  return createRecord("pams_kpi_links", { kpiId, targetId, factoryId, baseline, targetValue, weight }, ctx);
}
export function listKpiLinksForTarget(targetId) {
  return listRecords("pams_kpi_links", [where("targetId", "==", targetId)]);
}
export function deleteKpiLink(id, ctx) {
  return deleteRecord("pams_kpi_links", id, ctx);
}
