-- Corrections found by inspecting the real exported production data
-- (Phase 5 ETL dry-run prep) against the schema built from code
-- inspection alone -- two real fields existed in live Firestore data
-- that weren't caught by the earlier source-code survey.

alter table users add column username text;

alter table risk_assessments add column linked_cap_id text references caps(id);
alter table risk_assessments add column score numeric;
alter table risk_assessments add column level text;
