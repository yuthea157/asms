# PAMS Architecture Documents

Project Advisory Management System — a new module inside ASMS. This
folder started as the Phase 1 deliverable (architecture and analysis
only, per the standing rule not to start large-scale generation before
this exists); all 10 phases are now built — see [STATUS.md](STATUS.md)
for what actually shipped in each phase versus this original plan.

Read in this order:

1. **[PRD.md](PRD.md)** — what PAMS is, why it fits inside ASMS's
   existing Firestore/no-backend architecture rather than a new
   service, what ships in v1 vs. what's deferred.
2. **[ARCHITECTURE.md](ARCHITECTURE.md)** — how PAMS fits into ASMS
   technically: why it uses real per-record Firestore documents
   instead of the existing blob-array pattern, the data-access-layer
   design, evidence/file storage, and the realistic scale this is
   built for.
3. **[DOMAIN_MODEL.md](DOMAIN_MODEL.md)** — every entity, its
   Firestore schema, and how it links to ASMS's existing collections
   (`companies`, `caps`, `riskAssessments`, `visits`).
4. **[SCORING_ENGINE.md](SCORING_ENGINE.md)** — every formula
   (achievement, baseline-to-target, weighted rollup), the rating and
   RAG engines, the controlled KPI-formula expression parser, and
   scoring-rule version control.
5. **[SECURITY.md](SECURITY.md)** — roles/permissions (extends ASMS's
   existing 4-role matrix), what Firestore Security Rules can and
   can't enforce today, and the concrete Phase 8 plan to close the gap
   with Firebase Auth custom claims.
6. **[UI_SITEMAP.md](UI_SITEMAP.md)** — every screen, fitted into
   ASMS's existing state-based navigation (no router).
7. **[ROADMAP.md](ROADMAP.md)** — the 10-phase build plan, each phase
   ending in a deployable, testable state.
8. **[TEST_PLAN.md](TEST_PLAN.md)** — unit/integration/component test
   strategy (introduces Vitest + the Firebase emulator, neither of
   which exist in this repo today), plus the 28-step Final Acceptance
   Test.

## The one decision this whole set hinges on

ASMS stores every entity type as **one Firestore document holding a
JSON array of every record of that type** — every edit rewrites the
whole array, capped at Firestore's 1 MiB document limit. PAMS's
projected volume (thousands of measurements/evidence records) would
break that pattern almost immediately, so PAMS uses **real,
individual per-record Firestore documents** instead — still 100%
inside ASMS's existing Firebase project, no new infrastructure, just
not the same anti-pattern. Full reasoning in ARCHITECTURE.md §2.

## Status

**All 10 phases built.** See [STATUS.md](STATUS.md) for the honest,
phase-by-phase reconciliation of what shipped versus this original
plan — including the one real live-verification blocker still open
(publishing `firestore.rules`/`storage.rules` to the Firebase Console)
and the one piece of infrastructure that's written but deliberately
not deployed (the Phase 8 Cloud Function, `functions/index.js`).
