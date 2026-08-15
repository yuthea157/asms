// pams_rating_scales/pams_rating_levels, pams_rag_rules,
// pams_scoring_rule_versions — the configurable rating/RAG/versioning
// catalogs (docs/pams/SCORING_ENGINE.md §8, §11, §12). Seeded once with
// the brief's own defaults (§26, §27), same idempotent pattern as every
// other PAMS catalog.

import { createRecord, createRecordWithId, getRecord, listRecords, orderBy, updateRecord, where } from "./pamsStore.js";

const DEFAULT_RATING_LEVELS = [
  { name: "Excellent", minScore: 90, maxScore: 100, ragStatus: "Green", order: 1 },
  { name: "Very Good", minScore: 80, maxScore: 89, ragStatus: "Green", order: 2 },
  { name: "Good", minScore: 70, maxScore: 79, ragStatus: "Amber", order: 3 },
  { name: "Needs Improvement", minScore: 60, maxScore: 69, ragStatus: "Amber", order: 4 },
  { name: "Poor", minScore: 0, maxScore: 59, ragStatus: "Red", order: 5 },
];

const DEFAULT_RATING_SCALE_ID = "rs_default";
const DEFAULT_RAG_RULE_ID = "rag_default";
const DEFAULT_SCORING_RULE_VERSION_ID = "sr_v1_0";

export async function ensureDefaultScoringConfigSeeded(ctx) {
  const existingScale = await getRecord("pams_rating_scales", DEFAULT_RATING_SCALE_ID);
  if (!existingScale) {
    await createRecordWithId("pams_rating_scales", DEFAULT_RATING_SCALE_ID, { name: "Default Rating Scale", isSystemDefault: true }, ctx);
    for (const level of DEFAULT_RATING_LEVELS) {
      await createRecord("pams_rating_levels", { ...level, ratingScaleId: DEFAULT_RATING_SCALE_ID }, ctx);
    }
  }

  const existingRag = await getRecord("pams_rag_rules", DEFAULT_RAG_RULE_ID);
  if (!existingRag) {
    await createRecordWithId("pams_rag_rules", DEFAULT_RAG_RULE_ID, {
      name: "Default RAG Rule", greenThreshold: 70, amberThreshold: 70, redThreshold: 50, isDefault: true,
    }, ctx);
  }

  const existingVersion = await getRecord("pams_scoring_rule_versions", DEFAULT_SCORING_RULE_VERSION_ID);
  if (!existingVersion) {
    await createRecordWithId("pams_scoring_rule_versions", DEFAULT_SCORING_RULE_VERSION_ID, {
      versionLabel: "1.0", effectiveFrom: new Date().toISOString().slice(0, 10), effectiveTo: null,
      achievementCapEnabled: true, achievementCapValue: 100,
      ratingScaleId: DEFAULT_RATING_SCALE_ID, ragRuleId: DEFAULT_RAG_RULE_ID, isActive: true,
    }, ctx);
  }
}

export async function getActiveScoringRuleVersion() {
  const versions = await listRecords("pams_scoring_rule_versions", [where("isActive", "==", true)]);
  return versions[0] || null;
}

export function listRatingLevels(ratingScaleId) {
  return listRecords("pams_rating_levels", [where("ratingScaleId", "==", ratingScaleId), orderBy("order")]);
}
export function getRagRule(id) {
  return getRecord("pams_rag_rules", id);
}

/**
 * Bundles everything scoreTarget()/rollupScores() (scores.js) need in one
 * call: the active version's cap config, its rating levels, and its RAG
 * rule — so every score calculation in a given run uses one consistent
 * snapshot rather than three separate reads that could race against a
 * config change mid-calculation.
 */
export async function loadActiveScoringContext(ctx) {
  await ensureDefaultScoringConfigSeeded(ctx);
  const version = await getActiveScoringRuleVersion();
  const [ratingLevels, ragRule] = await Promise.all([
    listRatingLevels(version.ratingScaleId),
    getRagRule(version.ragRuleId),
  ]);
  return {
    scoringRuleVersionId: version.id,
    capConfig: { enabled: version.achievementCapEnabled, value: version.achievementCapValue },
    ratingLevels, ragRule,
  };
}
