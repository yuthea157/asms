# PAMS — Status (all 10 phases)

Honest reconciliation of what actually shipped against
[ROADMAP.md](ROADMAP.md)'s plan. Every phase below has: real Firestore
data-layer code, a matching UI wired into ASMS's existing shell, updated
`firestore.rules`, and (where the phase has genuinely pure logic) real
Vitest unit tests. **70 unit tests pass, zero network calls, against a
clean production build**, as of the last commit.

## What's NOT yet confirmed working live, and why

Two things gate full live verification, both outside what code alone
can resolve:

1. **`firestore.rules`, `storage.rules`, and `firestore.indexes.json`
   have not been published to the live Firebase project.** This was
   confirmed directly, not assumed: attempting to save a factory
   profile through the running app returns Firestore's own
   `"Missing or insufficient permissions."` error — proof the write
   correctly reaches Firestore with the right shape, rejected only
   because the rules living in this repo aren't the rules actually
   enforced on the server yet. Publish all three (Firebase Console →
   Firestore Database → Rules / Indexes, and → Storage → Rules) to
   unblock this.
2. **Live browser verification was repeatedly blocked by network
   instability** in the automated testing environment specifically
   (intermittent `ERR_FAILED`/`ERR_ABORTED` on calls to
   `identitytoolkit.googleapis.com`), not by anything in the app. One
   clean run did succeed end-to-end (login → Companies → a real
   company's Performance tab rendering correctly, zero console errors),
   which is real evidence the core wiring works — but the full
   create-a-project-through-recalculate-a-scorecard flow has not been
   click-tested end-to-end in a real browser session by this session's
   own automation. Worth doing once the rules above are published.

Neither of these reflects a code defect found and left unfixed — both
are deployment/environment blockers, documented here rather than
silently worked around or silently claimed as verified.

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
composite index every PAMS query needs — without this file deployed,
several Phase 5-9 screens would throw Firestore "requires an index"
errors on first real use), a genuine reusable Excel import wizard
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
