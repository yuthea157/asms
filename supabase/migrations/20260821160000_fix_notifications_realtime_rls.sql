-- Realtime's postgres_changes authorization evaluates RLS through a
-- different internal connection/role mechanism than normal PostgREST
-- requests -- the same class of issue already found for Storage in
-- Phase 4: current_profile() (a SECURITY DEFINER function) doesn't
-- reliably resolve there, even though it works correctly for every
-- ordinary PostgREST-backed table query. Confirmed via a live test: a
-- service-role subscriber received INSERT events on pams_notifications
-- immediately, but an authenticated (admin-role) subscriber using the
-- exact same current_profile()-based policy never received anything.
--
-- Fix: use a direct inline subquery against profiles instead of the
-- current_profile() wrapper, for this table only. This does NOT
-- reintroduce the original Phase 2 "infinite recursion detected in
-- policy" bug -- that was specific to policies defined ON profiles
-- itself referencing profiles recursively. pams_notifications is a
-- different table; a subquery here just needs SOME profiles policy to
-- make the row visible, and profiles_select_self (a plain
-- auth_user_id = auth.uid() check, no subquery, no recursion) already
-- covers that.

drop policy pams_notifications_scoped on pams_notifications;
create policy pams_notifications_scoped on pams_notifications for all using (
  exists (select 1 from profiles p where p.auth_user_id = auth.uid()
    and (p.role in ('admin','manager','officer') or p.company_id = pams_notifications.factory_id))
) with check (
  exists (select 1 from profiles p where p.auth_user_id = auth.uid()
    and (p.role in ('admin','manager','officer') or p.company_id = pams_notifications.factory_id))
);
