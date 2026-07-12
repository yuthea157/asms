// Polyfills the window.storage key-value API this app was originally built
// against (get/set/delete/list) — but for real, multiple-people-see-the-
// same-data storage this time, backed by Firestore instead of localStorage.
//
// Every key this app uses is stored with shared=true (see App.jsx), so in
// practice only the "shared" branch below is exercised. The "personal"
// branch is kept as a localStorage fallback in case that ever changes —
// it is NOT shared between users or devices.

import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import { db, authReady } from "./firebase.js";

const COLLECTION = "advisoryDeskShared";
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

// Firestore document IDs can't contain "/" — none of this app's keys do,
// but this guards against surprises if that ever changes.
function docIdFor(key) {
  return key.replace(/\//g, "_");
}

const storage = {
  async get(key, shared = false) {
    if (!shared) {
      const all = readPersonal();
      if (!(key in all)) throw new Error(`Key not found: ${key}`);
      return { key, value: all[key], shared: false };
    }
    await authReady;
    const snap = await getDoc(doc(db, COLLECTION, docIdFor(key)));
    if (!snap.exists()) throw new Error(`Key not found: ${key}`);
    return { key, value: snap.data().value, shared: true };
  },

  async set(key, value, shared = false) {
    if (!shared) {
      const all = readPersonal();
      all[key] = value;
      writePersonal(all);
      return { key, value, shared: false };
    }
    await authReady;
    await setDoc(doc(db, COLLECTION, docIdFor(key)), {
      value,
      updatedAt: serverTimestamp(),
    });
    return { key, value, shared: true };
  },

  async delete(key, shared = false) {
    if (!shared) {
      const all = readPersonal();
      delete all[key];
      writePersonal(all);
      return { key, deleted: true, shared: false };
    }
    await authReady;
    await deleteDoc(doc(db, COLLECTION, docIdFor(key)));
    return { key, deleted: true, shared: true };
  },

  async list(prefix = "", shared = false) {
    if (!shared) {
      const keys = Object.keys(readPersonal());
      return { keys: prefix ? keys.filter((k) => k.startsWith(prefix)) : keys, prefix, shared: false };
    }
    await authReady;
    const snap = await getDocs(collection(db, COLLECTION));
    const keys = snap.docs.map((d) => d.id);
    return { keys: prefix ? keys.filter((k) => k.startsWith(prefix)) : keys, prefix, shared: true };
  },
};

if (typeof window !== "undefined" && !window.storage) {
  window.storage = storage;
}

export default storage;
