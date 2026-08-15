# PAMS — Scoring, Rating, and RAG Engine

Governing rule (brief §30, §87): **no score is ever shown without its
full calculation trail one click away.** Every formula in this document
writes its inputs into `pams_scores.calculationTrace` (DOMAIN_MODEL.md
§7) precisely so the UI can always answer "why is this score 74?"
without recomputing anything.

## 1. Where calculation happens

All scoring math runs **client-side, in `pamsStore.js`**, inside a
Firestore `runTransaction()` when it's triggered by a write (a new
Measurement, a changed weight, a changed baseline/target), or on
read/render as a pure function when only *displaying* an
already-computed score. There is no server to own this exclusively —
see ARCHITECTURE.md §3. The transaction boundary is what stands in for
a real backend's "recalculate atomically" guarantee: the measurement
write and its resulting score write commit together or not at all, so
a dashboard summary document can never reflect a measurement that
didn't actually save.

## 2. Achievement score — higher-is-better

```
achievementPct = (actual / target) × 100
```

Guards:
- `target == 0` → achievement is undefined, not `Infinity` or `NaN`.
  Stored as `achievementPct: null`, rendered as "N/A — target not set",
  never silently shown as 0% or 100%.
- Negative `actual` or `target` on a metric where that's not physically
  meaningful (e.g. a percentage) is rejected at entry time by
  `pamsStore.js` validation (§9), not caught here.

## 3. Achievement score — lower-is-better

Naive `target / actual × 100` (brief §23) is kept as the **exact
achievement formula** when there is no baseline, but for anything
framed as an *improvement* (which is most of PAMS — defect rate,
absenteeism, turnover, accident rate, downtime, rework), the
baseline-aware version in §4 is used instead, because dividing directly
overstates progress made from a bad baseline. Both are implemented; the
Target's `direction` field plus whether `baseline` is set decides which
runs (§4 always wins when baseline is present, since it's strictly the
more correct measure of an improvement program's actual progress).

```
// only when no baseline is recorded for this target:
achievementPct = (target / actual) × 100     [lower-is-better, no baseline]
```

Same zero/negative guards as §2, plus: `actual == 0` on a lower-is-better
metric (e.g. zero defects) is a valid, excellent result — handled as a
special case returning `achievementPct: cap` (the configured cap, §6),
not a division by zero.

## 4. Baseline-to-target score (the primary formula for improvement
   programs — brief §24, §25)

```
// higher-is-better:
achievementPct = (actual − baseline) / (target − baseline) × 100

// lower-is-better:
achievementPct = (baseline − actual) / (baseline − target) × 100
```

Both reduce to the same shape: *"how much of the needed movement from
baseline to target has actually happened."* Worked example matching
the brief's own (baseline 50, target 70, actual 60 → 50%; baseline 8%,
target 4%, actual 6% defect rate → 50% also, by the lower-is-better
form).

Guards:
- `target == baseline` (no movement required) → `achievementPct: null`,
  "N/A — target equals baseline," never a divide-by-zero.
