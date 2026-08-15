# PAMS — Test Plan

## 0. Starting point: ASMS has no test infrastructure today

`package.json` has no test runner, no assertion library, nothing —
confirmed by inspection, not assumed. PAMS introducing real tests
means introducing a test framework as part of Phase 2, not just
writing test files against something that already exists. This is
called out explicitly because it's a real, additive cost to the
roadmap, not a free checkbox.

**Chosen framework: [Vitest](https://vitest.dev/).** It's the natural
fit for a Vite project (shares Vite's config/transform pipeline, so no
separate Babel/webpack setup), has a Jest-compatible API (so any future
contributor's existing Jest knowledge transfers directly), and needs
exactly one new dev dependency (`vitest`) plus
`@testing-library/react` for the handful of component-level tests in
§3. Added to `package.json`:

```json
"devDependencies": {
  "vitest": "^2.x",
  "@testing-library/react": "^16.x",
  "@firebase/rules-unit-testing": "^4.x"
}
```

`@firebase/rules-unit-testing` plus the **Firebase Local Emulator
Suite** (a CLI tool, `firebase emulators:start --only firestore`, no
new npm dependency beyond the testing helper) is what makes §2's
integration tests possible without touching the real production
Firestore project — tests run against a real, local, disposable
Firestore instance, matching this project's own established principle
elsewhere of testing against the real engine rather than a fake one
wherever that's practical.

## 1. Unit tests — pure functions, no Firestore

Everything in `SCORING_ENGINE.md` is written as pure functions
(`calculateAchievement(actual, target, baseline, direction, capConfig)`,
`calculateWeightedRollup(children)`, `resolveRating(score, scale)`,
`resolveRag(score, rules)`, `evaluateKpiFormula(ast, variables)`,
`calculateImprovementScore(baseline, current, target)`) precisely so
they can be tested without a database at all — matching this project's
own "write tests for business logic" rule.

Required cases (not exhaustive, the actual floor):

```
Achievement — higher-is-better
  ✓ normal case (actual 66, target 70 → ~94.3%)
  ✓ target = 0 → null, not Infinity/NaN
  ✓ negative actual/target → rejected before reaching this function

Achievement — lower-is-better, no baseline
  ✓ normal case
  ✓ actual = 0 → capped result, not divide-by-zero

Achievement — baseline-to-target, both directions
  ✓ brief's own worked examples (50/70/60 → 50%; 8%/4%/6% → 50%)
  ✓ target = baseline → null, "N/A"
  ✓ actual regressed past baseline → negative %, not clamped to 0
  ✓ actual overshot target → >100%, not clamped unless cap enabled

Achievement cap
  ✓ enabled: 150% raw → 100% displayed, raw preserved in trace
  ✓ disabled: 150% raw → 150% displayed

Weighted rollup
  ✓ normal case (brief's own 30/25/20/15/10 → 81.75 worked example)
  ✓ a child with no score yet → excluded from the average, not treated as 0
  ✓ weights not summing to 100% → rejected at the validation layer (tested separately, not inside the pure rollup function itself)

Rating resolution
  ✓ boundary values (exactly 90, exactly 89, exactly 59/60) resolve to the correct band, no off-by-one

RAG resolution
  ✓ boundary values, and the "no measurement yet" → Gray case

KPI formula engine
  ✓ valid expression evaluates correctly against supplied variables
  ✓ expression referencing an undeclared variable → rejected at formula-save time
  ✓ expression containing anything outside the allow-listed grammar (e.g. attempted property access, function calls outside min/max/round/abs) → rejected at formula-save time, never reaches eval-equivalent code (because there is no eval-equivalent code — this test is really asserting the parser's allow-list rejects the input, not that something dangerous was safely sandboxed)

Improvement score
  ✓ brief's own worked example (baseline 55, current 75, target 85 → +20 points, 66.67% progress)
```

## 2. Integration tests — against the Firebase emulator

Run via `firebase emulators:start --only firestore,storage` in CI/
locally, `@firebase/rules-unit-testing`'s `initializeTestEnvironment()`
pointed at the emulator, never the real project.

```
pamsStore.js write functions
  ✓ create writes withAuditFields() (createdBy/createdAt stamped from the test's signed-in context)
  ✓ measurement create for a period with an existing VERIFIED measurement → rejected, must use supersede path
  ✓ measurement create for a period with an existing unverified (Submitted/UnderReview) measurement → allowed, edits in place
  ✓ score write on measurement verification → pams_scores document created with correct calculationTrace
  ✓ pams_factory_summaries document updates in the same transaction as a verified measurement (never out of sync — assert both writes succeed or both are absent after a simulated mid-transaction failure)

Firestore Security Rules (SECURITY.md §3)
  ✓ anonymous session: read allowed, write rejected — same as today's baseline
  ✓ real signed-in account: create on pams_measurements allowed
  ✓ update on a pams_measurements doc with verificationStatus: "Verified" → rejected, even by a real signed-in account
  ✓ update on a pams_measurements doc with verificationStatus: "Submitted" → allowed
  ✓ any write attempt directly to pams_scores.update or .delete → rejected (create-only enforced)
  ✓ (Phase 8, once custom claims ship) role/factory-scoped rule tests — a `user` role account with factoryId=A cannot read/write a pams_ document with factoryId=B

Weight validation
  ✓ saving a sibling group (e.g. three Objectives under a Goal) whose weights sum to 95% → rejected with the specific error, not silently normalized
```

## 3. Component tests

Lighter coverage, focused on the genuinely new shared primitives
(UI_SITEMAP.md §5) rather than every screen — the existing codebase's
own pattern of duplicated per-module CRUD screens means most PAMS
screens are closer to "configuration of a known-good pattern" than
novel logic, so testing effort concentrates on the pieces that are
actually new and reused everywhere:

```
ScoreBadge / ScoreTraceSheet
  ✓ renders score + rating label + RAG color correctly from a pams_scores document
  ✓ clicking opens the trace sheet showing baseline/target/actual/weight/formula/period/evidence/reviewer — every field SCORING_ENGINE.md §5 requires, none silently omitted

WeightInput
  ✓ shows the correct running total across sibling inputs
  ✓ flags visually when the total isn't 100%

FormulaBuilder
  ✓ only allows building expressions from the declared variable list + allow-listed operators/functions — cannot produce free-text arbitrary input
```

## 4. What is explicitly not tested, and why

- **Excel import parsing** (brief §59) — validated primarily through
  the mandatory preview/error-report step in the UI itself (a human
  reviews before confirming), rather than an exhaustive test matrix of
  malformed spreadsheets; a handful of golden-file tests (one valid
  import, one with a missing required column, one with a bad enum
  value) cover the parsing logic itself.
- **PDF export** — ASMS's existing `exportPdf()` relies on the
  browser's native print dialog (no PDF library at all); there is
  nothing programmatically assertable about print-dialog output, so
  this is a manual verification item (§5), not an automated test.
- **Visual/pixel-level UI regressions** — no visual regression tooling
  is introduced for this; ASMS has none today and PAMS's screens follow
  its existing inline-style patterns closely enough that this isn't
  judged worth the new tooling cost for v1.

## 5. Manual verification checklist (per phase, before calling a
   phase done)

Matches this project's own standing rule: never claim something works
without having actually run it. At the end of each ROADMAP.md phase:

```
□ npm run build succeeds clean
□ npm run dev — walk the phase's new screens on both mobile-width and
  desktop-width viewports (the app's one real breakpoint, DESKTOP_BP=860)
□ Every new Firestore write actually appears in the Firebase console
  (or emulator UI) with the expected shape — not just "the UI didn't
  error"
□ Firestore Security Rules for anything touched this phase re-verified
  against the emulator, not just assumed unchanged
□ Backup & Restore (existing feature) either includes any new
  blob-pattern keys this phase added, or is confirmed N/A because the
  phase only added real per-record collections (which Backup & Restore
  doesn't cover — flagged as a known gap, not silently accepted, see
  ROADMAP.md Phase 10)
```

## 6. Final Acceptance Test (brief §94, adapted)

The full 28-step scenario, run end-to-end against a real (emulator or
disposable dev-project) Firestore instance, once Phase 9 is complete:

```
1.  Create Factory (extend an existing Company with a pams_factory_profiles record)
2.  Conduct Baseline Assessment (all configured categories)
3.  Identify Gaps (assessment items scoring below their category's threshold)
4.  Create Advisory Project
5.  Create Goal
6.  Create Objective
7.  Create Sub-Objective
8.  Create Target (with baseline/target values, weight)
9.  Assign KPI (attach from library, or create new)
10. Create Improvement Actions (under the Target)
11. Assign Responsible Persons
12. Implement Actions (status progression, tasks completed)
13. Enter Monthly Measurements (at least 3 consecutive periods, to prove trend rendering)
14. Upload Evidence (on a measurement and on an action)
15. Verify Evidence (as a different user than the submitter — proves segregation of duties)
16. Calculate Achievement (confirm the correct formula variant ran — baseline-to-target, per SCORING_ENGINE.md §4)
17. Calculate Score (confirm weighted rollup up through Target → Sub-Objective → Objective → Goal → Project → Factory)
18. Assign Rating (confirm correct band)
19. Determine RAG (confirm correct color + the Gray "not started" case tested on an untouched sibling)
20. Identify Poor Performance (a deliberately under-target measurement, confirm it surfaces on the Overview dashboard sorted by lowest score)
21. Create Advisory Finding (from that poor-performing Target's area — sourced from an Advisory Visit)
22. Create Recommendation (from the Finding)
23. Create Corrective Action (escalate the Recommendation into the existing `caps` collection, confirm findingId/recommendationId round-trip)
24. Follow Up (CAP progress update, Recommendation status update)
25. Conduct Final Assessment (same categories as step 2)
26. Compare Baseline vs Final (the Before/After screen, UI_SITEMAP.md §4)
27. Calculate Improvement (SCORING_ENGINE.md §13 — both improvement points and progress-toward-target shown)
28. Generate Factory Impact Report (brief §80's full field list, exported to PDF via the existing print pattern)
```

**Pass criteria:** every step's data is independently visible via
drill-down from the factory's Overview/Scorecard screen (SCORING_ENGINE.md
§10) — the test isn't just "did each screen let me create a record,"
it's "can a reviewer, starting from the factory's overall score, click
down through every level and land on this exact scenario's real data,
with no dead links and no score shown without its calculation trace."
