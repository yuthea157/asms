// pams_findings — the brief's "Advisory Finding" (§32), a real stored
// entity for the first time (today's ASMS "Findings" screen is a
// computed NC rollup, not a stored record — see docs/pams/PRD.md §2).
// Sourced from an Advisory Visit, a baseline Assessment item, or an
// existing `auditTool` NC question row (referenced, never copied — see
// docs/pams/DOMAIN_MODEL.md §5).

import { createRecord, deleteRecord, getRecord, listRecords, orderBy, updateRecord, where } from "./pamsStore.js";

export const FINDING_SEVERITIES = ["Critical", "High", "Medium", "Low", "Observation"];
export const FINDING_STATUSES = ["Open", "InProgress", "Closed"];

export function emptyFinding() {
  return { category: "", description: "", rootCause: "", severity: "Medium", responsibleUserId: null, dueDate: "", status: "Open" };
}

/** sourceType: "AdvisoryVisit" | "Assessment" | "AuditTool" — see docs/pams/DOMAIN_MODEL.md §5. */
export function createFinding(factoryId, { sourceType, sourceId, sourceQuestionId }, data, ctx) {
  return createRecord("pams_findings", { ...data, factoryId, sourceType, sourceId, sourceQuestionId: sourceQuestionId || null, recommendationIds: [] }, ctx);
}
export function getFinding(id) {
  return getRecord("pams_findings", id);
}
export function listFindingsForFactory(factoryId) {
  return listRecords("pams_findings", [where("factoryId", "==", factoryId), orderBy("createdAt", "desc")]);
}
export function listFindingsForSource(sourceType, sourceId) {
  return listRecords("pams_findings", [where("sourceType", "==", sourceType), where("sourceId", "==", sourceId)]);
}
export function updateFinding(id, patch, ctx) {
  return updateRecord("pams_findings", id, patch, ctx);
}
export function deleteFinding(id, ctx) {
  return deleteRecord("pams_findings", id, ctx);
}
export async function attachRecommendationToFinding(findingId, recommendationId, ctx) {
  const finding = await getFinding(findingId);
  await updateRecord("pams_findings", findingId, { recommendationIds: [...(finding.recommendationIds || []), recommendationId] }, ctx);
}
