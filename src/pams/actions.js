// pams_actions (brief §18-19). See docs/pams/DOMAIN_MODEL.md §4.

import { createRecord, deleteRecord, getRecord, listRecords, orderBy, updateRecord, where } from "./pamsStore.js";
export { isActionOverdue } from "./actionStatus.js";

// Configurable per brief §19 ("Allow administrators to customize
// statuses") — this is the coded default list; a future admin screen can
// read/write a pams_status_lists/actions catalog document instead of this
// constant without changing any call site's shape (docs/pams/
// DOMAIN_MODEL.md §9's "configurable, not hard-coded" list already names
// this as a Phase 8+ follow-up, matching the KPI-formula-engine's own
// "build the real thing now, wire in the config screen later" precedent
// from Phase 4).
export const ACTION_STATUSES = ["Not Started", "Planned", "In Progress", "Completed", "Delayed", "Blocked", "Cancelled", "Verified", "Closed"];
export const ACTION_PRIORITIES = ["Low", "Medium", "High", "Critical"];

export function emptyAction() {
  return {
    code: "", title: "", description: "", responsibleDepartmentId: null, responsibleUserId: null, supportingUserId: null,
    startDate: "", dueDate: "", priority: "Medium", status: "Not Started", progressPct: 0,
    expectedResult: "", actualResult: "", evidenceRequired: false, budget: "", riskNote: "", remarks: "",
  };
}

export function createAction(targetId, factoryId, data, ctx) {
  return createRecord("pams_actions", { ...data, targetId, factoryId }, ctx);
}
export function getAction(id) {
  return getRecord("pams_actions", id);
}
export function listActionsForTarget(targetId) {
  return listRecords("pams_actions", [where("targetId", "==", targetId), orderBy("createdAt")]);
}
export function listActionsForFactory(factoryId) {
  return listRecords("pams_actions", [where("factoryId", "==", factoryId), orderBy("dueDate")]);
}
export function updateAction(id, patch, ctx) {
  return updateRecord("pams_actions", id, patch, ctx);
}
export function deleteAction(id, ctx) {
  return deleteRecord("pams_actions", id, ctx);
}
