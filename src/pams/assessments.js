// pams_assessments — baseline/interim/final factory assessments. Item
// results are embedded (bounded by the fixed catalog size, same
// size-safety reasoning as ASMS's existing auditTool.questions embedding
// — see docs/pams/DOMAIN_MODEL.md §8), everything else about PAMS is a
// real per-record document (docs/pams/ARCHITECTURE.md §2).

import { createRecord, getRecord, listRecords, updateRecord, where, orderBy } from "./pamsStore.js";
import { ensureDefaultAssessmentCatalogSeeded, listAllAssessmentItemsGroupedByCategory } from "./assessmentCategories.js";
import { resolveDefaultRating } from "./defaultRating.js";

export const ASSESSMENT_TYPES = ["Baseline", "Interim", "Final"];

export async function createDraftAssessment({ factoryId, projectId, assessmentType }, ctx) {
  // Idempotent — safe to call on every assessment creation rather than
  // requiring a separate app-boot seeding step or trusting the UI to have
  // triggered it first (docs/pams/assessmentCategories.js's own doc
  // comment on why this is cheap to repeat).
  await ensureDefaultAssessmentCatalogSeeded(ctx);
  const grouped = await listAllAssessmentItemsGroupedByCategory();
  const itemResults = grouped.flatMap(({ category, items }) =>
    items.map((item) => ({
      itemId: item.id, categoryId: category.id,
      score: null, ratingLabel: null, evidenceIds: [],
      observation: "", finding: "", risk: "", recommendedAction: "",
      findingId: null,
    }))
  );
  const id = await createRecord("pams_assessments", {
    factoryId, projectId: projectId || null, assessmentType,
    assessmentDate: new Date().toISOString().slice(0, 10),
    conductedByUserId: ctx?.role?.id || null,
    status: "Draft",
    itemResults,
    overallScore: null, overallRatingLabel: null,
  }, ctx);
  return id;
}

export function getAssessment(id) {
  return getRecord("pams_assessments", id);
}

export function listAssessmentsForFactory(factoryId) {
  return listRecords("pams_assessments", [where("factoryId", "==", factoryId), orderBy("assessmentDate", "desc")]);
}

/**
 * Read-modify-write the whole document — safe here specifically because
 * itemResults is bounded (docs/pams/DOMAIN_MODEL.md §8), unlike PAMS's
 * unbounded collections (measurements, evidence), which are always real
 * individual documents precisely to avoid this pattern at real volume.
 */
export async function updateItemResult(assessmentId, itemId, patch, ctx) {
  const assessment = await getAssessment(assessmentId);
  if (!assessment) throw new Error("Assessment not found.");
  if (assessment.status !== "Draft") throw new Error("Only a Draft assessment's item results can be edited — reopen it first.");
  const nextItemResults = assessment.itemResults.map((r) =>
    r.itemId === itemId
      ? { ...r, ...patch, ratingLabel: patch.score !== undefined ? resolveDefaultRating(patch.score)?.name || null : r.ratingLabel }
      : r
  );
  await updateRecord("pams_assessments", assessmentId, { itemResults: nextItemResults }, ctx);
}

/**
 * Overall score is the plain average of every scored item (brief §10's
 * baseline concept) — weighted category rollups arrive with the full
 * scoring engine in Phase 6 (docs/pams/SCORING_ENGINE.md); this is
 * intentionally the simplest honest number available now, not a
 * placeholder pretending to be the final formula.
 */
export async function submitAssessment(assessmentId, ctx) {
  const assessment = await getAssessment(assessmentId);
  if (!assessment) throw new Error("Assessment not found.");
  const scored = assessment.itemResults.filter((r) => typeof r.score === "number");
  if (scored.length === 0) throw new Error("Score at least one item before submitting.");
  const overallScore = Math.round((scored.reduce((sum, r) => sum + r.score, 0) / scored.length) * 10) / 10;
  const overallRatingLabel = resolveDefaultRating(overallScore)?.name || null;
  await updateRecord("pams_assessments", assessmentId, { status: "Submitted", overallScore, overallRatingLabel }, ctx);
  return { overallScore, overallRatingLabel };
}

export function reopenAssessment(assessmentId, ctx) {
  return updateRecord("pams_assessments", assessmentId, { status: "Draft" }, ctx);
}

export function markAssessmentReviewed(assessmentId, ctx) {
  return updateRecord("pams_assessments", assessmentId, { status: "Reviewed" }, ctx);
}
