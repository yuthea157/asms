import { describe, it, expect } from "vitest";
import { resolveDefaultRating } from "../defaultRating.js";

describe("resolveDefaultRating", () => {
  it("matches the brief's default band (§26) at the exact boundaries, no off-by-one", () => {
    expect(resolveDefaultRating(100).name).toBe("Excellent");
    expect(resolveDefaultRating(90).name).toBe("Excellent");
    expect(resolveDefaultRating(89).name).toBe("Very Good");
    expect(resolveDefaultRating(80).name).toBe("Very Good");
    expect(resolveDefaultRating(79).name).toBe("Good");
    expect(resolveDefaultRating(70).name).toBe("Good");
    expect(resolveDefaultRating(69).name).toBe("Needs Improvement");
    expect(resolveDefaultRating(60).name).toBe("Needs Improvement");
    expect(resolveDefaultRating(59).name).toBe("Poor");
    expect(resolveDefaultRating(0).name).toBe("Poor");
  });

  it("maps each band to the right RAG color", () => {
    expect(resolveDefaultRating(95).ragStatus).toBe("Green");
    expect(resolveDefaultRating(85).ragStatus).toBe("Green");
    expect(resolveDefaultRating(75).ragStatus).toBe("Amber");
    expect(resolveDefaultRating(65).ragStatus).toBe("Amber");
    expect(resolveDefaultRating(30).ragStatus).toBe("Red");
  });

  it("returns null for a missing score rather than throwing or picking a default band", () => {
    expect(resolveDefaultRating(null)).toBeNull();
    expect(resolveDefaultRating(undefined)).toBeNull();
    expect(resolveDefaultRating(NaN)).toBeNull();
  });
});
