// Server-side scoring: makes pams_scores genuinely "system-write-only"
// rather than nominally so. The client (src/pams/scores.js) still
// decides WHAT to recalculate and in WHAT order (walking the Target ->
// Sub-Objective -> Objective -> Goal -> Project tree) -- that's pure
// orchestration/sequencing, harmless for a client to control. What it
// can no longer do is decide the SCORE VALUE itself: every write goes
// through this function, which independently re-runs the exact same
// pure math the client used to run locally (imported directly from
// src/pams/scoringEngine.js -- the single source of truth for the
// formulas, already covered by scoringEngine.test.js's 32 unit tests) and
// inserts the result using the service-role key, which bypasses RLS.
// A client calling pams_scores insert directly gets rejected by RLS
// (see the 20260821120500 migration's pams_scores policies -- no INSERT
// policy exists for the authenticated/anon roles at all).
//
// Request: POST
//   { mode: "measurement", actual, target, baseline, direction, weight,
//     capConfig, entityType: "Measurement", entityId, factoryId,
//     scoringRuleVersionId, ratingLevels, ragRule, measurementId? }
//   { mode: "rollup", children: [{score, weight}], weight,
//     entityType, entityId, factoryId, rollupType,
//     scoringRuleVersionId, ratingLevels, ragRule }
// Response: { id, score, ratingLevelId, ratingName, ragStatus }

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  scoreMeasurement,
  calculateWeightedRollup,
  resolveRating,
  resolveRag,
} from "../../../src/pams/scoringEngine.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

  // Any real signed-in user may request a recalculation (matches the
  // pre-migration Firestore rules, which let any non-anonymous
  // authenticated user write scores) -- this call just confirms the
  // caller has a real session at all, the same floor every other
  // authenticated write in this app already requires.
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user) return jsonResponse({ error: "Invalid or expired session" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { mode, entityType, entityId, factoryId, scoringRuleVersionId, ratingLevels, ragRule } = body as {
    mode?: string; entityType?: string; entityId?: string; factoryId?: string | null;
    scoringRuleVersionId?: string | null; ratingLevels?: unknown[]; ragRule?: unknown;
  };
  if (!mode || !entityType || !entityId) {
    return jsonResponse({ error: "mode, entityType, and entityId are required" }, 400);
  }

  let trace: Record<string, unknown>;
  let score: number | null;

  if (mode === "measurement") {
    const { actual, target, baseline, direction, weight, capConfig, measurementId } = body as {
      actual?: number; target?: number; baseline?: number | null; direction?: string;
      weight?: number; capConfig?: { enabled: boolean; value: number }; measurementId?: string;
    };
    if (actual == null || target == null || !direction) {
      return jsonResponse({ error: "actual, target, and direction are required for mode=measurement" }, 400);
    }
    trace = scoreMeasurement({ actual, target, baseline: baseline ?? null, direction, weight, capConfig });
    if (measurementId) trace.measurementId = measurementId;
    trace.scoringRuleVersionId = scoringRuleVersionId ?? null;
    score = (trace.cappedAchievementPct as number | null) ?? null;
  } else if (mode === "rollup") {
    const { children, weight, rollupType } = body as {
      children?: { score: number | null; weight: number }[]; weight?: number; rollupType?: string;
    };
    if (!Array.isArray(children)) return jsonResponse({ error: "children array is required for mode=rollup" }, 400);
    const rollupScore = calculateWeightedRollup(children);
    trace = { rollupType: rollupType ?? `${entityType.toLowerCase()}_rollup`, children, rollupScore, weight: weight ?? null };
    score = rollupScore;
  } else {
    return jsonResponse({ error: `Unknown mode "${mode}"` }, 400);
  }

  const rating = resolveRating(score, (ratingLevels as { id: string; name: string; minScore: number; maxScore: number }[]) ?? []);
  const rag = resolveRag(score, (ragRule as { amberThreshold: number; redThreshold: number }) ?? { amberThreshold: 100, redThreshold: 0 });

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const id = crypto.randomUUID();
  const { error: insertErr } = await adminClient.from("pams_scores").insert({
    id, entity_type: entityType, entity_id: entityId, factory_id: factoryId ?? null,
    period: new Date().toISOString().slice(0, 10),
    scoring_rule_version_id: scoringRuleVersionId ?? null,
    baseline: (trace.baseline as number | null) ?? null,
    target: (trace.target as number | null) ?? null,
    actual: (trace.actual as number | null) ?? null,
    weight: (trace.weight as number | null) ?? null,
    achievement_pct: score, score,
    rating_level_id: rating?.id ?? null, rag_status: rag,
    calculation_trace: trace, calculated_at: new Date().toISOString(), calculated_by: "system",
  });
  if (insertErr) return jsonResponse({ error: insertErr.message }, 500);

  return jsonResponse({ id, score, ratingLevelId: rating?.id ?? null, ratingName: rating?.name ?? null, ragStatus: rag }, 200);
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
