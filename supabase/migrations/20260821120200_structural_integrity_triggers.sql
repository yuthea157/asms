-- Structural-integrity invariants that today live only in firestore.rules
-- (client-side-trusted). These triggers fire regardless of role -- a
-- strictly stronger guarantee than the Firestore rules they replace,
-- which only blocked non-privileged writes with no DB-level backstop.

-- pams_measurements: once verification_status = 'Verified', the row is
-- frozen -- corrections must INSERT a new row with
-- supersedes_measurement_id pointing at the original. DELETE is never
-- allowed on any measurement, verified or not.
create function pams_measurements_lock() returns trigger as $$
begin
  if TG_OP = 'UPDATE' and OLD.verification_status = 'Verified' then
    raise exception 'Verified measurements cannot be modified; insert a new row with supersedes_measurement_id instead';
  end if;
  if TG_OP = 'DELETE' then
    raise exception 'Measurements cannot be deleted, only superseded';
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger trg_pams_measurements_lock
  before update or delete on pams_measurements
  for each row execute function pams_measurements_lock();

-- pams_scores: immutable once written. Only the server-side scoring
-- engine (a SECURITY DEFINER function / service-role Edge Function) may
-- INSERT; nothing may ever UPDATE or DELETE a score row.
create function pams_scores_block_mutation() returns trigger as $$
begin
  raise exception 'pams_scores rows are immutable; only the scoring engine may write scores';
end;
$$ language plpgsql;

create trigger trg_pams_scores_no_update
  before update or delete on pams_scores
  for each row execute function pams_scores_block_mutation();

-- pams_audit_logs: append-only audit trail.
create function pams_audit_logs_block_mutation() returns trigger as $$
begin
  raise exception 'pams_audit_logs is append-only';
end;
$$ language plpgsql;

create trigger trg_pams_audit_logs_no_mutation
  before update or delete on pams_audit_logs
  for each row execute function pams_audit_logs_block_mutation();
