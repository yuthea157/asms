import { describe, it, expect } from "vitest";
import { INDUSTRY_TYPES, INDUSTRY_TYPE_LABELS, defaultDepartmentsFor, defaultIndustryProfileRecord } from "../industryProfiles.js";

describe("industry profiles", () => {
  it("has exactly the 5 industry types the brief specifies (§3)", () => {
    expect(INDUSTRY_TYPES).toEqual(["Garment", "Footwear", "TravelGoods", "Textile", "Other"]);
  });

  it("has a display label for every industry type, none missing", () => {
    for (const t of INDUSTRY_TYPES) {
      expect(INDUSTRY_TYPE_LABELS[t]).toBeTruthy();
    }
  });

  it("gives every industry type a non-empty default department list", () => {
    for (const t of INDUSTRY_TYPES) {
      const depts = defaultDepartmentsFor(t);
      expect(Array.isArray(depts)).toBe(true);
      expect(depts.length).toBeGreaterThan(0);
      // No duplicate department names within one industry's default set —
      // a duplicate here would seed two identically-named departments for
      // every new factory of that type.
      expect(new Set(depts).size).toBe(depts.length);
    }
  });

  it("falls back to the Other department list for an unrecognized industry type", () => {
    expect(defaultDepartmentsFor("NotARealIndustry")).toEqual(defaultDepartmentsFor("Other"));
  });

  it("seeds an industry profile record with empty (not undefined) catalog arrays", () => {
    const record = defaultIndustryProfileRecord("Garment");
    expect(record.industryType).toBe("Garment");
    expect(record.defaultDepartmentNames.length).toBeGreaterThan(0);
    expect(record.defaultAssessmentCategoryIds).toEqual([]);
    expect(record.defaultKpiIds).toEqual([]);
  });
});
