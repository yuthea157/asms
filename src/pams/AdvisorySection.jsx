// Advisory Visits → Findings → Recommendations → CAP (brief §31-34), one
// section on the factory Performance tab, matching AssessmentsSection.jsx's
// bundling convention.

import React, { useEffect, useState } from "react";
import { CalendarClock, Plus, ArrowLeft, AlertTriangle, Lightbulb, ShieldAlert } from "lucide-react";
import { T, MODULE_COLORS, Field, TextInput, TextArea, Select, Sheet, Btn, Header, EmptyState, SectionLabel, EmptyRow, Row, Pill, hasPerm } from "../ui.jsx";
import { VISIT_TYPES, VISIT_STATUSES, emptyAdvisoryVisit, createAdvisoryVisit, listAdvisoryVisitsForFactory, updateAdvisoryVisit, deleteAdvisoryVisit } from "./advisoryVisits.js";
import { FINDING_SEVERITIES, FINDING_STATUSES, emptyFinding, createFinding, listFindingsForFactory, updateFinding, deleteFinding } from "./findings.js";
import { RECOMMENDATION_STATUSES, RECOMMENDATION_PRIORITIES, emptyRecommendation, createRecommendation, listRecommendationsForFinding, updateRecommendation, escalateRecommendationToCap } from "./recommendations.js";

function severityTone(sev) {
  return sev === "Critical" ? "red" : sev === "High" ? "amber" : sev === "Medium" ? "blue" : "muted";
}

export default function AdvisorySection({ companyId, ctx }) {
  const [tab, setTab] = useState("visits");
  const canEdit = hasPerm(ctx, "pamsFactory", "edit");

  return (
    <div>
      <SectionLabel>Advisory</SectionLabel>
      <div style={{ display: "flex", gap: 6, padding: "0 18px 10px", flexWrap: "wrap" }}>
        {[{ k: "visits", l: "Visits" }, { k: "findings", l: "Findings" }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding: "7px 13px", borderRadius: 999, border: `1px solid ${tab === t.k ? T.accent : T.border}`,
            background: tab === t.k ? T.accentSoft : T.surface, color: tab === t.k ? T.accentDark : T.ink2,
            fontSize: 12.5, fontWeight: 700, cursor: "pointer",
          }}>{t.l}</button>
        ))}
      </div>
      {tab === "visits" && <VisitsList companyId={companyId} ctx={ctx} canEdit={canEdit} />}
      {tab === "findings" && <FindingsList companyId={companyId} ctx={ctx} canEdit={canEdit} />}
    </div>
  );
}

function VisitsList({ companyId, ctx, canEdit }) {
  const [visits, setVisits] = useState(null);
  const [form, setForm] = useState(null);
  const reload = () => listAdvisoryVisitsForFactory(companyId).then(setVisits).catch(() => setVisits([]));
  useEffect(() => { reload(); }, [companyId]);

  return (
    <div style={{ padding: "0 18px" }}>
      {visits?.length === 0 && <EmptyRow text="No advisory visits logged." />}
      {(visits || []).map((v) => (
        <Row key={v.id} left={<CalendarClock size={16} color={T.accent} />} title={`${v.visitType} — ${v.visitDate}`}
          sub={v.purpose || "No purpose noted"} right={<Pill tone="muted">{v.status}</Pill>}
          onClick={canEdit ? () => setForm(v) : undefined} />
      ))}
      {canEdit && <Btn small variant="ghost" onClick={() => setForm(emptyAdvisoryVisit())}><Plus size={13} />Log visit</Btn>}
      {form && (
        <VisitForm initial={form} onClose={() => setForm(null)}
          onSave={async (data) => {
            if (data.id) await updateAdvisoryVisit(data.id, data, ctx);
            else await createAdvisoryVisit(companyId, null, data, ctx);
            setForm(null); reload();
          }}
          onDelete={form.id ? () => { if (window.confirm("Delete this visit?")) deleteAdvisoryVisit(form.id, ctx).then(() => { setForm(null); reload(); }); } : null} />
      )}
    </div>
  );
}

function VisitForm({ initial, onClose, onSave, onDelete }) {
  const [v, setV] = useState(initial);
  return (
    <Sheet title={initial.id ? "Edit visit" : "Log advisory visit"} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <Field label="Visit date"><TextInput type="date" value={v.visitDate} onChange={(e) => setV({ ...v, visitDate: e.target.value })} /></Field>
        <Field label="Visit type">
          <Select value={v.visitType} onChange={(e) => setV({ ...v, visitType: e.target.value })}>
            {VISIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Purpose"><TextArea value={v.purpose} onChange={(e) => setV({ ...v, purpose: e.target.value })} rows={2} /></Field>
      <Field label="Areas reviewed"><TextInput value={v.areasReviewed} onChange={(e) => setV({ ...v, areasReviewed: e.target.value })} placeholder="Comma-separated" /></Field>
      <Field label="Findings summary"><TextArea value={v.findingsSummary} onChange={(e) => setV({ ...v, findingsSummary: e.target.value })} rows={2} /></Field>
      <Field label="Recommendations summary"><TextArea value={v.recommendationsSummary} onChange={(e) => setV({ ...v, recommendationsSummary: e.target.value })} rows={2} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <Field label="Follow-up date"><TextInput type="date" value={v.followUpDate} onChange={(e) => setV({ ...v, followUpDate: e.target.value })} /></Field>
        <Field label="Status">
          <Select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })}>
            {VISIT_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {onDelete && <Btn variant="danger" onClick={onDelete}>Delete</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => onSave(v)}>Save</Btn>
      </div>
    </Sheet>
  );
}

