// pams_sub_objectives — arbitrary depth (brief §13: "do not unnecessarily
// restrict... to only one sub-objective level"). See docs/pams/
// DOMAIN_MODEL.md §2: `objectiveId` is denormalized onto every level (not
// just the immediate parent) so "all sub-objectives under this objective,
// any depth" is one indexed query instead of a recursive fetch.

import { createRecord, deleteRecord, getRecord, listRecords, orderBy, updateRecord, where } from "./pamsStore.js";
export { buildSubObjectiveTree } from "./subObjectiveTree.js";

export const SUB_OBJECTIVE_STATUSES = ["Draft", "Active", "OnHold", "Completed", "Cancelled"];

export function emptySubObjective() {
  return { code: "", title: "", description: "", ownerUserId: null, baseline: "", target: "", weight: 100, startDate: "", endDate: "", status: "Draft", progress: 0 };
}

export function createSubObjective(objectiveId, parentSubObjectiveId, data, ctx) {
  return createRecord("pams_sub_objectives", { ...data, objectiveId, parentSubObjectiveId: parentSubObjectiveId || null }, ctx);
}
export function getSubObjective(id) {
  return getRecord("pams_sub_objectives", id);
}
/** Every sub-objective under an objective, any depth — flat, then arranged into a tree client-side. */
export function listAllSubObjectivesForObjective(objectiveId) {
  return listRecords("pams_sub_objectives", [where("objectiveId", "==", objectiveId), orderBy("createdAt")]);
}
export function updateSubObjective(id, patch, ctx) {
  return updateRecord("pams_sub_objectives", id, patch, ctx);
}
export function deleteSubObjective(id, ctx) {
  return deleteRecord("pams_sub_objectives", id, ctx);
}
