import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import {
  Building2, CalendarClock, ClipboardList, ShieldAlert, Users as UsersIcon,
  FileBarChart, Plus, X, ChevronRight, Search, Clock, AlertTriangle,
  CheckCircle2, Circle, MoreHorizontal, ArrowLeft, Phone, Mail, MapPin,
  Trash2, Pencil, TrendingUp, FileText, LogIn, Paperclip, Image as ImageIcon,
  Download, Printer, Eye, EyeOff, Lock, MessageSquare, Scale, Filter, BookOpen
} from "lucide-react";

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

const T = {
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
  bg: "#F4F6F5",
  surface: "#FFFFFF",
  border: "#DCE3E1",
  muted: "#7C9089",
};

const uid = (p = "id") => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
};
const todayISO = () => new Date().toISOString().slice(0, 10);

// Above this width we switch from the mobile "phone card" chrome (bottom tab
// bar, bottom sheets) to a desktop layout (persistent sidebar, centered
// modals) instead of just stretching the same mobile layout wider.
const DESKTOP_BP = 860;

function useViewportWidth() {
  const [width, setWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : DESKTOP_BP));
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

// Downscale + compress an image file to a base64 JPEG so it fits comfortably
// within the 5MB-per-key storage limit.
function compressImageFile(file, maxDim = 1100, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Could not read image"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

const ROLE_LABEL = { admin: "Administrator", manager: "Manager", officer: "Advisory Officer", user: "Company User" };
const COMPANY_TYPES = ["Manufacturing", "Garment & Textile", "Food & Beverage", "Construction", "Logistics", "Services", "Other"];
const CAP_STATUSES = ["Open", "In Progress", "Completed"];

/* ---------------------------------------------------------------
   SEED DATA (used only the very first time storage is empty)
----------------------------------------------------------------*/
function seedData() {
  const companyId = uid("co");
  const advisoryId = uid("adv");
  const apId = uid("ap");
  return {
    companies: [
      {
        id: companyId, name: "Meridian Apparel Co., Ltd.", type: "Garment & Textile",
        address: "St. 598, Phnom Penh SEZ, Phnom Penh",
        contacts: [{ id: uid("ct"), name: "Sokha Chan", position: "HR Manager", phone: "012 345 678", email: "sokha@meridianapparel.com" }],
      },
    ],
    advisoryInfo: [
      { id: advisoryId, companyId, cycleNumber: "CY-2026-01", startDate: "2026-02-01", endDate: "2026-07-31", remark: "Annual advisory cycle, focus on labour standards." },
    ],
    visits: [
      { id: uid("v"), advisoryInfoId: advisoryId, visitNumber: "V-01", date: "2026-02-10", startTime: "09:00", endTime: "12:00", log: "Opening meeting and factory walkthrough completed." },
    ],
    assessmentPlans: [
      { id: apId, advisoryInfoId: advisoryId, previousAssessmentDate: "2025-08-15", planAssessmentDate: "2026-08-15", reportReleasedDate: "", currentNC: 3 },
    ],
    users: [
      { id: uid("u"), name: "Dara Pich", username: "dpich", email: "dara@advisoryco.com", role: "admin", password: "admin123" },
      { id: uid("u"), name: "Lina Meas", username: "lmeas", email: "lina@advisoryco.com", role: "manager", password: "manager123" },
      { id: uid("u"), name: "Vichet Ros", username: "vros", email: "vichet@advisoryco.com", role: "officer", password: "officer123" },
      { id: uid("u"), name: "Sokha Chan", username: "schan", email: "sokha@meridianapparel.com", role: "user", companyId, password: "company123" },
    ],
    caps: [
      { id: uid("cap"), assessmentPlanId: apId, ncNumber: "NC-01", area: "Fire Safety", rootCause: "Blocked emergency exits in Building B.", correctiveActions: "Clear exits, install signage, retrain floor staff.", leadPerson: "Sokha Chan", supportPerson: "Vichet Ros", targetDate: "2026-08-01", actualDate: "", status: "In Progress", progress: 60, recommendations: "Add monthly self-audit checklist." },
    ],
    meetingLogs: [
      { id: uid("ml"), companyId, date: "2026-02-10", log: "Discussed grievance handling procedure and upcoming fire drill schedule.", participants: ["Sokha Chan", "Vichet Ros", "Floor Supervisor"] },
    ],
    bipartiteCommittee: [
      { id: uid("bc"), companyId, name: "Sokha Chan", sex: "Female", dateJoined: "2025-01-15", committeeRole: "Chairperson", companyRole: "HR Manager", union: "N", phone: "012 345 678" },
      { id: uid("bc"), companyId, name: "Ratanak Sok", sex: "Male", dateJoined: "2025-01-15", committeeRole: "Member", companyRole: "Sewing Line Worker", union: "Y", phone: "011 222 333" },
    ],
    capRecommendations: [
      { id: uid("cr"), ncNo: "NC-STD-01", area: "Fire Safety", cluster: "OSH", rootCause: "Emergency exits obstructed or locked during working hours.", proposedCA: "Clear all exit routes, install illuminated exit signage, and conduct quarterly fire drills." },
      { id: uid("cr"), ncNo: "NC-STD-02", area: "Overtime Consent", cluster: "Working Time", rootCause: "Workers not given voluntary, documented consent before overtime.", proposedCA: "Introduce a written overtime consent form and log signed copies for each shift." },
    ],
    permissions: defaultPermissions(),
  };
}

/* ---------------------------------------------------------------
   PERMISSION MATRIX
   Admins always have full access to every company. Manager, Officer
   and Company User permissions are configurable by an admin, per
   module, per action. Company Users are additionally restricted to
   the single company they're assigned to (see inScope / scopeCompanyId).
----------------------------------------------------------------*/
const PERMISSION_MODULES = [
  { key: "companies", label: "Companies" },
  { key: "advisory", label: "Advisory Cycles" },
  { key: "visits", label: "Advisory Visits" },
  { key: "assessment", label: "Assessment Plans" },
  { key: "caps", label: "Actions (CAP)" },
  { key: "meetings", label: "Meeting Logs" },
  { key: "committee", label: "Bipartite Committee" },
  { key: "caprecs", label: "CAP Recommendations" },
  { key: "reports", label: "Reports" },
];
const CONFIGURABLE_ROLES = ["manager", "officer", "user"];

function defaultPermissions() {
  const full = { view: true, edit: true, delete: true };
  const editOnly = { view: true, edit: true, delete: false };
  const viewOnly = { view: true, edit: false, delete: false };
  const none = { view: false, edit: false, delete: false };
  return {
    manager: {
      companies: full, advisory: full, visits: full, assessment: full, caps: full,
      meetings: editOnly, committee: editOnly, caprecs: editOnly, reports: viewOnly,
    },
    officer: {
      companies: viewOnly, advisory: viewOnly, visits: editOnly, assessment: viewOnly, caps: editOnly,
      meetings: editOnly, committee: viewOnly, caprecs: viewOnly, reports: viewOnly,
    },
    user: {
      companies: viewOnly, advisory: viewOnly, visits: viewOnly, assessment: viewOnly, caps: viewOnly,
      meetings: viewOnly, committee: viewOnly, caprecs: none, reports: viewOnly,
    },
  };
}

function hasPerm(ctx, moduleKey, action) {
  if (ctx.role.role === "admin") return true;
  const perms = ctx.data.permissions?.[ctx.role.role]?.[moduleKey];
  return !!(perms && perms[action]);
}

// Company Users are locked to the single company they're assigned to.
// Every other role sees everything (scopeCompanyId is null for them).
function inScope(ctx, companyId) {
  return !ctx.scopeCompanyId || companyId === ctx.scopeCompanyId;
}

/* ---------------------------------------------------------------
   STORAGE HOOK
----------------------------------------------------------------*/
const KEYS = ["companies", "advisoryInfo", "visits", "assessmentPlans", "users", "caps", "meetingLogs", "bipartiteCommittee", "capRecommendations", "permissions"];

const CAP_CLUSTERS = [
  "Child Labor", "Forced Labor", "Discrimination and Harassment", "FoA & CBA",
  "Employment Contract and HR", "Working Time", "Wages and Benefits", "OSH", "Others",
];

function useStore() {
  const [data, setData] = useState(null);
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState("idle");

  useEffect(() => {
    (async () => {
      const next = {};
      let anyMissing = false;
      for (const k of KEYS) {
        try {
          const res = await window.storage.get(k, true);
          next[k] = res ? JSON.parse(res.value) : null;
          if (!res) anyMissing = true;
        } catch {
          next[k] = null;
          anyMissing = true;
        }
      }
      if (anyMissing) {
        const seed = seedData();
        for (const k of KEYS) {
          if (!next[k]) {
            next[k] = seed[k];
            try { await window.storage.set(k, JSON.stringify(seed[k]), true); } catch {}
          }
        }
      }
      setData(next);
      setReady(true);
    })();
  }, []);

  const update = useCallback((key, updater) => {
    setData((prev) => {
      const nextVal = typeof updater === "function" ? updater(prev[key]) : updater;
      const nextData = { ...prev, [key]: nextVal };
      setSaveState("saving");
      window.storage.set(key, JSON.stringify(nextVal), true)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
      return nextData;
    });
  }, []);

  return { data, ready, update, saveState };
}

/* ---------------------------------------------------------------
   SMALL UI PRIMITIVES
----------------------------------------------------------------*/
function Pill({ children, tone = "muted" }) {
  const tones = {
    muted: { bg: T.border, fg: T.ink2 },
    accent: { bg: T.accentSoft, fg: T.accentDark },
    amber: { bg: T.amberSoft, fg: T.amber },
    red: { bg: T.redSoft, fg: T.red },
    green: { bg: T.greenSoft, fg: T.green },
    blue: { bg: T.blueSoft, fg: T.blue },
  };
  const c = tones[tone] || tones.muted;
  return (
    <span style={{ background: c.bg, color: c.fg, fontSize: 11.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, letterSpacing: 0.2 }}>
      {children}
    </span>
  );
}

function Field({ label, children, full }) {
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

function TextInput(props) { return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />; }
function TextArea(props) { return <textarea {...props} rows={props.rows || 3} style={{ ...inputStyle, resize: "vertical", ...(props.style || {}) }} />; }
function Select({ children, ...props }) { return <select {...props} style={{ ...inputStyle, ...(props.style || {}) }}>{children}</select>; }

function Sheet({ title, onClose, children }) {
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

function Btn({ children, onClick, variant = "primary", full, type = "button", small, disabled }) {
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

function EmptyState({ icon: Icon, title, hint }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 20px", color: T.muted }}>
      <Icon size={30} strokeWidth={1.5} style={{ marginBottom: 10 }} />
      <div style={{ fontWeight: 700, color: T.ink2, fontSize: 15 }}>{title}</div>
      <div style={{ fontSize: 13, marginTop: 4 }}>{hint}</div>
    </div>
  );
}

function RestrictedView({ goto }) {
  return (
    <div style={{ textAlign: "center", padding: "70px 26px" }}>
      <Lock size={30} strokeWidth={1.5} color={T.muted} style={{ marginBottom: 10 }} />
      <div style={{ fontWeight: 700, color: T.ink2, fontSize: 15 }}>You don't have access to this section</div>
      <div style={{ fontSize: 13, color: T.muted, marginTop: 4, marginBottom: 18 }}>Ask an administrator to grant permission from the Permission Matrix.</div>
      <Btn onClick={goto}>Back to Overview</Btn>
    </div>
  );
}

function Header({ title, subtitle, action }) {
  return (
    <div style={{ padding: "18px 18px 4px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
      <div>
        <h1 style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: 23, color: T.ink }}>{title}</h1>
        {subtitle && <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

function SearchBar({ value, onChange, placeholder }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "9px 12px", margin: "12px 18px 6px" }}>
      <Search size={16} color={T.muted} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ border: "none", outline: "none", fontSize: 14.5, flex: 1, fontFamily: "inherit", color: T.ink, background: "transparent" }} />
    </div>
  );
}

function capStatusOf(cap) {
  if (cap.status === "Completed") return "Completed";
  if (cap.targetDate && cap.targetDate < todayISO()) return "Overdue";
  return cap.status || "Open";
}
function capTone(status) {
  return status === "Completed" ? "green" : status === "Overdue" ? "red" : status === "In Progress" ? "blue" : "amber";
}

/* ---------------------------------------------------------------
   MAIN APP
----------------------------------------------------------------*/
export default function App() {
  const { data, ready, update } = useStore();
  const [role, setRole] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [moreOpen, setMoreOpen] = useState(false);
  const [detail, setDetail] = useState(null); // {type:'company'|'advisory'|'assessment', id}
  const viewportWidth = useViewportWidth();
  const isDesktop = viewportWidth >= DESKTOP_BP;

  if (!ready) {
    return (
      <Shell>
        <div style={{ display: "grid", placeItems: "center", height: "70vh", color: T.muted, fontFamily: "'Space Grotesk', sans-serif" }}>
          Loading advisory workspace…
        </div>
      </Shell>
    );
  }

  if (!role) {
    return (
      <Shell>
        <RoleGate users={data.users} onEnter={setRole} />
      </Shell>
    );
  }

  const scopeCompanyId = role.role === "user" ? (role.companyId || "__unassigned__") : null;
  const visibleCompanies = scopeCompanyId ? data.companies.filter((c) => c.id === scopeCompanyId) : data.companies;
  const ctx = { data, update, role, setDetail, scopeCompanyId, visibleCompanies };

  const NAV = [
    { key: "dashboard", label: "Overview", icon: TrendingUp },
    { key: "companies", label: "Companies", icon: Building2, perm: "companies" },
    { key: "visits", label: "Visits", icon: CalendarClock, perm: "visits" },
    { key: "caps", label: "Actions", icon: ShieldAlert, perm: "caps" },
  ].filter((n) => !n.perm || hasPerm(ctx, n.perm, "view"));
  const MORE_NAV = [
    { key: "advisory", label: "Advisory Cycles", icon: ClipboardList, perm: "advisory" },
    { key: "assessment", label: "Assessment Plans", icon: FileText, perm: "assessment" },
    { key: "meetings", label: "Meeting Logs", icon: MessageSquare, perm: "meetings" },
    { key: "committee", label: "Bipartite Committee", icon: Scale, perm: "committee" },
    { key: "caprecs", label: "CAP Recommendations", icon: BookOpen, perm: "caprecs" },
    { key: "users", label: "User Accounts", icon: UsersIcon, adminOnly: true },
    { key: "reports", label: "Reports", icon: FileBarChart, perm: "reports" },
  ].filter((n) => (n.adminOnly ? role.role === "admin" : !n.perm || hasPerm(ctx, n.perm, "view")));

  let Body = null;
  if (scopeCompanyId === "__unassigned__") {
    Body = (
      <div style={{ textAlign: "center", padding: "70px 26px" }}>
        <Building2 size={30} strokeWidth={1.5} color={T.muted} style={{ marginBottom: 10 }} />
        <div style={{ fontWeight: 700, color: T.ink2, fontSize: 15 }}>No company assigned</div>
        <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>Ask an administrator to link your account to a company.</div>
      </div>
    );
  } else if (detail?.type === "company") Body = <CompanyDetail id={detail.id} ctx={ctx} onBack={() => setDetail(null)} />;
  else if (detail?.type === "advisory") Body = <AdvisoryDetail id={detail.id} ctx={ctx} onBack={() => setDetail(null)} />;
  else if (detail?.type === "assessment") Body = <AssessmentDetail id={detail.id} ctx={ctx} onBack={() => setDetail(null)} />;
  else if (tab === "dashboard") Body = <Dashboard ctx={ctx} goto={(t) => { setTab(t); setDetail(null); }} />;
  else if (tab === "companies" && hasPerm(ctx, "companies", "view")) Body = <CompaniesView ctx={ctx} />;
  else if (tab === "visits" && hasPerm(ctx, "visits", "view")) Body = <VisitsView ctx={ctx} />;
  else if (tab === "caps" && hasPerm(ctx, "caps", "view")) Body = <CapsView ctx={ctx} />;
  else if (tab === "advisory" && hasPerm(ctx, "advisory", "view")) Body = <AdvisoryView ctx={ctx} />;
  else if (tab === "assessment" && hasPerm(ctx, "assessment", "view")) Body = <AssessmentView ctx={ctx} />;
  else if (tab === "meetings" && hasPerm(ctx, "meetings", "view")) Body = <MeetingLogsView ctx={ctx} />;
  else if (tab === "committee" && hasPerm(ctx, "committee", "view")) Body = <BipartiteCommitteeView ctx={ctx} />;
  else if (tab === "caprecs" && hasPerm(ctx, "caprecs", "view")) Body = <CapRecommendationsView ctx={ctx} />;
  else if (tab === "users" && role.role === "admin") Body = <UsersView ctx={ctx} />;
  else if (tab === "reports" && hasPerm(ctx, "reports", "view")) Body = <ReportsView ctx={ctx} />;
  else Body = <RestrictedView goto={() => { setTab("dashboard"); setDetail(null); }} />;

  const activeMore = MORE_NAV.some((m) => m.key === tab);
  const roleLabel = ROLE_LABEL[role.role]?.split(" ")[0] || role.role;

  if (isDesktop) {
    return (
      <Shell wide>
        <div style={{ display: "flex", flex: 1, minHeight: "100vh" }}>
          <SideNav
            items={[...NAV, ...MORE_NAV]}
            activeKey={detail ? null : tab}
            onSelect={(k) => { setTab(k); setDetail(null); }}
            roleLabel={roleLabel}
            userName={role.name}
            onSignOut={() => setRole(null)}
          />
          <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
            <div style={{ maxWidth: 820, margin: "0 auto", padding: "12px 0 40px" }}>{Body}</div>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <TopBar roleLabel={roleLabel} userName={role.name} onSignOut={() => setRole(null)} />
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 86 }}>{Body}</div>
      <BottomNav
        items={NAV}
        moreItems={MORE_NAV}
        tab={tab}
        detail={detail}
        moreOpen={moreOpen}
        activeMore={activeMore}
        onSelect={(k) => { setTab(k); setDetail(null); setMoreOpen(false); }}
        onToggleMore={() => setMoreOpen((v) => !v)}
        onCloseMore={() => setMoreOpen(false)}
      />
    </Shell>
  );
}

