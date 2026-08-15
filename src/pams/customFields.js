// pams_custom_fields / pams_custom_field_values (brief §69 — "Custom
// fields" as one of the things "administrators must be able to
// configure"). See docs/pams/DOMAIN_MODEL.md §7/§9.

import { createRecord, deleteRecord, listRecords, updateRecord, where } from "./pamsStore.js";

export const CUSTOM_FIELD_TYPES = ["Text", "Number", "Date", "Select", "YesNo"];

export function emptyCustomFieldDef() {
  return { entityType: "Target", fieldKey: "", label: "", fieldType: "Text", options: "", isRequired: false };
}

export function listCustomFieldsForEntityType(entityType) {
  return listRecords("pams_custom_fields", [where("entityType", "==", entityType)]);
}
export function createCustomFieldDef(data, ctx) {
  return createRecord("pams_custom_fields", data, ctx);
}
export function updateCustomFieldDef(id, patch, ctx) {
  return updateRecord("pams_custom_fields", id, patch, ctx);
}
export function deleteCustomFieldDef(id, ctx) {
  return deleteRecord("pams_custom_fields", id, ctx);
}

export async function listCustomFieldValues(entityType, entityId) {
  return listRecords("pams_custom_field_values", [where("entityType", "==", entityType), where("entityId", "==", entityId)]);
}
export async function setCustomFieldValue(entityType, entityId, fieldKey, value, ctx) {
  const existing = await listRecords("pams_custom_field_values", [
    where("entityType", "==", entityType), where("entityId", "==", entityId), where("fieldKey", "==", fieldKey),
  ]);
  if (existing.length > 0) {
    return updateRecord("pams_custom_field_values", existing[0].id, { value }, ctx);
  }
  return createRecord("pams_custom_field_values", { entityType, entityId, fieldKey, value }, ctx);
}
