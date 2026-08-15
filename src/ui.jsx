// Shared style tokens, permission helper, and small UI primitives — moved
// out of App.jsx so new modules (starting with src/pams/*) can reuse them
// without creating a circular import: App.jsx renders PAMS components (so
// it must import them), and those components need these primitives (so
// they must import *something* that isn't App.jsx itself). This file has
// no dependency on App.jsx or any feature module, ever — it's the leaf
// every other file in the app is allowed to depend on.
//
// Original source: App.jsx (pre-PAMS). Moved verbatim, not rewritten —
// see git history for authorship of the original implementations.

import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import * as XLSX from "xlsx";

/* ---------------------------------------------------------------
   TOKENS
   Ink        #16323A  primary text / nav shell
   Accent     #2F7A6D  primary actions, active states (advisory teal)
   Amber      #C97A2B  non-compliance / attention
   Red        #B3432B  overdue / danger
   Green      #3F8B5C  completed / success
   Bg         #F4F6F5  app background
   Surface    #FFFFFF  cards
   Border     #DCE3E1
----------------------------------------------------------------*/
export const T = {
  ink: "#16323A",
  ink2: "#3E5761",
  accent: "#2F7A6D",
  accentDark: "#215A50",
  accentSoft: "#E4F0EC",
  amber: "#C97A2B",
  amberSoft: "#FBEEE0",
  red: "#B3432B",
  redSoft: "#F8E7E2",
  green: "#3F8B5C",
  greenSoft: "#E7F2EB",
  blue: "#3A6EA5",
  blueSoft: "#E7EEF5",
  purple: "#7A5AA8",
  purpleSoft: "#EFE8F5",
  cyan: "#2E8FA3",
  cyanSoft: "#E4F2F5",
  rose: "#B0507A",
  roseSoft: "#F7E7EF",
  brown: "#8B6B4A",
  brownSoft: "#F1EAE1",
  slate: "#5B6B76",
  slateSoft: "#E7ECEE",
  bg: "#F4F6F5",
  surface: "#FFFFFF",
  border: "#DCE3E1",
  muted: "#7C9089",
};

// One color per module, reused everywhere that module shows up (nav icon,
// page header icon, empty-state icon) so its identity stays recognizable
// throughout the app instead of everything being the same monochrome ink.
export const MODULE_COLORS = {
  dashboard: T.accent, companies: T.blue, visits: T.green, caps: T.amber,
  advisory: T.purple, assessment: T.cyan, meetings: T.rose, committee: T.blue,
  training: T.green, grievance: T.red, documents: T.brown,
  users: T.slate, reports: T.cyan, sysadmin: T.slate, risk: T.red,
  advisorymgmt: T.purple, pamsFactory: T.accent,
};

export const uid = (p = "id") => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
};
export const todayISO = () => new Date().toISOString().slice(0, 10);

// Above this width we switch from the mobile "phone card" chrome (bottom tab
// bar, bottom sheets) to a desktop layout (persistent sidebar, centered
// modals) instead of just stretching the same mobile layout wider.
export const DESKTOP_BP = 860;

export function useViewportWidth() {
  const [width, setWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : DESKTOP_BP));
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

// The coded fallback permissions, used when a module key is entirely
// absent from the live Firestore `permissions` doc (a role that already
// existed before a module was added won't have that key yet — see hasPerm
// below for why "missing" must mean "use this default", not "deny").
// Kept here (not in App.jsx) purely so hasPerm can call it directly without
// creating a circular import — this file's own comment block explains why
// that matters. PERMISSION_MODULES (the admin-facing labeled list used by
// the Permission Matrix screen) and CONFIGURABLE_ROLES stay in App.jsx,
// since nothing outside App.jsx needs them.
export function defaultPermissions() {
  const full = { view: true, edit: true, delete: true };
  const editOnly = { view: true, edit: true, delete: false };
  const viewOnly = { view: true, edit: false, delete: false };
  const none = { view: false, edit: false, delete: false };
  return {
    manager: {
      dashboard: viewOnly, companies: full, advisory: full, visits: full, assessment: full, risk: full, caps: full,
      meetings: editOnly, committee: editOnly, reports: viewOnly, sysadmin: none,
      training: editOnly, grievance: editOnly, documents: editOnly, pamsFactory: full,
    },
    officer: {
      dashboard: viewOnly, companies: viewOnly, advisory: viewOnly, visits: editOnly, assessment: viewOnly, risk: editOnly, caps: editOnly,
      meetings: editOnly, committee: viewOnly, reports: viewOnly, sysadmin: none,
      training: editOnly, grievance: editOnly, documents: editOnly, pamsFactory: editOnly,
    },
    user: {
      dashboard: viewOnly, companies: viewOnly, advisory: viewOnly, visits: viewOnly, assessment: viewOnly, risk: viewOnly, caps: viewOnly,
      meetings: viewOnly, committee: viewOnly, reports: viewOnly, sysadmin: none,
      training: viewOnly, grievance: viewOnly, documents: viewOnly, pamsFactory: viewOnly,
    },
  };
}

