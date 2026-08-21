// Polyfills the window.storage key-value API this app was originally built
// against (get/set/delete/list) — now backed by normalized Postgres tables
// via Supabase instead of one-JSON-blob-per-key Firestore documents.
//
// App.jsx and every screen built on `ctx.update()` still work with the
// exact same "one whole array per key" shape they always have — get()
// reconstructs that shape by querying the real tables (reassembling any
// nested arrays, e.g. companies[].contacts), and set() diffs the incoming
// array against the current rows to issue the right inserts/updates/
// deletes. This isolates 100% of the Firestore-blob -> normalized-Postgres
// impedance mismatch in this one file — see the migration plan's
// "guiding architectural decision" for why.
//
// Every key this app uses is stored with shared=true (see App.jsx), so in
// practice only the "shared" branch below is exercised. The "personal"
// branch is kept as a localStorage fallback in case that ever changes —
// it is NOT shared between users or devices.

import { supabase } from "./supabase.js";

/**
 * The one query the login screen is allowed to run before anyone is
 * signed in — RLS correctly denies an anonymous session everything else
 * (see the 20260821150100 migration for the narrow anon grant this relies
 * on: id/email/auth_user_id only, never role/companyId/etc). Deliberately
 * NOT routed through the generic KEY_CONFIG "users" path, which does
 * `select("*")` and would hit a permission error for the columns an
 * anonymous session can't see.
 */
export async function lookupUserForLogin(email) {
  // Case-insensitive equality via ilike with wildcard metacharacters
  // escaped (email is free-typed user input -- no reason to give it
  // pattern-matching power here).
  const { data, error } = await supabase
    .from("users")
    .select("id, email, auth_user_id")
    .filter("email", "ilike", email.replace(/[%_]/g, "\\$&"))
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, email: data.email, authUid: data.auth_user_id } : null;
}

/**
 * The full user record, for right after a successful sign-in — the
 * session is authenticated by this point, so the normal users_select RLS
 * policy applies and every column is visible (unlike the anon-only
 * lookupUserForLogin above).
 */
export async function getFullUserRecord(id) {
  const { data, error } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toJs(KEY_CONFIG.users.fields, data) : null;
}

/**
 * Same as getFullUserRecord, but keyed by the Supabase Auth user id
 * rather than the app-level users.id -- needed right after a password
 * recovery redirect, where all the app has is the authenticated
 * session's own user id, not yet the app record it maps to.
 */
export async function getFullUserRecordByAuthId(authUserId) {
  const { data, error } = await supabase.from("users").select("*").eq("auth_user_id", authUserId).maybeSingle();
  if (error) throw error;
  return data ? toJs(KEY_CONFIG.users.fields, data) : null;
}

const PERSONAL_DB_KEY = "advisory-desk:personal-kv";

function readPersonal() {
  try {
    return JSON.parse(localStorage.getItem(PERSONAL_DB_KEY) || "{}");
  } catch {
    return {};
  }
}
function writePersonal(obj) {
  localStorage.setItem(PERSONAL_DB_KEY, JSON.stringify(obj));
}

// ---------------------------------------------------------------------
// Per-key table configuration. `fields` maps camelCase (app-side) <->
// snake_case (db-side) for the main table; `children` describes any
// nested array that needs exploding into a child table on write and
// reassembling into the array on read.
// ---------------------------------------------------------------------

