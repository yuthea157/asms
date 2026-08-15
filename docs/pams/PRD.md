# PAMS — Product Requirements Document

## 1. What PAMS is

PAMS (Project Advisory Management System) is a new module inside ASMS
(the existing Advisory Management System) that turns today's flat,
per-audit corrective-action tracking into a full factory improvement
management platform:

```
ASSESS → PLAN → SET GOALS → SET OBJECTIVES → SET SUB-OBJECTIVES
  → SET TARGETS → DEFINE KPIs → CREATE ACTIONS → IMPLEMENT → MEASURE
  → VERIFY → SCORE → RATE → ADVISE → CORRECT → FOLLOW UP → IMPROVE
  → REASSESS
```

It is not a task tracker. Its job is to make one question answerable,
for any factory, at any time, with full traceability down to the
evidence: **did the advisory intervention actually produce measurable
improvement?**

## 2. Why this belongs inside ASMS, not next to it

ASMS already has the right *shape* of business, just shallower than
PAMS needs:

| ASMS today | PAMS need | Relationship |
|---|---|---|
| `companies` | Factory | PAMS extends the Company record with a factory profile (workforce, departments, industry profile) rather than replacing it — every existing module keyed on `companyId` keeps working. |
| `advisoryInfo` (Advisory Cycle) | Advisory Project | A cycle already scopes a company + date range; PAMS adds Goal/Objective/.../Action depth underneath it. |
| `visits` | Advisory Visit | Already exists; PAMS adds structured findings instead of one free-text log field. |
| `caps` ("Improvement Plan") | Corrective Action Plan | Already exists as a flat NC→action record; PAMS keeps it as the CAP entity and links it into the new Finding→Recommendation→CAP chain instead of reinventing it. |
| `auditTool` NC rows (computed "Findings") | Advisory Finding | Today's "Findings" screen is a read-only rollup of NC question rows, not a stored entity. PAMS introduces a real Finding entity that can originate from an audit NC *or* an advisory visit *or* a baseline assessment. |
| `riskAssessments` | Risk Register | Already exists in similar shape; kept, not replaced. |
| `selfAssessments` | Baseline Assessment (partial) | Structurally close (checklist snapshot + per-item answer), but scored per-question compliance, not the weighted category baseline PAMS needs — PAMS adds a dedicated Assessment entity for this. |

Nothing here is "throw it out and start over." PAMS is additive: new
collections for the genuinely new concepts (Project, Goal, Objective,
Sub-Objective, Target, KPI, Action, Task, Measurement, Score, Finding,
Recommendation), plus small additive fields on `companies`, plus real
links from the new Finding entity back into the existing `caps`
collection.

## 3. Scope decision: adapted to ASMS's real architecture, not the
   original spec's default stack

The originating brief assumed a relational backend (PostgreSQL,
ASP.NET Core, Redis, Hangfire). ASMS has none of that — it is a static
React/Vite SPA with Firestore as its only backend, no server, and
authorization enforced in the UI layer only (see
[SECURITY.md](SECURITY.md) for what that means and what PAMS does
about it). The user confirmed PAMS should be built **inside ASMS's
existing stack**, not as a new backend service.

Every following document in this set is written against that reality,
not against the original brief's default assumptions. Where the
original brief's requirement genuinely cannot be met without a server
(true relational foreign-key enforcement, a versioned append-only audit
table enforced at the database layer, background job processing), that
is called out explicitly rather than silently dropped or silently
faked — see each document's "adapted from the brief" notes.

One architectural change *is* being made relative to ASMS's existing
pattern, and is treated as a hard requirement, not a suggestion: PAMS
data is stored as **real per-record Firestore documents**, not as the
one-JSON-blob-per-entity-type pattern the rest of ASMS uses today. See
[ARCHITECTURE.md](ARCHITECTURE.md) §2 for why — in short, the existing
pattern rewrites and re-uploads an entire collection's array on every
single edit and is capped at Firestore's 1 MiB per-document limit for
the *whole collection combined*; PAMS's projected volume (thousands of
measurements/evidence records per factory) would hit that ceiling
almost immediately.