export function hasPerm(ctx, moduleKey, action) {
  if (ctx.role.role === "admin") return true;
  // An admin's explicit choice (even an explicit all-false "none") is a
  // real object and always wins over the fallback, since ?? only applies
  // when the value is null/undefined, never for an existing-but-restrictive
  // object.
  const perms = ctx.data.permissions?.[ctx.role.role]?.[moduleKey] ?? defaultPermissions()[ctx.role.role]?.[moduleKey];
  return !!(perms && perms[action]);
}

/* ---------------------------------------------------------------
   SMALL UI PRIMITIVES
----------------------------------------------------------------*/
export function Pill({ children, tone = "muted" }) {
  const tones = {
    muted: { bg: T.border, fg: T.ink2 },
    accent: { bg: T.accentSoft, fg: T.accentDark },
    amber: { bg: T.amberSoft, fg: T.amber },
    red: { bg: T.redSoft, fg: T.red },
    green: { bg: T.greenSoft, fg: T.green },
    blue: { bg: T.blueSoft, fg: T.blue },
    purple: { bg: T.purpleSoft, fg: T.purple },
    cyan: { bg: T.cyanSoft, fg: T.cyan },
    rose: { bg: T.roseSoft, fg: T.rose },
    brown: { bg: T.brownSoft, fg: T.brown },
    slate: { bg: T.slateSoft, fg: T.slate },
  };
  const c = tones[tone] || tones.muted;
  return (
    <span style={{ background: c.bg, color: c.fg, fontSize: 11.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, letterSpacing: 0.2 }}>
      {children}
    </span>
  );
}

// A colored circular backdrop behind an icon, used everywhere a module's
// icon appears (nav, header, empty states) so it reads as a colorful badge
// rather than a flat monochrome glyph. The ".icon-chip" class picks up the
// hover/press motion defined once in Shell's injected <style>.
export function IconChip({ icon: Icon, color = T.accent, size = 34, iconSize = 17, strokeWidth, background, style }) {
  return (
    <span className="icon-chip" style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      width: size, height: size, borderRadius: size * 0.32,
      background: background !== undefined ? background : `${color}1A`,
      ...style,
    }}>
      <Icon size={iconSize} color={color} strokeWidth={strokeWidth} />
    </span>
  );
}

