// The PAMS scoring engine — pure functions only, no Firestore, so every
// formula in docs/pams/SCORING_ENGINE.md can be unit tested directly
// against its own worked examples. Orchestration (reading measurements,
// writing pams_scores with a calculationTrace) lives in scores.js, which
// calls into this file rather than duplicating any of this math.

/**
 * Achievement score — the core formula selection logic (SCORING_ENGINE.md
 * §2-4). Baseline-to-target is used whenever a baseline is present
 * (strictly more correct for an improvement program than the naive
 * exact-division form); the exact form is the fallback when there's no
 * baseline to measure movement from.
 *
 * Returns { rawAchievementPct: number|null, formulaUsed: string } —
 * never throws, never returns NaN. `null` means "not calculable from
 * these inputs" (target equals baseline, target is zero, etc.), which the
 * caller must render as "N/A", never as 0% or 100%.
 */
export function calculateAchievement({ actual, target, baseline, direction }) {
  const hasBaseline = baseline !== null && baseline !== undefined;

  if (direction === "HigherIsBetter") {
    if (hasBaseline) {
      if (target === baseline) return { rawAchievementPct: null, formulaUsed: "baselineToTarget_higherIsBetter" };
      return { rawAchievementPct: ((actual - baseline) / (target - baseline)) * 100, formulaUsed: "baselineToTarget_higherIsBetter" };
    }
    if (target === 0) return { rawAchievementPct: null, formulaUsed: "exact_higherIsBetter" };
    return { rawAchievementPct: (actual / target) * 100, formulaUsed: "exact_higherIsBetter" };
  }

  if (direction === "LowerIsBetter") {
    if (hasBaseline) {
      if (baseline === target) return { rawAchievementPct: null, formulaUsed: "baselineToTarget_lowerIsBetter" };
      return { rawAchievementPct: ((baseline - actual) / (baseline - target)) * 100, formulaUsed: "baselineToTarget_lowerIsBetter" };
    }
    // No baseline: target/actual — but actual=0 (e.g. zero defects, a
    // genuinely excellent result) would divide by zero under the naive
    // form. Represented as +Infinity (mathematically the limit of
    // target/actual as actual→0), which applyCap() below turns into the
    // configured cap value when capping is enabled, or is rendered by the
    // UI as ">100%" when it's not — never a crash, never a silent 0.
    if (actual === 0) return { rawAchievementPct: target === 0 ? null : Infinity, formulaUsed: "exact_lowerIsBetter_zeroActual" };
    if (target === 0) return { rawAchievementPct: null, formulaUsed: "exact_lowerIsBetter" }; // target/actual=0 always regardless of actual — not meaningful, N/A rather than a misleading 0%
    return { rawAchievementPct: (target / actual) * 100, formulaUsed: "exact_lowerIsBetter" };
  }

  throw new Error(`Unsupported target direction "${direction}".`);
}

/**
 * Configurable achievement cap (SCORING_ENGINE.md §6) — a property of the
 * active scoring rule version, applied uniformly to every achievement
 * calculation. `null` passes through unchanged (still N/A after capping).
 */
export function applyCap(rawAchievementPct, capConfig) {
  if (rawAchievementPct === null || rawAchievementPct === undefined) return null;
  if (!capConfig?.enabled) return rawAchievementPct;
  return Math.min(rawAchievementPct, capConfig.value);
}

/**
 * Weighted rollup (SCORING_ENGINE.md §9) — a child with no score yet is
 * EXCLUDED from both the weighted sum and the weight total, never treated
 * as contributing a 0 (§15's edge-case table). Returns null only when
 * there is nothing scored to average at all.
 */
export function calculateWeightedRollup(children) {
  const scored = children.filter((c) => c.score !== null && c.score !== undefined && !Number.isNaN(c.score));
  if (scored.length === 0) return null;
  const totalWeight = scored.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
  if (totalWeight === 0) return null;
  const weightedSum = scored.reduce((sum, c) => sum + c.score * (Number(c.weight) || 0), 0);
  return weightedSum / totalWeight;
}

/**
 * Rating resolution (SCORING_ENGINE.md §11) against a configurable set of
 * levels (docs/pams/DOMAIN_MODEL.md §7's pams_rating_levels shape:
 * {name, minScore, maxScore, ragStatus, ...}). Never a hard-coded
 * if/else chain — the levels themselves are the only thing that changes
 * behavior here.
 */
export function resolveRating(score, ratingLevels) {
  if (score === null || score === undefined || Number.isNaN(score)) return null;
  return ratingLevels.find((level) => score >= level.minScore && score <= level.maxScore) || null;
}

/**
 * RAG resolution (SCORING_ENGINE.md §12) — independent of the Rating
 * Scale; both read from the same score, neither derives from the other.
 * No measurement yet (score is null) is Gray, not Red — "not started" is
 * a different state from "critical."
 */
export function resolveRag(score, ragRules) {
  if (score === null || score === undefined || Number.isNaN(score)) return "Gray";
  if (score >= ragRules.amberThreshold) return "Green";
  if (score >= ragRules.redThreshold) return "Amber";
  return "Red";
}

/**
 * Improvement score (SCORING_ENGINE.md §13) — both improvementPoints and
 * progressTowardTarget are always returned together, since either alone
 * hides part of the picture the brief is explicit about needing (brief's
 * own +20-points / 66.67%-progress worked example, §77).
 */
export function calculateImprovementScore({ baseline, current, target }) {
  const improvementPoints = current - baseline;
  const progressTowardTarget = target === baseline ? null : ((current - baseline) / (target - baseline)) * 100;
  return { improvementPoints, progressTowardTarget };
}

/**
 * One KPI measurement's full score computation, bundling achievement +
 * cap together — the shape this returns is exactly what scores.js writes
 * into a pams_scores document's calculationTrace (SCORING_ENGINE.md §5),
 * so the trace is never reconstructed differently from how the score was
 * actually calculated.
 */
export function scoreMeasurement({ actual, target, baseline, direction, weight, capConfig }) {
  const { rawAchievementPct, formulaUsed } = calculateAchievement({ actual, target, baseline, direction });
  const cappedAchievementPct = applyCap(rawAchievementPct, capConfig);
  return {
    formulaUsed,
    baseline: baseline ?? null, target, actual,
    rawAchievementPct, capApplied: !!capConfig?.enabled, cappedAchievementPct,
    weight, weightedContribution: cappedAchievementPct === null ? null : cappedAchievementPct * ((Number(weight) || 0) / 100),
  };
}
