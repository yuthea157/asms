// PAMS data-access layer — the one place allowed to call the Firestore SDK
// for pams_* collections. See docs/pams/ARCHITECTURE.md §2-3 for why this
// exists as a second pattern alongside storageShim.js: PAMS entities are
// real, individual Firestore documents (one per record), not the
// one-JSON-blob-per-entity-type pattern the rest of this app uses — PAMS's
// expected volume (thousands of measurements/evidence records) would hit
// Firestore's 1 MiB-per-document limit almost immediately under that
// pattern, and every edit would rewrite the entire collection's array.
//
// Every PAMS screen goes through the functions here rather than calling
// `collection()`/`doc()`/etc. directly, for the same reason every existing
// ASMS screen goes through `ctx.update()` — one seam to add audit stamping,
// validation, and (from Phase 6 on) score-recalculation triggers, without
// every screen having to remember to do it itself.

import { db } from "../firebase.js";
import {
  collection, doc, getDoc as fsGetDoc, getDocs, addDoc, setDoc, updateDoc as fsUpdateDoc,
  deleteDoc as fsDeleteDoc, query, where, orderBy, limit as fsLimit, serverTimestamp,
} from "firebase/firestore";
import { withAuditFields as withAuditFieldsPure } from "./auditFields.js";

/**
 * `ctx.role` is the signed-in user record (App.jsx's `role` state) — id,
 * name, email, role. PAMS stores the user's id (not their display name) on
 * every record, the same FK-by-id pattern every existing ASMS module uses
 * for `companyId`, so a later rename of the user's display name never
 * orphans historical attribution. See auditFields.js for why the actual
 * stamping logic lives there instead of here.
 */
export function withAuditFields(patch, ctx, opts) {
  return withAuditFieldsPure(patch, ctx, serverTimestamp(), opts);
}

/** Writes one row to pams_audit_logs — see docs/pams/SECURITY.md §9. */
export async function logAudit(ctx, { action, entityType, entityId, oldValue = null, newValue = null, reason = null }) {
  await addDoc(collection(db, "pams_audit_logs"), {
    userId: ctx?.role?.id || null,
    timestamp: serverTimestamp(),
    action, entityType, entityId, oldValue, newValue, reason,
  });
}

/** Creates a new document with an auto-generated ID. Returns the new ID. */
export async function createRecord(collectionName, data, ctx, auditMeta) {
  const ref = await addDoc(collection(db, collectionName), withAuditFields(data, ctx, { isCreate: true }));
  if (auditMeta) await logAudit(ctx, { action: "create", entityType: collectionName, entityId: ref.id, newValue: data, ...auditMeta });
  return ref.id;
}

/**
 * Creates a document at a caller-chosen ID — used for the 1:1
 * `pams_factory_profiles/{companyId}` satellite pattern (docs/pams/
 * DOMAIN_MODEL.md §1), where the doc ID must equal the existing company's
 * ID rather than being auto-generated.
 */
export async function createRecordWithId(collectionName, id, data, ctx, auditMeta) {
  await setDoc(doc(db, collectionName, id), withAuditFields(data, ctx, { isCreate: true }));
  if (auditMeta) await logAudit(ctx, { action: "create", entityType: collectionName, entityId: id, newValue: data, ...auditMeta });
  return id;
}

export async function updateRecord(collectionName, id, patch, ctx, auditMeta) {
  await fsUpdateDoc(doc(db, collectionName, id), withAuditFields(patch, ctx));
  if (auditMeta) await logAudit(ctx, { action: "update", entityType: collectionName, entityId: id, newValue: patch, ...auditMeta });
}

/**
 * Upserts a document at a caller-chosen ID — create if absent, update if
 * present. Used by the factory-profile satellite pattern, where the
 * screen doesn't know in advance whether a profile already exists for
 * this company.
 */
export async function upsertRecordWithId(collectionName, id, data, ctx) {
  const existing = await fsGetDoc(doc(db, collectionName, id));
  if (existing.exists()) {
    await fsUpdateDoc(doc(db, collectionName, id), withAuditFields(data, ctx));
  } else {
    await setDoc(doc(db, collectionName, id), withAuditFields(data, ctx, { isCreate: true }));
  }
}

export async function deleteRecord(collectionName, id, ctx, auditMeta) {
  await fsDeleteDoc(doc(db, collectionName, id));
  if (auditMeta) await logAudit(ctx, { action: "delete", entityType: collectionName, entityId: id, ...auditMeta });
}

export async function getRecord(collectionName, id) {
  const snap = await fsGetDoc(doc(db, collectionName, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * `constraints` is a plain array of Firestore query-constraint objects
 * (the return values of `where()`/`orderBy()`/`limit()`, re-exported below
 * so screens never need their own `import ... from "firebase/firestore"`).
 */
export async function listRecords(collectionName, constraints = []) {
  const snap = await getDocs(query(collection(db, collectionName), ...constraints));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export { where, orderBy, fsLimit as limit };
