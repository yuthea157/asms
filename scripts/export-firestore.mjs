// One-time export of every collection this migration cares about
// (advisoryDeskShared + the 33 pams_* collections) from the live
// Firestore project, to local JSON files -- the input to
// migrate-to-supabase.mjs. Uses a direct Admin SDK read rather than a
// managed `gcloud firestore export` since this dataset is small enough
// (dozens of companies, thousands of PAMS records at most) that a
// direct read is simpler and easier to make idempotent/rerunnable.
//
// Usage: SERVICE_ACCOUNT_PATH=/path/to/key.json node export-firestore.mjs [outDir]

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { writeFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";

const serviceAccountPath = process.env.SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath) {
  console.error("Set SERVICE_ACCOUNT_PATH to the Firebase service account JSON file path.");
  process.exit(1);
}
const outDir = process.argv[2] ?? "./export";

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const PAMS_COLLECTIONS = [
  "pams_factory_groups", "pams_industry_profiles", "pams_factory_profiles", "pams_departments",
  "pams_projects", "pams_goals", "pams_objectives", "pams_sub_objectives", "pams_targets",
  "pams_kpis", "pams_kpi_formulas", "pams_kpi_links", "pams_measurements", "pams_actions",
  "pams_tasks", "pams_evidence", "pams_advisory_visits", "pams_findings", "pams_recommendations",
  "pams_issues", "pams_scores", "pams_scoring_rule_versions", "pams_rating_scales",
  "pams_rating_levels", "pams_rag_rules", "pams_custom_fields", "pams_custom_field_values",
  "pams_assessment_categories", "pams_assessment_items", "pams_assessments", "pams_notifications",
  "pams_audit_logs", "pams_factory_summaries", "pams_target_summaries",
];

// Firestore Timestamp -> ISO 8601 string, recursively, so the exported
// JSON is directly usable by the transform step without a second pass.
function serialize(value) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = serialize(v);
    return out;
  }
  return value;
}

async function exportCollection(name) {
  const snap = await db.collection(name).get();
  const docs = snap.docs.map((d) => ({ id: d.id, ...serialize(d.data()) }));
  await writeFile(path.join(outDir, `${name}.json`), JSON.stringify(docs, null, 2));
  return docs.length;
}

async function main() {
  await mkdir(outDir, { recursive: true });

  console.log("Exporting advisoryDeskShared (legacy blob-array entities)...");
  const sharedCount = await exportCollection("advisoryDeskShared");
  console.log(`  ${sharedCount} documents (each a JSON-stringified array of one legacy entity type)`);

  for (const name of PAMS_COLLECTIONS) {
    const count = await exportCollection(name);
    console.log(`${name}: ${count} documents`);
  }

  console.log(`\nDone. Exported to ${path.resolve(outDir)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
