// Factory Performance → Overview (docs/pams/UI_SITEMAP.md §2, §4) — the
// brief's §47 multi-factory table: score, rating, RAG per factory, driven
// by the pams_factory_summaries the scoring engine (Phase 6) maintains.
// Sortable by score, matching the brief's "highest/lowest performance"
// requirement.

import React, { useEffect, useState } from "react";
import { Factory, Building2, ArrowUpDown } from "lucide-react";
import { T, MODULE_COLORS, Header, EmptyState, Row, Pill } from "../ui.jsx";
import { listRecords } from "./pamsStore.js";
import { INDUSTRY_TYPE_LABELS } from "./industryProfiles.js";
import { ScoreBadge } from "./ScoreDisplay.jsx";
import NotificationsPanel from "./NotificationsPanel.jsx";

export default function FactoryPerformanceOverview({ ctx }) {
  const [profiles, setProfiles] = useState(null);
  const [summaries, setSummaries] = useState({});
  const [sortDesc, setSortDesc] = useState(true);

  useEffect(() => {
    listRecords("pams_factory_profiles").then(setProfiles).catch(() => setProfiles([]));
    listRecords("pams_factory_summaries").then((all) => setSummaries(Object.fromEntries(all.map((s) => [s.id, s])))).catch(() => {});
  }, []);

  const companiesById = Object.fromEntries(ctx.data.companies.map((c) => [c.id, c]));
  // Company Users only ever see their own factory, same scoping every
  // other module already applies via visibleCompanies.
  const visibleIds = new Set(ctx.visibleCompanies.map((c) => c.id));
  const visibleProfiles = (profiles || []).filter((p) => visibleIds.has(p.id))
    .sort((a, b) => {
      const sa = summaries[a.id]?.overallScore ?? -1;
      const sb = summaries[b.id]?.overallScore ?? -1;
      return sortDesc ? sb - sa : sa - sb;
    });
  const companiesWithoutProfile = ctx.visibleCompanies.filter((c) => !(profiles || []).some((p) => p.id === c.id));

  return (
    <div>
      <Header title="Factory Performance" subtitle="Baseline assessments, goals, targets, KPIs and advisory tracking"
        icon={Factory} color={MODULE_COLORS.pamsFactory} />

      {profiles !== null && visibleProfiles.length > 0 && (
        <NotificationsPanel factoryIds={visibleProfiles.map((p) => p.id)} ctx={ctx} />
      )}

      {profiles === null ? (
        <div style={{ padding: 24, color: T.muted, fontSize: 13.5 }}>Loading…</div>
      ) : (
        <div style={{ padding: "0 18px" }}>
          {visibleProfiles.length === 0 && companiesWithoutProfile.length === 0 && (
            <EmptyState icon={Factory} color={MODULE_COLORS.pamsFactory} title="No companies yet"
              hint="Add a company first, then set up its factory profile here." />
          )}

          {visibleProfiles.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: 0.5, textTransform: "uppercase" }}>
                  Factories ({visibleProfiles.length})
                </div>
                <button onClick={() => setSortDesc((v) => !v)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: T.muted, fontWeight: 700 }}>
                  <ArrowUpDown size={12} />{sortDesc ? "Highest first" : "Lowest first"}
                </button>
              </div>
              {visibleProfiles.map((p) => {
                const co = companiesById[p.id];
                if (!co) return null;
                const summary = summaries[p.id];
                return (
                  <Row key={p.id} onClick={() => ctx.setDetail({ type: "company", id: p.id })}
                    left={<Factory size={17} color={T.accent} />} title={co.name}
                    sub={INDUSTRY_TYPE_LABELS[p.industryType] || p.industryType}
                    right={
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {summary ? <ScoreBadge score={summary.overallScore} ratingName={summary.overallRating} ragStatus={summary.ragStatus} /> : <Pill tone="muted">Not scored yet</Pill>}
                        <Pill tone={p.factoryStatus === "Active" ? "green" : "muted"}>{p.factoryStatus || "Active"}</Pill>
                      </div>
                    } />
                );
              })}
            </>
          )}

          {companiesWithoutProfile.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: 0.5, textTransform: "uppercase", padding: "16px 0 6px" }}>
                Not yet set up ({companiesWithoutProfile.length})
              </div>
              {companiesWithoutProfile.map((co) => (
                <Row key={co.id} onClick={() => ctx.setDetail({ type: "company", id: co.id })}
                  left={<Building2 size={17} color={T.muted} />} title={co.name} sub="No factory profile yet — open the company's Performance tab to set one up." />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
