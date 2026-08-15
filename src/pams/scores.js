// pams_scores — orchestration layer. Calls scoringEngine.js's pure
// functions and writes the results, with a full calculationTrace, per
// docs/pams/SCORING_ENGINE.md §5 ("no score is ever shown without its
// full calculation trail one click away").
//
// Rollup scope for this phase: Target → Sub-Objective (any depth) →
// Objective → Goal → Project. A single weighted Factory-wide score across
// domains (Productivity/Quality/OSH/...) is Phase 9 scope (docs/pams/
// ROADMAP.md's own phase boundary — it needs the dashboard/domain-mapping
// work, not just more rollup math) and is not built here.
//
// Each score write is its own atomic Firestore write, not one giant
// transaction spanning the whole hierarchy — a full-tree Firestore
// transaction would risk exceeding Firestore's per-transaction document
// limits on a large project and buys little real safety here (a
// recalculation that fails partway through is simply re-run; it never
// leaves stale data with a WRONG label, since every score's own
// calculatedAt/scoringRuleVersionId always reflects when it was actually
// computed).

import { createRecord, getRecord, listRecords, updateRecord, upsertRecordWithId, where } from "./pamsStore.js";
import { scoreMeasurement, calculateWeightedRollup, resolveRating, resolveRag } from "./scoringEngine.js";
import { loadActiveScoringContext } from "./ratingConfig.js";
import { getKpi } from "./kpis.js";
import { listKpiLinksForTarget } from "./kpis.js";
import { getTarget, listTargetsForParent } from "./targets.js";
import { listAllSubObjectivesForObjective } from "./subObjectives.js";
import { buildSubObjectiveTree } from "./subObjectiveTree.js";
import { getObjective, listObjectivesForGoal, updateObjective } from "./objectives.js";
import { getGoal, listGoalsForProject, updateGoal } from "./goals.js";
import { updateProject } from "./projects.js";
import { updateTarget } from "./targets.js";
import { updateSubObjective } from "./subObjectives.js";

async function writeScore({ entityType, entityId, factoryId, trace, scoringRuleVersionId, ratingLevels, ragRule }, ctx) {
  const score = trace.cappedAchievementPct ?? trace.rollupScore ?? null;
  const rating = resolveRating(score, ratingLevels);
  const rag = resolveRag(score, ragRule);
  const id = await createRecord("pams_scores", {
    entityType, entityId, factoryId,
    period: new Date().toISOString().slice(0, 10),
    scoringRuleVersionId,
    baseline: trace.baseline ?? null, target: trace.target ?? null, actual: trace.actual ?? null, weight: trace.weight ?? null,
    achievementPct: score, score, ratingLevelId: rating?.id || null, ratingName: rating?.name || null, ragStatus: rag,
    calculationTrace: trace,
    calculatedAt: new Date().toISOString(), calculatedBy: "system",
  }, ctx);
  return { id, score, rating, rag };
}

/** One KPI measurement's own score (called from measurements.js on every recordMeasurement). */
export async function scoreAndStoreMeasurement({ measurementId, kpiLink, target, actualValue, period }, ctx) {
  const kpi = await getKpi(kpiLink.kpiId);
  const scoringContext = await loadActiveScoringContext(ctx);
  const trace = scoreMeasurement({
    actual: Number(actualValue), target: Number(kpiLink.targetValue), baseline: kpiLink.baseline !== "" && kpiLink.baseline != null ? Number(kpiLink.baseline) : null,
    direction: kpi.direction, weight: kpiLink.weight, capConfig: scoringContext.capConfig,
  });
  trace.measurementId = measurementId;
  trace.scoringRuleVersionId = scoringContext.scoringRuleVersionId;

  const { id: scoreId, score, rating, rag } = await writeScore({
    entityType: "Measurement", entityId: measurementId, factoryId: target.factoryId,
    trace, scoringRuleVersionId: scoringContext.scoringRuleVersionId, ratingLevels: scoringContext.ratingLevels, ragRule: scoringContext.ragRule,
  }, ctx);

  await updateRecord("pams_measurements", measurementId, { achievementPct: score, scoreId }, ctx);
  await upsertRecordWithId("pams_target_summaries", target.id, {
    targetId: target.id, latestActual: Number(actualValue), latestPeriod: period || null,
    achievementPct: score, ratingName: rating?.name || null, ragStatus: rag, lastRecalculatedAt: new Date().toISOString(),
  }, ctx);

  return { scoreId, score, rating, rag };
}

/** A Target's own score — weighted rollup of its attached KPIs' latest scored measurement. */
export async function rollupTargetScore(targetId, ctx) {
  const target = await getTarget(targetId);
  const links = await listKpiLinksForTarget(targetId);
  const scoringContext = await loadActiveScoringContext(ctx);

  const childScores = [];
  for (const link of links) {
    const measurements = await listRecords("pams_measurements", [where("kpiLinkId", "==", link.id)]);
    const latest = measurements.filter((m) => m.achievementPct !== null && m.achievementPct !== undefined).sort((a, b) => (b.period || "").localeCompare(a.period || ""))[0];
    childScores.push({ score: latest ? latest.achievementPct : null, weight: link.weight });
  }
  const rollupScore = calculateWeightedRollup(childScores);

  const trace = { rollupType: "target_from_kpis", children: childScores, rollupScore, weight: target.weight };
  const { score, rating, rag } = await writeScore({
    entityType: "Target", entityId: targetId, factoryId: target.factoryId,
    trace, scoringRuleVersionId: scoringContext.scoringRuleVersionId, ratingLevels: scoringContext.ratingLevels, ragRule: scoringContext.ragRule,
  }, ctx);
  await updateTarget(targetId, { latestSummary: { score, ratingName: rating?.name || null, ragStatus: rag } }, ctx);
  return { score, rating, rag };
}