export function Field({ label, children, full }) {
  return (
    <label style={{ display: "block", marginBottom: 14, gridColumn: full ? "1 / -1" : undefined }}>
      <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: T.ink2, marginBottom: 6, letterSpacing: 0.2 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10,
  border: `1px solid ${T.border}`, fontSize: 15, fontFamily: "inherit", color: T.ink,
  background: "#FCFDFD", outline: "none",
};

export function TextInput(props) { return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />; }
export function TextArea(props) { return <textarea {...props} rows={props.rows || 3} style={{ ...inputStyle, resize: "vertical", ...(props.style || {}) }} />; }
export function Select({ children, ...props }) { return <select {...props} style={{ ...inputStyle, ...(props.style || {}) }}>{children}</select>; }

export function Sheet({ title, onClose, children }) {
  const width = useViewportWidth();
  const isDesktop = width >= DESKTOP_BP;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 60, display: "flex",
      alignItems: isDesktop ? "center" : "flex-end", justifyContent: isDesktop ? "center" : "stretch",
      padding: isDesktop ? 24 : 0,
    }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(22,50,58,0.45)" }} />
      <div style={{
        position: "relative", background: T.surface, width: isDesktop ? "min(600px, 100%)" : "100%",
        maxHeight: isDesktop ? "88vh" : "92vh",
        borderRadius: isDesktop ? 20 : "20px 20px 0 0", display: "flex", flexDirection: "column",
        animation: isDesktop ? "fadeScaleIn .18s ease-out" : "slideUp .22s ease-out",
        boxShadow: isDesktop ? "0 20px 60px rgba(0,0,0,0.25)" : "0 -8px 30px rgba(0,0,0,0.18)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: `1px solid ${T.border}` }}>
          <h3 style={{ margin: 0, fontSize: 17, fontFamily: "'Space Grotesk', sans-serif", color: T.ink }}>{title}</h3>
          <button onClick={onClose} aria-label="Close" style={{ background: T.bg, border: "none", borderRadius: 999, width: 32, height: 32, display: "grid", placeItems: "center", cursor: "pointer" }}>
            <X size={18} color={T.ink2} />
          </button>
        </div>
        <div style={{ padding: 18, overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}

export function Btn({ children, onClick, variant = "primary", full, type = "button", small, disabled }) {
  const styles = {
    primary: { background: T.accent, color: "#fff", border: "none" },
    ghost: { background: "transparent", color: T.ink2, border: `1px solid ${T.border}` },
    danger: { background: T.redSoft, color: T.red, border: "none" },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      ...styles[variant], width: full ? "100%" : undefined, padding: small ? "8px 12px" : "11px 16px",
      borderRadius: 10, fontSize: small ? 13 : 15, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
      fontFamily: "inherit", opacity: disabled ? 0.6 : 1,
    }}>
      {children}
    </button>
  );
}

export function EmptyState({ icon: Icon, title, hint, color = T.muted }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 20px", color: T.muted }}>
      <IconChip icon={Icon} color={color} size={54} iconSize={26} strokeWidth={1.6} style={{ margin: "0 auto 12px" }} />
      <div style={{ fontWeight: 700, color: T.ink2, fontSize: 15 }}>{title}</div>
      <div style={{ fontSize: 13, marginTop: 4 }}>{hint}</div>
    </div>
  );
}

export function Header({ title, subtitle, action, icon, color = T.accent }) {
  return (
    <div style={{ padding: "18px 18px 4px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {icon && <IconChip icon={icon} color={color} size={40} iconSize={20} strokeWidth={2} />}
        <div>
          <h1 style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: 23, color: T.ink }}>{title}</h1>
          {subtitle && <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>{subtitle}</div>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function SearchBar({ value, onChange, placeholder }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "9px 12px", margin: "12px 18px 6px" }}>
      <SearchIcon />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ border: "none", outline: "none", fontSize: 14.5, flex: 1, fontFamily: "inherit", color: T.ink, background: "transparent" }} />
    </div>
  );
}
// Local, tiny — avoids adding a second lucide-react import path just for
// this one icon while keeping SearchBar self-contained.
function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function SectionLabel({ children }) {
  return <div style={{ padding: "6px 18px", fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: 0.5, textTransform: "uppercase" }}>{children}</div>;
}
export function EmptyRow({ text }) {
  return <div style={{ padding: "14px 0", color: T.muted, fontSize: 13.5 }}>{text}</div>;
}
export function Row({ left, title, sub, right, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: T.surface,
      borderRadius: 12, marginBottom: 8, border: `1px solid ${T.border}`, cursor: onClick ? "pointer" : "default",
    }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: T.bg, display: "grid", placeItems: "center", flexShrink: 0 }}>{left}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        {sub && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 1 }}>{sub}</div>}
      </div>
      {right}
      {onClick && <ChevronRightIcon />}
    </div>
  );
}
function ChevronRightIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/* ---------------------------------------------------------------
   EXPORT HELPERS (Excel via SheetJS, PDF via print dialog)
----------------------------------------------------------------*/
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function exportExcel(rows, sheetName, filename) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(new Blob([out], { type: "application/octet-stream" }), filename);
}

export function exportPdf(title, rows, columns) {
  const win = window.open("", "_blank");
  if (!win) { alert("Please allow pop-ups to export a PDF."); return; }
  const styles = `
    body{font-family:Arial,Helvetica,sans-serif;padding:28px;color:${T.ink}}
    h1{font-size:19px;margin:0 0 2px} .sub{font-size:12px;color:${T.muted};margin-bottom:16px}
    table{width:100%;border-collapse:collapse} th,td{border:1px solid #D9D9D9;padding:7px 9px;font-size:11.5px;text-align:left;vertical-align:top}
    th{background:${T.bg};font-weight:700}
  `;
  const head = columns.map((c) => `<th>${c.label}</th>`).join("");
  const body = rows.map((r) => `<tr>${columns.map((c) => `<td>${(r[c.key] ?? "").toString().replace(/</g, "&lt;")}</td>`).join("")}</tr>`).join("");
  win.document.write(`<html><head><title>${title}</title><style>${styles}</style></head><body>
    <h1>${title}</h1><div class="sub">Generated ${fmtDate(todayISO())}</div>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 350);
}
