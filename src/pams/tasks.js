// pams_tasks (brief §20). See docs/pams/DOMAIN_MODEL.md §4.

import { createRecord, deleteRecord, listRecords, orderBy, updateRecord, where } from "./pamsStore.js";

export const TASK_STATUSES = ["Not Started", "In Progress", "Completed", "Blocked"];

export function emptyTask() {
  return { title: "", description: "", assignedToUserId: null, startDate: "", dueDate: "", status: "Not Started", progressPct: 0 };
}

export async function createTask(actionId, data, ctx) {
  const existing = await listRecords("pams_tasks", [where("actionId", "==", actionId)]);
  return createRecord("pams_tasks", { ...data, actionId, order: existing.length + 1 }, ctx);
}
export function listTasksForAction(actionId) {
  return listRecords("pams_tasks", [where("actionId", "==", actionId), orderBy("order")]);
}
export function updateTask(id, patch, ctx) {
  return updateRecord("pams_tasks", id, patch, ctx);
}
export function deleteTask(id, ctx) {
  return deleteRecord("pams_tasks", id, ctx);
}