function NavBtn({ icon: Icon, label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, background: "none", border: "none", display: "flex", flexDirection: "column",
      alignItems: "center", gap: 3, padding: "7px 2px", cursor: "pointer", fontFamily: "inherit",
    }}>
      <Icon size={20} color={active ? T.accent : T.muted} strokeWidth={active ? 2.4 : 1.9} />
      <span style={{ fontSize: 10.5, fontWeight: 700, color: active ? T.accent : T.muted }}>{label}</span>
    </button>
  );
}

// Top bar used by the mobile ("phone card") layout only — the desktop
// layout puts branding + account into SideNav instead, since there's no
// need to economize on vertical space there.
function TopBar({ roleLabel, userName, onSignOut }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: `1px solid ${T.border}`, background: T.ink }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: T.accent, display: "grid", placeItems: "center" }}>
          <ShieldAlert size={15} color="#fff" />
        </div>
        <span style={{ color: "#fff", fontFamily: "'Space Grotesk', sans-serif", fontSize: 15.5 }}>Advisory Desk</span>
      </div>
      <button onClick={onSignOut} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", fontSize: 11.5, fontWeight: 700, padding: "6px 10px", borderRadius: 999, cursor: "pointer" }}>
        {roleLabel?.split(" ")[0] || ""} · {userName.split(" ")[0]}
      </button>
    </div>
  );
}

