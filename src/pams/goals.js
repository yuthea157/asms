// pams_goals (brief §11). See docs/pams/DOMAIN_MODEL.md §2.

import { createRecord, deleteRecord, getRecord, listRecords, orderBy, updateRecord, where } from "./pamsStore.js";

export const GOAL_STATUSES = ["Draft", "Active", "OnHold", "Completed", "Cancelled"];

export function emptyGoal() {
  return {
    code: "", title: "", description: "", strategicArea: "", baseline: "",
    expectedOutcome: "", weight: 100, startDate: "", endDate: "", ownerUserId: null, status: "Draft",
  };
}

export function createGoal(factoryId, projectId, data, ctx) {
  return createRecord("pams_goals", { ...data, factoryId, projectId }, ctx);
}
export function getGoal(id) {
  return getRecord("pams_goals", id);
}
export function listGoalsForProject(projectId) {
  return listRecords("pams_goals", [where("projectId", "==", projectId), orderBy("createdAt")]);
}
export function updateGoal(id, patch, ctx) {
  return updateRecord("pams_goals", id, patch, ctx);
}
export function deleteGoal(id, ctx) {
  return deleteRecord("pams_goals", id, ctx);
}