function FindingsList({ companyId, ctx, canEdit }) {
  const [findings, setFindings] = useState(null);
  const [form, setForm] = useState(null);
  const [openId, setOpenId] = useState(null);
  const reload = () => listFindingsForFactory(companyId).then(setFindings).catch(() => setFindings([]));
  useEffect(() => { reload(); }, [companyId]);

  if (openId) {
    const finding = (findings || []).find((f) => f.id === openId);
    if (finding) return <FindingDetail finding={finding} companyId={companyId} ctx={ctx} canEdit={canEdit} onBack={() => { setOpenId(null); reload(); }} />;
  }

  return (
    <div style={{ padding: "0 18px" }}>
      {findings?.length === 0 && <EmptyRow text="No findings recorded." />}
      {(findings || []).map((f) => (
        <Row key={f.id} onClick={() => setOpenId(f.id)} left={<AlertTriangle size={16} color={T.accent} />} title={f.description || f.category}
          sub={`${f.sourceType} · ${f.status}`} right={<Pill tone={severityTone(f.severity)}>{f.severity}</Pill>} />
      ))}
      {canEdit && <Btn small variant="ghost" onClick={() => setForm(emptyFinding())}><Plus size={13} />New finding</Btn>}
      {form && (
        <FindingForm initial={form} onClose={() => setForm(null)}
          onSave={async (data) => { await createFinding(companyId, { sourceType: "AdvisoryVisit", sourceId: null }, data, ctx); setForm(null); reload(); }} />
      )}
    </div>
  );
}

function FindingForm({ initial, onClose, onSave }) {
  const [f, setF] = useState(initial);
  return (
    <Sheet title="New finding" onClose={onClose}>
      <Field label="Category"><TextInput value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="e.g. OSH, HR, Productivity" /></Field>
      <Field label="Description"><TextArea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <Field label="Root cause"><TextArea value={f.rootCause} onChange={(e) => setF({ ...f, rootCause: e.target.value })} rows={2} placeholder="5-Why or Fishbone summary" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <Field label="Severity">
          <Select value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}>
            {FINDING_SEVERITIES.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Due date"><TextInput type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => f.description.trim() && onSave(f)}>Save</Btn>
      </div>
    </Sheet>
  );
}

function FindingDetail({ finding, companyId, ctx, canEdit, onBack }) {
  const [recs, setRecs] = useState(null);
  const [form, setForm] = useState(null);
  const reload = () => listRecommendationsForFinding(finding.id).then(setRecs).catch(() => setRecs([]));
  useEffect(() => { reload(); }, [finding.id]);

  return (
    <div>
      <div style={{ padding: "8px 0" }}><Btn variant="ghost" small onClick={onBack}><ArrowLeft size={13} />Back</Btn></div>
      <div style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{finding.description}</div>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 4 }}>{finding.category} · {finding.severity} · {finding.status}</div>
      {finding.rootCause && <div style={{ fontSize: 12.5, color: T.ink2, marginBottom: 10 }}>Root cause: {finding.rootCause}</div>}

      <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, textTransform: "uppercase", marginBottom: 6 }}>Recommendations</div>
      {recs?.length === 0 && <EmptyRow text="No recommendations yet." />}
      {(recs || []).map((r) => (
        <RecommendationRow key={r.id} rec={r} finding={finding} companyId={companyId} ctx={ctx} canEdit={canEdit} onChanged={reload} />
      ))}
      {canEdit && <Btn small variant="ghost" onClick={() => setForm(emptyRecommendation())}><Plus size={12} />Add recommendation</Btn>}
      {form && (
        <Sheet title="New recommendation" onClose={() => setForm(null)}>
          <Field label="Recommendation"><TextArea value={form.recommendation} onChange={(e) => setForm({ ...form, recommendation: e.target.value })} /></Field>
          <Field label="Rationale"><TextArea value={form.rationale} onChange={(e) => setForm({ ...form, rationale: e.target.value })} rows={2} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
            <Field label="Priority">
              <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {RECOMMENDATION_PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </Select>
            </Field>
            <Field label="Due date"><TextInput type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <div style={{ flex: 1 }} />
            <Btn variant="ghost" onClick={() => setForm(null)}>Cancel</Btn>
            <Btn onClick={async () => { if (!form.recommendation.trim()) return; await createRecommendation(finding.id, companyId, form, ctx); setForm(null); reload(); }}>Save</Btn>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function RecommendationRow({ rec, finding, companyId, ctx, canEdit, onChanged }) {
  const [busy, setBusy] = useState(false);
  const escalate = async () => {
    setBusy(true);
    try { await escalateRecommendationToCap({ recommendation: rec, finding, factoryId: companyId }, ctx); onChanged(); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: 10, marginBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Lightbulb size={13} color={T.accent} />
        <span style={{ flex: 1, fontSize: 13, color: T.ink }}>{rec.recommendation}</span>
        <Pill tone="muted">{rec.status}</Pill>
      </div>
      {canEdit && !rec.capId && (
        <Btn small variant="ghost" onClick={escalate} disabled={busy}><ShieldAlert size={12} />{busy ? "Escalating…" : "Escalate to CAP"}</Btn>
      )}
      {rec.capId && <div style={{ fontSize: 11.5, color: T.muted, marginTop: 4 }}>Escalated to Improvement Plan (CAP {rec.capId.slice(-8)})</div>}
    </div>
  );
}
