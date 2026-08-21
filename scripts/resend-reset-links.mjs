// One-time fix-up: the original cutover invite emails (Phase 9) were
// sent while the Supabase project's Site URL config still defaulted to
// http://localhost:3000, so every link in them pointed to localhost
// instead of https://asms.usypro.com. That config is now fixed, so this
// resends a correctly-linked password reset to every real user.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://msxwjzlzdbguwrkhjnga.supabase.co";
const ANON_KEY = "sb_publishable__WPuEAbWcxI8WCNxPcnG3g_zAVBM99i";
const supabase = createClient(SUPABASE_URL, ANON_KEY);

const emails = process.argv.slice(2);
if (emails.length === 0) {
  console.error("Usage: node resend-reset-links.mjs <email1> <email2> ...");
  process.exit(1);
}

async function main() {
  for (const [i, email] of emails.entries()) {
    if (i > 0) { console.log("waiting 65s..."); await new Promise((r) => setTimeout(r, 65000)); }
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: "https://asms.usypro.com" });
    console.log(email, error ? `ERROR: ${error.message}` : "sent");
  }
}
main();
