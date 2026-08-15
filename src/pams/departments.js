// pams_departments — factory-scoped, admin-extensible catalog (brief §6).
// See docs/pams/DOMAIN_MODEL.md §2.

import { createRecord, deleteRecord, listRecords, updateRecord, where } from "./pamsStore.js";
import { defaultDepartmentsFor } from "./industryProfiles.js";

export function listDepartmentsForFactory(factoryId) {
  return listRecords("pams_departments", [where("factoryId", "==", factoryId)]);
}

/**
 * Called once, when a factory profile is first created (brief §6: default
 * department names are "seeded once ... then freely editable"). Never
 * called again for that factory — re-running it would duplicate rows, so
 * FactoryProfileForm only calls this on the create path, never on edit.
 */
export async function seedDefaultDepartments(factoryId, industryType, ctx) {
  const names = defaultDepartmentsFor(industryType);
  for (const name of names) {
    await createRecord("pams_departments", { factoryId, name, code: null, isSystemDefault: true }, ctx);
  }
}

export function createDepartment(factoryId, name, ctx) {
  return createRecord("pams_departments", { factoryId, name, code: null, isSystemDefault: false }, ctx);
}

export function renameDepartment(id, name, ctx) {
  return updateRecord("pams_departments", id, { name }, ctx);
}

export function deleteDepartment(id, ctx) {
  return deleteRecord("pams_departments", id, ctx);
}
