// Firebase initialization.
//
// The app's own username/password screen (in App.jsx) controls who can see
// which *features* inside the app (the permission matrix, company scoping,
// etc). That's an application-level concept, not a Firebase one — Firebase
// has no idea what "Manager" or "Officer" means.
//
// Firestore itself still needs *some* gate, or anyone on the internet who
// finds your config values (they're not secret, but they are public) could
// read/write your data directly, bypassing the app entirely. Signing in
// anonymously here gives every visitor a Firebase Auth identity, so your
// Firestore rules can require `request.auth != null` — i.e. "must have
// opened the app" — without you having to build a separate login UI for
// Firebase specifically. See README.md for the recommended security rules.

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

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

// Resolves once we have an (anonymous) signed-in user. Every Firestore
// call in storageShim.js awaits this first.
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
