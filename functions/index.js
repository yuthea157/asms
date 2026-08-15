// Reference Cloud Function for PAMS role/factory-aware Firestore rules
// (docs/pams/SECURITY.md §5 — the concrete follow-up to close the
// "authorization only in the frontend" gap for real).
//
// WHAT THIS DOES
// Firestore Security Rules cannot see which of ASMS's 4 roles
// (admin/manager/officer/user) or which factory a signed-in account maps
// to — that information lives in the `users` document inside the
// `advisoryDeskShared` blob, not on the Firebase Auth account itself.
// This function watches that blob for changes, and whenever a user's
// role or companyId changes, stamps the SAME information onto their
// Firebase Auth account as custom claims — which DO appear in
// `request.auth.token` inside Firestore rules, for free, with no extra
// read.
//
// DEPLOYMENT — this is reference code, not yet live, same as
// firestore.rules/storage.rules at the repo root:
//   1. This app is currently on Firebase's free "Spark" plan (see
//      README.md). Cloud Functions require the pay-as-you-go "Blaze"
//      plan — upgrade the project first (Firebase Console → Usage and
//      billing → Modify plan). Confirm this deliberately before
//      proceeding; it is the one piece of this whole roadmap that adds
//      real, ongoing infrastructure cost (docs/pams/ROADMAP.md's own
//      Phase 8 sequencing note flags this).
//   2. `cd functions && npm install`
//   3. `firebase deploy --only functions`
//   4. Once deployed, update firestore.rules to actually READ
//      request.auth.token.role / request.auth.token.factoryId instead of
//      only checking non-anonymous sign-in — see the commented example
//      rule block at the bottom of this file.
//   5. Existing signed-in sessions won't have the new claims until they
//      sign in again (or their ID token naturally refreshes, ~1hr) — this
//      is a known, expected Firebase Auth behavior, not a bug in this
//      function.

const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

initializeApp();

// The `users` list lives inside ONE Firestore document
// (advisoryDeskShared/<docIdFor("users")>) as a JSON-stringified array —
// see src/storageShim.js. This function has to parse that whole blob and
// diff it, rather than reacting to one user's own document changing,
// because that's genuinely how ASMS stores this data today (docs/pams/
// ARCHITECTURE.md §2's whole reason PAMS itself uses a different,
// per-record pattern — this function is the one place in the system that
// has to work WITH the old pattern, since it's watching `users`, not a
// PAMS collection).
exports.syncUserClaimsOnUsersDocChange = onDocumentWritten(
  "advisoryDeskShared/{docId}",
  async (event) => {
    // storageShim.js's docIdFor("users") — see src/storageShim.js for the
    // exact hashing/naming scheme; adjust this guard to match whatever
    // that function actually produces for the key "users" in your
    // deployed project (logged once at cold start below to make this
    // easy to confirm against the Cloud Functions console).
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after) return; // document deleted — nothing to sync

    let usersAfter;
    try {
      usersAfter = JSON.parse(after.value || "[]");
    } catch {
      return; // not the users document (some other key's blob) — ignore
    }
    // Cheap guard: only proceed if this blob actually looks like the
    // users array (has role/email fields), since every ASMS key shares
    // the same document shape ({ value: "<json>" }).
    if (!Array.isArray(usersAfter) || !usersAfter.every((u) => "role" in u && "email" in u)) return;

    let usersBefore = [];
    try { usersBefore = JSON.parse(before?.value || "[]"); } catch { /* first write ever */ }
    const beforeById = new Map(usersBefore.map((u) => [u.id, u]));

    const auth = getAuth();
    await Promise.all(
      usersAfter
        .filter((u) => u.authUid) // only real (migrated) Firebase Auth accounts have claims to set
        .filter((u) => {
          const prev = beforeById.get(u.id);
          return !prev || prev.role !== u.role || prev.companyId !== u.companyId;
        })
        .map((u) =>
          auth.setCustomUserClaims(u.authUid, {
            role: u.role,
            factoryId: u.role === "user" ? (u.companyId || null) : null,
          }).catch((err) => {
            // A stale/deleted authUid shouldn't fail the whole sync —
            // log and move on to the next user.
            console.error(`Failed to set custom claims for user ${u.id} (authUid ${u.authUid}):`, err);
          })
        )
    );
  }
);

/* Example firestore.rules block once this is deployed and Firestore
   rules are updated to actually use the claims (docs/pams/SECURITY.md §5):

   match /pams_measurements/{id} {
     allow read: if request.auth != null
       && (request.auth.token.role != 'user'
           || resource.data.factoryId == request.auth.token.factoryId);
     allow create: if request.auth != null
       && request.auth.token.firebase.sign_in_provider != 'anonymous'
       && (request.auth.token.role != 'user'
           || request.resource.data.factoryId == request.auth.token.factoryId);
     ... (same pattern extended to every other pams_* collection's factoryId field)
   }
*/