const KEY_CONFIG = {
  companies: {
    table: "companies",
    fields: [["id", "id"], ["name", "name"], ["type", "type"], ["address", "address"]],
    children: [{
      table: "company_contacts", parentCol: "company_id", arrayKey: "contacts", hasOwnId: true, orderCol: "sort_order",
      fields: [["id", "id"], ["name", "name"], ["position", "position"], ["phone", "phone"], ["email", "email"]],
    }],
  },
  advisoryInfo: {
    table: "advisory_info",
    fields: [["id", "id"], ["companyId", "company_id"], ["cycleNumber", "cycle_number"], ["startDate", "start_date"], ["endDate", "end_date"], ["remark", "remark"]],
  },
  visits: {
    table: "visits",
    fields: [["id", "id"], ["advisoryInfoId", "advisory_info_id"], ["visitNumber", "visit_number"], ["date", "visit_date"], ["startTime", "start_time"], ["endTime", "end_time"], ["log", "log"], ["attachmentCount", "attachment_count"]],
  },
  assessmentPlans: {
    table: "assessment_plans",
    fields: [["id", "id"], ["advisoryInfoId", "advisory_info_id"], ["auditNo", "audit_no"], ["previousAssessmentDate", "previous_assessment_date"], ["planAssessmentDate", "plan_assessment_date"], ["auditType", "audit_type"], ["status", "status"], ["reportReleasedDate", "report_released_date"], ["currentNC", "current_nc"]],
  },
  users: {
    table: "users",
    // password is deliberately never round-tripped -- there is no
    // password column in the new schema at all (see the auth migration
    // plan: plaintext passwords are never carried over).
    fields: [["id", "id"], ["name", "name"], ["username", "username"], ["email", "email"], ["role", "role"], ["authUid", "auth_user_id"], ["companyId", "company_id"], ["dashboardId", "dashboard_id"]],
  },
  caps: {
    table: "caps",
    fields: [["id", "id"], ["assessmentPlanId", "assessment_plan_id"], ["ncNumber", "nc_number"], ["area", "area"], ["rootCause", "root_cause"], ["correctiveActions", "corrective_actions"], ["leadPerson", "lead_person"], ["supportPerson", "support_person"], ["targetDate", "target_date"], ["actualDate", "actual_date"], ["status", "status"], ["progress", "progress"], ["recommendations", "recommendations"], ["findingId", "finding_id"], ["recommendationId", "recommendation_id"], ["companyId", "company_id"]],
  },
  meetingLogs: {
    table: "meeting_logs",
    fields: [["id", "id"], ["companyId", "company_id"], ["date", "meeting_date"], ["log", "log"]],
    children: [{ table: "meeting_participants", parentCol: "meeting_log_id", arrayKey: "participants", isStringArray: true, stringCol: "participant_name" }],
  },
  bipartiteCommittee: {
    table: "bipartite_committee",
    fields: [["id", "id"], ["companyId", "company_id"], ["name", "name"], ["sex", "sex"], ["dateJoined", "date_joined"], ["committeeRole", "committee_role"], ["companyRole", "company_role"], ["union", "union_name"], ["phone", "phone"]],
  },
  trainings: {
    table: "trainings",
    fields: [["id", "id"], ["companyId", "company_id"], ["topic", "topic"], ["trainer", "trainer"], ["date", "training_date"], ["startTime", "start_time"], ["endTime", "end_time"], ["deliveryMode", "delivery_mode"], ["status", "status"], ["location", "location"], ["notes", "notes"]],
    children: [{ table: "training_participants", parentCol: "training_id", arrayKey: "participants", isStringArray: true, stringCol: "participant_name" }],
  },
  grievances: {
    table: "grievances",
    fields: [["id", "id"], ["companyId", "company_id"], ["dateReported", "date_reported"], ["category", "category"], ["channel", "channel"], ["description", "description"], ["reportedBy", "reported_by"], ["status", "status"], ["assignedTo", "assigned_to"], ["resolution", "resolution"], ["resolvedDate", "resolved_date"]],
  },
  policies: {
    table: "policies",
    fields: [["id", "id"], ["companyId", "company_id"], ["code", "code"], ["name", "name"], ["version", "version"], ["releasedDate", "released_date"], ["type", "type"], ["remark", "remark"]],
  },
  licenses: {
    table: "licenses",
    fields: [["id", "id"], ["companyId", "company_id"], ["docNo", "doc_no"], ["name", "name"], ["issuedBy", "issued_by"], ["issueDate", "issue_date"], ["expiredDate", "expired_date"], ["status", "status"]],
  },
  auditChecklists: {
    table: "audit_checklists",
    fields: [["id", "id"], ["questionNo", "question_no"], ["question", "question"], ["category", "category"], ["legalReference", "legal_reference"], ["auditType", "audit_type"]],
  },
  auditGuidance: {
    table: "audit_guidance",
    fields: [["id", "id"], ["checklistId", "checklist_id"], ["auditGuidance", "audit_guidance"], ["ncCriteria", "nc_criteria"], ["rootCauses", "root_causes"], ["recommendation", "recommendation"]],
  },
  auditTool: {
    table: "audit_tool",
    fields: [["id", "id"], ["companyId", "company_id"], ["auditDate", "audit_date"], ["auditType", "audit_type"], ["status", "status"]],
    children: [{
      table: "audit_tool_questions", parentCol: "audit_tool_id", arrayKey: "questions", hasOwnId: false, orderCol: "id",
      fields: [["questionId", "question_id"], ["questionNo", "question_no"], ["question", "question"], ["category", "category"], ["legalReference", "legal_reference"], ["auditType", "audit_type"], ["status", "status"], ["findings", "findings"], ["rating", "rating"]],
    }],
  },
  selfAssessments: {
    table: "self_assessments",
    fields: [["id", "id"], ["companyId", "company_id"], ["assignedDate", "assigned_date"], ["dueDate", "due_date"], ["status", "status"]],
    children: [{
      table: "self_assessment_questions", parentCol: "self_assessment_id", arrayKey: "questions", hasOwnId: false, orderCol: "id",
      fields: [["questionId", "question_id"], ["questionNo", "question_no"], ["question", "question"], ["category", "category"], ["answer", "answer"], ["remark", "remark"]],
    }],
  },
  riskAssessments: {
    table: "risk_assessments",
    fields: [
      ["id", "id"], ["companyId", "company_id"], ["riskNo", "risk_no"], ["date", "risk_date"], ["area", "area"],
      ["category", "category"], ["hazard", "hazard"], ["description", "description"], ["likelihood", "likelihood"],
      ["severity", "severity"], ["existingControls", "existing_controls"], ["recommendedActions", "recommended_actions"],
      ["assignedTo", "assigned_to"], ["targetDate", "target_date"], ["actualCompletionDate", "actual_completion_date"],
      ["status", "status"], ["objectiveId", "objective_id"], ["targetId", "target_id"],
      ["linkedCapId", "linked_cap_id"], ["score", "score"], ["level", "level"],
    ],
  },
  customDashboards: {
    table: "custom_dashboards",
    fields: [["id", "id"], ["name", "name"]],
    children: [{ table: "custom_dashboard_widgets", parentCol: "dashboard_id", arrayKey: "widgets", hasOwnId: true, orderCol: "sort_order",
      fields: [["id", "id"], ["type", "widget_type"]] }],
  },
};

