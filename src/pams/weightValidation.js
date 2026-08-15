// Sibling-group weight validation (docs/pams/SCORING_ENGINE.md §9): every
// group of siblings under the same parent (Objectives under a Goal,
// Targets under a Sub-Objective, KPIs under a Target) must sum to 100% —
// rejected at save time, never silently normalized.

const EPSILON = 0.01; // percentage points — tolerates ordinary floating-point rounding, not a real imbalance

export function sumWeights(weights) {
  return weights.reduce((sum, w) => sum + (Number(w) || 0), 0);
}

export function weightsAreValid(weights) {
  if (weights.length === 0) return true; // an empty group has nothing to validate yet
  const sum = sumWeights(weights);
  return Math.abs(sum - 100) <= EPSILON;
}

/**
 * Returns a validation error message, or null if the group is valid.
 * `allowDraft` (docs/pams/SCORING_ENGINE.md §9's "Draft/incomplete groups"
 * carve-out) skips the 100% check entirely while a hierarchy is still
 * being assembled.
 */
export function validateSiblingWeights(weights, { allowDraft = false } = {}) {
  if (allowDraft) return null;
  if (weights.some((w) => Number(w) < 0)) return "Weight cannot be negative.";
  if (!weightsAreValid(weights)) {
    const sum = Math.round(sumWeights(weights) * 100) / 100;
    return `Weights must sum to 100% (currently ${sum}%).`;
  }
  return null;
}