async function rollupChildren(entityType, entityId, factoryId, children, weightKey, scoringContext, ctx) {
  const childScores = await Promise.all(children.map(async (c) => ({ score: (await latestScoreFor(c.entityType, c.id)), weight: c[weightKey] })));
  const rollupScore = calculateWeightedRollup(childScores);
  const trace = { rollupType: `${entityType.toLowerCase()}_rollup`, children: childScores, rollupScore };
  return writeScore({ entityType, entityId, factoryId, trace, scoringRuleVersionId: scoringContext.scoringRuleVersionId, ratingLevels: scoringContext.ratingLevels, ragRule: scoringContext.ragRule }, ctx);
}

async function latestScoreFor(entityType, entityId) {
  const scores = await listRecords("pams_scores", [where("entityType", "==", entityType), where("entityId", "==", entityId)]);
  if (scores.length === 0) return null;
  const latest = scores.sort((a, b) => (b.calculatedAt || "").localeCompare(a.calculatedAt || ""))[0];
  return latest.score;
}

/** Rolls up one Sub-Objective from its child Sub-Objectives + Targets. */
export async function rollupSubObjectiveNode(node, factoryId, scoringContext, ctx) {
  for (const child of node.children || []) await rollupSubObjectiveNode(child, factoryId, scoringContext, ctx);
  const targets = await listTargetsForParent("subObjective", node.id);
  for (const t of targets) await rollupTargetScore(t.id, ctx);

  const children = [
    ...(node.children || []).map((c) => ({ entityType: "SubObjective", id: c.id, weight: c.weight })),
    ...targets.map((t) => ({ entityType: "Target", id: t.id, weight: t.weight })),
  ];
  const { score, rating, rag } = await rollupChildren("SubObjective", node.id, factoryId, children, "weight", scoringContext, ctx);
  await updateSubObjective(node.id, { latestSummary: { score, ratingName: rating?.name || null, ragStatus: rag } }, ctx);
  return score;
}

/** Full recalculation: every Objective's Sub-Objectives/Targets, then the Objective, then its Goal, then the Project. */
export async function recalculateProjectScorecard(projectId, factoryId, ctx) {
  const scoringContext = await loadActiveScoringContext(ctx);
  const goals = await listGoalsForProject(projectId);

  for (const goal of goals) {
    const objectives = await listObjectivesForGoal(goal.id);
    for (const objective of objectives) {
      const flatSubs = await listAllSubObjectivesForObjective(objective.id);
      const tree = buildSubObjectiveTree(flatSubs);
      for (const node of tree) await rollupSubObjectiveNode(node, factoryId, scoringContext, ctx);

      const directTargets = await listTargetsForParent("objective", objective.id);
      for (const t of directTargets) await rollupTargetScore(t.id, ctx);

      const children = [
        ...tree.map((n) => ({ entityType: "SubObjective", id: n.id, weight: n.weight })),
        ...directTargets.map((t) => ({ entityType: "Target", id: t.id, weight: t.weight })),
      ];
      const { score: objScore, rating: objRating, rag: objRag } = await rollupChildren("Objective", objective.id, factoryId, children, "weight", scoringContext, ctx);
      await updateObjective(objective.id, { latestSummary: { score: objScore, ratingName: objRating?.name || null, ragStatus: objRag } }, ctx);
    }

    const objChildren = objectives.map((o) => ({ entityType: "Objective", id: o.id, weight: o.weight }));
    const { score: goalScore, rating: goalRating, rag: goalRag } = await rollupChildren("Goal", goal.id, factoryId, objChildren, "weight", scoringContext, ctx);
    await updateGoal(goal.id, { latestSummary: { score: goalScore, ratingName: goalRating?.name || null, ragStatus: goalRag } }, ctx);
  }

  const goalChildren = goals.map((g) => ({ entityType: "Goal", id: g.id, weight: g.weight }));
  const { score: projectScore, rating: projectRating, rag: projectRag } = await rollupChildren("Project", projectId, factoryId, goalChildren, "weight", scoringContext, ctx);
  await updateProject(projectId, { latestSummary: { score: projectScore, ratingName: projectRating?.name || null, ragStatus: projectRag } }, ctx);

  await upsertRecordWithId("pams_factory_summaries", factoryId, {
    factoryId, overallScore: projectScore, overallRating: projectRating?.name || null, ragStatus: projectRag,
    lastRecalculatedAt: new Date().toISOString(), scoringRuleVersion: scoringContext.scoringRuleVersionId,
  }, ctx);

  return { projectScore, projectRating, projectRag };
}

export function listScoreHistory(entityType, entityId) {
  return listRecords("pams_scores", [where("entityType", "==", entityType), where("entityId", "==", entityId)]);
}
export function getScore(id) {
  return getRecord("pams_scores", id);
}
