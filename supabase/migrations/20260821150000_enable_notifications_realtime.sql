-- Enables Supabase Realtime change events for pams_notifications, used
-- by the rewritten src/pams/notifications.js (Phase 6/8 of the
-- migration) in place of Firestore's onSnapshot listener.
alter publication supabase_realtime add table pams_notifications;
