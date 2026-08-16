# PAMS — Status (all 10 phases)

Honest reconciliation of what actually shipped against
[ROADMAP.md](ROADMAP.md)'s plan. Every phase below has: real Firestore
data-layer code, a matching UI wired into ASMS's existing shell, updated
`firestore.rules`, and (where the phase has genuinely pure logic) real
Vitest unit tests. **70 unit tests pass, zero network calls, against a
clean production build**, as of the last commit.

## Live verification — now done

`firestore.rules` and `storage.rules` have been published to the live
Firebase project (`advisoryms-a1902`). Confirmed end-to-end in a real
browser session: logged in as `dara@advisoryco.com`, opened ABC
Apparel's company detail, set up its factory profile (industry type,
legal name, workforce, etc.), saved it — the write succeeded (no more
`"Missing or insufficient permissions."`), 17 default departments were
seeded, and reloading the page showed the profile, departments,
assessments/projects/advisory/issues sections all rendering from real
Firestore data with zero console errors.

`firestore.indexes.json`'s 21 composite indexes are now deployed too,
via `firebase deploy --only firestore:indexes` (confirmed live via
`firebase firestore:indexes`). This needed a `firebase.json` +
`.firebaserc` added to the repo root (neither existed before — the
project had only ever used manually-published rules) and the Firebase
CLI installed locally. All three pieces of PAMS's Firestore
configuration — rules, storage rules, and indexes — are now live and
verified.

**A real bug was found and fixed during this verification pass**, unrelated
to the rules themselves: nine places across five PAMS components
(`ActionsAndTasks.jsx`, `AdvisorySection.jsx`, `AssessmentsSection.jsx`,
`IssuesSection.jsx`, `ProjectHierarchy.jsx`) passed a `reload` function
directly as a `useEffect` callback where `reload`'s own body was an
implicit-return arrow (`() => promise.then(...).catch(...)`). That
makes the effect itself return a Promise instead of `undefined`/a real
cleanup function; React stores whatever is returned as the effect's
"destroy" callback and calls it on unmount, crashing with
`"destroy is not a function"` and silently blanking the entire app to
a bare `<div id="root">` — with no console error, because nothing in
ASMS had an error boundary before this. This only ever triggered once
a factory had a *real* `pams_factory_profiles` record (every session
before now only ever exercised the always-safe empty-state branch, so
it went undetected until this pass). Fixed by wrapping each call as
`useEffect(() => { reload(); }, [deps])`; a new `src/ErrorBoundary.jsx`
now wraps the whole app so any future render crash shows a message and
stack trace instead of a silent blank screen.

## Phase-by-phase

**Phase 1 — Architecture.** 8 documents (this folder). The one load-bearing
decision — real per-record Firestore documents instead of ASMS's
existing blob-array pattern — held for all 9 phases after it; nothing
forced a reconsideration.

**Phase 2 — Foundation.** Factory profiles (`pams_factory_profiles`,
1:1 satellite on `companies`), departments, industry profiles, the new
"Factory Performance" nav entry, `pamsFactory` permission module. Shipped
exactly as planned.

**Phase 3 — Assessment.** Full brief §9 A–H category/item catalog
(seeded), the take-assessment wizard with per-item score/observation/
finding/evidence, Firebase Storage evidence uploads (`src/firebase.js`
gained a `storage` export — the first thing in ASMS to use Storage
instead of base64-in-Firestore). Rating uses a hard-coded default band
(`defaultRating.js`) in this phase, deliberately — the real configurable
Rating Scale entity arrives in Phase 6, per the original plan.

**Phase 4 — Planning.** Project → Goal → Objective → Sub-Objective
(arbitrary depth, `subObjectiveTree.js`) → Target → KPI, the full brief
§16 default KPI library (34 KPIs seeded), a real controlled expression
parser for KPI formulas (`formulaEngine.js` — no `eval`, hand-written
recursive-descent, rejects anything outside `+ - * /`, parentheses,
declared variables, and `min/max/round/abs`), and sibling-weight
validation. Shipped exactly as planned.

**Phase 5 — Implementation.** Actions (configurable status list, brief
§19), Tasks, Kanban board, a deadline calendar. **Deviation from
ROADMAP.md**: Gantt was not built — List + Kanban + Calendar cover the
same underlying data, and a real dependency-graph Gantt renderer was
judged not worth building half-finished this late; documented here as
a deliberate scope cut, not silently dropped.

