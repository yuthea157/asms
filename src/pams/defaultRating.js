// The brief's default rating band (§26) — used as-is for Phase 3
// assessment item scoring, since the full configurable Rating Scale
// entity (docs/pams/SCORING_ENGINE.md §11, pams_rating_scales/
// pams_rating_levels) is explicitly Phase 6 scope. This is a deliberate,
// documented placeholder: real, useful behavior now (a score of 55 really
// does mean "Poor") without building the configuration UI/storage a whole
// phase early. Phase 6 replaces calls to this function with a lookup
// against the live Firestore rating scale; nothing about this file's
// call sites needs to change shape when that happens (both take a score,
// return a label).

const DEFAULT_BANDS = [
  { min: 90, max: 100, name: "Excellent", ragStatus: "Green" },
  { min: 80, max: 89, name: "Very Good", ragStatus: "Green" },
  { min: 70, max: 79, name: "Good", ragStatus: "Amber" },
  { min: 60, max: 69, name: "Needs Improvement", ragStatus: "Amber" },
  { min: 0, max: 59, name: "Poor", ragStatus: "Red" },
];

export function resolveDefaultRating(score) {
  if (score === null || score === undefined || Number.isNaN(score)) return null;
  const band = DEFAULT_BANDS.find((b) => score >= b.min && score <= b.max);
  return band || DEFAULT_BANDS[DEFAULT_BANDS.length - 1];
}
