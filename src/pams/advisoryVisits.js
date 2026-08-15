// pams_advisory_visits — structured, richer visits (brief §31), kept
// deliberately separate from the existing free-text `visits` blob (see
// docs/pams/DOMAIN_MODEL.md §1/§5 for why: avoids any migration risk to
// a working, shipped screen). Existing `visits` keeps working unchanged.

import { createRecord, deleteRecord, getRecord, listRecords, orderBy, updateRecord, where } from "./pamsStore.js";

export const VISIT_TYPES = ["InitialAssessment", "RoutineAdvisory", "TechnicalAssistance", "FollowUp", "Verification", "FinalAssessment", "EmergencyAdvisory"];
export const VISIT_STATUSES = ["Planned", "Completed", "Cancelled"];

export function emptyAdvisoryVisit() {
  return {
    visitDate: new Date().toISOString().slice(0, 10), visitType: VISIT_TYPES[0], purpose: "",
    participants: "", areasReviewed: "", findingsSummary: "", recommendationsSummary: "",
    followUpDate: "", status: "Completed",
  };
}

export function createAdvisoryVisit(factoryId, projectId, data, ctx) {
  return createRecord("pams_advisory_visits", { ...data, factoryId, projectId: projectId || null }, ctx);
}
export function getAdvisoryVisit(id) {
  return getRecord("pams_advisory_visits", id);
}
export function listAdvisoryVisitsForFactory(factoryId) {
  return listRecords("pams_advisory_visits", [where("factoryId", "==", factoryId), orderBy("visitDate", "desc")]);
}
export function updateAdvisoryVisit(id, patch, ctx) {
  return updateRecord("pams_advisory_visits", id, patch, ctx);
}
export function deleteAdvisoryVisit(id, ctx) {
  return deleteRecord("pams_advisory_visits", id, ctx);
}
