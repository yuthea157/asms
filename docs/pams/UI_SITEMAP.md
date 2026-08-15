# PAMS — UI Sitemap

## 1. Fits the existing navigation pattern, does not replace it

ASMS has no router — navigation is a `tab` string switched by an
`if/else` chain in `App()`, plus a `detail` object for drill-in screens
(ARCHITECTURE research, confirmed at `App.jsx:767-788`). PAMS adds one
new top-level nav entry, **"Factory Performance"** (keeps "Advisory
Management" and "Audit Management" exactly as they are — PAMS doesn't
absorb or rename existing menus), which owns a new `tab` value and a
richer internal sub-navigation of its own, following the same
local-`tab`-state-plus-pill-buttons pattern the existing "Advisory
Management" and "Audit Management" groups already use for their own
sub-screens.

```
Existing top nav (unchanged):
  Dashboard · Companies · Advisory Management · Audit Management
  · Training · Grievances · Documents · Reports · Administration

New top nav entry:
  Factory Performance   ← PAMS lives here
```

## 2. Factory Performance — sub-navigation

```
Factory Performance
 ├── Overview                (org-wide PAMS dashboard, all factories)
 ├── Projects                (list → detail)
 ├── Assessments             (list → detail/take-assessment)
 ├── Goals & Objectives      (hierarchy browser)
 ├── KPI Library             (catalog, admin-managed)
 ├── Actions & Tasks         (list, Kanban, Calendar, Gantt views)
 ├── Advisory Visits         (list → detail)
 ├── Findings                (list → detail)
 ├── Recommendations         (list → detail)
 ├── Risks & Issues          (two tabs, reuses/extends existing Risk Assessment)
 └── Benchmarking            (multi-factory comparison)
```

Each of these is a real screen (an `XView` component, matching ASMS's
existing per-module pattern), not a modal — consistent with how
"Advisory Management" and "Audit Management" are themselves grouped
nav items with their own internal tab strip today.

## 3. Factory profile — extends the existing Company detail screen

The existing Company detail screen (`detail.type === "company"`) gets
one new tab, **"Performance"**, alongside whatever tabs it has today.
That tab is PAMS's factory home screen:

```
Company detail → Performance tab
 ├── Factory Profile          (pams_factory_profiles — industry, workforce, departments)
 ├── Scorecard                 (overall score, domain breakdown, RAG — brief §73's table)
 ├── Projects                   (this factory's projects)
 ├── Goals → Objectives →         (hierarchy, this factory's project(s) only)
 │    Sub-Objectives → Targets → KPIs
 ├── Actions                       (this factory's actions, all views)
 ├── Advisory (Visits/Findings/       (this factory's advisory history)
 │    Recommendations/CAPs)
 ├── Risks & Issues
 ├── Reviews                            (periodic review history)
 └── Reports                              (factory-scoped report set, §7)
```

This matches the brief's §72 "Factory Profile" screen list almost
exactly, adapted into ASMS's existing tabbed-detail-screen pattern
rather than a new standalone page.

## 4. Screen inventory

### Dashboards

| Screen | Shows | Drill-down target |
|---|---|---|
| Factory Performance → Overview | Multi-factory table (brief §47): score, rating, RAG, domain scores, open/overdue actions, sortable | Click a factory row → its Scorecard tab |
| Factory Scorecard (per factory) | Overall score/rating/RAG + domain breakdown table (brief §73), widgets: goals/objectives/targets/actions counts, overdue actions, open findings/recommendations/CAPs/risks/issues | Click any score → SCORING_ENGINE.md §5 trace screen |
| Productivity / Labor-HR / OSH / Quality dashboards | Domain-filtered slices of the same underlying scores + trend charts | Same drill-down chain |
| Benchmarking | Factory vs factory, factory vs group average, factory vs baseline, period vs period (brief §48, §76) | Click a factory → its Scorecard |

### Hierarchy management

| Screen | Purpose |
|---|---|
| Projects list/detail | CRUD an Advisory Project; detail screen shows its Goal tree inline |
| Goals & Objectives (hierarchy browser) | Tree view: Goal → Objective → Sub-Objective → Target, expand/collapse, inline weight display, add-child buttons at every level |
| Target detail | Baseline/target/actual, KPI(s) attached, measurement history + trend chart, linked Actions, Score trace |
| KPI Library | Catalog list (brief §16's default library, seeded + custom), formula editor (SCORING_ENGINE.md §7's controlled expression builder — not a raw text box, a guided variable-picker + operator UI to keep users inside the allow-listed grammar) |

### Assessment

