// pams_targets (brief §14). See docs/pams/DOMAIN_MODEL.md §2.

import { createRecord, deleteRecord, getRecord, listRecords, orderBy, updateRecord, where } from "./pamsStore.js";

export const TARGET_TYPES = ["Percentage", "Number", "Currency", "Quantity", "Time", "Ratio", "Date", "Milestone", "YesNo", "Rating", "Qualitative", "Custom"];
export const TARGET_DIRECTIONS = ["HigherIsBetter", "LowerIsBetter", "TargetExact", "Range", "Milestone"];
export const TARGET_STATUSES = ["Draft", "Active", "OnHold", "Completed", "Cancelled"];

export function emptyTarget() {
  return {
    code: "", title: "", description: "", targetType: "Percentage", unit: "%", direction: "HigherIsBetter",
    baseline: "", targetValue: "", rangeMin: "", rangeMax: "", weight: 100, startDate: "", endDate: "",
    ownerUserId: null, status: "Draft",
  };
}

/** parentType: "objective" | "subObjective" — see docs/pams/DOMAIN_MODEL.md §2. */
export function createTarget({ parentType, parentId, objectiveId, factoryId, projectId }, data, ctx) {
  return createRecord("pams_targets", { ...data, parentType, parentId, objectiveId, factoryId, projectId }, ctx);
}
export function getTarget(id) {
  return getRecord("pams_targets", id);
}
export function listTargetsForParent(parentType, parentId) {
  return listRecords("pams_targets", [where("parentType", "==", parentType), where("parentId", "==", parentId), orderBy("createdAt")]);
}
export function listTargetsForFactory(factoryId) {
  return listRecords("pams_targets", [where("factoryId", "==", factoryId)]);
}
export function updateTarget(id, patch, ctx) {
  return updateRecord("pams_targets", id, patch, ctx);
}
export function deleteTarget(id, ctx) {
  return deleteRecord("pams_targets", id, ctx);
}
