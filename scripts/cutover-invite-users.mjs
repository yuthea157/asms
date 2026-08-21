// One-time Phase 9 cutover step: for every real migrated user (already
// confirmed to have zero remaining plaintext passwords -- all 5 already
// completed the Firebase Auth migration), create their Supabase Auth
// account and send them a real invite/reset email in one atomic call
// (inviteUserByEmail does both -- see the Phase 3 fix for why calling
// createUser then inviteUserByEmail separately is wrong), then wire up
// users.auth_user_id and a profiles row so RLS scoping works the moment
// they set their password and log in.
//
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node cutover-invite-users.mjs

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: users, error: usersErr } = await supabase.from("users").select("id, email, role, company_id").is("auth_user_id", null);
  if (usersErr) throw usersErr;

  console.log(`Found ${users.length} user(s) needing a Supabase Auth account + invite.`);

  const results = [];
  for (const [i, u] of users.entries()) {
    // Supabase throttles outgoing auth emails to 1 per 60s
    // (smtp_max_frequency) regardless of the SMTP provider's own limits.
    if (i > 0) { console.log("waiting 65s for the smtp_max_frequency throttle..."); await new Promise((r) => setTimeout(r, 65000)); }
    if (!u.email) {
      results.push({ id: u.id, status: "skipped", reason: "no email on file" });
      continue;
    }
    const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(u.email, { redirectTo: "https://asms.usypro.com" });
    if (inviteErr) {
      results.push({ id: u.id, status: "error", reason: inviteErr.message });
      continue;
    }
    const authUserId = invited.user.id;

    const { error: profileErr } = await supabase.from("profiles").upsert({
      auth_user_id: authUserId, legacy_user_id: u.id, role: u.role, company_id: u.role === "user" ? u.company_id : null,
    }, { onConflict: "auth_user_id" });
    if (profileErr) {
      results.push({ id: u.id, status: "error", reason: `invited but profile insert failed: ${profileErr.message}` });
      continue;
    }

    const { error: updateErr } = await supabase.from("users").update({ auth_user_id: authUserId }).eq("id", u.id);
    if (updateErr) {
      results.push({ id: u.id, status: "error", reason: `invited + profiled but users.auth_user_id update failed: ${updateErr.message}` });
      continue;
    }

    results.push({ id: u.id, status: "invited", authUserId });
  }

  console.log("\n=== Cutover invite report ===");
  for (const r of results) console.log(`${r.id}: ${r.status}${r.reason ? " (" + r.reason + ")" : ""}`);

  const errors = results.filter((r) => r.status === "error");
  if (errors.length > 0) {
    console.error(`\n${errors.length} error(s) -- see report above.`);
    process.exit(1);
  }
  console.log("\nDone, no errors.");
}

main().catch((err) => { console.error(err); process.exit(1); });