| Screen | Purpose |
|---|---|
| Assessment categories/items (admin) | Manage the configurable catalog (brief §9) |
| Take Assessment (Baseline/Interim/Final) | Wizard through categories → items, score/rate/evidence/finding per item (brief §10) |
| Assessment detail | Read-only view of a completed assessment, "Promote to Finding" action per item |
| Before/After comparison | Baseline vs Final vs Target, per brief §79, feeding the Impact Report |

### Actions & implementation

| Screen | Purpose |
|---|---|
| Actions list | Filterable/sortable table, bulk status update |
| Actions Kanban | Status-column board (brief §20) |
| Actions Calendar | Deadlines (actions, targets, CAPs, follow-ups, measurement due dates — brief §53) |
| Actions Gantt | Goal → Objective → Target → Action tree with dependencies/milestones (brief §54) |
| Action detail | Tasks checklist, evidence, progress slider, status history |

### Measurement

| Screen | Purpose |
|---|---|
| Enter Measurement | Period picker + planned/actual entry, per KPI-link, shows prior periods' trend inline |
| Measurement history (per Target) | Table + trend chart, verification status column, click a row → SCORING_ENGINE.md §5 trace |
| Verification queue | Reviewer's worklist of Submitted/Resubmitted measurements & evidence across their scope |

### Advisory

| Screen | Purpose |
|---|---|
| Advisory Visits list/detail | Structured visit record (brief §31), "Create Finding" action |
| Findings list/detail | Real Finding entity (brief §32), shows its source (visit/assessment/audit NC), "Create Recommendation" action |
| Recommendations list/detail | Brief §33 fields, "Escalate to CAP" action (writes into existing `caps`) |
| Corrective Actions (existing "Improvement Plan" screen) | Unchanged existing screen, gains a "Source Finding" link chip when `findingId` is set |

### Governance

| Screen | Purpose |
|---|---|
| Risks (existing "Risk Assessment" screen) | Unchanged, gains "Related Objective/Target" link chip when set, plus a heatmap view (brief §38) |
| Issues | New list/detail (brief §39) |
| Reviews | Periodic review entry (brief §51) — planned vs actual, variance, comments |
| Scoring Configuration (admin only) | Rating scales, RAG rules, scoring rule versions, domain weights, industry profiles — the `pams.scoringConfig` permission module |

### Reports (brief §57)

Rendered through the existing `exportExcel`/`exportPdf` pattern
(`App.jsx`'s existing report helpers), one new report component per
row, added to the existing Reports screen's list rather than a
separate PAMS reports area:

```
Factory Baseline Assessment · Factory Improvement Plan
Project / Goal / Objective / Target Performance · KPI Report
Factory Scorecard · Advisory Visit Report · Findings Report
Recommendation Follow-up · Corrective Action Report
Productivity / Labor Compliance / HR / OSH / Quality Report
Factory Benchmarking · Quarterly / Annual Performance Report
Management Executive Report · Audit Trail Report
```

Executive Report (brief §58) is the one report that's a genuine new
composed view (not a straight table export) — overall performance,
major improvements/gaps, top risks/issues/recommendations, overdue
actions, critical findings, trend, next priorities, one screen, print-
optimized.

## 5. Forms

Every create/edit form is a `Sheet`-hosted form component, matching
every existing ASMS form (`CompanyForm`, `CapForm`, etc.) exactly —
same modal/bottom-sheet behavior, same `Field`/`TextInput`/`Select`/`Btn`
primitives reused, not reinvented. New shared primitives PAMS adds
(because nothing existing covers them):

- `WeightInput` — number input + live "siblings sum to X%" indicator
  (SCORING_ENGINE.md §9)
- `FormulaBuilder` — guided KPI formula editor (variable picker +
  operator buttons, never a raw expression textbox)
- `HierarchyTreeSelect` — pick a parent Goal/Objective/Sub-Objective
  when creating a child
- `ScoreBadge` + `ScoreTraceSheet` — the clickable score chip used
  everywhere a score appears, opening SCORING_ENGINE.md §5's trace
  view
- `RagPill` — colored Green/Amber/Red/Gray badge, config-driven colors
- `EvidenceUploader` — Firebase Storage upload + `pams_evidence` create,
  replacing the existing base64-dataUrl pattern for PAMS entities only
  (ARCHITECTURE.md §4)

## 6. Permission module additions to the existing shell arrays

`PERMISSION_MODULES`, `MODULE_COLORS`, `defaultPermissions()`, and the
`NAV`/`MORE_NAV` arrays each get the PAMS entries from SECURITY.md §2
appended — the smallest possible touch to existing shell code, since
these arrays are explicitly designed to be extended (every existing
module is already just another entry in the same four lists).
