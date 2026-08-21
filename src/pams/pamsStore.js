// PAMS data-access layer — the one place allowed to call Supabase for
// pams_* tables. Every PAMS screen goes through the functions here rather
// than calling `supabase.from()` directly, for the same reason every
// existing ASMS screen goes through `ctx.update()` — one seam to add
// audit stamping and validation without every screen having to remember
// to do it itself.
//
// Unlike storageShim.js (which needs hand-written per-key config to
// reshape nested arrays for the legacy blob entities), PAMS was already
// one-row-per-record in Firestore, so this is a much more direct swap —
// field names convert mechanically between camelCase (app-side) and
// snake_case (db-side) since the schema was built to mirror the real
// Firestore field names exactly (see the 20260821140000 migration).

import { supabase } from "../supabase.js";
import { withAuditFields as withAuditFieldsPure } from "./auditFields.js";

function camelToSnake(str) {
  return str.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);
}
function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
}
function rowToJs(row) {
  const obj = {};
  for (const [k, v] of Object.entries(row)) obj[snakeToCamel(k)] = v;
  return obj;
}
function jsToRow(obj) {
  const row = {};
  for (const [k, v] of Object.entries(obj)) row[camelToSnake(k)] = v === "" ? null : v;
  return row;
}

/**
 * `ctx.role` is the signed-in user record (App.jsx's `role` state) — id,
 * name, email, role. PAMS stores the user's id (not their display name) on
 * every record, the same FK-by-id pattern every existing ASMS module uses
 * for `companyId`, so a later rename of the user's display name never
 * orphans historical attribution. See auditFields.js for why the actual
 * stamping logic lives there instead of here.
 *
 * `nowValue` is `undefined` here (rather than a `serverTimestamp()`
 * sentinel the way the Firestore version worked) — created_at/updated_at
 * default to `now()` / are bumped by a trigger at the Postgres layer
 * instead, which is more correct anyway (removes client-clock-skew risk).
 */
export function withAuditFields(patch, ctx, opts) {
  const stamped = withAuditFieldsPure(patch, ctx, undefined, opts);
  // Drop the nowValue placeholders entirely rather than sending
  // `undefined` for createdAt/updatedAt -- the DB's own defaults/trigger
  // handle both.
  const { createdAt, updatedAt, ...rest } = stamped;
  return rest;
}

/** Writes one row to pams_audit_logs — see docs/pams/SECURITY.md §9. */
export async function logAudit(ctx, { action, entityType, entityId, oldValue = null, newValue = null, reason = null }) {
  const { error } = await supabase.from("pams_audit_logs").insert({
    user_id: ctx?.role?.id || null,
    action, entity_type: entityType, entity_id: entityId, old_value: oldValue, new_value: newValue, reason,
  });
  if (error) throw error;
}

function newId() {
  return crypto.randomUUID();
}

/** Creates a new row with an auto-generated ID. Returns the new ID. */
export async function createRecord(collectionName, data, ctx, auditMeta) {
  const id = newId();
  const row = { id, ...jsToRow(withAuditFields(data, ctx, { isCreate: true })) };
  const { error } = await supabase.from(collectionName).insert(row);
  if (error) throw error;
  if (auditMeta) await logAudit(ctx, { action: "create", entityType: collectionName, entityId: id, newValue: data, ...auditMeta });
  return id;
}

/**
 * Creates a row at a caller-chosen ID — used for the 1:1
 * `pams_factory_profiles/{companyId}` satellite pattern (docs/pams/
 * DOMAIN_MODEL.md §1), where the row's id must equal the existing
 * company's id rather than being auto-generated.
 */
export async function createRecordWithId(collectionName, id, data, ctx, auditMeta) {
  const row = { id, ...jsToRow(withAuditFields(data, ctx, { isCreate: true })) };
  const { error } = await supabase.from(collectionName).insert(row);
  if (error) throw error;
  if (auditMeta) await logAudit(ctx, { action: "create", entityType: collectionName, entityId: id, newValue: data, ...auditMeta });
  return id;
}

export async function updateRecord(collectionName, id, patch, ctx, auditMeta) {
  const row = jsToRow(withAuditFields(patch, ctx));
  const { error } = await supabase.from(collectionName).update(row).eq("id", id);
  if (error) throw error;
  if (auditMeta) await logAudit(ctx, { action: "update", entityType: collectionName, entityId: id, newValue: patch, ...auditMeta });
}

/**
 * Upserts a row at a caller-chosen ID — create if absent, update if
 * present. Used by the factory-profile satellite pattern, where the
 * screen doesn't know in advance whether a profile already exists for
 * this company. Postgres's native upsert does this in one round trip
 * (a real simplification vs. the old get-then-branch Firestore version).
 */
export async function upsertRecordWithId(collectionName, id, data, ctx) {
  const row = { id, ...jsToRow(withAuditFields(data, ctx, { isCreate: true })) };
  const { error } = await supabase.from(collectionName).upsert(row, { onConflict: "id" });
  if (error) throw error;
}

export async function deleteRecord(collectionName, id, ctx, auditMeta) {
  const { error } = await supabase.from(collectionName).delete().eq("id", id);
  if (error) throw error;
  if (auditMeta) await logAudit(ctx, { action: "delete", entityType: collectionName, entityId: id, ...auditMeta });
}

export async function getRecord(collectionName, id) {
  const { data, error } = await supabase.from(collectionName).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? rowToJs(data) : null;
}

// ---------------------------------------------------------------------
// where()/orderBy()/limit() stay as small descriptor factories so every
// existing `listRecords("pams_actions", [where("targetId","==",id),
// orderBy("createdAt")])` call site in PAMS screens is unchanged --
// listRecords interprets the descriptors into a Supabase query-builder
// chain internally, isolating the one place Firestore's constraint style
// doesn't map 1:1 onto Supabase's fluent API.
// ---------------------------------------------------------------------

export function where(field, op, value) {
  return { type: "where", field: camelToSnake(field), op, value };
}
export function orderBy(field, direction = "asc") {
  return { type: "orderBy", field: camelToSnake(field), ascending: direction !== "desc" };
}
export function limit(n) {
  return { type: "limit", n };
}

const OP_MAP = { "==": "eq", "!=": "neq", "<": "lt", "<=": "lte", ">": "gt", ">=": "gte", "in": "in", "array-contains": "cs" };

export async function listRecords(collectionName, constraints = []) {
  let q = supabase.from(collectionName).select("*");
  for (const c of constraints) {
    if (c.type === "where") {
      const op = OP_MAP[c.op];
      if (!op) throw new Error(`Unsupported where operator: ${c.op}`);
      q = op === "cs" ? q.contains(c.field, [c.value]) : q[op](c.field, c.value);
    } else if (c.type === "orderBy") {
      q = q.order(c.field, { ascending: c.ascending });
    } else if (c.type === "limit") {
      q = q.limit(c.n);
    }
  }
  const { data, error } = await q;
  if (error) throw error;
  return data.map(rowToJs);
}
