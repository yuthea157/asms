-- More corrections found during the Phase 5 ETL dry run against real
-- exported data: cycle_number and visit_number are human-assigned
-- string codes ("CY-2026-01", "V-01"), not sequential integers as the
-- original schema design assumed from the field name alone.

alter table advisory_info alter column cycle_number type text using cycle_number::text;
alter table visits alter column visit_number type text using visit_number::text;
