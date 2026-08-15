// Generic Excel import wizard (brief §59): Upload → Validate → Preview →
// Error Report → Confirm → Import. "Never silently accept invalid
// records" — every row is validated before any write happens, and rows
// with errors are shown, not silently dropped or silently imported with
// bad data.
//
// Reusable: callers pass `columns` (the expected header→field mapping
// and per-field validators) and an `onImport(validRows)` callback that
// does the actual bulk create. See KpiLibraryImport.jsx for the first
// concrete use (brief §59's own "goals/targets/KPIs/actions" import list
// — KPI Library chosen as the reference implementation since it needs no
// parent-hierarchy context to import into, keeping this first wiring
// simple; Targets/Actions import against a chosen Objective/Target follow
// the same reusable wizard, just with a parent picker added around it).

import React, { useState } from "react";
import * as XLSX from "xlsx";
import { Upload, CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";
import { T, Sheet, Btn, Pill } from "../ui.jsx";

/**
 * `columns`: [{ header: "Name", field: "name", required: true, validate?: (value) => errorString|null }]
 */
export default function ExcelImportWizard({ title, columns, onImport, onClose }) {
  const [stage, setStage] = useState("upload"); // upload | preview | importing | done
  const [rows, setRows] = useState([]); // { data, errors: string[] }
  const [importedCount, setImportedCount] = useState(0);
  const [fileError, setFileError] = useState("");

  const validRows = rows.filter((r) => r.errors.length === 0);
  const invalidRows = rows.filter((r) => r.errors.length > 0);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      if (raw.length === 0) { setFileError("The file has no data rows."); return; }

      const validated = raw.map((rawRow, i) => {
        const errors = [];
        const data = {};
        for (const col of columns) {
          const value = rawRow[col.header];
          if (col.required && (value === "" || value === undefined || value === null)) {
            errors.push(`Row ${i + 2}: "${col.header}" is required.`);
          }
          if (value !== "" && value !== undefined && col.validate) {
            const err = col.validate(value);
            if (err) errors.push(`Row ${i + 2}: ${err}`);
          }
          data[col.field] = value;
        }
        return { data, errors };
      });
      setRows(validated);
      setStage("preview");
    } catch (err) {
      setFileError("Couldn't read that file — make sure it's a real .xlsx/.xls file with a header row matching the template.");
    } finally {
      e.target.value = "";
    }
  };

  const confirmImport = async () => {
    setStage("importing");
    let count = 0;
    for (const row of validRows) {
      await onImport(row.data);
      count++;
    }
    setImportedCount(count);
    setStage("done");
  };

  return (
    <Sheet title={title} onClose={onClose}>
      {stage === "upload" && (
        <div>
          <div style={{ fontSize: 13, color: T.ink2, marginBottom: 12 }}>
            Upload an Excel file (.xlsx) with a header row matching these columns: {columns.map((c) => c.header).join(", ")}.
          </div>
          {fileError && <div style={{ background: T.redSoft, color: T.red, padding: "8px 12px", borderRadius: 10, fontSize: 13, marginBottom: 10 }}>{fileError}</div>}
          <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: `2px dashed ${T.border}`, borderRadius: 12, padding: 24, cursor: "pointer", color: T.accent, fontWeight: 700 }}>
            <Upload size={18} /> Choose file
            <input type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: "none" }} />
          </label>
        </div>
      )}

      {stage === "preview" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <Pill tone="green">{validRows.length} valid</Pill>
            {invalidRows.length > 0 && <Pill tone="red">{invalidRows.length} with errors</Pill>}
          </div>
          {invalidRows.length > 0 && (
            <div style={{ background: T.redSoft, borderRadius: 10, padding: 10, marginBottom: 12, maxHeight: 160, overflowY: "auto" }}>
              {invalidRows.flatMap((r) => r.errors).map((err, i) => (
                <div key={i} style={{ fontSize: 12, color: T.red, display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 3 }}>
                  <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 2 }} />{err}
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 10 }}>
            Rows with errors will NOT be imported — fix them in the file and re-upload, or continue to import only the {validRows.length} valid row(s).
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 10 }}>
            {validRows.slice(0, 20).map((r, i) => (
              <div key={i} style={{ padding: "6px 10px", fontSize: 12.5, borderBottom: `1px solid ${T.border}`, color: T.ink2 }}>
                {columns.map((c) => r.data[c.field]).join(" · ")}
              </div>
            ))}
            {validRows.length > 20 && <div style={{ padding: "6px 10px", fontSize: 11.5, color: T.muted }}>…and {validRows.length - 20} more</div>}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <Btn variant="ghost" onClick={() => setStage("upload")}><ArrowLeft size={13} />Choose different file</Btn>
            <div style={{ flex: 1 }} />
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <Btn onClick={confirmImport} disabled={validRows.length === 0}>Import {validRows.length} row(s)</Btn>
          </div>
        </div>
      )}

      {stage === "importing" && <div style={{ padding: 24, textAlign: "center", color: T.muted }}>Importing…</div>}

      {stage === "done" && (
        <div style={{ textAlign: "center", padding: 20 }}>
          <CheckCircle2 size={32} color={T.green} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>Imported {importedCount} row(s)</div>
          <Btn onClick={onClose} style={{ marginTop: 16 }}>Done</Btn>
        </div>
      )}
    </Sheet>
  );
}
