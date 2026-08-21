-- Real data has audit_tool_questions with status = "" for questions not
-- yet answered (a real, common state -- most checklist questions on a
-- freshly-created audit start blank). The original CHECK only allowed
-- 'NC'/'C'/'N/A'. The ETL sanitizes '' to null (which passes any CHECK
-- constraint automatically, since Postgres CHECK constraints only reject
-- on a FALSE result, not NULL) -- this migration exists so the
-- constraint's intent (only real answered states are valid, once set)
-- stays correctly enforced for actual answers.
alter table audit_tool_questions drop constraint audit_tool_questions_status_check;
alter table audit_tool_questions add constraint audit_tool_questions_status_check
  check (status is null or status in ('NC','C','N/A'));
