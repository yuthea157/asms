import { describe, it, expect } from "vitest";
import {
  calculateAchievement, applyCap, calculateWeightedRollup,
  resolveRating, resolveRag, calculateImprovementScore, scoreMeasurement,
} from "../scoringEngine.js";

describe("calculateAchievement", () => {
  describe("baseline-to-target (SCORING_ENGINE.md §4 — the brief's own worked examples)", () => {
    it("higher-is-better: baseline 50, target 70, actual 60 -> 50%", () => {
      const r = calculateAchievement({ actual: 60, target: 70, baseline: 50, direction: "HigherIsBetter" });
      expect(r.rawAchievementPct).toBeCloseTo(50, 10);
      expect(r.formulaUsed).toBe("baselineToTarget_higherIsBetter");
    });

    it("lower-is-better: baseline 8%, target 4%, actual 6% -> 50%", () => {
      const r = calculateAchievement({ actual: 6, target: 4, baseline: 8, direction: "LowerIsBetter" });
      expect(r.rawAchievementPct).toBeCloseTo(50, 10);
      expect(r.formulaUsed).toBe("baselineToTarget_lowerIsBetter");
    });

    it("target equals baseline -> null (N/A), not a divide-by-zero", () => {
      expect(calculateAchievement({ actual: 60, target: 70, baseline: 70, direction: "HigherIsBetter" }).rawAchievementPct).toBeNull();
      expect(calculateAchievement({ actual: 6, target: 8, baseline: 8, direction: "LowerIsBetter" }).rawAchievementPct).toBeNull();
    });

    it("regression past baseline produces a negative percentage, not a clamped 0", () => {
      // baseline 50, target 70, actual regressed to 40
      const r = calculateAchievement({ actual: 40, target: 70, baseline: 50, direction: "HigherIsBetter" });
      expect(r.rawAchievementPct).toBeLessThan(0);
    });

    it("overshooting the target produces >100%, not a clamped 100", () => {
      const r = calculateAchievement({ actual: 90, target: 70, baseline: 50, direction: "HigherIsBetter" });
      expect(r.rawAchievementPct).toBeGreaterThan(100);
    });
  });

  describe("exact (no baseline) — §2/§3", () => {
    it("higher-is-better: actual 66, target 70", () => {
      const r = calculateAchievement({ actual: 66, target: 70, baseline: null, direction: "HigherIsBetter" });
      expect(r.rawAchievementPct).toBeCloseTo(94.2857, 3);
      expect(r.formulaUsed).toBe("exact_higherIsBetter");
    });

    it("higher-is-better with target=0 -> null, not Infinity/NaN", () => {
      expect(calculateAchievement({ actual: 5, target: 0, baseline: null, direction: "HigherIsBetter" }).rawAchievementPct).toBeNull();
    });

    it("lower-is-better: target 4, actual 6", () => {
      const r = calculateAchievement({ actual: 6, target: 4, baseline: null, direction: "LowerIsBetter" });
      expect(r.rawAchievementPct).toBeCloseTo(66.6667, 3);
      expect(r.formulaUsed).toBe("exact_lowerIsBetter");
    });

    it("lower-is-better with actual=0 (a genuinely excellent result) -> +Infinity, not a crash", () => {
      const r = calculateAchievement({ actual: 0, target: 4, baseline: null, direction: "LowerIsBetter" });
      expect(r.rawAchievementPct).toBe(Infinity);
    });

    it("lower-is-better with both actual=0 and target=0 -> null (nothing to measure)", () => {
      expect(calculateAchievement({ actual: 0, target: 0, baseline: null, direction: "LowerIsBetter" }).rawAchievementPct).toBeNull();
    });

    it("lower-is-better with target=0 and actual>0 -> null, not a misleading 0%", () => {
      expect(calculateAchievement({ actual: 5, target: 0, baseline: null, direction: "LowerIsBetter" }).rawAchievementPct).toBeNull();
    });
  });

  it("throws on an unsupported direction rather than silently miscalculating", () => {
    expect(() => calculateAchievement({ actual: 1, target: 1, baseline: null, direction: "Sideways" })).toThrow(/Unsupported target direction/);
  });
});

describe("applyCap", () => {
  it("caps an over-100 achievement when enabled (brief §23)", () => {
    expect(applyCap(150, { enabled: true, value: 100 })).toBe(100);
  });
  it("leaves an over-100 achievement uncapped when disabled", () => {
    expect(applyCap(150, { enabled: false, value: 100 })).toBe(150);
  });
  it("caps +Infinity down to the configured value", () => {
    expect(applyCap(Infinity, { enabled: true, value: 100 })).toBe(100);
  });
  it("passes null through unchanged regardless of cap config", () => {
    expect(applyCap(null, { enabled: true, value: 100 })).toBeNull();
  });
  it("never caps a value already under the cap", () => {
    expect(applyCap(70, { enabled: true, value: 100 })).toBe(70);
  });
});

