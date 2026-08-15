import { describe, it, expect } from "vitest";
import { sumWeights, weightsAreValid, validateSiblingWeights } from "../weightValidation.js";

describe("weightValidation", () => {
  it("matches the brief's own worked example (§28: 40/35/25)", () => {
    expect(sumWeights([40, 35, 25])).toBe(100);
    expect(weightsAreValid([40, 35, 25])).toBe(true);
    expect(validateSiblingWeights([40, 35, 25])).toBeNull();
  });

  it("flags a group that doesn't sum to 100%", () => {
    expect(weightsAreValid([40, 35, 20])).toBe(false);
    expect(validateSiblingWeights([40, 35, 20])).toMatch(/sum to 100%.*95%/);
  });

  it("tolerates ordinary floating-point rounding (e.g. 33.33 x3)", () => {
    expect(weightsAreValid([33.33, 33.33, 33.34])).toBe(true);
  });

  it("rejects a negative weight outright, before checking the sum", () => {
    expect(validateSiblingWeights([-10, 60, 50])).toBe("Weight cannot be negative.");
  });

  it("treats an empty sibling group as valid (nothing to check yet)", () => {
    expect(weightsAreValid([])).toBe(true);
    expect(validateSiblingWeights([])).toBeNull();
  });

  it("skips the 100% check entirely for a Draft group", () => {
    expect(validateSiblingWeights([10, 10], { allowDraft: true })).toBeNull();
  });
});