// Bottom tab bar + its "More" overflow popover — the mobile navigation
// pattern. `items` are the always-visible tabs; `moreItems` collapse behind
// the overflow button since a phone-width bar can't fit every section.
function BottomNav({ items, moreItems, tab, detail, moreOpen, activeMore, onSelect, onToggleMore, onCloseMore }) {
  return (
    <>
      <nav style={{
        position: "sticky", bottom: 0, background: T.surface, borderTop: `1px solid ${T.border}`,
        display: "flex", padding: "6px 4px calc(6px + env(safe-area-inset-bottom))", zIndex: 40,
      }}>
        {items.map((n) => (
          <NavBtn key={n.key} icon={n.icon} label={n.label} active={tab === n.key && !detail} onClick={() => onSelect(n.key)} />
        ))}
        <NavBtn icon={MoreHorizontal} label="More" active={activeMore || moreOpen} onClick={onToggleMore} />
      </nav>

      {moreOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50 }} onClick={onCloseMore}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(22,50,58,0.35)" }} />
          <div onClick={(e) => e.stopPropagation()} style={{
            position: "absolute", bottom: 78, right: 12, background: T.surface, borderRadius: 14,
            boxShadow: "0 10px 30px rgba(0,0,0,0.2)", overflow: "hidden", width: 220, border: `1px solid ${T.border}`,
          }}>
            {moreItems.map((m) => (
              <button key={m.key} onClick={() => onSelect(m.key)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "13px 14px",
                background: tab === m.key ? T.accentSoft : "transparent", border: "none", borderBottom: `1px solid ${T.border}`,
                fontSize: 14.5, color: T.ink, cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontWeight: 600,
              }}>
                <m.icon size={17} color={tab === m.key ? T.accentDark : T.ink2} /> {m.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// Persistent desktop sidebar — replaces TopBar + BottomNav above the
// DESKTOP_BP breakpoint. There's room to show every nav item flat (no
// "More" overflow needed) since a sidebar isn't fighting for horizontal
// space the way a phone-width bottom bar is.
function SideNav({ items, activeKey, onSelect, roleLabel, userName, onSignOut }) {
  return (
    <div style={{
      width: 236, flexShrink: 0, background: T.ink, display: "flex", flexDirection: "column",
      minHeight: "100vh", position: "sticky", top: 0, alignSelf: "flex-start",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "22px 18px 18px" }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: T.accent, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <ShieldAlert size={17} color="#fff" />
        </div>
        <span style={{ color: "#fff", fontFamily: "'Space Grotesk', sans-serif", fontSize: 16.5 }}>Advisory Desk</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px" }}>
        {items.map((n) => (
          <button key={n.key} onClick={() => onSelect(n.key)} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", marginBottom: 2,
            borderRadius: 10, border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontSize: 14, fontWeight: 700,
            background: activeKey === n.key ? "rgba(255,255,255,0.12)" : "transparent",
            color: activeKey === n.key ? "#fff" : "#9DB3AB",
          }}>
            <n.icon size={18} strokeWidth={activeKey === n.key ? 2.3 : 1.9} />
            {n.label}
          </button>
        ))}
      </div>
      <div style={{ padding: 14, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <button onClick={onSignOut} style={{
          width: "100%", background: "rgba(255,255,255,0.08)", border: "none", color: "#fff",
          fontSize: 12.5, fontWeight: 700, padding: "9px 10px", borderRadius: 10, cursor: "pointer", textAlign: "left", fontFamily: "inherit",
        }}>
          {roleLabel?.split(" ")[0] || ""} · {userName.split(" ")[0]}
          <div style={{ fontSize: 10.5, fontWeight: 600, color: "#9DB3AB", marginTop: 2 }}>Tap to sign out</div>
        </button>
      </div>
    </div>
  );
}

function Shell({ children, wide }) {
  return (
    <div style={{
      maxWidth: wide ? "none" : 460, margin: "0 auto", minHeight: "100vh", background: T.bg,
      display: "flex", flexDirection: "column", fontFamily: "'Inter', -apple-system, sans-serif",
      position: "relative", boxShadow: wide ? "none" : "0 0 40px rgba(0,0,0,0.06)",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        @keyframes slideUp { from { transform: translateY(24px); opacity: 0.4 } to { transform: translateY(0); opacity: 1 } }
        @keyframes fadeScaleIn { from { transform: scale(0.96); opacity: 0.4 } to { transform: scale(1); opacity: 1 } }
        input:focus, select:focus, textarea:focus { border-color: ${T.accent} !important; box-shadow: 0 0 0 3px ${T.accentSoft}; }
        ::-webkit-scrollbar { width: 0; height: 0; }
      `}</style>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------
   ROLE GATE
----------------------------------------------------------------*/
function RoleGate({ users, onEnter }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");

  const tryLogin = () => {
    const u = users.find((x) => x.username.toLowerCase() === username.trim().toLowerCase());
    if (!u) { setError("No account with that username."); return; }
    if ((u.password || "") !== password) { setError("Incorrect password."); return; }
    setError("");
    onEnter(u);
  };

  return (
    <div style={{ padding: "60px 26px", display: "flex", flexDirection: "column", alignItems: "center", minHeight: "100vh", justifyContent: "center", background: T.ink }}>
      <div style={{ width: 54, height: 54, borderRadius: 14, background: T.accent, display: "grid", placeItems: "center", marginBottom: 18 }}>
        <ShieldAlert size={28} color="#fff" />
      </div>
      <h1 style={{ color: "#fff", fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, margin: "0 0 4px" }}>Advisory Desk</h1>
      <p style={{ color: "#9DB3AB", fontSize: 13.5, margin: "0 0 28px", textAlign: "center" }}>Case tracking for advisory visits, assessments &amp; corrective actions</p>
      <div style={{ width: "100%", background: T.surface, borderRadius: 16, padding: 20 }}>
        <Field label="Username">
          <TextInput value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. dpich"
            onKeyDown={(e) => e.key === "Enter" && tryLogin()} autoCapitalize="none" autoCorrect="off" />
        </Field>
        <Field label="Password">
          <div style={{ position: "relative" }}>
            <TextInput type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password" onKeyDown={(e) => e.key === "Enter" && tryLogin()} style={{ paddingRight: 40 }} />
            <button onClick={() => setShowPw((v) => !v)} type="button" style={{ position: "absolute", right: 8, top: 8, background: "none", border: "none", cursor: "pointer", padding: 4 }}>
              {showPw ? <EyeOff size={17} color={T.muted} /> : <Eye size={17} color={T.muted} />}
            </button>
          </div>
        </Field>
        {error && <div style={{ color: T.red, fontSize: 12.5, marginBottom: 12, fontWeight: 600 }}>{error}</div>}
        <Btn full onClick={tryLogin}>
          <LogIn size={16} /> Sign in
        </Btn>
        <div style={{ fontSize: 11.5, color: T.muted, marginTop: 14, textAlign: "center", lineHeight: 1.5 }}>
          Data is stored in Firebase and shared across everyone using this app.<br />
          Demo accounts: <b>dpich</b>/admin123 · <b>lmeas</b>/manager123 · <b>vros</b>/officer123 · <b>schan</b>/company123
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   DASHBOARD
----------------------------------------------------------------*/
function Dashboard({ ctx, goto }) {
  const { data } = ctx;
  const advisoryInScope = data.advisoryInfo.filter((a) => inScope(ctx, a.companyId));
  const advisoryIds = new Set(advisoryInScope.map((a) => a.id));
  const assessmentInScope = data.assessmentPlans.filter((p) => advisoryIds.has(p.advisoryInfoId));
  const assessmentIds = new Set(assessmentInScope.map((p) => p.id));
  const capsInScope = data.caps.filter((c) => assessmentIds.has(c.assessmentPlanId));
  const visitsInScope = data.visits.filter((v) => advisoryIds.has(v.advisoryInfoId));

  const openCaps = capsInScope.filter((c) => capStatusOf(c) !== "Completed");
  const overdue = capsInScope.filter((c) => capStatusOf(c) === "Overdue");
  const upcoming = [...visitsInScope].filter((v) => v.date >= todayISO()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const upcomingAssess = [...assessmentInScope].filter((a) => a.planAssessmentDate && a.planAssessmentDate >= todayISO())
    .sort((a, b) => a.planAssessmentDate.localeCompare(b.planAssessmentDate)).slice(0, 3);

  const completedCaps = capsInScope.filter((c) => capStatusOf(c) === "Completed").length;
  const rate = capsInScope.length ? Math.round((completedCaps / capsInScope.length) * 100) : 0;

  return (
    <div>
      <Header title="Overview" subtitle={fmtDate(todayISO())} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "14px 18px" }}>
        <StatCard label="Companies" value={ctx.visibleCompanies.length} icon={Building2} onClick={() => goto("companies")} />
        <StatCard label="Open Actions" value={openCaps.length} icon={ShieldAlert} tone={openCaps.length ? "amber" : "green"} onClick={() => goto("caps")} />
        <StatCard label="Overdue" value={overdue.length} icon={AlertTriangle} tone={overdue.length ? "red" : "green"} onClick={() => goto("caps")} />
        <StatCard label="Advisory Cycles" value={advisoryInScope.length} icon={ClipboardList} onClick={() => goto("advisory")} />
      </div>

      <div style={{ margin: "6px 18px 18px", background: T.surface, borderRadius: 16, padding: 18, border: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <RingProgress pct={rate} />
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, color: T.ink }}>{rate}% resolved</div>
            <div style={{ fontSize: 12.5, color: T.muted }}>{completedCaps} of {capsInScope.length} corrective actions closed out</div>
          </div>
        </div>
      </div>

      <SectionLabel>Upcoming visits</SectionLabel>
      <div style={{ padding: "0 18px" }}>
        {upcoming.length === 0 && <EmptyRow text="No upcoming visits scheduled." />}
        {upcoming.map((v) => {
          const adv = data.advisoryInfo.find((a) => a.id === v.advisoryInfoId);
          const co = data.companies.find((c) => c.id === adv?.companyId);
          return (
            <Row key={v.id} onClick={() => goto("visits")} left={<CalendarClock size={17} color={T.accent} />}
              title={`${v.visitNumber} · ${co?.name || "—"}`} sub={`${fmtDate(v.date)} · ${v.startTime}–${v.endTime}`} />
          );
        })}
      </div>

      <SectionLabel>Upcoming assessments</SectionLabel>
      <div style={{ padding: "0 18px" }}>
        {upcomingAssess.length === 0 && <EmptyRow text="No assessments scheduled." />}
        {upcomingAssess.map((a) => {
          const adv = data.advisoryInfo.find((x) => x.id === a.advisoryInfoId);
          const co = data.companies.find((c) => c.id === adv?.companyId);
          return (
            <Row key={a.id} onClick={() => ctx.setDetail({ type: "assessment", id: a.id })} left={<FileText size={17} color={T.blue} />}
              title={co?.name || "—"} sub={`Planned ${fmtDate(a.planAssessmentDate)} · ${a.currentNC} open NCs`} />
          );
        })}
      </div>
    </div>
  );
}

function RingProgress({ pct }) {
  const r = 30, c = 2 * Math.PI * r;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72">
      <circle cx="36" cy="36" r={r} fill="none" stroke={T.border} strokeWidth="7" />
      <circle cx="36" cy="36" r={r} fill="none" stroke={T.accent} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} transform="rotate(-90 36 36)" />
      <text x="36" y="41" textAnchor="middle" fontSize="15" fontWeight="700" fill={T.ink} fontFamily="'Space Grotesk', sans-serif">{pct}%</text>
    </svg>
  );
}

function StatCard({ label, value, icon: Icon, tone, onClick }) {
  const color = tone === "amber" ? T.amber : tone === "red" ? T.red : tone === "green" ? T.green : T.accent;
  return (
    <button onClick={onClick} style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14,
      textAlign: "left", cursor: "pointer", fontFamily: "inherit",
    }}>
      <Icon size={17} color={color} />
      <div style={{ fontSize: 24, fontWeight: 700, color: T.ink, marginTop: 8, fontFamily: "'Space Grotesk', sans-serif" }}>{value}</div>
      <div style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>{label}</div>
    </button>
  );
}

function SectionLabel({ children }) {
  return <div style={{ padding: "6px 18px", fontSize: 12, fontWeight: 800, color: T.muted, letterSpacing: 0.5, textTransform: "uppercase" }}>{children}</div>;
}
function EmptyRow({ text }) {
  return <div style={{ padding: "14px 0", color: T.muted, fontSize: 13.5 }}>{text}</div>;
}
function Row({ left, title, sub, right, onClick }) {
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
      {onClick && <ChevronRight size={17} color={T.muted} />}
    </div>
  );
}
function FAB({ onClick }) {
  return (
    <button onClick={onClick} style={{
      position: "fixed", bottom: 96, right: "calc(50% - 214px)", background: T.accent, color: "#fff",
      border: "none", borderRadius: 999, width: 52, height: 52, display: "grid", placeItems: "center",
      boxShadow: "0 8px 20px rgba(47,122,109,0.4)", cursor: "pointer", zIndex: 30,
    }}>
      <Plus size={24} />
    </button>
  );
}

/* ---------------------------------------------------------------
   COMPANIES
----------------------------------------------------------------*/
// Deleting a company cascades to every module that references it, directly
// (meetingLogs, bipartiteCommittee, users) or via its advisory cycles
// (visits, assessmentPlans, and caps hanging off those assessment plans).
// Shared by both the Companies list form and the Company detail's edit form,
// since either can be the last screen a user deletes from.
function deleteCompanyCascade(ctx, id) {
  const { data, update } = ctx;
  const company = data.companies.find((c) => c.id === id);
  const cycleIds = data.advisoryInfo.filter((a) => a.companyId === id).map((a) => a.id);
  const apIds = data.assessmentPlans.filter((p) => cycleIds.includes(p.advisoryInfoId)).map((p) => p.id);
  const counts = {
    cycles: cycleIds.length,
    visits: data.visits.filter((v) => cycleIds.includes(v.advisoryInfoId)).length,
    plans: apIds.length,
    caps: data.caps.filter((c) => apIds.includes(c.assessmentPlanId)).length,
    meetings: data.meetingLogs.filter((m) => m.companyId === id).length,
    committee: data.bipartiteCommittee.filter((b) => b.companyId === id).length,
    users: data.users.filter((u) => u.companyId === id).length,
  };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const detail = total === 0 ? "" : ` This also permanently deletes ${total} related record(s): `
    + [
      counts.cycles && `${counts.cycles} advisory cycle(s)`,
      counts.visits && `${counts.visits} visit(s)`,
      counts.plans && `${counts.plans} assessment plan(s)`,
      counts.caps && `${counts.caps} corrective action(s)`,
      counts.meetings && `${counts.meetings} meeting log(s)`,
      counts.committee && `${counts.committee} bipartite committee member(s)`,
      counts.users && `${counts.users} company user account(s)`,
    ].filter(Boolean).join(", ") + ".";
  if (!window.confirm(`Delete ${company?.name || "this company"}?${detail} This cannot be undone.`)) return false;

  update("caps", (prev) => prev.filter((c) => !apIds.includes(c.assessmentPlanId)));
  update("assessmentPlans", (prev) => prev.filter((p) => !cycleIds.includes(p.advisoryInfoId)));
  update("visits", (prev) => prev.filter((v) => !cycleIds.includes(v.advisoryInfoId)));
  update("advisoryInfo", (prev) => prev.filter((a) => a.companyId !== id));
  update("meetingLogs", (prev) => prev.filter((m) => m.companyId !== id));
  update("bipartiteCommittee", (prev) => prev.filter((b) => b.companyId !== id));
  update("users", (prev) => prev.filter((u) => u.companyId !== id));
  update("companies", (prev) => prev.filter((c) => c.id !== id));
  return true;
}

function CompaniesView({ ctx }) {
  const { data, update } = ctx;
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null);

  const list = ctx.visibleCompanies.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));

  const save = (c) => {
    update("companies", (prev) => c.id && prev.some((p) => p.id === c.id)
      ? prev.map((p) => (p.id === c.id ? c : p))
      : [...prev, { ...c, id: uid("co") }]);
    setForm(null);
  };

  return (
    <div>
      <Header title="Companies" subtitle={`${list.length} registered`}
        action={hasPerm(ctx, "companies", "edit") ? <Btn small onClick={() => setForm({})}><Plus size={15} />New</Btn> : null} />
      <SearchBar value={q} onChange={setQ} placeholder="Search companies…" />
      <div style={{ padding: "6px 18px" }}>
        {list.length === 0 && <EmptyState icon={Building2} title="No companies yet" hint="Add a company to start an advisory cycle." />}
        {list.map((c) => {
          const cycles = data.advisoryInfo.filter((a) => a.companyId === c.id).length;
          return (
            <Row key={c.id} onClick={() => ctx.setDetail({ type: "company", id: c.id })}
              left={<Building2 size={17} color={T.accent} />} title={c.name}
              sub={`${c.type} · ${cycles} cycle${cycles === 1 ? "" : "s"}`} />
          );
        })}
      </div>
      {form && <CompanyForm initial={form} onClose={() => setForm(null)} onSave={save} onDelete={form.id && hasPerm(ctx, "companies", "delete") ? () => { if (deleteCompanyCascade(ctx, form.id)) setForm(null); } : null} />}
    </div>
  );
}

function CompanyForm({ initial, onClose, onSave, onDelete }) {
  const [c, setC] = useState({ name: "", type: COMPANY_TYPES[0], address: "", contacts: [], ...initial });
  const setContact = (i, patch) => setC((p) => ({ ...p, contacts: p.contacts.map((ct, idx) => (idx === i ? { ...ct, ...patch } : ct)) }));
  const addContact = () => setC((p) => ({ ...p, contacts: [...p.contacts, { id: uid("ct"), name: "", position: "", phone: "", email: "" }] }));
  const removeContact = (i) => setC((p) => ({ ...p, contacts: p.contacts.filter((_, idx) => idx !== i) }));

  return (
    <Sheet title={initial.id ? "Edit company" : "New company"} onClose={onClose}>
      <Field label="Company name"><TextInput value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="e.g. Meridian Apparel Co., Ltd." /></Field>
      <Field label="Type of business">
        <Select value={c.type} onChange={(e) => setC({ ...c, type: e.target.value })}>
          {COMPANY_TYPES.map((t) => <option key={t}>{t}</option>)}
        </Select>
      </Field>
      <Field label="Address"><TextArea value={c.address} onChange={(e) => setC({ ...c, address: e.target.value })} placeholder="Street, city, province" /></Field>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "18px 0 8px" }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink2 }}>Contact persons</span>
        <Btn variant="ghost" small onClick={addContact}><Plus size={13} /> Add</Btn>
      </div>
      {c.contacts.length === 0 && <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 10 }}>No contacts added.</div>}
      {c.contacts.map((ct, i) => (
        <div key={ct.id} style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: 12, marginBottom: 10, background: T.bg }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <TextInput placeholder="Full name" value={ct.name} onChange={(e) => setContact(i, { name: e.target.value })} />
            <TextInput placeholder="Position" value={ct.position} onChange={(e) => setContact(i, { position: e.target.value })} />
            <TextInput placeholder="Phone" value={ct.phone} onChange={(e) => setContact(i, { phone: e.target.value })} />
            <TextInput placeholder="Email" value={ct.email} onChange={(e) => setContact(i, { email: e.target.value })} />
          </div>
          <button onClick={() => removeContact(i)} style={{ marginTop: 8, background: "none", border: "none", color: T.red, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>
            <Trash2 size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Remove contact
          </button>
        </div>
      ))}

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {onDelete && <Btn variant="danger" onClick={onDelete}><Trash2 size={15} /> Delete</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => c.name.trim() && onSave(c)}>Save</Btn>
      </div>
    </Sheet>
  );
}

function CompanyDetail({ id, ctx, onBack }) {
  const { data } = ctx;
  const c = data.companies.find((x) => x.id === id);
  const [form, setForm] = useState(null);
  if (!c) return <div style={{ padding: 18 }}><Btn variant="ghost" onClick={onBack}><ArrowLeft size={15} />Back</Btn></div>;
  const cycles = data.advisoryInfo.filter((a) => a.companyId === id);

  return (
    <div>
      <div style={{ padding: "14px 18px 0" }}>
        <Btn variant="ghost" small onClick={onBack}><ArrowLeft size={14} />All companies</Btn>
      </div>
      <Header title={c.name} subtitle={c.type} action={hasPerm(ctx, "companies", "edit") ? <Btn small onClick={() => setForm(c)}><Pencil size={13} />Edit</Btn> : null} />
      <div style={{ padding: "0 18px" }}>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 8, fontSize: 13.5, color: T.ink2, marginBottom: 8 }}>
            <MapPin size={15} color={T.muted} style={{ flexShrink: 0, marginTop: 1 }} /> {c.address || "No address on file"}
          </div>
          {c.contacts.map((ct) => (
            <div key={ct.id} style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8, marginTop: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{ct.name} <span style={{ fontWeight: 500, color: T.muted }}>· {ct.position}</span></div>
              <div style={{ display: "flex", gap: 14, marginTop: 3 }}>
                {ct.phone && <span style={{ fontSize: 12.5, color: T.ink2, display: "flex", alignItems: "center", gap: 4 }}><Phone size={12} />{ct.phone}</span>}
                {ct.email && <span style={{ fontSize: 12.5, color: T.ink2, display: "flex", alignItems: "center", gap: 4 }}><Mail size={12} />{ct.email}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
      <SectionLabel>Advisory cycles</SectionLabel>
      <div style={{ padding: "0 18px" }}>
        {cycles.length === 0 && <EmptyRow text="No advisory cycles yet." />}
        {cycles.map((a) => (
          <Row key={a.id} onClick={() => ctx.setDetail({ type: "advisory", id: a.id })} left={<ClipboardList size={16} color={T.accent} />}
            title={a.cycleNumber} sub={`${fmtDate(a.startDate)} → ${fmtDate(a.endDate)}`} />
        ))}
      </div>
      {form && <CompanyForm initial={form} onClose={() => setForm(null)}
        onSave={(v) => { ctx.update("companies", (prev) => prev.map((p) => (p.id === v.id ? v : p))); setForm(null); }}
        onDelete={hasPerm(ctx, "companies", "delete") ? () => { if (deleteCompanyCascade(ctx, id)) { setForm(null); onBack(); } } : null} />}
    </div>
  );
}

/* ---------------------------------------------------------------
   ADVISORY INFO (cycles)
----------------------------------------------------------------*/
function AdvisoryView({ ctx }) {
  const { data } = ctx;
  const [form, setForm] = useState(null);
  const cycles = data.advisoryInfo.filter((a) => inScope(ctx, a.companyId));
  return (
    <div>
      <Header title="Advisory Cycles" subtitle={`${cycles.length} cycles tracked`}
        action={hasPerm(ctx, "advisory", "edit") ? <Btn small onClick={() => setForm({})}><Plus size={15} />New</Btn> : null} />
      <div style={{ padding: "10px 18px" }}>
        {cycles.length === 0 && <EmptyState icon={ClipboardList} title="No advisory cycles" hint="Create a cycle under a company." />}
        {cycles.map((a) => {
          const co = data.companies.find((c) => c.id === a.companyId);
          return (
            <Row key={a.id} onClick={() => ctx.setDetail({ type: "advisory", id: a.id })} left={<ClipboardList size={16} color={T.accent} />}
              title={`${a.cycleNumber} · ${co?.name || "Unassigned"}`} sub={`${fmtDate(a.startDate)} → ${fmtDate(a.endDate)}`} />
          );
        })}
      </div>
      {form && <AdvisoryForm initial={form} ctx={ctx} onClose={() => setForm(null)} />}
    </div>
  );
}

function AdvisoryForm({ initial, ctx, onClose }) {
  const { data, update } = ctx;
  const [a, setA] = useState({ companyId: ctx.visibleCompanies[0]?.id || "", cycleNumber: "", startDate: "", endDate: "", remark: "", ...initial });
  const save = () => {
    if (!a.companyId || !a.cycleNumber) return;
    update("advisoryInfo", (prev) => a.id && prev.some((p) => p.id === a.id) ? prev.map((p) => (p.id === a.id ? a : p)) : [...prev, { ...a, id: uid("adv") }]);
    onClose();
  };
  const remove = () => {
    update("advisoryInfo", (prev) => prev.filter((p) => p.id !== a.id));
    update("visits", (prev) => prev.filter((v) => v.advisoryInfoId !== a.id));
    update("assessmentPlans", (prev) => prev.filter((v) => v.advisoryInfoId !== a.id));
    onClose();
  };
  return (
    <Sheet title={initial.id ? "Edit advisory cycle" : "New advisory cycle"} onClose={onClose}>
      <Field label="Company">
        <Select value={a.companyId} onChange={(e) => setA({ ...a, companyId: e.target.value })}>
          {ctx.visibleCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Cycle number"><TextInput value={a.cycleNumber} onChange={(e) => setA({ ...a, cycleNumber: e.target.value })} placeholder="e.g. CY-2026-02" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Start date"><TextInput type="date" value={a.startDate} onChange={(e) => setA({ ...a, startDate: e.target.value })} /></Field>
        <Field label="End date"><TextInput type="date" value={a.endDate} onChange={(e) => setA({ ...a, endDate: e.target.value })} /></Field>
      </div>
      <Field label="Remark"><TextArea value={a.remark} onChange={(e) => setA({ ...a, remark: e.target.value })} placeholder="Notes about this advisory cycle" /></Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {initial.id && hasPerm(ctx, "advisory", "delete") && <Btn variant="danger" onClick={remove}><Trash2 size={15} /> Delete</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save}>Save</Btn>
      </div>
    </Sheet>
  );
}

function AdvisoryDetail({ id, ctx, onBack }) {
  const { data } = ctx;
  const a = data.advisoryInfo.find((x) => x.id === id);
  const [form, setForm] = useState(null);
  if (!a) return null;
  const co = data.companies.find((c) => c.id === a.companyId);
  const visits = data.visits.filter((v) => v.advisoryInfoId === id);
  const plans = data.assessmentPlans.filter((p) => p.advisoryInfoId === id);
  return (
    <div>
      <div style={{ padding: "14px 18px 0" }}><Btn variant="ghost" small onClick={onBack}><ArrowLeft size={14} />All cycles</Btn></div>
      <Header title={a.cycleNumber} subtitle={co?.name} action={hasPerm(ctx, "advisory", "edit") ? <Btn small onClick={() => setForm(a)}><Pencil size={13} />Edit</Btn> : null} />
      <div style={{ padding: "0 18px" }}>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, marginBottom: 4 }}>
          <div style={{ fontSize: 13.5, color: T.ink2 }}>{fmtDate(a.startDate)} → {fmtDate(a.endDate)}</div>
          {a.remark && <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>{a.remark}</div>}
        </div>
      </div>
      <SectionLabel>Visits</SectionLabel>
      <div style={{ padding: "0 18px" }}>
        {visits.length === 0 && <EmptyRow text="No visits logged yet." />}
        {visits.map((v) => (
          <Row key={v.id} left={<CalendarClock size={16} color={T.accent} />} title={v.visitNumber} sub={`${fmtDate(v.date)} · ${v.startTime}–${v.endTime}`} />
        ))}
      </div>
      <SectionLabel>Assessment plans</SectionLabel>
      <div style={{ padding: "0 18px" }}>
        {plans.length === 0 && <EmptyRow text="No assessment plan yet." />}
        {plans.map((p) => (
          <Row key={p.id} onClick={() => ctx.setDetail({ type: "assessment", id: p.id })} left={<FileText size={16} color={T.blue} />}
            title={`Planned ${fmtDate(p.planAssessmentDate)}`} sub={`${p.currentNC} open non-compliance`} />
        ))}
      </div>
      {form && <AdvisoryForm initial={form} ctx={ctx} onClose={() => setForm(null)} />}
    </div>
  );
}

/* ---------------------------------------------------------------
   VISITS
----------------------------------------------------------------*/
function VisitsView({ ctx }) {
  const { data } = ctx;
  const [form, setForm] = useState(null);
  const canEdit = hasPerm(ctx, "visits", "edit");
  const sorted = [...data.visits]
    .filter((v) => {
      const adv = data.advisoryInfo.find((a) => a.id === v.advisoryInfoId);
      return inScope(ctx, adv?.companyId);
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div>
      <Header title="Advisory Visits" subtitle={`${sorted.length} visits logged`}
        action={canEdit ? <Btn small onClick={() => setForm({})}><Plus size={15} />Log visit</Btn> : null} />
      <div style={{ padding: "10px 18px" }}>
        {sorted.length === 0 && <EmptyState icon={CalendarClock} title="No visits logged" hint="Record your first advisory visit." />}
        {sorted.map((v) => {
          const adv = data.advisoryInfo.find((a) => a.id === v.advisoryInfoId);
          const co = data.companies.find((c) => c.id === adv?.companyId);
          return (
            <div key={v.id} onClick={canEdit ? () => setForm(v) : undefined} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 8, cursor: canEdit ? "pointer" : "default" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 14.5, color: T.ink }}>{v.visitNumber}</span>
                <Pill tone={v.date >= todayISO() ? "blue" : "muted"}>{v.date >= todayISO() ? "Upcoming" : "Completed"}</Pill>
              </div>
              <div style={{ fontSize: 13, color: T.ink2, marginTop: 4 }}>{co?.name || "Unassigned company"}</div>
              <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                <Clock size={12} /> {fmtDate(v.date)} · {v.startTime}–{v.endTime}
                {v.attachmentCount > 0 && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, marginLeft: 6, color: T.accentDark, fontWeight: 700 }}>
                    <Paperclip size={12} /> {v.attachmentCount}
                  </span>
                )}
              </div>
              {v.log && <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 6, background: T.bg, padding: 8, borderRadius: 8 }}>{v.log}</div>}
            </div>
          );
        })}
      </div>
      {form && <VisitForm initial={form} ctx={ctx} onClose={() => setForm(null)} />}
    </div>
  );
}

function VisitForm({ initial, ctx, onClose }) {
  const { data, update } = ctx;
  const scopedAdvisory = data.advisoryInfo.filter((a) => inScope(ctx, a.companyId));
  const [v, setV] = useState({ advisoryInfoId: scopedAdvisory[0]?.id || "", visitNumber: "", date: todayISO(), startTime: "09:00", endTime: "11:00", log: "", ...initial });
  const [attachments, setAttachments] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [attError, setAttError] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!initial.id) return;
    (async () => {
      try {
        const res = await window.storage.get(`attachments:${initial.id}`, true);
        setAttachments(res ? JSON.parse(res.value) : []);
      } catch {
        setAttachments([]);
      }
    })();
  }, [initial.id]);

  const onPickFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setLoadingFiles(true);
    setAttError("");
    try {
      const next = [...attachments];
      for (const f of files) {
        if (!f.type.startsWith("image/")) { setAttError("Only image files are supported."); continue; }
        const dataUrl = await compressImageFile(f);
        next.push({ id: uid("att"), name: f.name, dataUrl });
      }
      if (next.length > 8) { setAttError("Limit is 8 photos per visit — keeping the first 8."); }
      setAttachments(next.slice(0, 8));
    } catch {
      setAttError("Couldn't process one of the images.");
    } finally {
      setLoadingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (id) => setAttachments((prev) => prev.filter((a) => a.id !== id));

  const save = async () => {
    if (!v.advisoryInfoId || !v.visitNumber) return;
    const visitId = v.id || uid("v");
    const record = { ...v, id: visitId, attachmentCount: attachments.length };
    update("visits", (prev) => prev.some((p) => p.id === visitId) ? prev.map((p) => (p.id === visitId ? record : p)) : [...prev, record]);
    try {
      if (attachments.length > 0) {
        await window.storage.set(`attachments:${visitId}`, JSON.stringify(attachments), true);
      } else {
        await window.storage.delete(`attachments:${visitId}`, true).catch(() => {});
      }
    } catch {
      setAttError("Visit saved, but photos failed to upload — try again.");
      return;
    }
    onClose();
  };

  const remove = async () => {
    update("visits", (prev) => prev.filter((p) => p.id !== v.id));
    try { await window.storage.delete(`attachments:${v.id}`, true); } catch {}
    onClose();
  };

  return (
    <Sheet title={initial.id ? "Edit visit" : "Log advisory visit"} onClose={onClose}>
      <Field label="Advisory cycle">
        <Select value={v.advisoryInfoId} onChange={(e) => setV({ ...v, advisoryInfoId: e.target.value })}>
          {data.advisoryInfo.filter((a) => inScope(ctx, a.companyId)).map((a) => {
            const co = data.companies.find((c) => c.id === a.companyId);
            return <option key={a.id} value={a.id}>{a.cycleNumber} · {co?.name}</option>;
          })}
        </Select>
      </Field>
      <Field label="Visit number"><TextInput value={v.visitNumber} onChange={(e) => setV({ ...v, visitNumber: e.target.value })} placeholder="e.g. V-03" /></Field>
      <Field label="Visit date"><TextInput type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Start time"><TextInput type="time" value={v.startTime} onChange={(e) => setV({ ...v, startTime: e.target.value })} /></Field>
        <Field label="End time"><TextInput type="time" value={v.endTime} onChange={(e) => setV({ ...v, endTime: e.target.value })} /></Field>
      </div>
      <Field label="Visit log"><TextArea rows={4} value={v.log} onChange={(e) => setV({ ...v, log: e.target.value })} placeholder="What happened during this visit…" /></Field>

      <Field label={`Photos (${attachments.length}/8)`}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {attachments.map((a) => (
            <div key={a.id} style={{ position: "relative", width: 72, height: 72 }}>
              <img src={a.dataUrl} alt={a.name} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10, border: `1px solid ${T.border}` }} />
              <button onClick={() => removeAttachment(a.id)} type="button" style={{
                position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 999,
                background: T.red, border: "2px solid #fff", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer",
              }}>
                <X size={11} />
              </button>
            </div>
          ))}
          {attachments.length < 8 && (
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={loadingFiles} style={{
              width: 72, height: 72, borderRadius: 10, border: `1.5px dashed ${T.border}`, background: T.bg,
              display: "grid", placeItems: "center", cursor: "pointer", color: T.muted,
            }}>
              {loadingFiles ? <span style={{ fontSize: 10 }}>Processing…</span> : <ImageIcon size={20} />}
            </button>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple capture="environment" onChange={onPickFiles} style={{ display: "none" }} />
        {attError && <div style={{ fontSize: 12, color: T.red }}>{attError}</div>}
        <div style={{ fontSize: 11.5, color: T.muted }}>Photos are resized and compressed automatically before saving.</div>
      </Field>

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {initial.id && hasPerm(ctx, "visits", "delete") && <Btn variant="danger" onClick={remove}><Trash2 size={15} /> Delete</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={loadingFiles}>Save</Btn>
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------
   ASSESSMENT PLANS
----------------------------------------------------------------*/
function AssessmentView({ ctx }) {
  const { data } = ctx;
  const [form, setForm] = useState(null);
  const plans = data.assessmentPlans.filter((p) => {
    const adv = data.advisoryInfo.find((a) => a.id === p.advisoryInfoId);
    return inScope(ctx, adv?.companyId);
  });
  return (
    <div>
      <Header title="Assessment Plans" subtitle={`${plans.length} plans`}
        action={hasPerm(ctx, "assessment", "edit") ? <Btn small onClick={() => setForm({})}><Plus size={15} />New</Btn> : null} />
      <div style={{ padding: "10px 18px" }}>
        {plans.length === 0 && <EmptyState icon={FileText} title="No assessment plans" hint="Plan a new assessment for a cycle." />}
        {plans.map((p) => {
          const adv = data.advisoryInfo.find((a) => a.id === p.advisoryInfoId);
          const co = data.companies.find((c) => c.id === adv?.companyId);
          return (
            <Row key={p.id} onClick={() => ctx.setDetail({ type: "assessment", id: p.id })} left={<FileText size={16} color={T.blue} />}
              title={co?.name || "Unassigned"} sub={`Planned ${fmtDate(p.planAssessmentDate)} · ${p.currentNC} open NCs`}
              right={p.currentNC > 0 ? <Pill tone="amber">{p.currentNC} NC</Pill> : <Pill tone="green">Clear</Pill>} />
          );
        })}
      </div>
      {form && <AssessmentForm initial={form} ctx={ctx} onClose={() => setForm(null)} />}
    </div>
  );
}

function AssessmentForm({ initial, ctx, onClose }) {
  const { data, update } = ctx;
  const scopedAdvisory = data.advisoryInfo.filter((a) => inScope(ctx, a.companyId));
  const [p, setP] = useState({ advisoryInfoId: scopedAdvisory[0]?.id || "", previousAssessmentDate: "", planAssessmentDate: "", reportReleasedDate: "", currentNC: 0, ...initial });
  const save = () => {
    if (!p.advisoryInfoId) return;
    update("assessmentPlans", (prev) => p.id && prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, { ...p, id: uid("ap") }]);
    onClose();
  };
  const remove = () => {
    update("assessmentPlans", (prev) => prev.filter((x) => x.id !== p.id));
    update("caps", (prev) => prev.filter((c) => c.assessmentPlanId !== p.id));
    onClose();
  };
  return (
    <Sheet title={initial.id ? "Edit assessment plan" : "New assessment plan"} onClose={onClose}>
      <Field label="Advisory cycle">
        <Select value={p.advisoryInfoId} onChange={(e) => setP({ ...p, advisoryInfoId: e.target.value })}>
          {data.advisoryInfo.filter((a) => inScope(ctx, a.companyId)).map((a) => {
            const co = data.companies.find((c) => c.id === a.companyId);
            return <option key={a.id} value={a.id}>{a.cycleNumber} · {co?.name}</option>;
          })}
        </Select>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Previous assessment"><TextInput type="date" value={p.previousAssessmentDate} onChange={(e) => setP({ ...p, previousAssessmentDate: e.target.value })} /></Field>
        <Field label="Planned assessment"><TextInput type="date" value={p.planAssessmentDate} onChange={(e) => setP({ ...p, planAssessmentDate: e.target.value })} /></Field>
      </div>
      <Field label="Report released date"><TextInput type="date" value={p.reportReleasedDate} onChange={(e) => setP({ ...p, reportReleasedDate: e.target.value })} /></Field>
      <Field label="Current non-compliance count">
        <TextInput type="number" min="0" value={p.currentNC} onChange={(e) => setP({ ...p, currentNC: Number(e.target.value) })} />
      </Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {initial.id && hasPerm(ctx, "assessment", "delete") && <Btn variant="danger" onClick={remove}><Trash2 size={15} /> Delete</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save}>Save</Btn>
      </div>
    </Sheet>
  );
}

function AssessmentDetail({ id, ctx, onBack }) {
  const { data } = ctx;
  const p = data.assessmentPlans.find((x) => x.id === id);
  const [form, setForm] = useState(null);
  if (!p) return null;
  const adv = data.advisoryInfo.find((a) => a.id === p.advisoryInfoId);
  const co = data.companies.find((c) => c.id === adv?.companyId);
  const caps = data.caps.filter((c) => c.assessmentPlanId === id);
  return (
    <div>
      <div style={{ padding: "14px 18px 0" }}><Btn variant="ghost" small onClick={onBack}><ArrowLeft size={14} />All plans</Btn></div>
      <Header title={co?.name || "Assessment"} subtitle={adv?.cycleNumber} action={hasPerm(ctx, "assessment", "edit") ? <Btn small onClick={() => setForm(p)}><Pencil size={13} />Edit</Btn> : null} />
      <div style={{ padding: "0 18px" }}>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
          <div><div style={{ color: T.muted, fontSize: 11.5, fontWeight: 700 }}>PREVIOUS</div>{fmtDate(p.previousAssessmentDate)}</div>
          <div><div style={{ color: T.muted, fontSize: 11.5, fontWeight: 700 }}>PLANNED</div>{fmtDate(p.planAssessmentDate)}</div>
          <div><div style={{ color: T.muted, fontSize: 11.5, fontWeight: 700 }}>REPORT RELEASED</div>{fmtDate(p.reportReleasedDate)}</div>
          <div><div style={{ color: T.muted, fontSize: 11.5, fontWeight: 700 }}>OPEN NCs</div>{p.currentNC}</div>
        </div>
      </div>
      <SectionLabel>Corrective action plans</SectionLabel>
      <div style={{ padding: "0 18px" }}>
        {caps.length === 0 && <EmptyRow text="No corrective actions linked." />}
        {caps.map((c) => {
          const st = capStatusOf(c);
          return <Row key={c.id} left={<ShieldAlert size={16} color={T.amber} />} title={`${c.ncNumber} · ${c.area}`} sub={`Target ${fmtDate(c.targetDate)}`} right={<Pill tone={capTone(st)}>{st}</Pill>} />;
        })}
      </div>
      {form && <AssessmentForm initial={form} ctx={ctx} onClose={() => setForm(null)} />}
    </div>
  );
}

/* ---------------------------------------------------------------
   CORRECTIVE ACTION PLANS
----------------------------------------------------------------*/
function CapsView({ ctx }) {
  const { data } = ctx;
  const [filter, setFilter] = useState("All");
  const [form, setForm] = useState(null);

  const enriched = data.caps.map((c) => {
    const ap = data.assessmentPlans.find((a) => a.id === c.assessmentPlanId);
    const adv = data.advisoryInfo.find((a) => a.id === ap?.advisoryInfoId);
    const co = data.companies.find((x) => x.id === adv?.companyId);
    return { ...c, companyId: co?.id || "", companyName: co?.name || "Unassigned", status: capStatusOf(c) };
  }).filter((c) => inScope(ctx, c.companyId));
  const filtered = filter === "All" ? enriched : enriched.filter((c) => c.status === filter);
  const canEdit = hasPerm(ctx, "caps", "edit");

  return (
    <div>
      <Header title="Corrective Actions" subtitle={`${enriched.length} tracked`} action={canEdit ? <Btn small onClick={() => setForm({})}><Plus size={15} />New</Btn> : null} />
      <div style={{ display: "flex", gap: 6, padding: "10px 18px", overflowX: "auto" }}>
        {["All", "Open", "In Progress", "Overdue", "Completed"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "7px 12px", borderRadius: 999, border: `1px solid ${filter === f ? T.accent : T.border}`,
            background: filter === f ? T.accent : T.surface, color: filter === f ? "#fff" : T.ink2,
            fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", cursor: "pointer", fontFamily: "inherit",
          }}>{f}</button>
        ))}
      </div>
      <div style={{ padding: "0 18px" }}>
        {filtered.length === 0 && <EmptyState icon={ShieldAlert} title="No matching actions" hint="Try a different filter or add a new action." />}
        {filtered.map((c) => (
          <div key={c.id} onClick={canEdit ? () => setForm(c) : undefined} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 8, cursor: canEdit ? "pointer" : "default" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, color: T.ink }}>{c.ncNumber}</span>
                <span style={{ fontSize: 12.5, color: T.muted, marginLeft: 6 }}>{c.area}</span>
              </div>
              <Pill tone={capTone(c.status)}>{c.status}</Pill>
            </div>
            <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 4 }}>{c.companyName}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
              <div style={{ flex: 1, height: 6, background: T.bg, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${c.progress || 0}%`, height: "100%", background: T.accent }} />
              </div>
              <span style={{ fontSize: 11.5, color: T.muted, fontWeight: 700 }}>{c.progress || 0}%</span>
            </div>
            {c.progressComments && <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 8, background: T.bg, padding: 8, borderRadius: 8 }}>{c.progressComments}</div>}
            <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>Lead: {c.leadPerson || "—"} · Target {fmtDate(c.targetDate)}</div>
          </div>
        ))}
      </div>
      {form && <CapForm initial={form} ctx={ctx} onClose={() => setForm(null)} />}
    </div>
  );
}

