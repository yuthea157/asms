// Issues (brief §39). See docs/pams/UI_SITEMAP.md §4 "Governance".

import React, { useEffect, useState } from "react";
import { AlertCircle, Plus } from "lucide-react";
import { T, MODULE_COLORS, Field, TextInput, TextArea, Select, Sheet, Btn, SectionLabel, EmptyRow, Row, Pill, hasPerm } from "../ui.jsx";
import { ISSUE_SEVERITIES, ISSUE_STATUSES, emptyIssue, createIssue, listIssuesForFactory, updateIssue, deleteIssue } from "./issues.js";

function severityTone(sev) {
  return sev === "Critical" ? "red" : sev === "High" ? "amber" : sev === "Medium" ? "blue" : "muted";
}

export default function IssuesSection({ companyId, ctx }) {
  const [issues, setIssues] = useState(null);
  const [form, setForm] = useState(null);
  const canEdit = hasPerm(ctx, "pamsFactory", "edit");

  const reload = () => listIssuesForFactory(companyId).then(setIssues).catch(() => setIssues([]));
  useEffect(reload, [companyId]);

  return (
    <div>
      <SectionLabel>Issues {issues ? `(${issues.length})` : ""}</SectionLabel>
      <div style={{ padding: "0 18px" }}>
        {issues?.length === 0 && <EmptyRow text="No issues logged." />}
        {(issues || []).map((i) => (
          <Row key={i.id} onClick={canEdit ? () => setForm(i) : undefined} left={<AlertCircle size={16} color={T.accent} />}
            title={i.title} sub={i.status} right={<Pill tone={severityTone(i.severity)}>{i.severity}</Pill>} />
        ))}
        {canEdit && <Btn small variant="ghost" onClick={() => setForm(emptyIssue())}><Plus size={13} />New issue</Btn>}
      </div>
      {form && (
        <IssueForm initial={form} onClose={() => setForm(null)}
          onSave={async (data) => {
            if (data.id) await updateIssue(data.id, data, ctx);
            else await createIssue(companyId, data, ctx);
            setForm(null); reload();
          }}
          onDelete={form.id ? () => { if (window.confirm("Delete this issue?")) deleteIssue(form.id, ctx).then(() => { setForm(null); reload(); }); } : null} />
      )}
    </div>
  );
}

function IssueForm({ initial, onClose, onSave, onDelete }) {
  const [i, setI] = useState(initial);
  return (
    <Sheet title={initial.id ? "Edit issue" : "New issue"} onClose={onClose}>
      <Field label="Title"><TextInput value={i.title} onChange={(e) => setI({ ...i, title: e.target.value })} /></Field>
      <Field label="Description"><TextArea value={i.description} onChange={(e) => setI({ ...i, description: e.target.value })} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <Field label="Severity">
          <Select value={i.severity} onChange={(e) => setI({ ...i, severity: e.target.value })}>
            {ISSUE_SEVERITIES.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={i.status} onChange={(e) => setI({ ...i, status: e.target.value })}>
            {ISSUE_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Root cause"><TextArea value={i.rootCause} onChange={(e) => setI({ ...i, rootCause: e.target.value })} rows={2} /></Field>
      <Field label="Corrective action"><TextArea value={i.correctiveAction} onChange={(e) => setI({ ...i, correctiveAction: e.target.value })} rows={2} /></Field>
      <Field label="Due date"><TextInput type="date" value={i.dueDate} onChange={(e) => setI({ ...i, dueDate: e.target.value })} /></Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {onDelete && <Btn variant="danger" onClick={onDelete}>Delete</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => i.title.trim() && onSave(i)}>Save</Btn>
      </div>
    </Sheet>
  );
}