**Phase 6 — Measurement & Scoring — the critical-path phase.**
`scoringEngine.js` is pure, dependency-free, and unit-tested against
every worked example in `SCORING_ENGINE.md` (32 tests): achievement
(exact and baseline-to-target, both directions), the configurable cap,
weighted rollup (including the "never average a missing child as 0"
rule), rating/RAG resolution, improvement score. Measurements are
genuinely append-only with a real verification workflow and
segregation-of-duties check. **Deviation from ROADMAP.md**: rollup is
an explicit, advisor-triggered "Recalculate scorecard" action per
project, not an automatic cascade on every single measurement write —
a full-tree Firestore transaction on every save was judged too risky/
complex for the time available and not meaningfully safer (a failed
recalculation is just re-run; every score's own `calculatedAt` always
reflects when it was actually computed, so nothing is ever silently
stale-but-mislabeled). Rollup currently reaches Project level; a single
weighted Factory-wide score across domains is Phase 9 work, and Phase 9
does surface one (`pams_factory_summaries.overallScore`, currently set
from the most-recalculated project — a real number, with the same
domain-mapping caveat noted below).

**Phase 7 — Advisory.** Advisory Visits (kept deliberately separate
from ASMS's existing free-text `visits`), Findings (a real stored
entity for the first time — ASMS's existing "Findings" screen is a
computed NC rollup, not a record), Recommendations, and
Recommendation→CAP escalation writing into the *existing* `caps`
collection. **Real bug found and fixed during this phase**: the
existing `CapsView`/`CompanyReport` screens resolve a CAP's company
strictly through `assessmentPlanId → advisoryInfo → companyId` — a
PAMS-escalated CAP has no assessment plan, so without a fix it would
have displayed as "Unassigned" and been invisible to Company User
accounts. Fixed with a one-line fallback to the CAP's own `companyId`
field in both places, verified not to change behavior for any existing
CAP (which always has a real assessment plan already).

**Phase 8 — Governance & Security.** Issues (genuinely new entity), a
risk heatmap added to the existing Risk Assessment screen (reuses that
screen's own `riskLevelOf`/`riskLevelTone`, so the heatmap and the list
can never disagree), custom fields data layer. **The real security
upgrade — Firebase Auth custom claims — is written but NOT deployed**:
`functions/index.js` is complete, documented reference code (same
pattern as `firestore.rules`), but deploying it requires upgrading this
Firebase project from the free Spark plan to pay-as-you-go Blaze, which
is a real, ongoing cost decision only the project owner should make —
not something to silently trigger. Until deployed, PAMS's authorization
remains UI-layer, identical in strength to the rest of ASMS today, not
a regression.

**Phase 9 — Reporting & Dashboards.** Multi-factory Overview (sortable
by score), a Factory Scorecard, Improvement Score (brief §77's own
worked example verified in tests), Before/After baseline-vs-final
assessment comparison, Excel/PDF export. **Deviation from ROADMAP.md**:
the scorecard's rows are Advisory Projects, not abstract "domains"
(Productivity/Quality/...) — this data model doesn't have a
domain-independent-of-project-name concept, and every project is
already named after exactly one such domain (`PROJECT_TYPES`), so each
project row already reads as a domain row in practice. A literal
separate domain-tagging system is a natural follow-up if a real
deployment shows the project-as-domain mapping isn't precise enough,
not built speculatively now.

**Phase 10 — Optimization & Hardening.** `firestore.indexes.json` (every
composite index every PAMS query needs — now deployed live, see "Live
verification" above), a genuine reusable Excel import wizard
(upload → validate → preview-with-errors → confirm → import, never
silently accepting a bad row) wired to the KPI Library as its reference
use, and live in-app notifications via a real `onSnapshot` listener
(overdue actions computed on read, same principle as ASMS's existing
`capStatusOf()`). **Not built**: a demo-data seed script — this Firebase
project already holds real, in-use company data (ABC Apparel, Best
Footwear, Great Travel Goods), and generating a large synthetic dataset
against it without being asked felt like the wrong default; happy to
build one against a disposable/dev project if wanted.

## Test suite

```
npm test
```

70 tests across 9 files — every one is a pure function with zero
Firestore/network dependency (see `auditFields.js`'s own doc comment
for why: anything that imports `pamsStore.js` would trigger
`firebase.js`'s real `signInAnonymously()` call against whatever
project `.env` points at, which is exactly what these tests are
structured to avoid). The scoring engine suite (32 tests) is the one
that matters most — every formula in `SCORING_ENGINE.md` is checked
against its own worked example, not just a made-up input.
