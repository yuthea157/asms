// pams_notifications — in-app only for v1 (docs/pams/ARCHITECTURE.md §5:
// email/SMS is a real Edge Function follow-up, not built here). Uses
// Supabase Realtime instead of Firestore's onSnapshot.
//
// Firestore's onSnapshot fires the FULL current result set on every
// change; Supabase Realtime's postgres_changes is delta/event-based
// instead (one INSERT/UPDATE/DELETE at a time) — the simplest correct
// way to keep the exact same "callback gets the full current list"
// contract every caller already expects is an initial fetch plus a
// refetch on any change, rather than hand-patching the list from deltas.

import { supabase } from "../supabase.js";
import { createRecord, updateRecord } from "./pamsStore.js";

export function subscribeToNotifications(factoryIds, callback) {
  if (!factoryIds || factoryIds.length === 0) { callback([]); return () => {}; }
  // Matches the old `in` cap of 30 — still the realistic ceiling for the
  // factory list one screen's notification bell is ever scoped to.
  const scopedIds = factoryIds.slice(0, 30);

  const load = async () => {
    const { data, error } = await supabase
      .from("pams_notifications")
      .select("*")
      .in("factory_id", scopedIds)
      .order("created_at", { ascending: false });
    if (error) { callback([]); return; }
    callback(data.map((row) => ({
      id: row.id, factoryId: row.factory_id, type: row.type, message: row.message,
      entityType: row.entity_type, entityId: row.entity_id, read: row.read, createdAt: row.created_at,
    })));
  };

  load();
  const channel = supabase
    .channel(`pams_notifications_${scopedIds.join("_")}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "pams_notifications" }, () => load())
    .subscribe();

  return () => supabase.removeChannel(channel);
}

export function createNotification({ factoryId, type, message, entityType, entityId }, ctx) {
  return createRecord("pams_notifications", { factoryId, type, message, entityType, entityId, read: false }, ctx);
}
export function markNotificationRead(id, ctx) {
  return updateRecord("pams_notifications", id, { read: true }, ctx);
}
