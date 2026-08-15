// pams_factory_profiles — a 1:1 satellite on the existing `companies`
// record (doc ID = the company's own ID), holding everything the brief's
// Factory Management section (§4) needs that `companies` doesn't have.
// Zero changes to the existing CompanyForm/companies blob — this is purely
// additive. See docs/pams/DOMAIN_MODEL.md §1-2.

import { createRecordWithId, getRecord, listRecords, upsertRecordWithId, where } from "./pamsStore.js";
import { defaultIndustryProfileRecord } from "./industryProfiles.js";

export function getFactoryProfile(companyId) {
  return getRecord("pams_factory_profiles", companyId);
}

export function emptyFactoryProfile() {
  return {
    industryType: "Garment",
    legalName: "", brand: "", ownership: "", parentCompanyGroup: "",
    country: "", province: "", district: "",
    generalManagerName: "", hrManagerName: "", complianceManagerName: "", productionManagerName: "",
    workerCountTotal: "", workerCountMale: "", workerCountFemale: "",
    productionLineCount: "", productionCapacity: "", mainProducts: "", mainExportMarkets: "",
    workingHours: "", shiftStructure: "",
    factoryStatus: "Active",
    programEnrollmentDate: "", programExitDate: "",
    advisoryStatus: "", riskClassification: "",
  };
}

/**
 * Create-or-update a factory profile. The caller (FactoryProfileTab)
 * decides whether this is a first-time save (and therefore whether to
 * also seed default departments) — this function only persists the
 * profile document itself.
 */
export function saveFactoryProfile(companyId, data, ctx) {
  return upsertRecordWithId("pams_factory_profiles", companyId, data, ctx);
}

/**
 * pams_industry_profiles uses the industry TYPE itself as the document ID
 * (Garment/Footwear/TravelGoods/Textile/Other) — a small, fixed catalog,
 * not an arbitrarily-keyed collection, since the set of supported
 * industries is a real product decision (docs/pams/industryProfiles.js's
 * own comment). Ensures the catalog row exists (idempotent) and returns
 * it — called lazily the first time a given industry type is actually
 * used, rather than a separate app-boot seeding step.
 */
export async function ensureIndustryProfile(industryType, ctx) {
  const existing = await getRecord("pams_industry_profiles", industryType);
  if (existing) return existing;
  const record = defaultIndustryProfileRecord(industryType);
  await createRecordWithId("pams_industry_profiles", industryType, record, ctx);
  return { id: industryType, ...record };
}

export function listFactoryGroups() {
  return listRecords("pams_factory_groups");
}
