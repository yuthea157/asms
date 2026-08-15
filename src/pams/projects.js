// pams_projects — Advisory Project (brief §8). See docs/pams/DOMAIN_MODEL.md §2.

import { createRecord, deleteRecord, getRecord, listRecords, orderBy, updateRecord, where } from "./pamsStore.js";

export const PROJECT_TYPES = [
  "Productivity Improvement", "Labor Compliance Improvement", "OSH Improvement",
  "HR Management Improvement", "Quality Improvement", "Gender Equality Improvement",
  "Worker Welfare Improvement", "Environmental Improvement", "Training Improvement",
  "Lean Manufacturing", "Digital Transformation", "Other",
];
export const PROJECT_STATUSES = ["Planned", "Active", "OnHold", "Completed", "Cancelled"];

export function emptyProject() {
  return {
    code: "", name: "", projectType: PROJECT_TYPES[0], programId: null, advisoryInfoId: null,
    clientOrDonor: "", projectManagerUserId: null, startDate: "", endDate: "", budget: "",
    status: "Planned", priority: "Medium", description: "", expectedOutcomes: "",
  };
}

export function createProject(factoryId, data, ctx) {
  return createRecord("pams_projects", { ...data, factoryId }, ctx);
}
export function getProject(id) {
  return getRecord("pams_projects", id);
}
export function listProjectsForFactory(factoryId) {
  return listRecords("pams_projects", [where("factoryId", "==", factoryId), orderBy("createdAt", "desc")]);
}
export function updateProject(id, patch, ctx) {
  return updateRecord("pams_projects", id, patch, ctx);
}
export function deleteProject(id, ctx) {
  return deleteRecord("pams_projects", id, ctx);
}