const SINGLETON_CONFIG = {
  permissions: { table: "permissions", column: "role_module_matrix" },
  systemSettings: { table: "system_settings", column: "time_zone", isTimeZoneObject: true },
};

function toDb(fields, obj) {
  const row = {};
  for (const [jsKey, dbCol] of fields) {
    if (obj[jsKey] !== undefined) row[dbCol] = obj[jsKey] === "" ? null : obj[jsKey];
  }
  return row;
}
function toJs(fields, row) {
  const obj = {};
  for (const [jsKey, dbCol] of fields) obj[jsKey] = row[dbCol] ?? null;
  return obj;
}

async function getKeyArray(key) {
  const cfg = KEY_CONFIG[key];
  const { data: rows, error } = await supabase.from(cfg.table).select("*");
  if (error) throw error;

  const childrenByParent = {};
  for (const child of cfg.children || []) {
    const parentIds = rows.map((r) => r.id);
    if (parentIds.length === 0) { childrenByParent[child.table] = {}; continue; }
    let q = supabase.from(child.table).select("*").in(child.parentCol, parentIds);
    if (child.orderCol) q = q.order(child.orderCol, { ascending: true });
    const { data: childRows, error: childErr } = await q;
    if (childErr) throw childErr;
    const grouped = {};
    for (const cr of childRows) {
      const pid = cr[child.parentCol];
      (grouped[pid] ??= []).push(cr);
    }
    childrenByParent[child.table] = grouped;
  }

  return rows.map((row) => {
    const obj = toJs(cfg.fields, row);
    for (const child of cfg.children || []) {
      const childRows = childrenByParent[child.table][row.id] || [];
      obj[child.arrayKey] = child.isStringArray
        ? childRows.map((cr) => cr[child.stringCol])
        : childRows.map((cr) => toJs(child.fields, cr));
    }
    return obj;
  });
}

async function setKeyArray(key, incoming) {
  const cfg = KEY_CONFIG[key];
  const rows = incoming.map((obj) => toDb(cfg.fields, obj));

  const { data: currentRows, error: fetchErr } = await supabase.from(cfg.table).select("id");
  if (fetchErr) throw fetchErr;
  const currentIds = new Set((currentRows || []).map((r) => r.id));
  const incomingIds = new Set(rows.map((r) => r.id));
  const toDelete = [...currentIds].filter((id) => !incomingIds.has(id));

  if (rows.length > 0) {
    const { error: upsertErr } = await supabase.from(cfg.table).upsert(rows, { onConflict: "id" });
    if (upsertErr) throw upsertErr;
  }
  if (toDelete.length > 0) {
    const { error: delErr } = await supabase.from(cfg.table).delete().in("id", toDelete);
    if (delErr) throw delErr;
  }

  // Children: delete-all-and-reinsert-fresh per parent, since the
  // incoming nested array IS the full source of truth for that parent on
  // every save (matches how the app has always treated these arrays).
  for (const child of cfg.children || []) {
    const parentIds = incoming.map((o) => o.id);
    if (parentIds.length > 0) {
      const { error: delChildErr } = await supabase.from(child.table).delete().in(child.parentCol, parentIds);
      if (delChildErr) throw delChildErr;
    }
    const childRows = incoming.flatMap((parent) => {
      const arr = parent[child.arrayKey] || [];
      return arr.map((item, i) => {
        const base = child.isStringArray
          ? { [child.stringCol]: item }
          : toDb(child.fields, item);
        base[child.parentCol] = parent.id;
        if (child.orderCol && child.orderCol !== "id") base[child.orderCol] = i;
        return base;
      });
    });
    if (childRows.length > 0) {
      const { error: insChildErr } = await supabase.from(child.table).insert(childRows);
      if (insChildErr) throw insChildErr;
    }
  }
}

