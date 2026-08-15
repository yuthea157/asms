// Factory Scorecard (brief §73) + Improvement Score (§49, §77) +
// Before/After assessment comparison (§79) — Phase 9. Scope note: the
// brief's own worked scorecard table groups rows by "domain"
// (Productivity/Quality/HR/OSH...); this data model groups performance
// under Advisory PROJECTS instead (each typically named after exactly
// one such domain — "OSH Improvement Project", etc., per
// projects.js/PROJECT_TYPES), so each project IS this scorecard's
// domain row. A literal domain-tag-independent-of-project-name grouping
// is a natural follow-up once real deployments show it's needed, not
// built speculatively here.

import React, { useEffect, useState } from "react";
import { BarChart3, TrendingUp, Download, FileText } from "lucide-react";
import { T, MODULE_COLORS, Header, EmptyState, SectionLabel, EmptyRow, Btn, exportExcel, exportPdf, fmtDate } from "../ui.jsx";
import { listProjectsForFactory } from "./projects.js";
import { listRecords } from "./pamsStore.js";
import { ScoreBadge } from "./ScoreDisplay.jsx";
import { calculateImprovementScore } from "./scoringEngine.js";
import { getAssessment, listAssessmentsForFactory } from "./assessments.js";

export default function FactoryScorecard({ companyId, companyName, ctx }) {
  const [projects, setProjects] = useState(null);
  const [assessments, setAssessments] = useState(null);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    listProjectsForFactory(companyId).then(setProjects).catch(() => setProjects([]));
    listAssessmentsForFactory(companyId).then((all) => setAssessments(all.filter((a) => a.status !== "Draft"))).catch(() => setAssessments([]));
    listRecords("pams_factory_summaries").then((all) => setSummary(all.find((s) => s.id === companyId) || null)).catch(() => {});
  }, [companyId]);

  if (projects === null || assessments === null) return <div style={{ padding: 24, color: T.muted, fontSize: 13.5 }}>Loading…</div>;

  const baseline = assessments.filter((a) => a.assessmentType === "Baseline").sort((a, b) => a.assessmentDate.localeCompare(b.assessmentDate))[0];
  const final = assessments.filter((a) => a.assessmentType === "Final").sort((a, b) => b.assessmentDate.localeCompare(a.assessmentDate))[0];
  const latest = assessments.sort((a, b) => b.assessmentDate.localeCompare(a.assessmentDate))[0];

  const exportRows = projects.map((p) => ({
    Project: p.name, Type: p.projectType, Status: p.status,
    Score: p.latestSummary?.score != null ? Math.round(p.latestSummary.score * 10) / 10 : "Not scored",
    Rating: p.latestSummary?.ratingName || "—", RAG: p.latestSummary?.ragStatus || "Gray",
  }));
  const exportColumns = [
    { key: "Project", label: "Project" }, { key: "Type", label: "Type" }, { key: "Status", label: "Status" },
    { key: "Score", label: "Score" }, { key: "Rating", label: "Rating" }, { key: "RAG", label: "RAG" },
  ];

  return (
    <div>
      <Header title="Factory Scorecard" subtitle={companyName} icon={BarChart3} color={MODULE_COLORS.pamsFactory}
        action={projects.length > 0 && (
          <div style={{ display: "flex", gap: 6 }}>
            <Btn small variant="ghost" onClick={() => exportExcel(exportRows, "Scorecard", `${companyName}-scorecard-${fmtDate(new Date().toISOString().slice(0, 10))}.xlsx`)}><Download size={12} />Excel</Btn>
            <Btn small variant="ghost" onClick={() => exportPdf(`${companyName} — Factory Scorecard`, exportRows, exportColumns)}><FileText size={12} />PDF</Btn>
          </div>
        )} />

      {summary && (
        <div style={{ padding: "0 18px 10px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: T.muted }}>Overall:</span>
          <ScoreBadge score={summary.overallScore} ratingName={summary.overallRating} ragStatus={summary.ragStatus} />
        </div>
      )}

      <SectionLabel>Projects</SectionLabel>
      <div style={{ padding: "0 18px" }}>
        {projects.length === 0 && <EmptyState icon={BarChart3} color={MODULE_COLORS.pamsFactory} title="No projects yet" hint="Score data appears once a project's goals/objectives/targets are measured and recalculated." />}
        {projects.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                  {["Project", "Type", "Status", "Score", "Rating", "RAG"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: T.muted, fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: "6px 8px", color: T.ink, fontWeight: 600 }}>{p.name}</td>
                    <td style={{ padding: "6px 8px", color: T.ink2 }}>{p.projectType}</td>
                    <td style={{ padding: "6px 8px", color: T.ink2 }}>{p.status}</td>
                    <td style={{ padding: "6px 8px" }} colSpan={3}>
                      {p.latestSummary ? <ScoreBadge score={p.latestSummary.score} ratingName={p.latestSummary.ratingName} ragStatus={p.latestSummary.ragStatus} /> : <span style={{ color: T.muted }}>Not scored yet — open the project and Recalculate scorecard</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {baseline && (
        <>
          <SectionLabel>Improvement (brief §49/§77)</SectionLabel>
          <div style={{ padding: "0 18px" }}>
            <ImprovementRow baseline={baseline} current={latest} target={100} />
          </div>
        </>
      )}

      {baseline && final && (
        <>
          <SectionLabel>Before / After (Baseline vs Final)</SectionLabel>
          <div style={{ padding: "0 18px 18px" }}>
            <BeforeAfterTable baseline={baseline} final={final} />
          </div>
        </>
      )}
    </div>
  );
}

function ImprovementRow({ baseline, current, target }) {
  const { improvementPoints, progressTowardTarget } = calculateImprovementScore({
    baseline: baseline.overallScore || 0, current: current?.overallScore ?? baseline.overallScore ?? 0, target,
  });
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, display: "flex", alignItems: "center", gap: 16 }}>
      <TrendingUp size={20} color={improvementPoints >= 0 ? T.green : T.red} />
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: improvementPoints >= 0 ? T.green : T.red }}>
          {improvementPoints >= 0 ? "+" : ""}{Math.round(improvementPoints * 10) / 10} points
        </div>
        <div style={{ fontSize: 12, color: T.muted }}>
          {progressTowardTarget !== null ? `${Math.round(progressTowardTarget * 10) / 10}% progress toward target` : "Target equals baseline — no progress % available"}
        </div>
      </div>
    </div>
  );
}

function BeforeAfterTable({ baseline, final }) {
  const baselineByItem = Object.fromEntries((baseline.itemResults || []).map((r) => [r.itemId, r]));
  const rows = (final.itemResults || [])
    .filter((r) => typeof r.score === "number" && typeof baselineByItem[r.itemId]?.score === "number")
    .map((r) => ({ itemId: r.itemId, before: baselineByItem[r.itemId].score, after: r.score, delta: r.score - baselineByItem[r.itemId].score }));

  if (rows.length === 0) return <EmptyRow text="No comparable scored items between the baseline and final assessments." />;

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
      <thead>
        <tr style={{ borderBottom: `2px solid ${T.border}` }}>
          {["Baseline score", "Final score", "Change"].map((h) => <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: T.muted, fontWeight: 700 }}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.itemId} style={{ borderBottom: `1px solid ${T.border}` }}>
            <td style={{ padding: "6px 8px" }}>{r.before}</td>
            <td style={{ padding: "6px 8px" }}>{r.after}</td>
            <td style={{ padding: "6px 8px", color: r.delta >= 0 ? T.green : T.red, fontWeight: 700 }}>{r.delta >= 0 ? "+" : ""}{r.delta}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
