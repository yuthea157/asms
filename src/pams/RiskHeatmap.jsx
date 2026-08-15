// Risk heatmap (brief §38: "Provide risk heatmap") — a 5×5
// likelihood×severity grid, cell color/count driven by the same
// riskLevelOf()/riskLevelTone() functions the existing Risk Assessment
// list already uses, so the heatmap and the list can never disagree
// about what counts as "High" vs "Medium."

import React from "react";
import { T } from "../ui.jsx";

const LIKELIHOOD_LABELS = ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"];
const SEVERITY_LABELS = ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"];

export default function RiskHeatmap({ risks, riskLevelOf, riskLevelTone, onCellClick }) {
  const cellColor = (level) => {
    const tone = riskLevelTone(level);
    return tone === "red" ? T.red : tone === "rose" ? T.rose : tone === "amber" ? T.amber : T.green;
  };

  const grid = [];
  for (let severity = 5; severity >= 1; severity--) {
    const row = [];
    for (let likelihood = 1; likelihood <= 5; likelihood++) {
      const score = likelihood * severity;
      const level = riskLevelOf(score);
      const count = risks.filter((r) => r.likelihood === likelihood && r.severity === severity).length;
      row.push({ likelihood, severity, score, level, count });
    }
    grid.push(row);
  }

  return (
    <div style={{ padding: "0 18px 14px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "70px repeat(5, 1fr)", gap: 3 }}>
        <div />
        {LIKELIHOOD_LABELS.map((l) => (
          <div key={l} style={{ fontSize: 9.5, fontWeight: 700, color: T.muted, textAlign: "center", writingMode: "horizontal-tb" }}>{l}</div>
        ))}
        {grid.map((row, i) => (
          <React.Fragment key={i}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: T.muted, display: "flex", alignItems: "center" }}>{SEVERITY_LABELS[row[0].severity - 1]}</div>
            {row.map((cell) => (
              <div key={`${cell.likelihood}-${cell.severity}`} onClick={() => cell.count > 0 && onCellClick?.(cell)}
                style={{
                  background: cellColor(cell.level), borderRadius: 6, minHeight: 44, display: "flex",
                  flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#fff",
                  cursor: cell.count > 0 && onCellClick ? "pointer" : "default", opacity: cell.count > 0 ? 1 : 0.35,
                }}>
                <span style={{ fontSize: 15, fontWeight: 800 }}>{cell.count || ""}</span>
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.muted, marginTop: 4, padding: "0 4px" }}>
        <span>← Likelihood →</span>
        <span>↑ Severity ↑</span>
      </div>
    </div>
  );
}