function CapForm({ initial, ctx, onClose }) {
  const { data, update } = ctx;
  const scopedPlans = data.assessmentPlans.filter((p) => {
    const adv = data.advisoryInfo.find((a) => a.id === p.advisoryInfoId);
    return inScope(ctx, adv?.companyId);
  });
  const [c, setC] = useState({
    assessmentPlanId: scopedPlans[0]?.id || "", ncNumber: "", area: "", rootCause: "",
    correctiveActions: "", leadPerson: "", supportPerson: "", targetDate: "", actualDate: "",
    status: "Open", progress: 0, progressComments: "", recommendations: "", ...initial,
  });
  const save = () => {
    if (!c.assessmentPlanId || !c.ncNumber) return;
    const record = { ...c };
    delete record.companyName;
    delete record.companyId;
    update("caps", (prev) => record.id && prev.some((p) => p.id === record.id) ? prev.map((p) => (p.id === record.id ? record : p)) : [...prev, { ...record, id: uid("cap") }]);
    onClose();
  };
  const remove = () => { update("caps", (prev) => prev.filter((p) => p.id !== c.id)); onClose(); };

  return (
    <Sheet title={initial.id ? "Edit corrective action" : "New corrective action"} onClose={onClose}>
      <Field label="Assessment plan">
        <Select value={c.assessmentPlanId} onChange={(e) => setC({ ...c, assessmentPlanId: e.target.value })}>
          {scopedPlans.map((p) => {
            const adv = data.advisoryInfo.find((a) => a.id === p.advisoryInfoId);
            const co = data.companies.find((x) => x.id === adv?.companyId);
            return <option key={p.id} value={p.id}>{co?.name} · planned {fmtDate(p.planAssessmentDate)}</option>;
          })}
        </Select>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="NC number"><TextInput value={c.ncNumber} onChange={(e) => setC({ ...c, ncNumber: e.target.value })} placeholder="NC-01" /></Field>
        <Field label="Area of improvement"><TextInput value={c.area} onChange={(e) => setC({ ...c, area: e.target.value })} placeholder="e.g. Fire Safety" /></Field>
      </div>
      <Field label="Root cause">
        {data.capRecommendations.length > 0 && (
          <Select value="" onChange={(e) => {
            const rec = data.capRecommendations.find((r) => r.rootCause === e.target.value);
            if (rec) setC((prev) => ({ ...prev, rootCause: rec.rootCause, area: prev.area || rec.area }));
          }} style={{ marginBottom: 8 }}>
            <option value="">Insert from CAP recommendations…</option>
            {data.capRecommendations.map((r) => (
              <option key={r.id} value={r.rootCause}>{r.ncNo} · {r.area} ({r.cluster})</option>
            ))}
          </Select>
        )}
        <TextArea value={c.rootCause} onChange={(e) => setC({ ...c, rootCause: e.target.value })} placeholder="Pick from the list above, or type your own…" />
      </Field>
      <Field label="Corrective actions">
        {data.capRecommendations.length > 0 && (
          <Select value="" onChange={(e) => {
            const rec = data.capRecommendations.find((r) => r.proposedCA === e.target.value);
            if (rec) setC((prev) => ({ ...prev, correctiveActions: rec.proposedCA, area: prev.area || rec.area }));
          }} style={{ marginBottom: 8 }}>
            <option value="">Insert from CAP recommendations…</option>
            {data.capRecommendations.map((r) => (
              <option key={r.id} value={r.proposedCA}>{r.ncNo} · {r.area} ({r.cluster})</option>
            ))}
          </Select>
        )}
        <TextArea value={c.correctiveActions} onChange={(e) => setC({ ...c, correctiveActions: e.target.value })} placeholder="Pick from the list above, or type your own…" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Lead person"><TextInput value={c.leadPerson} onChange={(e) => setC({ ...c, leadPerson: e.target.value })} /></Field>
        <Field label="Support person"><TextInput value={c.supportPerson} onChange={(e) => setC({ ...c, supportPerson: e.target.value })} /></Field>
        <Field label="Target completion"><TextInput type="date" value={c.targetDate} onChange={(e) => setC({ ...c, targetDate: e.target.value })} /></Field>
        <Field label="Actual completion"><TextInput type="date" value={c.actualDate} onChange={(e) => setC({ ...c, actualDate: e.target.value })} /></Field>
      </div>
      <Field label="Status">
        <Select value={c.status} onChange={(e) => setC({ ...c, status: e.target.value })}>
          {CAP_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </Select>
      </Field>
      <Field label={`Progress — ${c.progress}%`}>
        <input type="range" min="0" max="100" value={c.progress} onChange={(e) => setC({ ...c, progress: Number(e.target.value) })} style={{ width: "100%", accentColor: T.accent }} />
      </Field>
      <Field label="Progress comments"><TextArea value={c.progressComments} onChange={(e) => setC({ ...c, progressComments: e.target.value })} placeholder="Notes on current progress, blockers, next steps…" /></Field>
      <Field label="Recommendations"><TextArea value={c.recommendations} onChange={(e) => setC({ ...c, recommendations: e.target.value })} /></Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {initial.id && hasPerm(ctx, "caps", "delete") && <Btn variant="danger" onClick={remove}><Trash2 size={15} /> Delete</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save}>Save</Btn>
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------
   MEETING LOGS
----------------------------------------------------------------*/
function MeetingLogsView({ ctx }) {
  const { data } = ctx;
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null);
  const sorted = [...data.meetingLogs].filter((m) => inScope(ctx, m.companyId)).sort((a, b) => b.date.localeCompare(a.date));
  const filtered = sorted.filter((m) => {
    const co = data.companies.find((c) => c.id === m.companyId);
    const hay = `${co?.name || ""} ${m.log} ${(m.participants || []).join(" ")}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div>
      <Header title="Meeting Logs" subtitle={`${sorted.length} meetings recorded`} action={hasPerm(ctx, "meetings", "edit") ? <Btn small onClick={() => setForm({})}><Plus size={15} />New</Btn> : null} />
      <SearchBar value={q} onChange={setQ} placeholder="Search meetings, participants…" />
      <div style={{ padding: "6px 18px" }}>
        {filtered.length === 0 && <EmptyState icon={MessageSquare} title="No meeting logs" hint="Record your first meeting." />}
        {filtered.map((m) => {
          const co = data.companies.find((c) => c.id === m.companyId);
          const canEdit = hasPerm(ctx, "meetings", "edit");
          return (
            <div key={m.id} onClick={canEdit ? () => setForm(m) : undefined} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 8, cursor: canEdit ? "pointer" : "default" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 14.5, color: T.ink }}>{fmtDate(m.date)}</span>
                {co && <Pill tone="accent">{co.name}</Pill>}
              </div>
              {m.log && <div style={{ fontSize: 13, color: T.ink2, marginTop: 6 }}>{m.log}</div>}
              {(m.participants || []).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                  {m.participants.map((p, i) => <Pill key={i} tone="muted">{p}</Pill>)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {form && <MeetingLogForm initial={form} ctx={ctx} onClose={() => setForm(null)} />}
    </div>
  );
}

function MeetingLogForm({ initial, ctx, onClose }) {
  const { data, update } = ctx;
  const initParticipants = (initial.participants || []).join("\n");
  const [m, setM] = useState({ companyId: ctx.scopeCompanyId && ctx.scopeCompanyId !== "__unassigned__" ? ctx.scopeCompanyId : "", date: todayISO(), log: "", ...initial });
  const [participantsText, setParticipantsText] = useState(initParticipants);

  const save = () => {
    if (!m.date) return;
    const participants = participantsText.split("\n").map((s) => s.trim()).filter(Boolean);
    const record = { ...m, participants };
    update("meetingLogs", (prev) => record.id && prev.some((p) => p.id === record.id) ? prev.map((p) => (p.id === record.id ? record : p)) : [...prev, { ...record, id: uid("ml") }]);
    onClose();
  };
  const remove = () => { update("meetingLogs", (prev) => prev.filter((p) => p.id !== m.id)); onClose(); };

  return (
    <Sheet title={initial.id ? "Edit meeting log" : "New meeting log"} onClose={onClose}>
      <Field label="Related company (optional)">
        <Select value={m.companyId} onChange={(e) => setM({ ...m, companyId: e.target.value })}>
          <option value="">— None —</option>
          {ctx.visibleCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Meeting date"><TextInput type="date" value={m.date} onChange={(e) => setM({ ...m, date: e.target.value })} /></Field>
      <Field label="Meeting log"><TextArea rows={4} value={m.log} onChange={(e) => setM({ ...m, log: e.target.value })} placeholder="Topics discussed, decisions made…" /></Field>
      <Field label="Participants (one name per line)">
        <TextArea rows={4} value={participantsText} onChange={(e) => setParticipantsText(e.target.value)} placeholder={"Sokha Chan\nVichet Ros\n…"} />
      </Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {initial.id && hasPerm(ctx, "meetings", "delete") && <Btn variant="danger" onClick={remove}><Trash2 size={15} /> Delete</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save}>Save</Btn>
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------
   BIPARTITE COMMITTEE
----------------------------------------------------------------*/
const COMMITTEE_ROLES = ["Chairperson", "Vice Chairperson", "Secretary", "Member"];

function BipartiteCommitteeView({ ctx }) {
  const { data } = ctx;
  const [q, setQ] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [form, setForm] = useState(null);

  const filtered = data.bipartiteCommittee.filter((m) => {
    if (!inScope(ctx, m.companyId)) return false;
    if (companyFilter && m.companyId !== companyFilter) return false;
    return m.name.toLowerCase().includes(q.toLowerCase());
  });

  const canEdit = hasPerm(ctx, "committee", "edit");

  return (
    <div>
      <Header title="Bipartite Committee" subtitle={`${filtered.length} members`} action={canEdit ? <Btn small onClick={() => setForm({})}><Plus size={15} />New</Btn> : null} />
      <SearchBar value={q} onChange={setQ} placeholder="Search members…" />
      <div style={{ padding: "0 18px 6px" }}>
        <Select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
          <option value="">All companies</option>
          {ctx.visibleCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      <div style={{ padding: "10px 18px" }}>
        {filtered.length === 0 && <EmptyState icon={Scale} title="No committee members" hint="Add members of the bipartite committee." />}
        {filtered.map((mem) => {
          const co = data.companies.find((c) => c.id === mem.companyId);
          return (
            <div key={mem.id} onClick={canEdit ? () => setForm(mem) : undefined} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 8, cursor: canEdit ? "pointer" : "default" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 14.5, color: T.ink }}>{mem.name}</span>
                  <div style={{ fontSize: 12.5, color: T.muted, marginTop: 1 }}>{co?.name || "Unassigned"} · {mem.companyRole}</div>
                </div>
                <Pill tone={mem.union === "Y" ? "green" : "muted"}>{mem.union === "Y" ? "Union" : "Non-union"}</Pill>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                <Pill tone="accent">{mem.committeeRole}</Pill>
                <Pill tone="muted">{mem.sex}</Pill>
                <Pill tone="muted">Joined {fmtDate(mem.dateJoined)}</Pill>
              </div>
              {mem.phone && <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 8, display: "flex", alignItems: "center", gap: 4 }}><Phone size={12} />{mem.phone}</div>}
            </div>
          );
        })}
      </div>
      {form && <BipartiteForm initial={form} ctx={ctx} onClose={() => setForm(null)} />}
    </div>
  );
}

function BipartiteForm({ initial, ctx, onClose }) {
  const { data, update } = ctx;
  const [m, setM] = useState({
    companyId: ctx.visibleCompanies[0]?.id || "", name: "", sex: "Female", dateJoined: todayISO(),
    committeeRole: COMMITTEE_ROLES[3], companyRole: "", union: "N", phone: "", ...initial,
  });
  const save = () => {
    if (!m.name.trim() || !m.companyId) return;
    update("bipartiteCommittee", (prev) => m.id && prev.some((p) => p.id === m.id) ? prev.map((p) => (p.id === m.id ? m : p)) : [...prev, { ...m, id: uid("bc") }]);
    onClose();
  };
  const remove = () => { update("bipartiteCommittee", (prev) => prev.filter((p) => p.id !== m.id)); onClose(); };

  return (
    <Sheet title={initial.id ? "Edit committee member" : "New committee member"} onClose={onClose}>
      <Field label="Company">
        <Select value={m.companyId} onChange={(e) => setM({ ...m, companyId: e.target.value })}>
          {ctx.visibleCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Participant name"><TextInput value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Sex">
          <Select value={m.sex} onChange={(e) => setM({ ...m, sex: e.target.value })}>
            <option>Female</option><option>Male</option><option>Other</option>
          </Select>
        </Field>
        <Field label="Date joined"><TextInput type="date" value={m.dateJoined} onChange={(e) => setM({ ...m, dateJoined: e.target.value })} /></Field>
      </div>
      <Field label="Committee role">
        <Select value={m.committeeRole} onChange={(e) => setM({ ...m, committeeRole: e.target.value })}>
          {COMMITTEE_ROLES.map((r) => <option key={r}>{r}</option>)}
        </Select>
      </Field>
      <Field label="Company role / job title"><TextInput value={m.companyRole} onChange={(e) => setM({ ...m, companyRole: e.target.value })} placeholder="e.g. Sewing Line Worker" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Union member?">
          <Select value={m.union} onChange={(e) => setM({ ...m, union: e.target.value })}>
            <option value="Y">Yes</option>
            <option value="N">No</option>
          </Select>
        </Field>
        <Field label="Phone contact"><TextInput value={m.phone} onChange={(e) => setM({ ...m, phone: e.target.value })} /></Field>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {initial.id && hasPerm(ctx, "committee", "delete") && <Btn variant="danger" onClick={remove}><Trash2 size={15} /> Delete</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save}>Save</Btn>
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------
   CAP RECOMMENDATION LIBRARY
----------------------------------------------------------------*/
function clusterTone(cluster) {
  const map = {
    "Child Labor": "red", "Forced Labor": "red", "Discrimination and Harassment": "amber",
    "FoA & CBA": "blue", "Employment Contract and HR": "accent", "Working Time": "blue",
    "Wages and Benefits": "green", "OSH": "amber", "Others": "muted",
  };
  return map[cluster] || "muted";
}

function CapRecommendationsView({ ctx }) {
  const { data } = ctx;
  const [q, setQ] = useState("");
  const [clusterFilter, setClusterFilter] = useState("");
  const [form, setForm] = useState(null);

  const filtered = data.capRecommendations.filter((r) => {
    if (clusterFilter && r.cluster !== clusterFilter) return false;
    const hay = `${r.ncNo} ${r.area} ${r.rootCause} ${r.proposedCA}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  const canEdit = hasPerm(ctx, "caprecs", "edit");

  return (
    <div>
      <Header title="CAP Recommendations" subtitle={`${data.capRecommendations.length} reference items`} action={canEdit ? <Btn small onClick={() => setForm({})}><Plus size={15} />New</Btn> : null} />
      <SearchBar value={q} onChange={setQ} placeholder="Search NC no., area, root cause…" />
      <div style={{ padding: "0 18px 6px" }}>
        <Select value={clusterFilter} onChange={(e) => setClusterFilter(e.target.value)}>
          <option value="">All clusters</option>
          {CAP_CLUSTERS.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>
      <div style={{ padding: "10px 18px" }}>
        {filtered.length === 0 && <EmptyState icon={BookOpen} title="No recommendations" hint="Build a library of standard root causes and corrective actions." />}
        {filtered.map((r) => (
          <div key={r.id} onClick={canEdit ? () => setForm(r) : undefined} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 8, cursor: canEdit ? "pointer" : "default" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 14.5, color: T.ink }}>{r.ncNo} · {r.area}</span>
              <Pill tone={clusterTone(r.cluster)}>{r.cluster}</Pill>
            </div>
            <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 8 }}>
              <span style={{ fontWeight: 700, color: T.muted }}>Root cause: </span>{r.rootCause}
            </div>
            <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 6 }}>
              <span style={{ fontWeight: 700, color: T.muted }}>Proposed CA: </span>{r.proposedCA}
            </div>
          </div>
        ))}
      </div>
      {form && <CapRecommendationForm initial={form} onClose={() => setForm(null)} onSave={(v) => {
        ctx.update("capRecommendations", (prev) => v.id && prev.some((p) => p.id === v.id) ? prev.map((p) => (p.id === v.id ? v : p)) : [...prev, { ...v, id: uid("cr") }]);
        setForm(null);
      }} onDelete={form.id && hasPerm(ctx, "caprecs", "delete") ? () => { ctx.update("capRecommendations", (prev) => prev.filter((p) => p.id !== form.id)); setForm(null); } : null} />}
    </div>
  );
}

