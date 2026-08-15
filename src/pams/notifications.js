// pams_notifications — in-app only for v1 (docs/pams/ARCHITECTURE.md §5:
// email/SMS is a real Cloud Function follow-up, not built here). Uses a
// real Firestore onSnapshot listener, not polling — the natural fit for
// "live" in a backend-less app, since Firestore pushes changes to
// subscribed clients for free.

import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { db } from "../firebase.js";
import { createRecord, updateRecord } from "./pamsStore.js";

export function subscribeToNotifications(factoryIds, callback) {
  if (!factoryIds || factoryIds.length === 0) { callback([]); return () => {}; }
  // Firestore's `in` operator caps at 30 values — fine for the realistic
  // number of factories one account is scoped to (a company user sees
  // exactly one; admin/manager/officer see all of theirs, but this
  // listener is only ever mounted for the currently-open factory list on
  // screen, not the whole org at once).
  const q = query(collection(db, "pams_notifications"), where("factoryId", "in", factoryIds.slice(0, 30)), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export function createNotification({ factoryId, type, message, entityType, entityId }, ctx) {
  return createRecord("pams_notifications", { factoryId, type, message, entityType, entityId, read: false }, ctx);
}
export function markNotificationRead(id, ctx) {
  return updateRecord("pams_notifications", id, { read: true }, ctx);
}
