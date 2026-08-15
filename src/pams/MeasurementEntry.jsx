// Enter Measurement + measurement history/trend (brief §21-22, docs/pams/
// UI_SITEMAP.md §4 "Measurement" screens). Wired into a KPI link row in
// ProjectHierarchy.jsx.

import React, { useEffect, useState } from "react";
import { Plus, TrendingUp, CheckCircle2 } from "lucide-react";
import { T, Field, TextInput, TextArea, Sheet, Btn, Pill, hasPerm } from "../ui.jsx";
import { recordMeasurement, listMeasurementHistoryForTarget, verifyMeasurement, setMeasurementUnderReview } from "./measurements.js";
import { getKpi } from "./kpis.js";
import { getScore } from "./scores.js";
import { ScoreBadge, ScoreTraceSheet, useScoreTrace } from "./ScoreDisplay.jsx";

export default function MeasurementEntry({ kpiLink, target, ctx }) {
  const [kpi, setKpi] = useState(null);
  const [history, setHistory] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const trace = useScoreTrace();
  const canEdit = hasPerm(ctx, "pamsFactory", "edit");

  const reload = () => {
    getKpi(kpiLink.kpiId).then(setKpi);
    listMeasurementHistoryForTarget(target.id).then((all) => setHistory(all.filter((m) => m.kpiLinkId === kpiLink.id))).catch(() => setHistory([]));
  };
  useEffect(reload, [kpiLink.id]);

  const submit = async (data) => {
    setError("");
    try {
      await recordMeasurement({ kpiLink, target, period: data.period, actualValue: Number(data.actualValue), plannedValue: data.plannedValue ? Number(data.plannedValue) : null, comment: data.comment }, ctx);
      setForm(null);
      reload();
    } catch (e) {
      setError(e?.message || "Could not record the measurement.");
    }
  };

  const openTrace = async (measurement) => {
    if (!measurement.scoreId) return;
    const s = await getScore(measurement.scoreId);
    trace.open(s);
  };

  return (
    <div style={{ marginTop: 4 }}>
      {error && <div style={{ background: T.redSoft, color: T.red, padding: "6px 10px", borderRadius: 8, fontSize: 12, marginBottom: 6 }}>{error}</div>}
      {history?.length === 0 && <div style={{ fontSize: 11.5, color: T.muted }}>No measurements yet for this KPI.</div>}
      {(history || []).slice(0, 6).map((m) => (
        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 12 }}>
          <TrendingUp size={11} color={T.muted} />
          <span style={{ color: T.ink2 }}>{m.period}: {m.actualValue}</span>
          <ScoreBadge score={m.achievementPct} ragStatus={undefined} onClick={m.scoreId ? () => openTrace(m) : undefined} />
          {m.verificationStatus === "Verified" ? (
            <Pill tone="green"><CheckCircle2 size={10} style={{ verticalAlign: -1 }} /> Verified</Pill>
          ) : (
            <Pill tone="amber">{m.verificationStatus}</Pill>
          )}
          {canEdit && m.verificationStatus !== "Verified" && ctx?.role?.id !== m.submittedBy && (
            <button onClick={() => verifyMeasurement(m.id, m, ctx).then(reload).catch((e) => setError(e.message))} style={{ background: "none", border: "none", color: T.accent, fontSize: 11, cursor: "pointer" }}>Verify</button>
          )}
        </div>
      ))}
      {canEdit && <Btn small variant="ghost" onClick={() => setForm({ period: currentPeriod(), actualValue: "", plannedValue: "", comment: "" })}><Plus size={11} />Enter measurement</Btn>}

      {form && (
        <Sheet title={`Enter measurement — ${kpi?.name || ""}`} onClose={() => setForm(null)}>
          <Field label="Period (e.g. 2026-03 for monthly)"><TextInput value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} /></Field>
          <Field label="Actual value"><TextInput type="number" value={form.actualValue} onChange={(e) => setForm({ ...form, actualValue: e.target.value })} /></Field>
          <Field label="Planned value (optional)"><TextInput type="number" value={form.plannedValue} onChange={(e) => setForm({ ...form, plannedValue: e.target.value })} /></Field>
          <Field label="Comment"><TextArea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} /></Field>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <div style={{ flex: 1 }} />
            <Btn variant="ghost" onClick={() => setForm(null)}>Cancel</Btn>
            <Btn onClick={() => form.period && form.actualValue !== "" && submit(form)}>Save</Btn>
          </div>
        </Sheet>
      )}
      {trace.scoreDoc && <ScoreTraceSheet scoreDoc={trace.scoreDoc} onClose={trace.close} />}
    </div>
  );
}

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
