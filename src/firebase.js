// Firebase initialization.
//
// The app's own login screen (in App.jsx) controls who can see which
// *features* inside the app (the permission matrix, company scoping,
// etc). That's an application-level concept, not a Firebase one — Firebase
// has no idea what "Manager" or "Officer" means.
//
// Real user identity — email/password accounts, password-reset emails —
// now runs on actual Firebase Authentication (see the exported helpers
// below). Firestore access itself still needs *some* gate even before
// anyone logs in (or anyone on the internet who finds your config values,
// which are public, could read/write your data directly): signing in
// anonymously here gives every visitor a Firebase Auth identity so your
// Firestore rules can require `request.auth != null`. Logging in with a
// real email/password account simply replaces that anonymous session —
// Firestore calls always use whichever session is current, so nothing
// elsewhere needs to know or care which kind of session it is. See
// README.md for the recommended security rules.

import { initializeApp, deleteApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updatePassword,
  signOut,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missing = Object.entries(firebaseConfig).filter(([, v]) => !v);
if (missing.length) {
  // Fails loudly and early rather than letting Firestore calls hang or
  // throw cryptic errors deep inside the app.
  // eslint-disable-next-line no-console
  console.error(
    `Missing Firebase config value(s): ${missing.map(([k]) => k).join(", ")}. ` +
    `Copy .env.example to .env and fill in your Firebase project's values.`
  );
}

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Resolves once we have a signed-in user (anonymous at boot; real
// email/password after login). Every Firestore call in storageShim.js
// awaits this first.
export const authReady = new Promise((resolve, reject) => {
  const unsubscribe = onAuthStateChanged(
    auth,
    (user) => {
      if (user) {
        unsubscribe();
        resolve(user);
      }
    },
    reject
  );
  signInAnonymously(auth).catch(reject);
});

/** Signs the current session into a real, already-existing account. */
export function signInEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Creates a real account AND signs the current session into it — used for
 * the one-time "migrate a legacy plaintext-password account" path, where
 * the person doing this *is* that account, so becoming signed-in as them
 * is exactly what should happen.
 */
export function createEmailAccount(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

/** Sends a real password-reset email via Firebase's own hosted flow. */
export function sendReset(email) {
  return sendPasswordResetEmail(auth, email);
}

/**
 * Creates a real account for SOMEONE ELSE (the admin-creates-user flow)
 * without disturbing the admin's own signed-in session. The normal client
 * SDK call would sign the *current* session into the new account, which
 * would kick the admin out of their own — so this spins up a throwaway
 * secondary Firebase App instance, creates the account there instead, then
 * tears that instance down. Returns the new account's UID.
 */
export async function createAuthUserAsAdmin(email, password) {
  const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    await signOut(secondaryAuth);
    return cred.user.uid;
  } finally {
    await deleteApp(secondaryApp);
  }
}

/** Ends the real session and restores the anonymous one Firestore rules expect. */
export async function logout() {
  await signOut(auth);
  await signInAnonymously(auth);
}

/**
 * Changes the CURRENTLY signed-in user's own password — this is the one
 * password-change operation the client SDK can do for free, no backend
 * needed, because it only ever acts on `auth.currentUser`. Used for the
 * "admin set an initial password, user must change it on first login" flow.
 */
export function changeOwnPassword(newPassword) {
  return updatePassword(auth.currentUser, newPassword);
}
