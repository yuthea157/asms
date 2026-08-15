// pams_assessment_categories / pams_assessment_items — the configurable
// baseline-assessment catalog (brief §9). Seeded once with the brief's own
// A-H default list, then freely editable by an admin — same "seed once,
// then it's just data" pattern as departments.js. See docs/pams/
// DOMAIN_MODEL.md §8.

import { createRecord, createRecordWithId, deleteRecord, getRecord, listRecords, orderBy, updateRecord, where } from "./pamsStore.js";

// Fixed IDs (not auto-generated) so re-running the seed is idempotent —
// createRecordWithId + getRecord's "already exists, skip" check means
// calling ensureDefaultAssessmentCatalogSeeded() twice never duplicates
// rows, the same guarantee PartitionMaintenanceService-style idempotent
// seeding gives in this session's other project.
const DEFAULT_CATEGORIES = [
  {
    id: "cat_hr", name: "HR Management", order: 1,
    items: [
      "HR policies", "Recruitment", "Employee records", "Attendance",
      "Leave management", "Performance management", "Training",
      "Career development", "Worker communication",
    ],
  },
  {
    id: "cat_labor", name: "Labor Compliance", order: 2,
    items: [
      "Employment contracts", "Working hours", "Overtime", "Wages", "Benefits",
      "Leave", "Child labor prevention", "Forced labor prevention",
      "Discrimination", "Harassment", "Freedom of association", "Grievance mechanism",
    ],
  },
  {
    id: "cat_osh", name: "Occupational Safety and Health", order: 3,
    items: [
      "OSH policy", "OSH committee", "Risk assessment", "PPE", "Fire safety",
      "Emergency preparedness", "Machine safety", "Chemical safety", "First aid",
      "Ergonomics", "Accident reporting", "Worker training",
    ],
  },
  {
    id: "cat_productivity", name: "Productivity", order: 4,
    items: [
      "Production efficiency", "Line efficiency", "Labor productivity",
      "Machine utilization", "Downtime", "Capacity utilization", "Output",
      "Standard minute value", "Line balancing", "Overtime", "Absenteeism", "Worker turnover",
    ],
  },
  {
    id: "cat_quality", name: "Quality", order: 5,
    items: [
      "First pass yield", "Defect rate", "Rework", "Rejection",
      "Customer complaints", "Quality inspection", "Root cause analysis", "Corrective actions",
    ],
  },
  {
    id: "cat_production_mgmt", name: "Production Management", order: 6,
    items: [
      "Production planning", "Production scheduling", "Line loading",
      "Capacity planning", "Material availability", "Work-in-progress",
      "Production monitoring", "Bottleneck management",
    ],
  },
  {
    id: "cat_welfare", name: "Worker Welfare", order: 7,
    items: [
      "Canteen", "Drinking water", "Sanitation", "Dormitory where applicable",
      "Daycare", "Breastfeeding room", "Worker communication", "Welfare committees",
    ],
  },
  {
    id: "cat_environment", name: "Environmental / Sustainability", order: 8,
    items: [
      "Energy", "Water", "Waste", "Chemicals", "Emissions",
      "Wastewater", "Resource efficiency",
    ],
  },
];

export async function ensureDefaultAssessmentCatalogSeeded(ctx) {
  for (const cat of DEFAULT_CATEGORIES) {
    const existingCat = await getRecord("pams_assessment_categories", cat.id);
    if (!existingCat) {
      await createRecordWithId("pams_assessment_categories", cat.id, { name: cat.name, description: "", weight: null, order: cat.order, isSystemDefault: true }, ctx);
    }
    const existingItems = await listRecords("pams_assessment_items", [where("categoryId", "==", cat.id)]);
    if (existingItems.length === 0) {
      for (let i = 0; i < cat.items.length; i++) {
        await createRecord("pams_assessment_items", { categoryId: cat.id, text: cat.items[i], order: i + 1 }, ctx);
      }
    }
  }
}

export function listAssessmentCategories() {
  return listRecords("pams_assessment_categories", [orderBy("order")]);
}

export function listAssessmentItems(categoryId) {
  return listRecords("pams_assessment_items", [where("categoryId", "==", categoryId), orderBy("order")]);
}

export async function listAllAssessmentItemsGroupedByCategory() {
  const categories = await listAssessmentCategories();
  const grouped = [];
  for (const cat of categories) {
    const items = await listAssessmentItems(cat.id);
    grouped.push({ category: cat, items });
  }
  return grouped;
}

export function createAssessmentCategory(name, order, ctx) {
  return createRecord("pams_assessment_categories", { name, description: "", weight: null, order, isSystemDefault: false }, ctx);
}
export function renameAssessmentCategory(id, name, ctx) {
  return updateRecord("pams_assessment_categories", id, { name }, ctx);
}
export function deleteAssessmentCategory(id, ctx) {
  return deleteRecord("pams_assessment_categories", id, ctx);
}
export function createAssessmentItem(categoryId, text, order, ctx) {
  return createRecord("pams_assessment_items", { categoryId, text, order }, ctx);
}
export function renameAssessmentItem(id, text, ctx) {
  return updateRecord("pams_assessment_items", id, { text }, ctx);
}
export function deleteAssessmentItem(id, ctx) {
  return deleteRecord("pams_assessment_items", id, ctx);
}