## 4. Users (mapped onto ASMS's existing 4 roles)

ASMS has exactly four roles today: `admin`, `manager`, `officer`,
`user` (company-scoped). The brief's long list of job titles (GM,
Compliance Manager, Project Manager, M&E Officer, Auditor, ...) are
**not** new system roles — they are real-world titles that map onto
these four:

| Brief's role examples | ASMS role | Scope |
|---|---|---|
| Super Administrator, Org Administrator | `admin` | Everything, unrestricted. |
| Program Manager, Project Manager, Regional Manager | `manager` | Everything the permission matrix grants; typically full PAMS access. |
| Technical/Labor/OSH/Quality Advisor, M&E Officer, Auditor | `officer` | Day-to-day PAMS data entry, findings, measurements; scoped by the permission matrix like every other module today. |
| Factory GM, HR/Compliance/Production Manager, Factory Supervisor | `user` (company-scoped) | Read/limited-write on their own factory's PAMS records only, same `scopeCompanyId` mechanism already used for company users. |

If real deployments need finer-grained roles later (e.g. a
factory-side user who can enter measurements but not create targets),
that is a permission-matrix *action* addition (see SECURITY.md), not a
new role — matching how ASMS already differentiates `view/edit/delete`
per module per role today.

## 5. What ships, and what's explicitly deferred

**In scope for PAMS v1** (this roadmap, all phases in
[ROADMAP.md](ROADMAP.md)):

- Factory profile extension (workforce, departments, industry profile)
- Advisory Project (extends Advisory Cycle)
- Baseline Assessment (configurable categories, weighted scoring)
- Goal → Objective → Sub-Objective → Target hierarchy, arbitrary
  sub-objective depth
- KPI library (reusable, formula-driven) + configurable formula engine
- Action → Task with responsible-person assignment, status, progress
- Periodic Measurement entry with history (never overwritten)
- Evidence attachment + verification workflow
- Configurable Score / Rating / RAG engine, with versioned scoring
  rules (see SCORING_ENGINE.md)
- Advisory Visit structured findings (replacing the free-text log)
- Advisory Finding → Recommendation → Corrective Action chain, wired
  into the existing `caps` collection
- Risk register (reusing/extending the existing entity)
- Factory scorecard, drill-down, benchmarking, improvement-trend
  dashboards
- Reports: baseline assessment, improvement plan, scorecard, advisory
  visit, findings, recommendations, CAP, benchmarking — export via the
  existing Excel/print-to-PDF pattern
- Excel import for bulk-loading factories/goals/targets/KPIs/actions

**Explicitly deferred, not silently dropped:**

- Real server-side RBAC enforcement (needs Cloud Functions or Firestore
  custom claims — a real but separately-scoped follow-up; see
  SECURITY.md §5)
- Multi-tenancy beyond what `companyId` scoping already gives (the
  brief's "Client A / Client B" isolation is effectively ASMS's
  existing company-scoping, already sufficient for one shared
  deployment)
- AI-assisted analysis (brief §75) — the data model is built so nothing
  needs restructuring later, but no AI feature ships in v1
- Hangfire/background-job-style async report generation — ASMS has no
  server to run jobs on; large reports run client-side, with the
  volume ceilings documented in ARCHITECTURE.md §6 as the reason this
  is safe at the scale PAMS is actually built for
- Redis caching — not applicable without a server; the equivalent
  concern (avoid recomputing expensive rollups on every dashboard
  render) is handled by materialized summary documents, see
  ARCHITECTURE.md §7

## 6. Success criteria

PAMS v1 is done when the Final Acceptance Test scenario (originating
brief §94, restated per this architecture in
[TEST_PLAN.md](TEST_PLAN.md) §5) passes end-to-end against real
Firestore data: create factory → baseline assessment → gap → project →
goal → objective → sub-objective → target → KPI → action → measurement
→ evidence → verification → score → rating → RAG → finding →
recommendation → CAP → follow-up → final assessment → baseline-vs-final
comparison → factory impact report — with every step's data traceable
back to its source, and no score ever shown without its full
calculation trail visible on click.