- Result is **not implicitly clamped to [0, 100]** by this formula
  alone — a factory that regressed past its baseline produces a
  negative percentage (correctly signaling regression, not "0%
  progress" which would hide that something got worse), and a factory
  that overshot its target produces >100% — both pass through
  unclamped into §6, where the configurable cap decides whether to
  clamp for *display/scoring* purposes. The raw, unclamped value is
  always preserved in `calculationTrace` even when the displayed score
  is capped.

## 5. Score transparency payload (brief §30 — mandatory, not optional)

Every `pams_scores` document's `calculationTrace` field holds enough to
reconstruct the number from scratch without touching the database
again:

```json
{
  "formulaUsed": "baselineToTarget_higherIsBetter",
  "baseline": 55, "target": 70, "actual": 66,
  "rawAchievementPct": 73.33,
  "capApplied": true, "cappedAchievementPct": 73.33,
  "weight": 0.30,
  "weightedContribution": 22.0,
  "measurementPeriod": "2026-03",
  "measurementId": "meas_xxx",
  "scoringRuleVersionId": "sr_v1_1",
  "evidenceIds": ["ev_xxx", "ev_yyy"],
  "verifiedBy": "u_officer1", "verifiedAt": "2026-03-05T10:00:00Z"
}
```

The score detail screen (UI_SITEMAP.md) renders this object directly —
Baseline / Target / Actual / Achievement / Weight / Score / Rating /
Formula / Period / Evidence / Reviewer, exactly the field list the
brief's §30 specifies, with nothing computed freshly for display that
wasn't already stored at calculation time.

## 6. Configurable achievement cap

```
pams_scoring_rule_versions.achievementCapEnabled: boolean
pams_scoring_rule_versions.achievementCapValue: number   // typically 100, but configurable per brief §23
```

When enabled, `score = min(achievementPct, capValue)`. When disabled,
`score = achievementPct` unclamped (a factory that doubled a target can
show a score of 150, if the organization wants over-achievement to be
visible rather than flattened to 100). This is a property of the
*active scoring rule version*, not a global constant — see §8.

## 7. KPI formula engine — controlled expression parser, never `eval`

Brief §17 is explicit: *"Never execute arbitrary programming code. Use
a controlled expression parser."* PAMS uses a small, hand-written
recursive-descent parser (no `eval`, no `new Function()`, no
`Function.prototype.call` on user text) restricted to:

- The four arithmetic operators (`+ - * /`) and parentheses
- Named variables, resolved only from the specific
  `pams_kpi_formulas.variables` list declared for that formula — an
  expression cannot reference anything not explicitly declared
- A tiny allow-listed function set: `min()`, `max()`, `round()`,
  `abs()` — nothing else is recognized, and an unrecognized identifier
  is a **validation error at formula save time**, not a runtime
  surprise during measurement entry

```
Line Efficiency = actualMinutesProduced / availableMinutes * 100
Absenteeism Rate = absentWorkerDays / scheduledWorkerDays * 100
Turnover Rate = separations / averageWorkforce * 100
Defect Rate = defectiveUnits / inspectedUnits * 100
```

The parser produces an AST once at formula-save time (validating
variable references against the declared list and rejecting anything
outside the allow-listed grammar), then the *same* validated AST is
evaluated numerically every time a measurement supplies values for
those variables — no re-parsing of untrusted text happens at
measurement-entry time, only numeric evaluation of an already-validated
tree.

## 8. Scoring rule versioning (brief §87, §88 — mandatory)

```
pams_scoring_rule_versions/{id}
  { versionLabel: "1.0", effectiveFrom, effectiveTo (null = current),
    achievementCapEnabled, achievementCapValue,
    ratingScaleId, ragRuleId, isActive }
```

Exactly one version has `isActive: true` at a time. Every
`pams_scores` document permanently stores which version calculated it
(`scoringRuleVersionId`). **Activating a new version never rewrites
existing `pams_scores` documents** — it only changes which rule the
*next* calculation uses. A historical score calculated under v1.0
remains exactly as it was when v2.0 becomes active; re-displaying it
re-reads its stored `calculationTrace`, it does not re-run the current
formula against old inputs. If an organization genuinely wants
historical data recalculated under a new rule, that is an explicit,
audited bulk-recalculation action (UI_SITEMAP.md's admin screen), never
an automatic side effect of publishing a new version.

## 9. Weighting and rollups

Weights are entered per sibling group (Objectives under a Goal, Targets
under a Sub-Objective, KPIs under a Target) and validated to sum to
100% at save time — `pamsStore.js` rejects a save that leaves a sibling
group's weights summing to anything else, surfaced as a form error, not
a silent normalization. (Draft/incomplete groups are allowed to be
under 100% only while explicitly marked "Draft" — see WORKFLOW /
SECURITY.md's approval states.)

Roll-up is always weighted average of the level below, computed
bottom-up:

```
Target.score        = weighted average of its KPI achievement scores (§2-6)
SubObjective.score   = weighted average of its child Targets' scores (and nested Sub-Objectives', if any — §DOMAIN_MODEL §2)
Objective.score       = weighted average of its Sub-Objectives' scores (or direct Targets, if a Target attaches straight to an Objective)
Goal.score             = weighted average of its Objectives' scores
Project.score            = weighted average of its Goals' scores
Factory.overallScore      = weighted average across configured domains (Productivity/Quality/Compliance/OSH/HR/...), per the brief §29 worked example
```

Each rollup level writes its own `pams_scores` document (DOMAIN_MODEL.md
§7) with its own `calculationTrace` (in this case, the trace lists each
child's score+weight+contribution, not raw measurement values) — so
drill-down (§10) always has a real stored document to read at every
level, never a value computed only for that one render.

## 10. Drill-down (brief §74)

```
Factory.overallScore (78)
  → click → domain scores (Productivity 82, Quality 75, ...)
    → click a domain → its Goals
      → click a Goal → its Objectives
        → click an Objective → its Sub-Objectives
          → click a Sub-Objective → its Targets
            → click a Target → its KPI(s) and measurement trend
              → click a measurement → its full calculationTrace + evidence
```

Every arrow above is a real Firestore query against a real document
(DOMAIN_MODEL.md's per-record collections are what make this possible
at all — the old blob-array pattern has no equivalent, since every
"level" would be an in-memory `.filter()` over an already-fully-loaded
array, which doesn't scale past a few hundred rows per type).

## 11. Rating engine

```
pams_rating_scales/{id} → pams_rating_levels/{id}
  { name: "Excellent", minScore: 90, maxScore: 100, ragStatus: "Green",
    description: "...", recommendedResponse: "...", order: 1 }
```

Default seed (brief §26), fully editable per organization/program:

```
90–100  Excellent           Green
80–89   Very Good           Green
70–79   Good                Amber
60–69   Needs Improvement   Amber
0–59    Poor                Red
```

A score's rating is resolved by finding the level whose
`[minScore, maxScore]` contains the score, under the rating scale
referenced by the active scoring rule version — never a hard-coded
`if/else` chain in a component (contrast with ASMS's existing
`capStatusOf()`, which *is* a hard-coded function — deliberately not
the pattern reused here, since the brief explicitly calls out
configurable rating scales as a requirement).

## 12. RAG engine

```
pams_rag_rules/{id}
  { name, greenThreshold, amberThreshold, redThreshold, appliesToEntityType }
```

Default (brief §27):

```
Green  — On Track       (score ≥ amberThreshold, e.g. ≥ 70)
Amber  — Needs Attention (redThreshold ≤ score < amberThreshold, e.g. 50–69)
Red    — Critical        (score < redThreshold, e.g. < 50)
Gray   — Not Started      (no measurement recorded yet for the current period)
```

RAG is computed independently of the Rating Scale (a factory could use
one rating-scale vocabulary for its own scorecard language while
keeping the simpler four-color RAG for exec dashboards) — both read
from the same underlying score, neither derives from the other.

## 13. Improvement score (brief §49, §77)

```
improvementPoints = currentScore − baselineScore

progressTowardTarget = (currentScore − baselineScore) / (targetScore − baselineScore) × 100
```

Both values are shown together everywhere an improvement score
appears (factory scorecard, benchmarking, impact report) — "+20 points"
alone hides whether that's 20% of the way to target or 90% of the way;
the brief is explicit that both must be visible.

## 14. Overall factory score worked example (matches brief §29)

```
Productivity        85 × 30% = 25.5
Quality               80 × 25% = 20.0
Labor Compliance       90 × 20% = 18.0
OSH                       75 × 15% = 11.25
HR                          70 × 10% =  7.0
                                      ------
Overall Factory Score                 81.75  →  rating "Very Good" (80-89 band)  →  RAG Green
```

Domain weights (`Productivity: 30%`, ...) live on
`pams_factory_profiles` (or a program-level default the factory
inherits), editable by an admin, validated to sum to 100% the same way
as §9's sibling-group rule.

## 15. Edge cases the engine must never silently mishandle

| Situation | Behavior |
|---|---|
| Target has no baseline and direction is lower-is-better | Falls back to §3's exact-division formula, flagged in `calculationTrace.formulaUsed` so the UI can note "baseline-based scoring not available for this target." |
| Weight sum ≠ 100% in a sibling group | Save rejected with a form error; never silently normalized. |
| Measurement submitted for a period that already has a *verified* measurement | Rejected — must go through the correction/supersede path (DOMAIN_MODEL.md §3), never overwritten. |
| Actual value's implied unit doesn't match the Target's unit | Rejected at entry (brief §89 — "Actual values must use the correct unit"). |
| Formula references a variable the measurement didn't supply | Measurement save rejected with the specific missing variable named, never computed as `NaN`/`0`. |
| A rollup's child has no score yet (e.g. a brand-new Objective with no Targets measured) | Rollup shows RAG Gray / score `null` — never averaged as if the missing child were 0. |