async function getSingleton(key) {
  const cfg = SINGLETON_CONFIG[key];
  const { data, error } = await supabase.from(cfg.table).select("*").eq("id", "singleton").maybeSingle();
  if (error) throw error;
  const value = data ? data[cfg.column] : null;
  return cfg.isTimeZoneObject ? { timeZone: value ?? null } : value;
}
async function setSingleton(key, value) {
  const cfg = SINGLETON_CONFIG[key];
  const columnValue = cfg.isTimeZoneObject ? (value?.timeZone ?? null) : value;
  const { error } = await supabase.from(cfg.table).upsert({ id: "singleton", [cfg.column]: columnValue });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// attachments:{parentId} — replaces the old base64-in-Firestore blob
// pattern with real Supabase Storage objects (bucket "legacy-attachments").
// The shape necessarily changes: `dataUrl` doesn't exist anymore, callers
// get back `storagePath` and must resolve a signed URL to display/
// download the file (see evidence.js's signedAttachmentUrl, and the
// App.jsx call sites that render these).
//
// Two distinct sub-patterns share this one key prefix:
//   - "attachments:{visitId}" -- a flat array, one row per attachment,
//     parent_id = the visit's own id directly.
//   - "attachments:{auditToolId}" -- a MAP keyed by questionId (App.jsx's
//     AuditToolDetail: `{[questionId]: [items]}`), not a flat array.
//     parent_id here is the composite "{auditToolId}:{questionId}", NOT
//     the audit_tool_questions row's own bigserial id -- that id gets
//     regenerated every time the parent audit tool record is saved
//     (setKeyArray's children are deleted and reinserted fresh on every
//     save), so anchoring evidence to it would silently orphan every
//     previously-uploaded file the next time someone edits an unrelated
//     field on the same audit. The composite key is stable across saves
//     and unique per (audit, question) instead.
// ---------------------------------------------------------------------

function toAttachmentItem(row) {
  return { id: row.id, name: row.file_name, storagePath: row.storage_path, mimeType: row.mime_type, sizeBytes: row.size_bytes };
}

async function getVisitAttachments(visitId) {
  const { data, error } = await supabase.from("attachments").select("*")
    .eq("parent_type", "visit").eq("parent_id", visitId).order("created_at", { ascending: true });
  if (error) throw error;
  return data.map(toAttachmentItem);
}
async function setVisitAttachments(visitId, items) {
  await replaceAttachmentsForParentId("visit", visitId, items);
}

async function getAuditToolEvidenceMap(auditToolId) {
  const { data, error } = await supabase.from("attachments").select("*")
    .eq("parent_type", "audit_tool_question").like("parent_id", `${auditToolId}:%`)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const map = {};
  for (const row of data) {
    const questionId = row.parent_id.slice(`${auditToolId}:`.length);
    (map[questionId] ??= []).push(toAttachmentItem(row));
  }
  return map;
}
async function setAuditToolEvidenceMap(auditToolId, evidenceByQ) {
  // Every question's evidence list is independently replaced -- a
  // question absent from the incoming map (e.g. the audit's checklist
  // changed) simply keeps whatever it already has rather than being
  // guessed at; App.jsx always sends every question it knows about.
  for (const [questionId, items] of Object.entries(evidenceByQ)) {
    await replaceAttachmentsForParentId("audit_tool_question", `${auditToolId}:${questionId}`, items);
  }
}

async function replaceAttachmentsForParentId(parentType, parentId, items) {
  const { data: current, error: fetchErr } = await supabase.from("attachments").select("id, storage_path").eq("parent_id", parentId);
  if (fetchErr) throw fetchErr;
  const incomingIds = new Set(items.map((i) => i.id));
  const removed = (current || []).filter((c) => !incomingIds.has(c.id));
  for (const r of removed) {
    await supabase.storage.from("legacy-attachments").remove([r.storage_path]).catch(() => {});
  }
  if (removed.length > 0) {
    await supabase.from("attachments").delete().in("id", removed.map((r) => r.id));
  }
  const currentIds = new Set((current || []).map((c) => c.id));
  const toInsert = items.filter((i) => !currentIds.has(i.id)).map((i) => ({
    id: i.id, parent_type: parentType, parent_id: parentId,
    file_name: i.name, storage_path: i.storagePath, mime_type: i.mimeType, size_bytes: i.sizeBytes,
  }));
  if (toInsert.length > 0) {
    const { error: insErr } = await supabase.from("attachments").insert(toInsert);
    if (insErr) throw insErr;
  }
}
async function deleteAllAttachmentsForParentId(parentType, parentIdOrPrefix, isPrefix = false) {
  const q = supabase.from("attachments").select("id, storage_path").eq("parent_type", parentType);
  const { data: rows, error } = isPrefix ? await q.like("parent_id", `${parentIdOrPrefix}:%`) : await q.eq("parent_id", parentIdOrPrefix);
  if (error) throw error;
  for (const r of rows || []) {
    await supabase.storage.from("legacy-attachments").remove([r.storage_path]).catch(() => {});
  }
  if ((rows || []).length > 0) {
    await supabase.from("attachments").delete().in("id", rows.map((r) => r.id));
  }
}

// Disambiguates which of the two patterns a given "attachments:{id}" key
// means, by checking which table actually has a row with that id.
async function isVisitId(id) {
  const { data } = await supabase.from("visits").select("id").eq("id", id).maybeSingle();
  return !!data;
}

const storage = {
  async get(key, shared = false) {
    if (!shared) {
      const all = readPersonal();
      if (!(key in all)) throw new Error(`Key not found: ${key}`);
      return { key, value: all[key], shared: false };
    }
    if (key.startsWith("attachments:")) {
      const parentId = key.slice("attachments:".length);
      const value = (await isVisitId(parentId)) ? await getVisitAttachments(parentId) : await getAuditToolEvidenceMap(parentId);
      return { key, value: JSON.stringify(value), shared: true };
    }
    if (KEY_CONFIG[key]) {
      const arr = await getKeyArray(key);
      return { key, value: JSON.stringify(arr), shared: true };
    }
    if (SINGLETON_CONFIG[key]) {
      const val = await getSingleton(key);
      return { key, value: JSON.stringify(val), shared: true };
    }
    throw new Error(`Key not found: ${key}`);
  },

  async set(key, value, shared = false) {
    if (!shared) {
      const all = readPersonal();
      all[key] = value;
      writePersonal(all);
      return { key, value, shared: false };
    }
    const parsed = JSON.parse(value);
    if (key.startsWith("attachments:")) {
      const parentId = key.slice("attachments:".length);
      if (await isVisitId(parentId)) {
        await setVisitAttachments(parentId, parsed);
      } else {
        await setAuditToolEvidenceMap(parentId, parsed);
      }
      return { key, value, shared: true };
    }
    if (KEY_CONFIG[key]) {
      await setKeyArray(key, parsed);
      return { key, value, shared: true };
    }
    if (SINGLETON_CONFIG[key]) {
      await setSingleton(key, parsed);
      return { key, value, shared: true };
    }
    throw new Error(`Unknown key: ${key}`);
  },

  async delete(key, shared = false) {
    if (!shared) {
      const all = readPersonal();
      delete all[key];
      writePersonal(all);
      return { key, deleted: true, shared: false };
    }
    if (key.startsWith("attachments:")) {
      const parentId = key.slice("attachments:".length);
      if (await isVisitId(parentId)) {
        await deleteAllAttachmentsForParentId("visit", parentId, false);
      } else {
        await deleteAllAttachmentsForParentId("audit_tool_question", parentId, true);
      }
      return { key, deleted: true, shared: true };
    }
    if (KEY_CONFIG[key]) {
      await setKeyArray(key, []);
      return { key, deleted: true, shared: true };
    }
    return { key, deleted: true, shared: true };
  },

  async list(prefix = "", shared = false) {
    if (!shared) {
      const keys = Object.keys(readPersonal());
      return { keys: prefix ? keys.filter((k) => k.startsWith(prefix)) : keys, prefix, shared: false };
    }
    // Only used by useStore()'s seed-check today, against the full set of
    // top-level keys -- never against the attachments:* pattern.
    const keys = Object.keys(KEY_CONFIG);
    return { keys: prefix ? keys.filter((k) => k.startsWith(prefix)) : keys, prefix, shared: true };
  },
};

if (typeof window !== "undefined" && !window.storage) {
  window.storage = storage;
}

export default storage;
