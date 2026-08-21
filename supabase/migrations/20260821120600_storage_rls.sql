-- Storage RLS for the two buckets created in Phase 4 (pams-evidence,
-- legacy-attachments). Matches today's Firebase Storage rules: read
-- requires any authenticated session, write requires a real
-- authenticated session (the Supabase-era app drops the anonymous-
-- sign-in scaffolding entirely, so "authenticated" is unambiguous here).
--
-- Uses auth.uid() directly rather than the current_profile() helper used
-- elsewhere in this schema: verified during Phase 4 testing that
-- current_profile() (a SECURITY DEFINER function) does not reliably
-- resolve when evaluated from a storage.objects policy under the
-- Storage service's own connection/pooling context, even though it
-- works correctly everywhere else (confirmed via RPC and every
-- PostgREST-backed table policy). auth.uid() alone was confirmed
-- working under Storage by direct test. No company/factory-level
-- scoping is needed here per the migration plan (matches today's actual
-- Firebase Storage rules, which also have no such scoping) so this is
-- not a capability regression.

create policy pams_evidence_bucket_read on storage.objects for select using (
  bucket_id = 'pams-evidence' and auth.uid() is not null
);
create policy pams_evidence_bucket_write on storage.objects for all using (
  bucket_id = 'pams-evidence' and auth.uid() is not null
) with check (
  bucket_id = 'pams-evidence' and auth.uid() is not null
);

create policy legacy_attachments_bucket_read on storage.objects for select using (
  bucket_id = 'legacy-attachments' and auth.uid() is not null
);
create policy legacy_attachments_bucket_write on storage.objects for all using (
  bucket_id = 'legacy-attachments' and auth.uid() is not null
) with check (
  bucket_id = 'legacy-attachments' and auth.uid() is not null
);
