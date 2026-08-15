// KPI Library admin screen — list of the catalog + bulk Excel import
// (brief §59), the reference use of ExcelImportWizard.jsx. Wired into
// System Administration alongside the Assessment Catalog admin tab.

import React, { useEffect, useState } from "react";
import { Upload, Gauge } from "lucide-react";
import { T, Btn, EmptyRow, Row, Pill } from "../ui.jsx";
import { KPI_CATEGORIES, KPI_DIRECTIONS, ensureDefaultKpiLibrarySeeded, listKpis, createKpi } from "./kpis.js";
import ExcelImportWizard from "./ExcelImportWizard.jsx";

const IMPORT_COLUMNS = [
  { header: "Name", field: "name", required: true },
  { header: "Category", field: "category", required: true, validate: (v) => KPI_CATEGORIES.includes(v) ? null : `Category must be one of: ${KPI_CATEGORIES.join(", ")}.` },
  { header: "Unit", field: "unit", required: false },
  { header: "Direction", field: "direction", required: true, validate: (v) => KPI_DIRECTIONS.includes(v) ? null : `Direction must be one of: ${KPI_DIRECTIONS.join(", ")}.` },
  { header: "Definition", field: "definition", required: false },
];

export default function KpiLibraryAdminTab({ ctx, canEdit }) {
  const [kpis, setKpis] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const reload = () => { ensureDefaultKpiLibrarySeeded(ctx).then(() => listKpis().then(setKpis)); };
  useEffect(reload, []);

  if (kpis === null) return <div style={{ padding: 24, color: T.muted, fontSize: 13.5 }}>Loading…</div>;

  return (
    <div style={{ padding: "10px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: T.muted, textTransform: "uppercase" }}>{kpis.length} KPIs</div>
        {canEdit && <Btn small variant="ghost" onClick={() => setImportOpen(true)}><Upload size={13} />Import from Excel</Btn>}
      </div>
      {kpis.length === 0 && <EmptyRow text="No KPIs yet." />}
      {KPI_CATEGORIES.map((cat) => {
        const inCat = kpis.filter((k) => k.category === cat);
        if (inCat.length === 0) return null;
        return (
          <div key={cat} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: T.muted, padding: "4px 0" }}>{cat}</div>
            {inCat.map((k) => (
              <Row key={k.id} left={<Gauge size={14} color={T.accent} />} title={k.name}
                sub={`${k.unit || "—"} · ${k.direction}`} right={k.isSystemDefault ? <Pill tone="muted">Default</Pill> : <Pill tone="accent">Custom</Pill>} />
            ))}
          </div>
        );
      })}
      {importOpen && (
        <ExcelImportWizard title="Import KPI Library" columns={IMPORT_COLUMNS}
          onClose={() => { setImportOpen(false); reload(); }}
          onImport={(row) => createKpi({
            name: row.name, category: row.category, unit: row.unit || "", direction: row.direction,
            definition: row.definition || "", formulaId: null, dataSource: "", measurementFrequency: "Monthly", verificationMethod: "",
          }, ctx)} />
      )}
    </div>
  );
}
