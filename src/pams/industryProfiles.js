// Configurable industry profiles (brief §3: "Do not hard-code
// factory-specific logic. Create configurable industry profiles.") and the
// default department catalog (brief §6). See docs/pams/DOMAIN_MODEL.md §1
// and §9.
//
// The five industry TYPES themselves (Garment/Footwear/TravelGoods/
// Textile/Other) are a fixed, small enum — matching how ASMS's existing
// `COMPANY_TYPES` is a fixed array — since the *set of industries PAMS
// supports* is a real, intentionally-scoped product decision (brief §1),
// not something an admin should be inventing new top-level industries for.
// What IS configurable per type, stored in Firestore rather than hard-coded,
// is each type's *defaults* (starter department names, and — from Phase 3/4
// on — default assessment categories and KPIs) — an admin can freely edit
// those per deployment without a code change.

export const INDUSTRY_TYPES = ["Garment", "Footwear", "TravelGoods", "Textile", "Other"];

export const INDUSTRY_TYPE_LABELS = {
  Garment: "Garment",
  Footwear: "Footwear",
  TravelGoods: "Travel Goods",
  Textile: "Textile",
  Other: "Other Manufacturing",
};

// Seed-only starting point for each industry profile's default department
// list (brief §6's examples) — an admin can rename/add/remove per factory
// after seeding; this is never re-read after a factory's departments exist.
const DEFAULT_DEPARTMENTS_BY_INDUSTRY = {
  Garment: [
    "Administration", "HR", "Recruitment", "Training", "Compliance",
    "Cutting", "Sewing", "Finishing", "Packing", "IE", "Quality",
    "Maintenance", "Warehouse", "Logistics", "Purchasing", "Finance",
    "OSH", "Sustainability", "Canteen", "Worker Welfare",
  ],
  Footwear: [
    "Administration", "HR", "Recruitment", "Training", "Compliance",
    "Cutting", "Stitching", "Assembly", "Finishing", "Packing", "IE",
    "Quality", "Maintenance", "Warehouse", "Logistics", "Purchasing",
    "Finance", "OSH", "Sustainability", "Canteen", "Worker Welfare",
  ],
  TravelGoods: [
    "Administration", "HR", "Recruitment", "Training", "Compliance",
    "Cutting", "Sewing", "Hardware Assembly", "Finishing", "Packing",
    "IE", "Quality", "Maintenance", "Warehouse", "Logistics",
    "Purchasing", "Finance", "OSH", "Sustainability", "Canteen", "Worker Welfare",
  ],
  Textile: [
    "Administration", "HR", "Recruitment", "Training", "Compliance",
    "Spinning", "Weaving/Knitting", "Dyeing & Finishing", "Quality",
    "IE", "Maintenance", "Warehouse", "Logistics", "Purchasing",
    "Finance", "OSH", "Sustainability", "Canteen", "Worker Welfare",
  ],
  Other: [
    "Administration", "HR", "Recruitment", "Training", "Compliance",
    "Production", "Quality", "Maintenance", "Warehouse", "Logistics",
    "Purchasing", "Finance", "OSH", "Sustainability", "Canteen", "Worker Welfare",
  ],
};

export function defaultDepartmentsFor(industryType) {
  return DEFAULT_DEPARTMENTS_BY_INDUSTRY[industryType] || DEFAULT_DEPARTMENTS_BY_INDUSTRY.Other;
}

/**
 * pams_industry_profiles is still a real Firestore catalog collection (an
 * admin can edit it later — docs/pams/DOMAIN_MODEL.md §9), but Phase 2 only
 * needs the department-name half of it; defaultAssessmentCategoryIds and
 * defaultKpiIds are seeded as empty arrays now and populated in Phase 3/4
 * without needing a schema change.
 */
export function defaultIndustryProfileRecord(industryType) {
  return {
    industryType,
    defaultDepartmentNames: defaultDepartmentsFor(industryType),
    defaultAssessmentCategoryIds: [],
    defaultKpiIds: [],
  };
}