describe("calculateWeightedRollup", () => {
  it("matches the brief's own overall factory score worked example (§29)", () => {
    const domains = [
      { score: 85, weight: 30 }, // Productivity
      { score: 80, weight: 25 }, // Quality
      { score: 90, weight: 20 }, // Labor Compliance
      { score: 75, weight: 15 }, // OSH
      { score: 70, weight: 10 }, // HR
    ];
    expect(calculateWeightedRollup(domains)).toBeCloseTo(81.75, 2);
  });

  it("excludes an unscored child entirely, never averaging it as 0 (§15's edge case)", () => {
    const children = [
      { score: 80, weight: 50 },
      { score: null, weight: 50 }, // not yet measured
    ];
    // If the null were treated as 0, this would be 40. Excluding it
    // entirely (re-normalizing over the scored 50% weight) gives 80.
    expect(calculateWeightedRollup(children)).toBeCloseTo(80, 10);
  });

  it("returns null when nothing is scored yet, not 0", () => {
    expect(calculateWeightedRollup([{ score: null, weight: 100 }])).toBeNull();
    expect(calculateWeightedRollup([])).toBeNull();
  });

  it("returns null when total weight of scored children is 0", () => {
    expect(calculateWeightedRollup([{ score: 80, weight: 0 }])).toBeNull();
  });
});

describe("resolveRating", () => {
  const DEFAULT_LEVELS = [
    { name: "Excellent", minScore: 90, maxScore: 100 },
    { name: "Very Good", minScore: 80, maxScore: 89 },
    { name: "Good", minScore: 70, maxScore: 79 },
    { name: "Needs Improvement", minScore: 60, maxScore: 69 },
    { name: "Poor", minScore: 0, maxScore: 59 },
  ];

  it("resolves against the brief's own default band (§26), no off-by-one at boundaries", () => {
    expect(resolveRating(81.75, DEFAULT_LEVELS).name).toBe("Very Good"); // the §29 worked example's own result
    expect(resolveRating(90, DEFAULT_LEVELS).name).toBe("Excellent");
    expect(resolveRating(89, DEFAULT_LEVELS).name).toBe("Very Good");
    expect(resolveRating(0, DEFAULT_LEVELS).name).toBe("Poor");
  });

  it("returns null for a missing score, never guessing a default band", () => {
    expect(resolveRating(null, DEFAULT_LEVELS)).toBeNull();
    expect(resolveRating(undefined, DEFAULT_LEVELS)).toBeNull();
  });

  it("is driven entirely by the passed-in levels — a different scale changes the result with no code change", () => {
    const strictLevels = [{ name: "Pass", minScore: 95, maxScore: 100 }, { name: "Fail", minScore: 0, maxScore: 94 }];
    expect(resolveRating(90, strictLevels).name).toBe("Fail");
  });
});

describe("resolveRag", () => {
  const DEFAULT_RAG = { amberThreshold: 70, redThreshold: 50 };

  it("matches the brief's default (§27)", () => {
    expect(resolveRag(85, DEFAULT_RAG)).toBe("Green");
    expect(resolveRag(70, DEFAULT_RAG)).toBe("Green");
    expect(resolveRag(60, DEFAULT_RAG)).toBe("Amber");
    expect(resolveRag(50, DEFAULT_RAG)).toBe("Amber");
    expect(resolveRag(30, DEFAULT_RAG)).toBe("Red");
  });

  it("is Gray for a not-yet-measured score, distinct from Red", () => {
    expect(resolveRag(null, DEFAULT_RAG)).toBe("Gray");
    expect(resolveRag(undefined, DEFAULT_RAG)).toBe("Gray");
  });
});

describe("calculateImprovementScore", () => {
  it("matches the brief's own worked example exactly (§77): +20 points, 66.67% progress", () => {
    const r = calculateImprovementScore({ baseline: 55, current: 75, target: 85 });
    expect(r.improvementPoints).toBe(20);
    expect(r.progressTowardTarget).toBeCloseTo(66.67, 1);
  });

  it("returns null progress (not a divide-by-zero) when target equals baseline", () => {
    const r = calculateImprovementScore({ baseline: 55, current: 75, target: 55 });
    expect(r.improvementPoints).toBe(20);
    expect(r.progressTowardTarget).toBeNull();
  });

  it("a regression shows negative improvement points", () => {
    const r = calculateImprovementScore({ baseline: 55, current: 45, target: 85 });
    expect(r.improvementPoints).toBe(-10);
  });
});

describe("scoreMeasurement (the calculationTrace-shaped bundle)", () => {
  it("bundles achievement + cap + weighted contribution together, matching SCORING_ENGINE.md §5's transparency payload", () => {
    const trace = scoreMeasurement({
      actual: 66, target: 70, baseline: 55, direction: "HigherIsBetter",
      weight: 30, capConfig: { enabled: true, value: 100 },
    });
    expect(trace.formulaUsed).toBe("baselineToTarget_higherIsBetter");
    expect(trace.rawAchievementPct).toBeCloseTo(73.33, 2);
    expect(trace.capApplied).toBe(true);
    expect(trace.cappedAchievementPct).toBeCloseTo(73.33, 2); // under 100, cap has no effect
    expect(trace.weightedContribution).toBeCloseTo(73.33 * 0.3, 1);
  });

  it("preserves the raw value even when capping changes the displayed score", () => {
    const trace = scoreMeasurement({
      actual: 0, target: 4, baseline: null, direction: "LowerIsBetter",
      weight: 100, capConfig: { enabled: true, value: 100 },
    });
    expect(trace.rawAchievementPct).toBe(Infinity); // never silently lost
    expect(trace.cappedAchievementPct).toBe(100); // what's actually shown/scored
  });

  it("weightedContribution is null (not 0) when the achievement itself is null", () => {
    const trace = scoreMeasurement({ actual: 10, target: 10, baseline: 10, direction: "HigherIsBetter", weight: 50, capConfig: { enabled: true, value: 100 } });
    expect(trace.rawAchievementPct).toBeNull();
    expect(trace.weightedContribution).toBeNull();
  });
});
