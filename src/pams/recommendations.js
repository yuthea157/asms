// pams_recommendations (brief §33) + the escalation into ASMS's existing
// `caps` collection (the "Improvement Plan" module — see docs/pams/
// DOMAIN_MODEL.md §6). Escalation writes through `ctx.update("caps", ...)`
// directly, the SAME blob-array path every existing CAP screen uses —
// deliberately not pamsStore.js, since the CAP entity itself hasn't
// changed shape or volume characteristics, only gained two optional
// fields (findingId, recommendationId).

import { createRecord, deleteRecord, getRecord, listRecords, orderBy, updateRecord } from "./pamsStore.js";
import { attachRecommendationToFinding } from "./findings.js";
import { uid } from "../ui.jsx";

export const RECOMMENDATION_STATUSES = ["Open", "Accepted", "InProgress", "Implemented", "PartiallyImplemented", "Rejected", "Closed"];
export const RECOMMENDATION_PRIORITIES = ["Low", "Medium", "High", "Critical"];

export function emptyRecommendation() {
  return { recommendation: "", rationale: "", expectedResult: "", responsibleUserId: null, dueDate: "", priority: "Medium", status: "Open", implementationPct: 0 };
}

export async function createRecommendation(findingId, factoryId, data, ctx) {
  const id = await createRecord("pams_recommendations", { ...data, findingId, factoryId, evidenceIds: [], capId: null }, ctx);
  await attachRecommendationToFinding(findingId, id, ctx);
  return id;
}
export function getRecommendation(id) {
  return getRecord("pams_recommendations", id);
}
export function listRecommendationsForFinding(findingId) {
  return listRecords("pams_recommendations", []).then((all) => all.filter((r) => r.findingId === findingId));
}
export function updateRecommendation(id, patch, ctx) {
  return updateRecord("pams_recommendations", id, patch, ctx);
}
export function deleteRecommendation(id, ctx) {
  return deleteRecord("pams_recommendations", id, ctx);
}

/**
 * Escalates a Recommendation into a real Corrective Action Plan — writes
 * a new record into the EXISTING `caps` collection (via `ctx.update`,
 * ASMS's normal blob-array path, not pamsStore.js — docs/pams/
 * DOMAIN_MODEL.md §6's documented exception), and records the resulting
 * capId back on the Recommendation for the reverse link.
 */
export async function escalateRecommendationToCap({ recommendation, finding, factoryId }, ctx) {
  const capId = uid("cap");
  const capRecord = {
    id: capId,
    assessmentPlanId: "", // no audit plan behind a PAMS-originated CAP — CapForm's own Select simply shows no plan pre-selected if reopened, a documented, harmless cosmetic quirk (docs/pams/DOMAIN_MODEL.md §6)
    ncNumber: `PAMS-${capId.slice(-6)}`,
    area: finding.category || "",
    rootCause: finding.rootCause || "",
    correctiveActions: recommendation.recommendation,
    leadPerson: "", supportPerson: "",
    targetDate: recommendation.dueDate || "",
    actualDate: "",
    status: "Open", progress: 0, progressComments: "",
    recommendations: recommendation.rationale || "",
    companyId: factoryId,
    findingId: finding.id,
    recommendationId: recommendation.id,
  };
  ctx.update("caps", (prev) => [...prev, capRecord]);
  await updateRecommendation(recommendation.id, { capId, status: "Accepted" }, ctx);
  return capId;
}
