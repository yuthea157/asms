// ScoreBadge / ScoreTraceSheet / RagPill (docs/pams/UI_SITEMAP.md §5) — the
// clickable score chip used everywhere a score appears, opening
// SCORING_ENGINE.md §5's full transparency payload. Every score anywhere
// in PAMS renders through this one component so "click a score to see
// why" is never reimplemented differently per screen.

import React, { useState } from "react";
import { Info } from "lucide-react";
import { T, Sheet, Pill } from "../ui.jsx";

const RAG_COLORS = { Green: T.green, Amber: T.amber, Red: T.red, Gray: T.muted };

export function RagPill({ rag }) {
  const tone = rag === "Green" ? "green" : rag === "Amber" ? "amber" : rag === "Red" ? "red" : "muted";
  return <Pill tone={tone}>{rag || "Gray"}</Pill>;
}

export function ScoreBadge({ score, ratingName, ragStatus, onClick }) {
  if (score === null || score === undefined) {
    return <Pill tone="muted">Not yet measured</Pill>;
  }
  const tone = ragStatus === "Green" ? "green" : ragStatus === "Amber" ? "amber" : ragStatus === "Red" ? "red" : "muted";
  return (
    <button onClick={onClick} style={{ background: "none", border: "none", cursor: onClick ? "pointer" : "default", padding: 0 }}>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        background: tone === "green" ? T.greenSoft : tone === "amber" ? T.amberSoft : tone === "red" ? T.redSoft : T.border,
        color: tone === "green" ? T.green : tone === "amber" ? T.amber : tone === "red" ? T.red : T.ink2,
        fontSize: 11.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
      }}>
        {Math.round(score * 10) / 10}{ratingName ? ` · ${ratingName}` : ""}
        {onClick && <Info size={11} />}
      </span>
    </button>
  );
}

/**
 * The full trace view (SCORING_ENGINE.md §5's mandatory field list:
 * Baseline / Target / Actual / Achievement / Weight / Score / Rating /
 * Formula / Period / Evidence / Reviewer) — rendered directly from a
 * pams_scores document's calculationTrace, nothing recomputed for
 * display.
 */
export function ScoreTraceSheet({ scoreDoc, onClose }) {
  if (!scoreDoc) return null;
  const trace = scoreDoc.calculationTrace || {};
  return (
    <Sheet title="Score breakdown" onClose={onClose}>
      <TraceRow label="Formula" value={trace.formulaUsed || trace.rollupType || "—"} />
      {trace.baseline !== undefined && <TraceRow label="Baseline" value={fmt(trace.baseline)} />}
      {trace.target !== undefined && <TraceRow label="Target" value={fmt(trace.target)} />}
      {trace.actual !== undefined && <TraceRow label="Actual" value={fmt(trace.actual)} />}
      {trace.rawAchievementPct !== undefined && <TraceRow label="Raw achievement" value={fmt(trace.rawAchievementPct) + "%"} />}
      {trace.capApplied !== undefined && <TraceRow label="Cap applied" value={trace.capApplied ? "Yes" : "No"} />}
      {trace.weight !== undefined && <TraceRow label="Weight" value={fmt(trace.weight) + "%"} />}
      {trace.children && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: T.muted, textTransform: "uppercase", marginBottom: 4 }}>Rolled up from</div>
          {trace.children.map((c, i) => (
            <div key={i} style={{ fontSize: 12.5, color: T.ink2, padding: "3px 0" }}>
              {c.score === null ? "Not yet measured" : `${fmt(c.score)}`} (weight {c.weight}%)
            </div>
          ))}
        </div>
      )}
      <TraceRow label="Score" value={fmt(scoreDoc.score)} />
      <TraceRow label="Rating" value={scoreDoc.ratingName || "—"} />
      <TraceRow label="RAG" value={<RagPill rag={scoreDoc.ragStatus} />} />
      <TraceRow label="Period" value={scoreDoc.period || "—"} />
      <TraceRow label="Scoring rule version" value={scoreDoc.scoringRuleVersionId || "—"} />
      <TraceRow label="Calculated" value={scoreDoc.calculatedAt ? new Date(scoreDoc.calculatedAt).toLocaleString() : "—"} />
    </Sheet>
  );
}

function fmt(v) {
  if (v === null || v === undefined) return "—";
  if (v === Infinity) return "∞";
  if (typeof v === "number") return Math.round(v * 100) / 100;
  return v;
}

function TraceRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 13 }}>
      <span style={{ color: T.muted }}>{label}</span>
      <span style={{ color: T.ink, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

/** Fetches and shows a score's trace on click — the common wiring every screen needs. */
export function useScoreTrace() {
  const [scoreDoc, setScoreDoc] = useState(null);
  return { scoreDoc, open: setScoreDoc, close: () => setScoreDoc(null) };
}
