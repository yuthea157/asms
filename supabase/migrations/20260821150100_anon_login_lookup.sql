-- The pre-login "look up this email, check if it has a real auth
-- account yet" read (App.jsx's RoleGate) runs with no session at all --
-- the new architecture deliberately drops the old anonymous-Firebase-
-- session bootstrap (see the auth migration plan), so this request hits
-- Postgres as the `anon` role, not `authenticated`. Every other RLS
-- policy on `users` requires a real `profiles` row, which `anon` can
-- never have -- without this, the login screen could never find ANY
-- account by email and every login attempt would fail regardless of
-- correct credentials (found via live testing of the Phase 6 rewrite).
--
-- Scoped narrowly per the plan's own intent: `anon` gets exactly the 3
-- columns RoleGate's lookup actually needs (id, to key its update()
-- call; email, to match what was typed; auth_user_id, to know whether
-- to go straight to sign-in or show "account not set up yet") -- role,
-- company_id, username, dashboard_id stay invisible to anonymous
-- requests.

revoke select on users from anon;
grant select (id, email, auth_user_id) on users to anon;

create policy users_anon_login_lookup on users for select to anon using (true);
