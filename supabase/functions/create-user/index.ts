// Replaces src/firebase.js's createAuthUserAsAdmin(): lets an ASMS admin
// create a real account for someone else (e.g. onboarding a new company
// user) without needing the service-role key in the browser. Supabase's
// admin user-creation API requires that key, which must never ship to
// the client -- so this runs server-side instead, checking the caller is
// really an admin (via their own JWT + the `profiles` table) before
// calling the admin API with elevated privileges.
//
// Request: POST { email, role, companyId? }
// Auth: caller's Supabase access token in the Authorization header.
// Response: { userId, legacyUserId } on success, or { error } with a
// non-200 status.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Explicit, rather than relying on the project's Site URL dashboard
// setting alone -- that setting defaulted to http://localhost:3000 and
// broke every invite/reset link sent before this was caught, so this
// function doesn't depend on it being kept in sync going forward.
const APP_URL = "https://asms.usypro.com";

const ALLOWED_ROLES = ["admin", "manager", "officer", "user"];

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

  // Client scoped to the caller's own JWT -- used only to verify who is
  // making the request; RLS on `profiles` means this client can only
  // ever see the caller's own row (or every row, if the caller is
  // already an admin -- either way, exactly what we need to check here).
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonResponse({ error: "Invalid or expired session" }, 401);
  }

  const { data: callerProfile, error: profileErr } = await callerClient
    .from("profiles")
    .select("role")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (profileErr || !callerProfile || callerProfile.role !== "admin") {
    return jsonResponse({ error: "Only admins can create user accounts" }, 403);
  }

  let body: { email?: string; role?: string; companyId?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { email, role, companyId, name } = body;
  if (!email || !role || !ALLOWED_ROLES.includes(role)) {
    return jsonResponse({ error: "email and a valid role are required" }, 400);
  }
  if (role === "user" && !companyId) {
    return jsonResponse({ error: "companyId is required for role 'user'" }, 400);
  }

  // Elevated client -- only used past this point, only after the admin
  // check above has passed.
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // inviteUserByEmail() both creates the auth user AND sends the invite
  // email in one atomic step. Calling admin.createUser() first and then
  // inviteUserByEmail() separately (an earlier version of this function
  // did that) fails: invite assumes the account doesn't exist yet, so it
  // errors "already registered" against the account createUser() just
  // made.
  const { data: created, error: createErr } = await adminClient.auth.admin.inviteUserByEmail(email, { redirectTo: APP_URL });
  if (createErr || !created?.user) {
    return jsonResponse({ error: createErr?.message ?? "Failed to create/invite user" }, 500);
  }

  const { error: profileInsertErr } = await adminClient.from("profiles").insert({
    auth_user_id: created.user.id,
    role,
    company_id: role === "user" ? companyId : null,
  });
  if (profileInsertErr) {
    // Roll back the orphaned auth user rather than leaving an
    // auth-user-with-no-profile that could never pass any RLS check.
    await adminClient.auth.admin.deleteUser(created.user.id);
    return jsonResponse({ error: profileInsertErr.message }, 500);
  }

  const legacyUserId = `usr_${crypto.randomUUID().slice(0, 12)}`;
  const { error: legacyInsertErr } = await adminClient.from("users").insert({
    id: legacyUserId,
    name: name ?? email,
    email,
    role,
    auth_user_id: created.user.id,
    company_id: role === "user" ? companyId : null,
  });
  if (legacyInsertErr) {
    return jsonResponse({ error: legacyInsertErr.message }, 500);
  }

  return jsonResponse({ userId: created.user.id, legacyUserId }, 200);
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
