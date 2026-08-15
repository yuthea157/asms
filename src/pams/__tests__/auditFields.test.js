import { describe, it, expect } from "vitest";
import { withAuditFields } from "../auditFields.js";

describe("withAuditFields", () => {
  const ctx = { role: { id: "u_officer1", name: "Officer One" } };
  const NOW = "STAMP";

  it("stamps createdBy/createdAt AND updatedBy/updatedAt on create", () => {
    const result = withAuditFields({ name: "Test" }, ctx, NOW, { isCreate: true });
    expect(result).toEqual({
      name: "Test",
      createdByUserId: "u_officer1", createdAt: NOW,
      updatedByUserId: "u_officer1", updatedAt: NOW,
    });
  });

  it("stamps only updatedBy/updatedAt on update, leaving createdAt untouched", () => {
    const result = withAuditFields({ name: "Renamed" }, ctx, NOW);
    expect(result).toEqual({ name: "Renamed", updatedByUserId: "u_officer1", updatedAt: NOW });
    expect(result.createdByUserId).toBeUndefined();
    expect(result.createdAt).toBeUndefined();
  });

  it("never mutates the original patch object", () => {
    const patch = { name: "Test" };
    withAuditFields(patch, ctx, NOW, { isCreate: true });
    expect(patch).toEqual({ name: "Test" });
  });

  it("stamps null when no user is signed in, rather than throwing", () => {
    const result = withAuditFields({ name: "Test" }, {}, NOW, { isCreate: true });
    expect(result.createdByUserId).toBeNull();
    expect(result.updatedByUserId).toBeNull();
  });
});
