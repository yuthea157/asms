// pams_objectives (brief §12). See docs/pams/DOMAIN_MODEL.md §2.

import { createRecord, deleteRecord, getRecord, listRecords, orderBy, updateRecord, where } from "./pamsStore.js";

export const OBJECTIVE_STATUSES = ["Draft", "Active", "OnHold", "Completed", "Cancelled"];

export function emptyObjective() {
  return { code: "", title: "", description: "", ownerUserId: null, baseline: "", target: "", weight: 100, startDate: "", endDate: "", status: "Draft", progress: 0 };
}

export function createObjective(goalId, data, ctx) {
  return createRecord("pams_objectives", { ...data, goalId }, ctx);
}
export function getObjective(id) {
  return getRecord("pams_objectives", id);
}
export function listObjectivesForGoal(goalId) {
  return listRecords("pams_objectives", [where("goalId", "==", goalId), orderBy("createdAt")]);
}
export function updateObjective(id, patch, ctx) {
  return updateRecord("pams_objectives", id, patch, ctx);
}
export function deleteObjective(id, ctx) {
  return deleteRecord("pams_objectives", id, ctx);
}
