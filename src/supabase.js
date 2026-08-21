// Supabase initialization — replaces firebase.js (Firebase→Supabase
// migration, see the migration plan for the full rationale).
//
// The app's own login screen (in App.jsx) still controls who can see which
// *features* inside the app (the permission matrix, company scoping,
// etc) — that stays entirely application-level, unrelated to Supabase.
//
// Unlike the Firebase version, there is no anonymous-session bootstrap
// here: Supabase's anon key already lets unauthenticated requests through,
// subject to Row Level Security, so the pre-login "look up this email"
// read just needs a narrowly-scoped RLS policy — no fake session needed
// to satisfy `auth != null`.

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fails loudly and early rather than letting every Supabase call hang
  // or throw cryptic errors deep inside the app.
  // eslint-disable-next-line no-console
  console.error(
    "Missing Supabase config: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env " +
    "(Supabase dashboard → Settings → API)."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** Signs the current session into a real, already-existing account. */
export function signInEmail(email, password) {
  return supabase.auth.signInWithPassword({ email, password }).then(({ data, error }) => {
    if (error) throw error;
    return data;
  });
}

/**
 * Sends a real password-reset email via Supabase's own hosted flow.
 * Explicitly passes redirectTo (rather than relying on the project's
 * default Site URL config) so this works correctly in both local dev
 * and production without needing to remember to keep that dashboard
 * setting in sync with wherever the app happens to be running.
 */
export function sendReset(email) {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin }).then(({ error }) => {
    if (error) throw error;
  });
}

/**
 * Creates a real account for SOMEONE ELSE (the admin-creates-user flow).
 * Supabase's admin user-creation API requires the service-role key, which
 * must never ship to the browser — this calls the create-user Edge
 * Function instead, which checks server-side that the caller is really an
 * admin (via their own JWT + `profiles` row) before using that key.
 * Returns the new account's auth user id.
 */
export async function createAuthUserAsAdmin(email, role, companyId, name) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  const { data, error } = await supabase.functions.invoke("create-user", {
    body: { email, role, companyId, name },
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  if (error) throw error;
  if (data?.warning) {
    // eslint-disable-next-line no-console
    console.warn(data.warning);
  }
  return data.userId;
}

/** Ends the current session. */
export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Changes the CURRENTLY signed-in user's own password — used for the
 * "admin set an initial password, user must change it on first login" flow
 * (in the Supabase model, "admin set an initial password" is really
 * "admin sent an invite" — the person sets their own password via that
 * link, but this helper stays for the self-service "change it again" case).
 */
export async function changeOwnPassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/**
 * Self-service "change my password" for an already logged-in user: proves
 * they know their CURRENT password by re-authenticating with it (Supabase
 * has no direct reauthenticate-with-credential primitive like Firebase's,
 * so this re-runs a real sign-in with the old password — a wrong old
 * password fails right here, before anything changes), then sets the new
 * one.
 */
export async function changePasswordWithVerification(email, oldPassword, newPassword) {
  const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: oldPassword });
  if (verifyError) throw verifyError;
  await changeOwnPassword(newPassword);
}

/**
 * Verifies the CURRENTLY signed-in user's password without changing
 * anything — used to gate a dangerous, irreversible in-app action (e.g.
 * wiping audit data) behind "prove you are who you say you are right now".
 * Throws if the password doesn't match; resolves if it does.
 */
export async function verifyCurrentPassword(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
