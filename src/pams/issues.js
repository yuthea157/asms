// pams_issues (brief §39) — genuinely new; nothing in ASMS plays this
// role today. Distinct from Risk (a potential future problem) — an Issue
// is a real, current one. See docs/pams/DOMAIN_MODEL.md §6.

import { createRecord, deleteRecord, listRecords, orderBy, updateRecord, where } from "./pamsStore.js";

export const ISSUE_SEVERITIES = ["Critical", "High", "Medium", "Low"];
export const ISSUE_STATUSES = ["Open", "InProgress", "Resolved", "Closed"];

export function emptyIssue() {
  return { title: "", description: "", severity: "Medium", rootCause: "", correctiveAction: "", dueDate: "", status: "Open" };
}

export function createIssue(factoryId, data, ctx) {
  return createRecord("pams_issues", { ...data, factoryId }, ctx);
}
export function listIssuesForFactory(factoryId) {
  return listRecords("pams_issues", [where("factoryId", "==", factoryId), orderBy("createdAt", "desc")]);
}
export function updateIssue(id, patch, ctx) {
  return updateRecord("pams_issues", id, patch, ctx);
}
export function deleteIssue(id, ctx) {
  return deleteRecord("pams_issues", id, ctx);
}