function CapRecommendationForm({ initial, onClose, onSave, onDelete }) {
  const [r, setR] = useState({ ncNo: "", area: "", cluster: CAP_CLUSTERS[0], rootCause: "", proposedCA: "", ...initial });
  return (
    <Sheet title={initial.id ? "Edit recommendation" : "New CAP recommendation"} onClose={onClose}>
      <Field label="NC No."><TextInput value={r.ncNo} onChange={(e) => setR({ ...r, ncNo: e.target.value })} placeholder="e.g. NC-STD-01" /></Field>
      <Field label="Areas of improvement"><TextInput value={r.area} onChange={(e) => setR({ ...r, area: e.target.value })} placeholder="e.g. Fire Safety" /></Field>
      <Field label="Cluster">
        <Select value={r.cluster} onChange={(e) => setR({ ...r, cluster: e.target.value })}>
          {CAP_CLUSTERS.map((c) => <option key={c}>{c}</option>)}
        </Select>
      </Field>
      <Field label="Possible root cause"><TextArea value={r.rootCause} onChange={(e) => setR({ ...r, rootCause: e.target.value })} /></Field>
      <Field label="Proposed corrective action"><TextArea value={r.proposedCA} onChange={(e) => setR({ ...r, proposedCA: e.target.value })} /></Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {onDelete && <Btn variant="danger" onClick={onDelete}><Trash2 size={15} /> Delete</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => r.ncNo.trim() && r.area.trim() && onSave(r)}>Save</Btn>
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------
   USERS
----------------------------------------------------------------*/
function UsersView({ ctx }) {
  const { data, update, role } = ctx;
  const [tab, setTab] = useState("accounts");
  const [form, setForm] = useState(null);
  const isAdmin = role.role === "admin";

  const save = (u) => {
    update("users", (prev) => {
      if (u.id && prev.some((p) => p.id === u.id)) {
        return prev.map((p) => (p.id === u.id ? { ...u, password: u.password ? u.password : p.password } : p));
      }
      return [...prev, { ...u, id: uid("u"), password: u.password || "changeme" }];
    });
    setForm(null);
  };
  const remove = (id) => { update("users", (prev) => prev.filter((p) => p.id !== id)); setForm(null); };

  return (
    <div>
      <Header title="User Accounts" subtitle={tab === "accounts" ? `${data.users.length} accounts` : "Who can view, edit, or delete each module"}
        action={tab === "accounts" && isAdmin ? <Btn small onClick={() => setForm({})}><Plus size={15} />New</Btn> : null} />
      {isAdmin && (
        <div style={{ display: "flex", gap: 6, padding: "10px 18px" }}>
          {[{ k: "accounts", l: "Accounts" }, { k: "permissions", l: "Permission Matrix" }].map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)} style={{
              flex: 1, padding: "10px 8px", borderRadius: 10, border: `1px solid ${tab === t.k ? T.accent : T.border}`,
              background: tab === t.k ? T.accent : T.surface, color: tab === t.k ? "#fff" : T.ink2,
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>{t.l}</button>
          ))}
        </div>
      )}
      {!isAdmin && <div style={{ margin: "0 18px 10px", fontSize: 12.5, color: T.muted }}>Only administrators can manage user accounts.</div>}

      {tab === "accounts" ? (
        <div style={{ padding: "0 18px" }}>
          {data.users.map((u) => {
            const co = u.role === "user" ? data.companies.find((c) => c.id === u.companyId) : null;
            return (
              <Row key={u.id} onClick={isAdmin ? () => setForm(u) : undefined} left={<UsersIcon size={16} color={T.accent} />}
                title={u.name} sub={u.role === "user" ? `${u.username} · ${co?.name || "No company assigned"}` : `${u.username} · ${u.email}`}
                right={<Pill tone={u.role === "admin" ? "accent" : u.role === "manager" ? "blue" : u.role === "user" ? "green" : "muted"}>{ROLE_LABEL[u.role]}</Pill>} />
            );
          })}
        </div>
      ) : (
        isAdmin && <PermissionMatrix ctx={ctx} />
      )}

      {form && isAdmin && (
        <Sheet title={form.id ? "Edit user" : "New user account"} onClose={() => setForm(null)}>
          <UserFields form={form} setForm={setForm} companies={data.companies} />
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            {form.id && <Btn variant="danger" onClick={() => remove(form.id)}><Trash2 size={15} /> Delete</Btn>}
            <div style={{ flex: 1 }} />
            <Btn variant="ghost" onClick={() => setForm(null)}>Cancel</Btn>
            <Btn onClick={() => form.name && form.username && (form.role !== "user" || form.companyId) && save(form)}>Save</Btn>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function PermissionMatrix({ ctx }) {
  const { data, update } = ctx;
  const perms = data.permissions || defaultPermissions();
  const [activeRole, setActiveRole] = useState("manager");

  const toggle = (moduleKey, action) => {
    update("permissions", (prev) => {
      const base = prev || defaultPermissions();
      const current = base[activeRole]?.[moduleKey] || { view: false, edit: false, delete: false };
      let next = { ...current, [action]: !current[action] };
      // Edit and Delete both require View; turning View off clears the others.
      if (action === "view" && !next.view) next = { view: false, edit: false, delete: false };
      if ((action === "edit" || action === "delete") && next[action]) next.view = true;
      return { ...base, [activeRole]: { ...base[activeRole], [moduleKey]: next } };
    });
  };

  return (
    <div style={{ padding: "0 18px 20px" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {CONFIGURABLE_ROLES.map((r) => (
          <button key={r} onClick={() => setActiveRole(r)} style={{
            flex: 1, padding: "9px 8px", borderRadius: 10, border: `1px solid ${activeRole === r ? T.accent : T.border}`,
            background: activeRole === r ? T.accentSoft : T.surface, color: activeRole === r ? T.accentDark : T.ink2,
            fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>{ROLE_LABEL[r]}</button>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 12, lineHeight: 1.5 }}>
        Administrators always have full access to every module. Toggle what {ROLE_LABEL[activeRole].toLowerCase()}s can do below —
        Edit and Delete automatically include View.
      </div>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 44px 44px 44px", padding: "10px 12px", background: T.bg, fontSize: 11, fontWeight: 800, color: T.muted, letterSpacing: 0.3 }}>
          <span>MODULE</span><span style={{ textAlign: "center" }}>VIEW</span><span style={{ textAlign: "center" }}>EDIT</span><span style={{ textAlign: "center" }}>DEL</span>
        </div>
        {PERMISSION_MODULES.map((m, i) => {
          const p = perms[activeRole]?.[m.key] || { view: false, edit: false, delete: false };
          return (
            <div key={m.key} style={{ display: "grid", gridTemplateColumns: "1fr 44px 44px 44px", alignItems: "center", padding: "11px 12px", borderTop: i > 0 ? `1px solid ${T.border}` : "none" }}>
              <span style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>{m.label}</span>
              <PermCheck checked={p.view} onClick={() => toggle(m.key, "view")} />
              <PermCheck checked={p.edit} onClick={() => toggle(m.key, "edit")} />
              <PermCheck checked={p.delete} onClick={() => toggle(m.key, "delete")} tone="red" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PermCheck({ checked, onClick, tone = "accent" }) {
  const on = tone === "red" ? T.red : T.accent;
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <button onClick={onClick} aria-label="toggle permission" style={{
        width: 24, height: 24, borderRadius: 7, border: `1.5px solid ${checked ? on : T.border}`,
        background: checked ? on : "transparent", display: "grid", placeItems: "center", cursor: "pointer", padding: 0,
      }}>
        {checked && <CheckCircle2 size={13} color="#fff" strokeWidth={3} />}
      </button>
    </div>
  );
}

function UserFields({ form, setForm, companies }) {
  return (
    <>
      <Field label="Full name"><TextInput value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Username"><TextInput value={form.username || ""} onChange={(e) => setForm({ ...form, username: e.target.value })} autoCapitalize="none" /></Field>
      <Field label="Email"><TextInput type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
      <Field label={form.id ? "Password (leave blank to keep current)" : "Password"}>
        <TextInput type="text" value={form.password || ""} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Set a password" />
      </Field>
      <Field label="Role">
        <Select value={form.role || "officer"} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="admin">Administrator</option>
          <option value="manager">Manager</option>
          <option value="officer">Advisory Officer</option>
          <option value="user">Company User</option>
        </Select>
      </Field>
      {form.role === "user" && (
        <Field label="Company">
          <Select value={form.companyId || ""} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
            <option value="">— Select company —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <div style={{ fontSize: 11.5, color: T.muted, marginTop: 6 }}>This account will only see data for the selected company, within the modules granted in the Permission Matrix.</div>
        </Field>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: T.muted, marginTop: -6 }}>
        <Lock size={12} /> Stored as plain text in Firestore — fine for internal use, not for sensitive credentials.
      </div>
    </>
  );
}

/* ---------------------------------------------------------------
   EXPORT HELPERS (Excel via SheetJS, PDF via print dialog)
----------------------------------------------------------------*/
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function exportExcel(rows, sheetName, filename) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(new Blob([out], { type: "application/octet-stream" }), filename);
}

function exportPdf(title, rows, columns) {
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

function ExportBar({ onExcel, onPdf }) {
  return (
    <div style={{ display: "flex", gap: 8, padding: "0 18px 10px" }}>
      <Btn variant="ghost" small onClick={onExcel}><Download size={13} /> Excel</Btn>
      <Btn variant="ghost" small onClick={onPdf}><Printer size={13} /> PDF</Btn>
    </div>
  );
}

/* ---------------------------------------------------------------
   REPORTS
----------------------------------------------------------------*/
function ReportsView({ ctx }) {
  const [tab, setTab] = useState("companies");
  return (
    <div>
      <Header title="Reports" subtitle="Company list & corrective action tracking" />
      <div style={{ display: "flex", gap: 6, padding: "10px 18px" }}>
        {[{ k: "companies", l: "Company list" }, { k: "caps", l: "Corrective actions" }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            flex: 1, padding: "10px 8px", borderRadius: 10, border: `1px solid ${tab === t.k ? T.accent : T.border}`,
            background: tab === t.k ? T.accent : T.surface, color: tab === t.k ? "#fff" : T.ink2,
            fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>{t.l}</button>
        ))}
      </div>
      {tab === "companies" ? <CompanyReport ctx={ctx} /> : <CapReport ctx={ctx} />}
    </div>
  );
}

function CompanyReport({ ctx }) {
  const { data } = ctx;
  const [nameFilter, setNameFilter] = useState("");
  const companiesFiltered = ctx.visibleCompanies.filter((c) => c.name.toLowerCase().includes(nameFilter.toLowerCase()));
  const rows = companiesFiltered.map((c) => {
    const cycles = data.advisoryInfo.filter((a) => a.companyId === c.id);
    const capIds = cycles.flatMap((cy) => data.assessmentPlans.filter((a) => a.advisoryInfoId === cy.id).map((a) => a.id));
    const caps = data.caps.filter((cp) => capIds.includes(cp.assessmentPlanId));
    const openCaps = caps.filter((cp) => capStatusOf(cp) !== "Completed").length;
    const contacts = c.contacts.map((ct) => `${ct.name} (${ct.position})`).join("; ");
    return {
      "Company": c.name, "Type": c.type, "Address": c.address, "Contacts": contacts,
      "Advisory Cycles": cycles.length, "Total Actions": caps.length, "Open Actions": openCaps,
    };
  });
  const columns = [
    { key: "Company", label: "Company" }, { key: "Type", label: "Type" }, { key: "Address", label: "Address" },
    { key: "Contacts", label: "Contacts" }, { key: "Advisory Cycles", label: "Cycles" },
    { key: "Total Actions", label: "Total Actions" }, { key: "Open Actions", label: "Open Actions" },
  ];
  return (
    <div>
      <div style={{ padding: "0 18px 10px" }}>
        <TextInput value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} placeholder="Filter by company name…" />
      </div>
      {rows.length > 0 && (
        <ExportBar
          onExcel={() => exportExcel(rows, "Companies", `company-report-${todayISO()}.xlsx`)}
          onPdf={() => exportPdf("Company List Report", rows, columns)}
        />
      )}
      <div style={{ padding: "0 18px" }}>
      {companiesFiltered.map((c) => {
        const cycles = data.advisoryInfo.filter((a) => a.companyId === c.id);
        const capIds = cycles.flatMap((cy) => data.assessmentPlans.filter((a) => a.advisoryInfoId === cy.id).map((a) => a.id));
        const caps = data.caps.filter((cp) => capIds.includes(cp.assessmentPlanId));
        const openCaps = caps.filter((cp) => capStatusOf(cp) !== "Completed").length;
        return (
          <div key={c.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700, fontSize: 14.5, color: T.ink, fontFamily: "'Space Grotesk', sans-serif" }}>{c.name}</span>
              <Pill tone={openCaps ? "amber" : "green"}>{openCaps} open</Pill>
            </div>
            <div style={{ fontSize: 12.5, color: T.muted, marginTop: 4 }}>{c.type} · {cycles.length} cycle{cycles.length === 1 ? "" : "s"} · {caps.length} action{caps.length === 1 ? "" : "s"} total</div>
          </div>
        );
      })}
      {companiesFiltered.length === 0 && <EmptyState icon={FileBarChart} title="No matching companies" hint="Try a different search or add companies." />}
      </div>
    </div>
  );
}

function CapReport({ ctx }) {
  const { data } = ctx;
  const [statusFilter, setStatusFilter] = useState("All");
  const [companyFilter, setCompanyFilter] = useState("");
  const enrichedAll = data.caps.map((c) => {
    const ap = data.assessmentPlans.find((a) => a.id === c.assessmentPlanId);
    const adv = data.advisoryInfo.find((a) => a.id === ap?.advisoryInfoId);
    const co = data.companies.find((x) => x.id === adv?.companyId);
    return { ...c, companyId: co?.id || "", companyName: co?.name || "—", status: capStatusOf(c) };
  });
  const enriched = enrichedAll.filter((c) => {
    if (!inScope(ctx, c.companyId)) return false;
    if (statusFilter !== "All" && c.status !== statusFilter) return false;
    if (companyFilter && c.companyId !== companyFilter) return false;
    return true;
  });
  const rows = enriched.map((c) => ({
    "NC Number": c.ncNumber, "Company": c.companyName, "Area of Improvement": c.area, "Root Cause": c.rootCause,
    "Corrective Actions": c.correctiveActions, "Lead Person": c.leadPerson, "Support Person": c.supportPerson,
    "Target Date": fmtDate(c.targetDate), "Actual Date": fmtDate(c.actualDate), "Status": c.status,
    "Progress %": c.progress || 0, "Progress Comments": c.progressComments, "Recommendations": c.recommendations,
  }));
  const columns = [
    { key: "NC Number", label: "NC #" }, { key: "Company", label: "Company" }, { key: "Area of Improvement", label: "Area" },
    { key: "Status", label: "Status" }, { key: "Lead Person", label: "Lead" }, { key: "Support Person", label: "Support" },
    { key: "Target Date", label: "Target" }, { key: "Actual Date", label: "Actual" }, { key: "Progress %", label: "Progress" },
  ];
  return (
    <div>
      <div style={{ display: "flex", gap: 8, padding: "0 18px 10px" }}>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ flex: 1 }}>
          <option value="All">All statuses</option>
          <option value="Open">Open</option>
          <option value="In Progress">In Progress</option>
          <option value="Overdue">Overdue</option>
          <option value="Completed">Completed</option>
        </Select>
        <Select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} style={{ flex: 1 }}>
          <option value="">All companies</option>
          {ctx.visibleCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      {rows.length > 0 && (
        <ExportBar
          onExcel={() => exportExcel(rows, "Corrective Actions", `corrective-action-report-${todayISO()}.xlsx`)}
          onPdf={() => exportPdf("Corrective Action Plan Report", rows, columns)}
        />
      )}
      <div style={{ padding: "0 18px" }}>
        {enriched.map((c) => (
          <div key={c.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>{c.ncNumber} · {c.area}</span>
              <Pill tone={capTone(c.status)}>{c.status}</Pill>
            </div>
            <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 3 }}>{c.companyName}</div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>Target {fmtDate(c.targetDate)} · Actual {fmtDate(c.actualDate)} · {c.progress || 0}% complete</div>
          </div>
        ))}
        {enriched.length === 0 && <EmptyState icon={FileBarChart} title="No matching corrective actions" hint="Try clearing a filter." />}
      </div>
    </div>
  );
}
