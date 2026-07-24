import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import logo from "./assets/logo.jpg";
import { signInEmail, createEmailAccount, sendReset, createAuthUserAsAdmin, changeOwnPassword, changePasswordWithVerification, logout as firebaseLogout } from "./firebase.js";
import {
  Building2, CalendarClock, ClipboardList, ShieldAlert, Users as UsersIcon,
  FileBarChart, Plus, X, ChevronRight, Search, Clock, AlertTriangle,
  CheckCircle2, Circle, ArrowLeft, Phone, Mail, MapPin,
  Trash2, Pencil, TrendingUp, FileText, LogIn, Paperclip, Image as ImageIcon,
  Download, Printer, Eye, EyeOff, Lock, MessageSquare, Scale, Filter, BookOpen,
  Upload, Settings, Database, GraduationCap, Megaphone, FolderOpen, ShieldCheck,
  ListChecks, ClipboardCheck, LayoutDashboard, Menu, Briefcase
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
const MODULE_COLORS = {
  dashboard: T.accent, companies: T.blue, visits: T.green, caps: T.amber,
  advisory: T.purple, assessment: T.cyan, meetings: T.rose, committee: T.blue,
  caprecs: T.amber, training: T.green, grievance: T.red, documents: T.brown,
  users: T.slate, reports: T.cyan, sysadmin: T.slate, risk: T.red,
  advisorymgmt: T.purple,
};

const uid = (p = "id") => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Used only as a throwaway initial password for admin-created accounts —
// the admin never sees or communicates it; a real password-reset email is
// sent immediately so the new user sets their own.
function randomPassword() {
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}Aa1!`;
}

// Firebase's auth/* error codes are accurate but not something to show a
// non-technical user verbatim — this maps the ones this app can actually
// trigger to plain language.
function authErrorMessage(err) {
  const code = err?.code || "";
  if (code === "auth/invalid-email") return "That doesn't look like a valid email address.";
  if (code === "auth/user-not-found" || code === "auth/invalid-credential" || code === "auth/wrong-password") return "Incorrect email or password.";
  if (code === "auth/too-many-requests") return "Too many attempts — please wait a moment and try again.";
  if (code === "auth/email-already-in-use") return "An account with that email already exists.";
  if (code === "auth/weak-password") return "That password is too weak — use at least 6 characters.";
  if (code === "auth/network-request-failed") return "Network error — check your connection and try again.";
  return err?.message || "Something went wrong. Please try again.";
}
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
  const capId = uid("cap");
  const checklistQs = [
    { id: uid("aq"), questionNo: "Q-01", question: "Are all emergency exits unobstructed and clearly marked?", category: "OSH", legalReference: "Labor Law Art. 137" },
    { id: uid("aq"), questionNo: "Q-02", question: "Are workers paid at least the applicable minimum wage on time?", category: "Wages and Benefits", legalReference: "Labor Law Art. 104" },
    { id: uid("aq"), questionNo: "Q-03", question: "Is overtime voluntary and backed by documented worker consent?", category: "Working Time", legalReference: "Labor Law Art. 139" },
  ];
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
      { id: apId, advisoryInfoId: advisoryId, auditNo: "AUD-2026-01", previousAssessmentDate: "2025-08-15", planAssessmentDate: "2026-08-15", auditType: "Social Compliance", status: "Planned", reportReleasedDate: "", currentNC: 3 },
    ],
    // No authUid on these seeded accounts — they migrate to real Firebase
    // Authentication automatically the first time each one logs in (see
    // RoleGate), still gated by these plaintext passwords until then.
    users: [
      { id: uid("u"), name: "Dara Pich", email: "dara@advisoryco.com", role: "admin", password: "admin123" },
      { id: uid("u"), name: "Lina Meas", email: "lina@advisoryco.com", role: "manager", password: "manager123" },
      { id: uid("u"), name: "Vichet Ros", email: "vichet@advisoryco.com", role: "officer", password: "officer123" },
      { id: uid("u"), name: "Sokha Chan", email: "sokha@meridianapparel.com", role: "user", companyId, password: "company123" },
    ],
    caps: [
      { id: capId, assessmentPlanId: apId, ncNumber: "NC-01", area: "Fire Safety", rootCause: "Blocked emergency exits in Building B.", correctiveActions: "Clear exits, install signage, retrain floor staff.", leadPerson: "Sokha Chan", supportPerson: "Vichet Ros", targetDate: "2026-08-01", actualDate: "", status: "In Progress", progress: 60, recommendations: "Add monthly self-audit checklist." },
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
    trainings: [
      {
        id: uid("tr"), companyId, topic: "Fire Safety & Emergency Response", trainer: "Vichet Ros",
        date: "2026-03-05", startTime: "13:00", endTime: "16:00", deliveryMode: "Onsite", status: "Completed",
        location: "Meridian Apparel Co. — Training Hall", participants: ["Sokha Chan", "Ratanak Sok", "Floor Supervisor"],
        notes: "Covered evacuation routes, extinguisher use, and assembly points.",
      },
    ],
    grievances: [
      {
        id: uid("gr"), companyId, dateReported: "2026-03-12", category: "Working Conditions",
        channel: "Suggestion Box", description: "Workers report inadequate ventilation on the second floor sewing line during hot season.",
        reportedBy: "", status: "Under Investigation", assignedTo: "Vichet Ros", resolution: "", resolvedDate: "",
      },
    ],
    policies: [
      {
        id: uid("pol"), companyId, code: "POL-01", name: "Code of Conduct", version: "v1.0",
        releasedDate: "2026-01-15", type: "Policy", remark: "Covers workplace ethics, anti-harassment, and grievance escalation.",
      },
    ],
    licenses: [
      {
        id: uid("lic"), companyId, docNo: "LIC-01", name: "Fire Safety Certificate", issuedBy: "Ministry of Interior",
        issueDate: "2025-06-01", expiredDate: "2026-06-01", status: "Valid",
      },
    ],
    permissions: defaultPermissions(),
    systemSettings: { timeZone: "UTC" },
    auditChecklists: checklistQs,
    auditRecords: [
      {
        id: uid("ar"), companyId, auditDate: "2026-02-20", auditType: "Social Compliance",
        ncs: [{ id: uid("nc"), description: "Emergency exit in Building B partially blocked by stored materials.", severity: "Major", status: "Open" }],
      },
    ],
    selfAssessments: [
      {
        id: uid("sa"), companyId, assignedDate: "2026-03-01", dueDate: "2026-03-15", status: "Draft",
        questions: checklistQs.map((q) => ({ questionId: q.id, questionNo: q.questionNo, question: q.question, category: q.category, answer: "", remark: "" })),
      },
    ],
    riskAssessments: [
      {
        id: uid("ra"), companyId, riskNo: "RA-01", date: "2026-02-20", area: "Building B — Sewing Floor", category: "OSH",
        hazard: "Blocked emergency exit", description: "Emergency exit partially blocked by stored fabric rolls, delaying evacuation in a fire.",
        likelihood: 3, severity: 4, existingControls: "Monthly fire drill; exit signage installed.",
        recommendedActions: "Relocate stored materials away from all exit routes; assign a daily housekeeping check.",
        assignedTo: "Vichet Ros", targetDate: "2026-03-15", actualCompletionDate: "", status: "Open", linkedCapId: capId,
      },
    ],
    customDashboards: [
      {
        id: uid("dash"), name: "Factory Snapshot",
        widgets: [
          { id: uid("dw"), type: "open_caps" },
          { id: uid("dw"), type: "high_risks" },
          { id: uid("dw"), type: "upcoming_visits" },
        ],
      },
    ],
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
  { key: "dashboard", label: "Overview" },
  { key: "companies", label: "Companies" },
  { key: "advisory", label: "Advisory Cycles" },
  { key: "visits", label: "Advisory Visits" },
  { key: "assessment", label: "Audit Management" },
  { key: "risk", label: "Risk Assessment" },
  { key: "caps", label: "Improvement Plan (CAP)" },
  { key: "meetings", label: "Meeting Logs" },
  { key: "committee", label: "Bipartite Committee" },
  { key: "caprecs", label: "CAP Recommendations" },
  { key: "training", label: "Training" },
  { key: "grievance", label: "Grievance Mechanism" },
  { key: "documents", label: "Documentation" },
  { key: "reports", label: "Reports" },
  { key: "sysadmin", label: "System Administration" },
];
const CONFIGURABLE_ROLES = ["manager", "officer", "user"];

function defaultPermissions() {
  const full = { view: true, edit: true, delete: true };
  const editOnly = { view: true, edit: true, delete: false };
  const viewOnly = { view: true, edit: false, delete: false };
  const none = { view: false, edit: false, delete: false };
  return {
    manager: {
      dashboard: viewOnly, companies: full, advisory: full, visits: full, assessment: full, risk: full, caps: full,
      meetings: editOnly, committee: editOnly, caprecs: editOnly, reports: viewOnly, sysadmin: none,
      training: editOnly, grievance: editOnly, documents: editOnly,
    },
    officer: {
      dashboard: viewOnly, companies: viewOnly, advisory: viewOnly, visits: editOnly, assessment: viewOnly, risk: editOnly, caps: editOnly,
      meetings: editOnly, committee: viewOnly, caprecs: viewOnly, reports: viewOnly, sysadmin: none,
      training: editOnly, grievance: editOnly, documents: editOnly,
    },
    user: {
      dashboard: viewOnly, companies: viewOnly, advisory: viewOnly, visits: viewOnly, assessment: viewOnly, risk: viewOnly, caps: viewOnly,
      meetings: viewOnly, committee: viewOnly, caprecs: none, reports: viewOnly, sysadmin: none,
      training: viewOnly, grievance: viewOnly, documents: viewOnly,
    },
  };
}

function hasPerm(ctx, moduleKey, action) {
  if (ctx.role.role === "admin") return true;
  // Falls back to the coded default when a module is entirely absent from
  // the live permissions doc — a role that already existed in Firestore
  // before a module was added won't have that key yet, and "missing" here
  // must mean "use the sensible default", not "deny": an admin's explicit
  // choice (even an explicit all-false "none") is a real object and always
  // wins over the fallback, since ?? only applies when the value is
  // null/undefined, never for an existing-but-restrictive object.
  const perms = ctx.data.permissions?.[ctx.role.role]?.[moduleKey] ?? defaultPermissions()[ctx.role.role]?.[moduleKey];
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
const KEYS = ["companies", "advisoryInfo", "visits", "assessmentPlans", "users", "caps", "meetingLogs", "bipartiteCommittee", "capRecommendations", "permissions", "systemSettings", "trainings", "grievances", "policies", "licenses", "auditChecklists", "auditRecords", "selfAssessments", "riskAssessments", "customDashboards"];

const CAP_CLUSTERS = [
  "Child Labor", "Forced Labor", "Discrimination and Harassment", "FoA & CBA",
  "Employment Contract and HR", "Working Time", "Wages and Benefits", "OSH", "Management System", "Others",
];

const TRAINING_DELIVERY_MODES = ["Onsite", "Online", "Hybrid"];
const TRAINING_STATUSES = ["Scheduled", "Completed", "Cancelled"];

const GRIEVANCE_CATEGORIES = [
  "Wages & Benefits", "Working Conditions", "Harassment & Discrimination",
  "Health & Safety", "Discipline & Termination", "Freedom of Association", "Other",
];
const GRIEVANCE_CHANNELS = ["Suggestion Box", "Hotline", "In-Person", "Bipartite Committee", "Email", "Other"];
const GRIEVANCE_STATUSES = ["Open", "Under Investigation", "Resolved", "Closed"];

const DOC_TYPES = ["Policy", "Procedure", "Guideline", "Form", "Other"];
const LICENSE_STATUSES = ["Valid", "Renewed", "Cancelled"];
const LICENSE_RENEWAL_WINDOW_DAYS = 30;

const AUDIT_TYPES = ["Internal", "Social Compliance", "Quality", "Safety (OSH)", "Environmental", "Customer/Brand", "Other"];
const AUDIT_PLAN_STATUSES = ["Planned", "Scheduled", "In Progress", "Completed", "Cancelled"];
const AUDIT_NC_SEVERITIES = ["Minor", "Major", "Critical"];
const AUDIT_NC_STATUSES = ["Open", "Closed"];
const SELF_ASSESSMENT_STATUSES = ["Draft", "Submitted", "Reviewed"];
const SELF_ASSESSMENT_ANSWERS = ["Compliant", "Non-Compliant", "N/A"];

const RISK_LIKELIHOOD_LABELS = ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"];
const RISK_SEVERITY_LABELS = ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"];
const RISK_STATUSES = ["Open", "In Progress", "Closed"];
// Likelihood x severity are both 1-5, so the only achievable scores are
// 1-6, 8-10, 12-15, 16-25 — 7 and 11 can never occur (neither factors as
// two numbers 1-5), so these plain thresholds cover every real score.
function riskLevelOf(score) {
  if (score >= 16) return "Very High";
  if (score >= 12) return "High";
  if (score >= 8) return "Medium";
  return "Low";
}
function riskLevelTone(level) {
  return level === "Very High" ? "red" : level === "High" ? "rose" : level === "Medium" ? "amber" : "green";
}

function addDays(dateStr, days) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
// Renew date is always derived from Expired Date, never stored, so it can
// never go stale if Expired Date is edited later.
function renewDateOf(lic) {
  return addDays(lic.expiredDate, -LICENSE_RENEWAL_WINDOW_DAYS);
}
function licenseStatusOf(lic) {
  if (lic.status === "Renewed" || lic.status === "Cancelled") return lic.status;
  if (!lic.expiredDate) return "Valid";
  if (lic.expiredDate < todayISO()) return "Expired";
  if (renewDateOf(lic) <= todayISO()) return "Expiring Soon";
  return "Valid";
}
function licenseTone(status) {
  return status === "Expired" ? "red" : status === "Expiring Soon" ? "amber" : status === "Cancelled" ? "muted" : "green";
}

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
function IconChip({ icon: Icon, color = T.accent, size = 34, iconSize = 17, strokeWidth, background, style }) {
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

function EmptyState({ icon: Icon, title, hint, color = T.muted }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 20px", color: T.muted }}>
      <IconChip icon={Icon} color={color} size={54} iconSize={26} strokeWidth={1.6} style={{ margin: "0 auto 12px" }} />
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

function Header({ title, subtitle, action, icon, color = T.accent }) {
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
function trainingTone(status) {
  return status === "Completed" ? "green" : status === "Cancelled" ? "muted" : "blue";
}
function grievanceTone(status) {
  return status === "Resolved" ? "green" : status === "Closed" ? "muted" : status === "Under Investigation" ? "blue" : "amber";
}

/* ---------------------------------------------------------------
   MAIN APP
----------------------------------------------------------------*/
export default function App() {
  const { data, ready, update } = useStore();
  const [role, setRole] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
    // The landing tab is decided right here, at the moment of login, since
    // it depends on the account being signed in. Default is Overview — the
    // "dashboard" tab itself already shows the assigned dashboard in place
    // of the generic Overview when one exists (see assignedDashboard
    // below) — so the only reason to land somewhere else is not having
    // permission to view Overview at all, in which case Companies instead.
    const handleLogin = (u) => {
      const canViewDashboard = u.role === "admin" || !!(data.permissions?.[u.role]?.dashboard ?? defaultPermissions()[u.role]?.dashboard)?.view;
      setRole(u);
      setTab(canViewDashboard ? "dashboard" : "companies");
      setDetail(null);
    };
    return (
      <Shell>
        <RoleGate users={data.users} update={update} onEnter={handleLogin} />
      </Shell>
    );
  }

  if (role.mustChangePassword) {
    return (
      <Shell>
        <ForceChangePasswordScreen
          onDone={() => {
            const next = { ...role, mustChangePassword: false };
            update("users", (prev) => prev.map((u) => (u.id === role.id ? next : u)));
            setRole(next);
          }}
          onSignOut={() => { firebaseLogout().catch(() => {}); setRole(null); }}
        />
      </Shell>
    );
  }

  const scopeCompanyId = role.role === "user" ? (role.companyId || "__unassigned__") : null;
  const visibleCompanies = scopeCompanyId ? data.companies.filter((c) => c.id === scopeCompanyId) : data.companies;
  const ctx = { data, update, role, setDetail, scopeCompanyId, visibleCompanies };
  // A dashboard assigned to this account (Dashboard Builder) replaces the
  // default Overview everywhere "dashboard" is the active tab — including
  // right after login, since tab always starts on "dashboard".
  const assignedDashboard = role.dashboardId ? data.customDashboards.find((d) => d.id === role.dashboardId) : null;

  // Advisory Cycles, Advisory Visits, Meeting Logs, Bipartite Committee, and
  // Improvement Plan are grouped under one "Advisory Management" nav entry
  // (AdvisoryManagementView) instead of five flat entries. Each still has its
  // own permission key, so the group is shown if the role can view ANY of
  // them, and lands on the first one it actually has access to — clicking
  // into a specific one from elsewhere (dashboard shortcuts, custom dashboard
  // widgets) still works unchanged since `tab` keeps using these same keys.
  const ADVISORY_MGMT_KEYS = ["advisory", "visits", "meetings", "committee", "caps"];
  const canViewAdvisoryMgmt = ADVISORY_MGMT_KEYS.some((k) => hasPerm(ctx, k, "view"));
  const advisoryMgmtLandingKey = ADVISORY_MGMT_KEYS.find((k) => hasPerm(ctx, k, "view")) || "advisory";

  const NAV = [
    { key: "dashboard", label: assignedDashboard ? assignedDashboard.name : "Overview", icon: TrendingUp, perm: "dashboard", color: MODULE_COLORS.dashboard },
    { key: "companies", label: "Companies", icon: Building2, perm: "companies", color: MODULE_COLORS.companies },
    ...(canViewAdvisoryMgmt ? [{ key: advisoryMgmtLandingKey, matchKeys: ADVISORY_MGMT_KEYS, label: "Advisory Management", icon: Briefcase, color: MODULE_COLORS.advisorymgmt }] : []),
  ].filter((n) => !n.perm || hasPerm(ctx, n.perm, "view"));
  const MORE_NAV = [
    { key: "assessment", label: "Audit Management", icon: ClipboardCheck, perm: "assessment", color: MODULE_COLORS.assessment },
    { key: "risk", label: "Risk Assessment", icon: AlertTriangle, perm: "risk", color: MODULE_COLORS.risk },
    { key: "caprecs", label: "CAP Recommendations", icon: BookOpen, perm: "caprecs", color: MODULE_COLORS.caprecs },
    { key: "training", label: "Training", icon: GraduationCap, perm: "training", color: MODULE_COLORS.training },
    { key: "grievance", label: "Grievance Mechanism", icon: Megaphone, perm: "grievance", color: MODULE_COLORS.grievance },
    { key: "documents", label: "Documentation", icon: FolderOpen, perm: "documents", color: MODULE_COLORS.documents },
    { key: "users", label: "User Accounts", icon: UsersIcon, adminOnly: true, color: MODULE_COLORS.users },
    { key: "dashboards", label: "Dashboard Builder", icon: LayoutDashboard, adminOnly: true, color: MODULE_COLORS.dashboard },
    { key: "reports", label: "Reports", icon: FileBarChart, perm: "reports", color: MODULE_COLORS.reports },
    { key: "sysadmin", label: "System Administration", icon: Settings, perm: "sysadmin", color: MODULE_COLORS.sysadmin },
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
  else if (detail?.type === "assessment") Body = <AuditPlanDetail id={detail.id} ctx={ctx} onBack={() => setDetail(null)} />;
  else if (detail?.type === "auditRecord") Body = <AuditRecordDetail id={detail.id} ctx={ctx} onBack={() => setDetail(null)} />;
  else if (detail?.type === "selfAssessment") Body = <SelfAssessmentDetail id={detail.id} ctx={ctx} onBack={() => setDetail(null)} />;
  else if (tab === "dashboard" && hasPerm(ctx, "dashboard", "view")) {
    const goto = (t) => { setTab(t); setDetail(null); };
    Body = assignedDashboard
      ? <CustomDashboardView ctx={ctx} dashboard={assignedDashboard} goto={goto} />
      : <Dashboard ctx={ctx} goto={goto} />;
  }
  else if (tab === "companies" && hasPerm(ctx, "companies", "view")) Body = <CompaniesView ctx={ctx} />;
  else if (tab === "visits" && hasPerm(ctx, "visits", "view")) Body = <AdvisoryManagementView ctx={ctx} tab={tab} setTab={setTab} />;
  else if (tab === "caps" && hasPerm(ctx, "caps", "view")) Body = <AdvisoryManagementView ctx={ctx} tab={tab} setTab={setTab} />;
  else if (tab === "advisory" && hasPerm(ctx, "advisory", "view")) Body = <AdvisoryManagementView ctx={ctx} tab={tab} setTab={setTab} />;
  else if (tab === "assessment" && hasPerm(ctx, "assessment", "view")) Body = <AuditManagementView ctx={ctx} />;
  else if (tab === "risk" && hasPerm(ctx, "risk", "view")) Body = <RiskAssessmentView ctx={ctx} />;
  else if (tab === "meetings" && hasPerm(ctx, "meetings", "view")) Body = <AdvisoryManagementView ctx={ctx} tab={tab} setTab={setTab} />;
  else if (tab === "committee" && hasPerm(ctx, "committee", "view")) Body = <AdvisoryManagementView ctx={ctx} tab={tab} setTab={setTab} />;
  else if (tab === "caprecs" && hasPerm(ctx, "caprecs", "view")) Body = <CapRecommendationsView ctx={ctx} />;
  else if (tab === "training" && hasPerm(ctx, "training", "view")) Body = <TrainingView ctx={ctx} />;
  else if (tab === "grievance" && hasPerm(ctx, "grievance", "view")) Body = <GrievanceView ctx={ctx} />;
  else if (tab === "documents" && hasPerm(ctx, "documents", "view")) Body = <DocumentationView ctx={ctx} />;
  else if (tab === "users" && role.role === "admin") Body = <UsersView ctx={ctx} />;
  else if (tab === "dashboards" && role.role === "admin") Body = <DashboardBuilderView ctx={ctx} />;
  else if (tab === "reports" && hasPerm(ctx, "reports", "view")) Body = <ReportsView ctx={ctx} />;
  else if (tab === "sysadmin" && hasPerm(ctx, "sysadmin", "view")) Body = <SystemAdministrationView ctx={ctx} />;
  else Body = <RestrictedView goto={() => { setTab("dashboard"); setDetail(null); }} />;

  const roleLabel = ROLE_LABEL[role.role]?.split(" ")[0] || role.role;
  // Ends the real Firebase session and restores the anonymous one Firestore
  // rules expect, so the login screen is immediately usable for whoever's next.
  const handleSignOut = () => { firebaseLogout().catch(() => {}); setRole(null); };

  if (isDesktop) {
    return (
      <Shell wide>
        <div style={{ display: "flex", flex: 1, minHeight: "100vh" }}>
          <SideNav
            items={[...NAV, ...MORE_NAV]}
            activeKey={detail ? null : tab}
            onSelect={(k) => { setTab(k); setDetail(null); }}
          />
          <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
            <AccountCorner roleLabel={roleLabel} userName={role.name} email={role.email} onSignOut={handleSignOut} />
            <div style={{ maxWidth: 820, margin: "0 auto", padding: "0 0 40px" }}>{Body}</div>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <TopBar roleLabel={roleLabel} userName={role.name} email={role.email} onSignOut={handleSignOut} onOpenMenu={() => setMobileMenuOpen(true)} />
      <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>{Body}</div>
      <MobileMenu
        items={[...NAV, ...MORE_NAV]}
        activeKey={detail ? null : tab}
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        onSelect={(k) => { setTab(k); setDetail(null); setMobileMenuOpen(false); }}
      />
    </Shell>
  );
}

// Top bar used by the mobile ("phone card") layout only — the desktop
// layout uses AccountCorner (below) for the account/sign-out control instead,
// since SideNav's own header is branding-only there. The hamburger button on
// the left opens MobileMenu, mobile's equivalent of the desktop SideNav.
function TopBar({ roleLabel, userName, email, onSignOut, onOpenMenu }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: `1px solid ${T.border}`, background: T.ink }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <button onClick={onOpenMenu} aria-label="Open menu" style={{
          background: "none", border: "none", cursor: "pointer", padding: 6, marginLeft: -6,
          flexShrink: 0, display: "grid", placeItems: "center", borderRadius: 8,
        }}>
          <Menu size={21} color="#fff" />
        </button>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: "#fff", display: "grid", placeItems: "center", flexShrink: 0, overflow: "hidden" }}>
          <img src={logo} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </div>
        <span style={{
          color: "#fff", fontFamily: "'Space Grotesk', sans-serif", fontSize: 13.5,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>Advisory Management System</span>
      </div>
      <AccountMenu roleLabel={roleLabel} userName={userName} email={email} onSignOut={onSignOut} variant="mobile" />
    </div>
  );
}

// Mobile navigation drawer, opened from TopBar's top-left hamburger button —
// mobile's equivalent of the desktop SideNav (same items, same styling
// language), rendered as a slide-in overlay instead of a persistent column
// since a phone doesn't have the width to spare for one.
function MobileMenu({ items, activeKey, open, onClose, onSelect }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(22,50,58,0.45)" }} />
      <div style={{
        position: "absolute", top: 0, left: 0, bottom: 0, width: "min(268px, 82vw)",
        background: T.ink, display: "flex", flexDirection: "column",
        boxShadow: "6px 0 28px rgba(0,0,0,0.25)", animation: "slideInLeft .18s ease-out",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 16px 14px" }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "#fff", display: "grid", placeItems: "center", flexShrink: 0, overflow: "hidden" }}>
            <img src={logo} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <span style={{ color: "#fff", fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, lineHeight: 1.25, flex: 1, minWidth: 0 }}>Advisory Management System</span>
          <button onClick={onClose} aria-label="Close menu" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0, display: "grid", placeItems: "center" }}>
            <X size={19} color="#fff" />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px 14px" }}>
          {items.map((n) => {
            const active = n.matchKeys ? n.matchKeys.includes(activeKey) : activeKey === n.key;
            return (
              <button key={n.key} onClick={() => onSelect(n.key)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 10px", marginBottom: 2,
                borderRadius: 10, border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontSize: 14, fontWeight: 700,
                background: active ? "rgba(255,255,255,0.12)" : "transparent",
                color: active ? "#fff" : "#9DB3AB",
              }}>
                <IconChip icon={n.icon} color={n.color || "#9DB3AB"} size={30} iconSize={17}
                  strokeWidth={active ? 2.3 : 1.9} background="transparent"
                  style={{ opacity: active ? 1 : 0.6 }} />
                {n.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Account control for the desktop layout — pinned to the top-right corner
// of the scrollable content pane (SideNav's own header is branding-only).
function AccountCorner({ roleLabel, userName, email, onSignOut }) {
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 20, display: "flex", justifyContent: "flex-end", padding: "16px 24px 0" }}>
      <AccountMenu roleLabel={roleLabel} userName={userName} email={email} onSignOut={onSignOut} variant="desktop" />
    </div>
  );
}

// Account button + dropdown (Change password / Sign out), shared by the
// desktop (AccountCorner) and mobile (TopBar) top-right account controls —
// same menu, just a differently-styled trigger button per variant.
function AccountMenu({ roleLabel, userName, email, onSignOut, variant }) {
  const [open, setOpen] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  const triggerStyle = variant === "desktop"
    ? {
        background: T.surface, border: `1px solid ${T.border}`, color: T.ink2,
        fontSize: 12, fontWeight: 700, padding: "8px 14px", borderRadius: 999, cursor: "pointer",
        fontFamily: "inherit", textAlign: "right", boxShadow: "0 2px 8px rgba(22,50,58,0.08)",
      }
    : {
        background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", fontSize: 11.5,
        fontWeight: 700, padding: "6px 10px", borderRadius: 999, cursor: "pointer", flexShrink: 0,
        fontFamily: "inherit",
      };

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} style={triggerStyle}>
        {roleLabel?.split(" ")[0] || ""} · {userName.split(" ")[0]}
        {variant === "desktop" && <div style={{ fontSize: 10, fontWeight: 600, color: T.muted, marginTop: 1 }}>Tap for account options</div>}
      </button>

      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 55 }} onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            position: "absolute", top: variant === "desktop" ? 58 : 48, right: variant === "desktop" ? 24 : 14,
            background: T.surface, borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            overflow: "hidden", width: 200, border: `1px solid ${T.border}`,
          }}>
            <button onClick={() => { setOpen(false); setChangingPw(true); }} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "11px 14px",
              background: "transparent", border: "none", borderBottom: `1px solid ${T.border}`,
              fontSize: 13.5, color: T.ink, cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontWeight: 600,
            }}>
              <Lock size={15} color={T.muted} /> Change password
            </button>
            <button onClick={() => { setOpen(false); onSignOut(); }} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "11px 14px",
              background: "transparent", border: "none",
              fontSize: 13.5, color: T.red, cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontWeight: 600,
            }}>
              <LogIn size={15} style={{ transform: "scaleX(-1)" }} /> Sign out
            </button>
          </div>
        </div>
      )}

      {changingPw && <ChangePasswordSheet email={email} onClose={() => setChangingPw(false)} />}
    </div>
  );
}

// Self-service password change — requires the current password (verified
// via a real Firebase reauthentication, not just a client-side string
// compare) before a new one is set. See firebase.js's
// changePasswordWithVerification for why reauthentication is the right way
// to do the "verify old password" step here.
function ChangePasswordSheet({ email, onClose }) {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!oldPw) { setError("Enter your current password."); return; }
    if (newPw.length < 6) { setError("New password must be at least 6 characters."); return; }
    if (newPw !== confirmPw) { setError("New passwords don't match."); return; }
    setError("");
    setBusy(true);
    try {
      await changePasswordWithVerification(email, oldPw, newPw);
      setSuccess(true);
    } catch (err) {
      const code = err?.code || "";
      setError(code === "auth/wrong-password" || code === "auth/invalid-credential" ? "Your current password is incorrect." : authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Change password" onClose={onClose}>
      {success ? (
        <div>
          <div style={{ color: T.green, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Your password has been changed.</div>
          <Btn full onClick={onClose}>Done</Btn>
        </div>
      ) : (
        <>
          <Field label="Current password">
            <TextInput type={showPw ? "text" : "password"} value={oldPw} onChange={(e) => setOldPw(e.target.value)} placeholder="Enter your current password" onKeyDown={(e) => e.key === "Enter" && submit()} />
          </Field>
          <Field label="New password">
            <TextInput type={showPw ? "text" : "password"} value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="At least 6 characters" onKeyDown={(e) => e.key === "Enter" && submit()} />
          </Field>
          <Field label="Confirm new password">
            <TextInput type={showPw ? "text" : "password"} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Type it again" onKeyDown={(e) => e.key === "Enter" && submit()} />
          </Field>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.muted, marginBottom: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} /> Show passwords
          </label>
          {error && <div style={{ color: T.red, fontSize: 12.5, marginBottom: 12, fontWeight: 600 }}>{error}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }} />
            <Btn variant="ghost" onClick={onClose} disabled={busy}>Cancel</Btn>
            <Btn onClick={submit} disabled={busy}>{busy ? "Saving…" : "Change password"}</Btn>
          </div>
        </>
      )}
    </Sheet>
  );
}

// Persistent desktop sidebar — replaces TopBar + MobileMenu above the
// DESKTOP_BP breakpoint. There's room to show every nav item flat since a
// sidebar isn't fighting for horizontal space the way mobile chrome is.
function SideNav({ items, activeKey, onSelect }) {
  return (
    <div style={{
      width: 236, flexShrink: 0, background: T.ink, display: "flex", flexDirection: "column",
      minHeight: "100vh", position: "sticky", top: 0, alignSelf: "flex-start",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "22px 18px 18px" }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: "#fff", display: "grid", placeItems: "center", flexShrink: 0, overflow: "hidden" }}>
          <img src={logo} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </div>
        <span style={{ color: "#fff", fontFamily: "'Space Grotesk', sans-serif", fontSize: 14.5, lineHeight: 1.25 }}>Advisory Management System</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px 14px" }}>
        {items.map((n) => {
          const active = n.matchKeys ? n.matchKeys.includes(activeKey) : activeKey === n.key;
          return (
            <button key={n.key} onClick={() => onSelect(n.key)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", marginBottom: 2,
              borderRadius: 10, border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontSize: 14, fontWeight: 700,
              background: active ? "rgba(255,255,255,0.12)" : "transparent",
              color: active ? "#fff" : "#9DB3AB",
            }}>
              <IconChip icon={n.icon} color={n.color || "#9DB3AB"} size={30} iconSize={17}
                strokeWidth={active ? 2.3 : 1.9} background="transparent"
                style={{ opacity: active ? 1 : 0.6 }} />
              {n.label}
            </button>
          );
        })}
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
      overflowX: wide ? "visible" : "hidden", width: wide ? undefined : "100%",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        @keyframes slideUp { from { transform: translateY(24px); opacity: 0.4 } to { transform: translateY(0); opacity: 1 } }
        @keyframes slideInLeft { from { transform: translateX(-100%) } to { transform: translateX(0) } }
        @keyframes fadeScaleIn { from { transform: scale(0.96); opacity: 0.4 } to { transform: scale(1); opacity: 1 } }
        input:focus, select:focus, textarea:focus { border-color: ${T.accent} !important; box-shadow: 0 0 0 3px ${T.accentSoft}; }
        ::-webkit-scrollbar { width: 0; height: 0; }
        .icon-chip { transition: transform 0.15s ease, background 0.15s ease; }
        button:hover .icon-chip { transform: scale(1.1); }
        button:active .icon-chip { transform: scale(0.92); }
        .lift-card { transition: transform 0.15s ease, box-shadow 0.15s ease; }
        .lift-card:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(22,50,58,0.1); }
        .lift-card:active { transform: translateY(0); }
      `}</style>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------
   ROLE GATE
----------------------------------------------------------------*/
function RoleGate({ users, update, onEnter }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const tryLogin = async () => {
    if (busy) return;
    setError("");
    setResetMsg("");
    const enteredEmail = email.trim().toLowerCase();
    if (!enteredEmail || !password) { setError("Enter your email and password."); return; }
    const match = users.find((u) => (u.email || "").trim().toLowerCase() === enteredEmail);
    if (!match) { setError("Incorrect email or password."); return; }

    setBusy(true);
    try {
      if (match.authUid) {
        // Already migrated to real Firebase Authentication — normal sign-in.
        await signInEmail(match.email, password);
        onEnter(match);
        return;
      }
      // Legacy account (predates real authentication): still checked
      // against its plaintext password, then transparently migrated the
      // moment that password is proven correct — the user notices nothing.
      if (!EMAIL_RE.test(match.email || "")) {
        setError("This account has no valid email on file. Ask an administrator to set one before signing in.");
        return;
      }
      if ((match.password || "") !== password) {
        setError("Incorrect email or password.");
        return;
      }
      const cred = await createEmailAccount(match.email, password);
      const migrated = { ...match, authUid: cred.user.uid };
      delete migrated.password;
      update("users", (prev) => prev.map((u) => (u.id === match.id ? migrated : u)));
      onEnter(migrated);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const forgotPassword = async () => {
    const enteredEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(enteredEmail)) { setError("Enter your email above first, then tap “Forgot password”."); return; }
    setError("");
    setResetMsg("");
    setBusy(true);
    try {
      await sendReset(enteredEmail);
    } catch {
      // Deliberately swallowed — the confirmation below is shown either
      // way, so this screen never reveals whether an email is registered.
    } finally {
      setBusy(false);
      setResetMsg("If an account exists for that email, a password reset link has been sent.");
    }
  };

  return (
    <div style={{ padding: "60px 26px", display: "flex", flexDirection: "column", alignItems: "center", minHeight: "100vh", justifyContent: "center", background: T.ink }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 12, marginBottom: 18, display: "inline-flex", boxShadow: "0 8px 24px rgba(0,0,0,0.2)" }}>
        <img src={logo} alt="Advisory Management System" style={{ width: 96, height: "auto", display: "block" }} />
      </div>
      <h1 style={{ color: "#fff", fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, margin: "0 0 10px", textAlign: "center" }}>Advisory Management System</h1>
      <p style={{ color: "#9DB3AB", fontSize: 13.5, margin: "0 0 28px", textAlign: "center" }}>Case tracking for advisory visits, assessments &amp; corrective actions</p>
      <div style={{ width: "100%", background: T.surface, borderRadius: 16, padding: 20 }}>
        <Field label="Email">
          <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email"
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
        <div style={{ textAlign: "right", marginBottom: 14, marginTop: -6 }}>
          <button type="button" onClick={forgotPassword} disabled={busy} style={{ background: "none", border: "none", color: T.accent, fontSize: 12.5, fontWeight: 700, cursor: busy ? "default" : "pointer", padding: 0, fontFamily: "inherit" }}>
            Forgot password?
          </button>
        </div>
        {error && <div style={{ color: T.red, fontSize: 12.5, marginBottom: 12, fontWeight: 600 }}>{error}</div>}
        {resetMsg && <div style={{ color: T.green, fontSize: 12.5, marginBottom: 12, fontWeight: 600 }}>{resetMsg}</div>}
        <Btn full onClick={tryLogin} disabled={busy}>
          <LogIn size={16} /> {busy ? "Signing in…" : "Sign in"}
        </Btn>
      </div>
    </div>
  );
}

/**
 * Blocks the rest of the app until an account created with an admin-set
 * initial password sets a real one of its own. `updatePassword` only
 * operates on `auth.currentUser`, which is already this account (they just
 * signed in to get here) — no backend/Admin SDK needed for this part.
 */
function ForceChangePasswordScreen({ onDone, onSignOut }) {
  const [pw, setPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (pw.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (pw !== confirmPw) { setError("Passwords don't match."); return; }
    setError("");
    setBusy(true);
    try {
      await changeOwnPassword(pw);
      onDone();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: "60px 26px", display: "flex", flexDirection: "column", alignItems: "center", minHeight: "100vh", justifyContent: "center", background: T.ink }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 12, marginBottom: 18, display: "inline-flex", boxShadow: "0 8px 24px rgba(0,0,0,0.2)" }}>
        <img src={logo} alt="Advisory Management System" style={{ width: 96, height: "auto", display: "block" }} />
      </div>
      <h1 style={{ color: "#fff", fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, margin: "0 0 10px", textAlign: "center" }}>Set a new password</h1>
      <p style={{ color: "#9DB3AB", fontSize: 13.5, margin: "0 0 28px", textAlign: "center", maxWidth: 320 }}>Your administrator set a temporary password for this account. Choose one only you know before continuing.</p>
      <div style={{ width: "100%", background: T.surface, borderRadius: 16, padding: 20 }}>
        <Field label="New password">
          <div style={{ position: "relative" }}>
            <TextInput type={showPw ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)}
              placeholder="At least 6 characters" onKeyDown={(e) => e.key === "Enter" && submit()} style={{ paddingRight: 40 }} />
            <button onClick={() => setShowPw((v) => !v)} type="button" style={{ position: "absolute", right: 8, top: 8, background: "none", border: "none", cursor: "pointer", padding: 4 }}>
              {showPw ? <EyeOff size={17} color={T.muted} /> : <Eye size={17} color={T.muted} />}
            </button>
          </div>
        </Field>
        <Field label="Confirm new password">
          <TextInput type={showPw ? "text" : "password"} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
            placeholder="Type it again" onKeyDown={(e) => e.key === "Enter" && submit()} />
        </Field>
        {error && <div style={{ color: T.red, fontSize: 12.5, marginBottom: 12, fontWeight: 600 }}>{error}</div>}
        <Btn full onClick={submit} disabled={busy}>
          {busy ? "Saving…" : "Set password and continue"}
        </Btn>
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button type="button" onClick={onSignOut} disabled={busy} style={{ background: "none", border: "none", color: T.muted, fontSize: 12.5, fontWeight: 600, cursor: busy ? "default" : "pointer", padding: 0, fontFamily: "inherit" }}>
            Sign out instead
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   DASHBOARD BUILDER — a fixed catalog of KPI/list widgets an admin can
   pick, order, and assign to a user; that user then sees this instead of
   the default Overview as soon as they log in (see role.dashboardId).
----------------------------------------------------------------*/
const DASHBOARD_WIDGET_CATALOG = [
  { type: "companies_count", label: "Companies", kind: "stat", icon: Building2, tone: "blue", goto: "companies" },
  { type: "open_caps", label: "Open Improvement Plans", kind: "stat", icon: ShieldAlert, tone: "amber", goto: "caps" },
  { type: "overdue_caps", label: "Overdue Improvement Plans", kind: "stat", icon: AlertTriangle, tone: "red", goto: "caps" },
  { type: "advisory_cycles", label: "Advisory Cycles", kind: "stat", icon: ClipboardList, tone: "purple", goto: "advisory" },
  { type: "open_risks", label: "Open Risks", kind: "stat", icon: AlertTriangle, tone: "amber", goto: "risk" },
  { type: "high_risks", label: "High / Very High Risks", kind: "stat", icon: AlertTriangle, tone: "red", goto: "risk" },
  { type: "open_grievances", label: "Open Grievances", kind: "stat", icon: Megaphone, tone: "red", goto: "grievance" },
  { type: "scheduled_trainings", label: "Scheduled Trainings", kind: "stat", icon: GraduationCap, tone: "blue", goto: "training" },
  { type: "pending_self_assessments", label: "Pending Self-Assessments", kind: "stat", icon: ListChecks, tone: "amber", goto: "assessment" },
  { type: "expiring_licenses", label: "Expiring / Expired Licenses", kind: "stat", icon: FileText, tone: "red", goto: "documents" },
  { type: "upcoming_visits", label: "Upcoming Visits", kind: "list", icon: CalendarClock, goto: "visits" },
  { type: "upcoming_audits", label: "Upcoming Audits", kind: "list", icon: ClipboardCheck, goto: "assessment" },
];

function computeWidget(type, ctx) {
  const { data } = ctx;
  const advisoryInScope = data.advisoryInfo.filter((a) => inScope(ctx, a.companyId));
  const advisoryIds = new Set(advisoryInScope.map((a) => a.id));
  const apInScope = data.assessmentPlans.filter((p) => advisoryIds.has(p.advisoryInfoId));
  const apIds = new Set(apInScope.map((p) => p.id));
  const capsInScope = data.caps.filter((c) => apIds.has(c.assessmentPlanId));
  const visitsInScope = data.visits.filter((v) => advisoryIds.has(v.advisoryInfoId));
  const risksInScope = data.riskAssessments.filter((r) => inScope(ctx, r.companyId));

  switch (type) {
    case "companies_count": return { value: ctx.visibleCompanies.length };
    case "open_caps": return { value: capsInScope.filter((c) => capStatusOf(c) !== "Completed").length };
    case "overdue_caps": return { value: capsInScope.filter((c) => capStatusOf(c) === "Overdue").length };
    case "advisory_cycles": return { value: advisoryInScope.length };
    case "open_risks": return { value: risksInScope.filter((r) => r.status !== "Closed").length };
    case "high_risks":
      return { value: risksInScope.filter((r) => r.status !== "Closed" && ["High", "Very High"].includes(riskLevelOf((r.likelihood || 0) * (r.severity || 0)))).length };
    case "open_grievances":
      return { value: data.grievances.filter((g) => inScope(ctx, g.companyId) && g.status !== "Resolved" && g.status !== "Closed").length };
    case "scheduled_trainings":
      return { value: data.trainings.filter((t) => inScope(ctx, t.companyId) && t.status === "Scheduled").length };
    case "pending_self_assessments":
      return { value: data.selfAssessments.filter((s) => inScope(ctx, s.companyId) && s.status === "Draft").length };
    case "expiring_licenses":
      return { value: data.licenses.filter((l) => inScope(ctx, l.companyId) && ["Expiring Soon", "Expired"].includes(licenseStatusOf(l))).length };
    case "upcoming_visits": {
      const items = [...visitsInScope].filter((v) => v.date >= todayISO()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3).map((v) => {
        const adv = data.advisoryInfo.find((a) => a.id === v.advisoryInfoId);
        const co = data.companies.find((c) => c.id === adv?.companyId);
        return { id: v.id, title: `${v.visitNumber} · ${co?.name || "—"}`, sub: `${fmtDate(v.date)} · ${v.startTime}–${v.endTime}` };
      });
      return { items };
    }
    case "upcoming_audits": {
      const items = [...apInScope].filter((a) => a.planAssessmentDate && a.planAssessmentDate >= todayISO()).sort((a, b) => a.planAssessmentDate.localeCompare(b.planAssessmentDate)).slice(0, 3).map((a) => {
        const adv = data.advisoryInfo.find((x) => x.id === a.advisoryInfoId);
        const co = data.companies.find((c) => c.id === adv?.companyId);
        return { id: a.id, title: a.auditNo || co?.name || "—", sub: `${co?.name || "—"} · Planned ${fmtDate(a.planAssessmentDate)}` };
      });
      return { items };
    }
    default: return { value: 0, items: [] };
  }
}

function CustomDashboardView({ ctx, dashboard, goto }) {
  const statWidgets = dashboard.widgets.filter((w) => DASHBOARD_WIDGET_CATALOG.find((c) => c.type === w.type)?.kind === "stat");
  const listWidgets = dashboard.widgets.filter((w) => DASHBOARD_WIDGET_CATALOG.find((c) => c.type === w.type)?.kind === "list");
  return (
    <div>
      <Header title={dashboard.name} subtitle={fmtDate(todayISO())} icon={LayoutDashboard} color={MODULE_COLORS.dashboard} />
      {statWidgets.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "14px 18px" }}>
          {statWidgets.map((w) => {
            const def = DASHBOARD_WIDGET_CATALOG.find((c) => c.type === w.type);
            const { value } = computeWidget(w.type, ctx);
            return <StatCard key={w.id} label={def.label} value={value} icon={def.icon} tone={def.tone} onClick={() => goto(def.goto)} />;
          })}
        </div>
      )}
      {listWidgets.map((w) => {
        const def = DASHBOARD_WIDGET_CATALOG.find((c) => c.type === w.type);
        const { items } = computeWidget(w.type, ctx);
        return (
          <div key={w.id}>
            <SectionLabel>{def.label}</SectionLabel>
            <div style={{ padding: "0 18px" }}>
              {(!items || items.length === 0) && <EmptyRow text="Nothing to show." />}
              {items?.map((it) => <Row key={it.id} onClick={() => goto(def.goto)} left={<def.icon size={16} color={T.accent} />} title={it.title} sub={it.sub} />)}
            </div>
          </div>
        );
      })}
      {dashboard.widgets.length === 0 && <EmptyState icon={LayoutDashboard} color={MODULE_COLORS.dashboard} title="Empty dashboard" hint="Ask an administrator to add widgets to this dashboard." />}
    </div>
  );
}

function DashboardBuilderView({ ctx }) {
  const { data } = ctx;
  const [form, setForm] = useState(null);
  return (
    <div>
      <Header title="Dashboard Builder" subtitle={`${data.customDashboards.length} custom dashboard${data.customDashboards.length === 1 ? "" : "s"}`} icon={LayoutDashboard} color={MODULE_COLORS.dashboard}
        action={<Btn small onClick={() => setForm({})}><Plus size={15} />New dashboard</Btn>} />
      <div style={{ padding: "10px 18px" }}>
        {data.customDashboards.length === 0 && <EmptyState icon={LayoutDashboard} color={MODULE_COLORS.dashboard} title="No custom dashboards yet" hint="Design a dashboard, then assign it to a user from their account." />}
        {data.customDashboards.map((d) => {
          const assignedCount = data.users.filter((u) => u.dashboardId === d.id).length;
          return (
            <Row key={d.id} onClick={() => setForm(d)} left={<LayoutDashboard size={16} color={T.accent} />}
              title={d.name} sub={`${d.widgets.length} widget${d.widgets.length === 1 ? "" : "s"} · assigned to ${assignedCount} user${assignedCount === 1 ? "" : "s"}`} />
          );
        })}
      </div>
      {form && <DashboardBuilderForm initial={form} ctx={ctx} onClose={() => setForm(null)} />}
    </div>
  );
}

function DashboardBuilderForm({ initial, ctx, onClose }) {
  const { update } = ctx;
  const [name, setName] = useState(initial.name || "");
  const [widgets, setWidgets] = useState(initial.widgets || []);

  const isSelected = (type) => widgets.some((w) => w.type === type);
  const toggle = (type) => {
    setWidgets((prev) => (isSelected(type) ? prev.filter((w) => w.type !== type) : [...prev, { id: uid("dw"), type }]));
  };
  const move = (idx, dir) => {
    setWidgets((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const save = () => {
    if (!name.trim()) return;
    const record = { id: initial.id || uid("dash"), name: name.trim(), widgets };
    update("customDashboards", (prev) => (initial.id && prev.some((x) => x.id === initial.id) ? prev.map((x) => (x.id === initial.id ? record : x)) : [...prev, record]));
    onClose();
  };
  const remove = () => {
    update("customDashboards", (prev) => prev.filter((x) => x.id !== initial.id));
    update("users", (prev) => prev.map((u) => (u.dashboardId === initial.id ? { ...u, dashboardId: "" } : u)));
    onClose();
  };

  return (
    <Sheet title={initial.id ? "Edit dashboard" : "New dashboard"} onClose={onClose}>
      <Field label="Dashboard name"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Executive Summary" /></Field>
      <Field label={`Widgets (${widgets.length} selected)`}>
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, maxHeight: 240, overflowY: "auto" }}>
          {DASHBOARD_WIDGET_CATALOG.map((wdef) => (
            <label key={wdef.type} style={{ display: "flex", gap: 8, alignItems: "center", padding: "9px 10px", borderTop: `1px solid ${T.border}`, cursor: "pointer" }}>
              <input type="checkbox" checked={isSelected(wdef.type)} onChange={() => toggle(wdef.type)} />
              <wdef.icon size={14} color={T.muted} />
              <span style={{ fontSize: 12.5, color: T.ink2 }}>{wdef.label}</span>
            </label>
          ))}
        </div>
      </Field>
      {widgets.length > 0 && (
        <Field label="Order">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {widgets.map((w, idx) => {
              const def = DASHBOARD_WIDGET_CATALOG.find((c) => c.type === w.type);
              return (
                <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: T.bg, borderRadius: 8 }}>
                  <span style={{ flex: 1, fontSize: 12.5, color: T.ink2 }}>{def?.label}</span>
                  <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} style={{ border: "none", background: "none", cursor: idx === 0 ? "default" : "pointer", opacity: idx === 0 ? 0.3 : 1, fontSize: 13 }}>▲</button>
                  <button type="button" onClick={() => move(idx, 1)} disabled={idx === widgets.length - 1} style={{ border: "none", background: "none", cursor: idx === widgets.length - 1 ? "default" : "pointer", opacity: idx === widgets.length - 1 ? 0.3 : 1, fontSize: 13 }}>▼</button>
                </div>
              );
            })}
          </div>
        </Field>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {initial.id && <Btn variant="danger" onClick={remove}><Trash2 size={15} /> Delete</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save}>Save</Btn>
      </div>
    </Sheet>
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
      <Header title="Overview" subtitle={fmtDate(todayISO())} icon={TrendingUp} color={MODULE_COLORS.dashboard} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "14px 18px" }}>
        <StatCard label="Companies" value={ctx.visibleCompanies.length} icon={Building2} tone="blue" onClick={() => goto("companies")} />
        <StatCard label="Open Improvement Plans" value={openCaps.length} icon={ShieldAlert} tone={openCaps.length ? "amber" : "green"} onClick={() => goto("caps")} />
        <StatCard label="Overdue" value={overdue.length} icon={AlertTriangle} tone={overdue.length ? "red" : "green"} onClick={() => goto("caps")} />
        <StatCard label="Advisory Cycles" value={advisoryInScope.length} icon={ClipboardList} tone="purple" onClick={() => goto("advisory")} />
      </div>

      <div style={{ margin: "6px 18px 18px", background: T.surface, borderRadius: 16, padding: 18, border: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <RingProgress pct={rate} />
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, color: T.ink }}>{rate}% resolved</div>
            <div style={{ fontSize: 12.5, color: T.muted }}>{completedCaps} of {capsInScope.length} improvement plans closed out</div>
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

      <SectionLabel>Upcoming audits</SectionLabel>
      <div style={{ padding: "0 18px" }}>
        {upcomingAssess.length === 0 && <EmptyRow text="No audits scheduled." />}
        {upcomingAssess.map((a) => {
          const adv = data.advisoryInfo.find((x) => x.id === a.advisoryInfoId);
          const co = data.companies.find((c) => c.id === adv?.companyId);
          return (
            <Row key={a.id} onClick={() => ctx.setDetail({ type: "assessment", id: a.id })} left={<ClipboardCheck size={17} color={T.blue} />}
              title={`${a.auditNo || co?.name || "—"}`} sub={`${co?.name || "—"} · Planned ${fmtDate(a.planAssessmentDate)}`} />
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
  const toneColors = { amber: T.amber, red: T.red, green: T.green, blue: T.blue, purple: T.purple };
  const color = toneColors[tone] || T.accent;
  return (
    <button onClick={onClick} className="lift-card" style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14,
      textAlign: "left", cursor: "pointer", fontFamily: "inherit",
    }}>
      <IconChip icon={Icon} color={color} size={34} iconSize={17} />
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
    trainings: data.trainings.filter((t) => t.companyId === id).length,
    grievances: data.grievances.filter((g) => g.companyId === id).length,
    policies: data.policies.filter((p) => p.companyId === id).length,
    licenses: data.licenses.filter((l) => l.companyId === id).length,
    auditRecords: data.auditRecords.filter((r) => r.companyId === id).length,
    selfAssessments: data.selfAssessments.filter((s) => s.companyId === id).length,
    riskAssessments: data.riskAssessments.filter((r) => r.companyId === id).length,
  };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const detail = total === 0 ? "" : ` This also permanently deletes ${total} related record(s): `
    + [
      counts.cycles && `${counts.cycles} advisory cycle(s)`,
      counts.visits && `${counts.visits} visit(s)`,
      counts.plans && `${counts.plans} audit plan(s)`,
      counts.caps && `${counts.caps} corrective action(s)`,
      counts.meetings && `${counts.meetings} meeting log(s)`,
      counts.committee && `${counts.committee} bipartite committee member(s)`,
      counts.users && `${counts.users} company user account(s)`,
      counts.trainings && `${counts.trainings} training record(s)`,
      counts.grievances && `${counts.grievances} grievance record(s)`,
      counts.policies && `${counts.policies} policy/procedure document(s)`,
      counts.licenses && `${counts.licenses} license/inspection record(s)`,
      counts.auditRecords && `${counts.auditRecords} recorded audit(s)`,
      counts.selfAssessments && `${counts.selfAssessments} self-assessment(s)`,
      counts.riskAssessments && `${counts.riskAssessments} risk assessment(s)`,
    ].filter(Boolean).join(", ") + ".";
  if (!window.confirm(`Delete ${company?.name || "this company"}?${detail} This cannot be undone.`)) return false;

  update("caps", (prev) => prev.filter((c) => !apIds.includes(c.assessmentPlanId)));
  update("assessmentPlans", (prev) => prev.filter((p) => !cycleIds.includes(p.advisoryInfoId)));
  update("visits", (prev) => prev.filter((v) => !cycleIds.includes(v.advisoryInfoId)));
  update("advisoryInfo", (prev) => prev.filter((a) => a.companyId !== id));
  update("meetingLogs", (prev) => prev.filter((m) => m.companyId !== id));
  update("bipartiteCommittee", (prev) => prev.filter((b) => b.companyId !== id));
  update("users", (prev) => prev.filter((u) => u.companyId !== id));
  update("trainings", (prev) => prev.filter((t) => t.companyId !== id));
  update("grievances", (prev) => prev.filter((g) => g.companyId !== id));
  update("policies", (prev) => prev.filter((p) => p.companyId !== id));
  update("licenses", (prev) => prev.filter((l) => l.companyId !== id));
  update("auditRecords", (prev) => prev.filter((r) => r.companyId !== id));
  update("selfAssessments", (prev) => prev.filter((s) => s.companyId !== id));
  update("riskAssessments", (prev) => prev.filter((r) => r.companyId !== id));
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
      <Header title="Companies" subtitle={`${list.length} registered`} icon={Building2} color={MODULE_COLORS.companies}
        action={hasPerm(ctx, "companies", "edit") ? <Btn small onClick={() => setForm({})}><Plus size={15} />New</Btn> : null} />
      <SearchBar value={q} onChange={setQ} placeholder="Search companies…" />
      <div style={{ padding: "6px 18px" }}>
        {list.length === 0 && <EmptyState icon={Building2} color={MODULE_COLORS.companies} title="No companies yet" hint="Add a company to start an advisory cycle." />}
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
      <Header title={c.name} subtitle={c.type} icon={Building2} color={MODULE_COLORS.companies} action={hasPerm(ctx, "companies", "edit") ? <Btn small onClick={() => setForm(c)}><Pencil size={13} />Edit</Btn> : null} />
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
   ADVISORY MANAGEMENT (groups Advisory Cycles, Advisory Visits, Meeting
   Logs, Bipartite Committee, and Improvement Plan under one nav entry)
----------------------------------------------------------------*/
const ADVISORY_MGMT_TABS = [
  { k: "advisory", l: "Advisory Cycles", perm: "advisory" },
  { k: "visits", l: "Advisory Visits", perm: "visits" },
  { k: "meetings", l: "Meeting Logs", perm: "meetings" },
  { k: "committee", l: "Bipartite Committee", perm: "committee" },
  { k: "caps", l: "Improvement Plan", perm: "caps" },
];

// Unlike AuditManagementView/DocumentationView's local tab state, this uses
// the outer App-level tab/setTab directly — each sub-tab is still a real,
// independently-linkable destination (Dashboard stat cards, custom
// dashboard widgets navigate straight to "caps"/"advisory"/"visits" via
// goto()), so the active sub-view has to stay driven by the same `tab`
// state those shortcuts already set.
function AdvisoryManagementView({ ctx, tab, setTab }) {
  const visibleTabs = ADVISORY_MGMT_TABS.filter((t) => hasPerm(ctx, t.perm, "view"));
  return (
    <div>
      <Header title="Advisory Management" subtitle="Cycles, visits, meetings, committee & improvement plans" icon={Briefcase} color={MODULE_COLORS.advisorymgmt} />
      <div style={{ display: "flex", gap: 6, padding: "10px 18px", flexWrap: "wrap" }}>
        {visibleTabs.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            flex: "1 1 120px", padding: "10px 6px", borderRadius: 10, border: `1px solid ${tab === t.k ? T.accent : T.border}`,
            background: tab === t.k ? T.accent : T.surface, color: tab === t.k ? "#fff" : T.ink2,
            fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>{t.l}</button>
        ))}
      </div>
      {tab === "advisory" && <AdvisoryView ctx={ctx} />}
      {tab === "visits" && <VisitsView ctx={ctx} />}
      {tab === "meetings" && <MeetingLogsView ctx={ctx} />}
      {tab === "committee" && <BipartiteCommitteeView ctx={ctx} />}
      {tab === "caps" && <CapsView ctx={ctx} />}
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
      <Header title="Advisory Cycles" subtitle={`${cycles.length} cycles tracked`} icon={ClipboardList} color={MODULE_COLORS.advisory}
        action={hasPerm(ctx, "advisory", "edit") ? <Btn small onClick={() => setForm({})}><Plus size={15} />New</Btn> : null} />
      <div style={{ padding: "10px 18px" }}>
        {cycles.length === 0 && <EmptyState icon={ClipboardList} color={MODULE_COLORS.advisory} title="No advisory cycles" hint="Create a cycle under a company." />}
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
      <Header title={a.cycleNumber} subtitle={co?.name} icon={ClipboardList} color={MODULE_COLORS.advisory} action={hasPerm(ctx, "advisory", "edit") ? <Btn small onClick={() => setForm(a)}><Pencil size={13} />Edit</Btn> : null} />
      <div style={{ padding: "0 18px" }}>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, marginBottom: 4 }}>
          <div style={{ fontSize: 13.5, color: T.ink2 }}>{fmtDate(a.startDate)} → {fmtDate(a.endDate)}</div>
          {a.remark && <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>{a.remark}</div>}
        </div>
      </div>
      <SectionLabel>Advisory Visits</SectionLabel>
      <div style={{ padding: "0 18px" }}>
        {visits.length === 0 && <EmptyRow text="No visits logged yet." />}
        {visits.map((v) => (
          <Row key={v.id} left={<CalendarClock size={16} color={T.accent} />} title={v.visitNumber} sub={`${fmtDate(v.date)} · ${v.startTime}–${v.endTime}`} />
        ))}
      </div>
      <SectionLabel>Audit Plan</SectionLabel>
      <div style={{ padding: "0 18px" }}>
        {plans.length === 0 && <EmptyRow text="No audit plan yet." />}
        {plans.map((p) => (
          <Row key={p.id} onClick={() => ctx.setDetail({ type: "assessment", id: p.id })} left={<ClipboardCheck size={16} color={T.blue} />}
            title={p.auditNo || `Planned ${fmtDate(p.planAssessmentDate)}`} sub={`${fmtDate(p.planAssessmentDate)} · ${p.status || "Planned"}`} />
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
      <Header title="Advisory Visits" subtitle={`${sorted.length} visits logged`} icon={CalendarClock} color={MODULE_COLORS.visits}
        action={canEdit ? <Btn small onClick={() => setForm({})}><Plus size={15} />Log visit</Btn> : null} />
      <div style={{ padding: "10px 18px" }}>
        {sorted.length === 0 && <EmptyState icon={CalendarClock} color={MODULE_COLORS.visits} title="No visits logged" hint="Record your first advisory visit." />}
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
   AUDIT MANAGEMENT — Audit Checklist, Audit Plan, Audit Management (records)
----------------------------------------------------------------*/
const AUDIT_TABS = [
  { k: "checklist", l: "Audit Checklist" },
  { k: "plan", l: "Audit Plan" },
  { k: "records", l: "Audit Management" },
  { k: "selfassessment", l: "Self-Assessment" },
];

function AuditManagementView({ ctx }) {
  const [tab, setTab] = useState("checklist");
  return (
    <div>
      <Header title="Audit Management" subtitle="Checklists, audit plans & recorded audits" icon={ClipboardCheck} color={MODULE_COLORS.assessment} />
      <div style={{ display: "flex", gap: 6, padding: "10px 18px" }}>
        {AUDIT_TABS.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            flex: 1, padding: "10px 6px", borderRadius: 10, border: `1px solid ${tab === t.k ? T.accent : T.border}`,
            background: tab === t.k ? T.accent : T.surface, color: tab === t.k ? "#fff" : T.ink2,
            fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>{t.l}</button>
        ))}
      </div>
      {tab === "checklist" && <AuditChecklistView ctx={ctx} />}
      {tab === "plan" && <AuditPlanView ctx={ctx} />}
      {tab === "records" && <AuditRecordsView ctx={ctx} />}
      {tab === "selfassessment" && <SelfAssessmentView ctx={ctx} />}
    </div>
  );
}

/* --- Audit Checklist: reusable bank of questions auditors check against --- */
const checklistThStyle = { textAlign: "left", padding: "10px 12px", fontSize: 11.5, fontWeight: 800, color: T.muted, letterSpacing: 0.3, textTransform: "uppercase", whiteSpace: "nowrap" };
const checklistTdStyle = { textAlign: "left", padding: "10px 12px", verticalAlign: "top", lineHeight: 1.4 };

const AUDIT_CHECKLIST_COLUMNS = [
  { key: "Question No.", field: "questionNo" },
  { key: "Category", field: "category" },
  { key: "Question", field: "question" },
  { key: "Legal Reference", field: "legalReference" },
];

function exportAuditChecklist(list) {
  const rows = list.map((c) => Object.fromEntries(AUDIT_CHECKLIST_COLUMNS.map((col) => [col.key, c[col.field] || ""])));
  exportExcel(rows, "Audit Checklist", `audit-checklist-${todayISO()}.xlsx`);
}

async function parseAuditChecklistExcel(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return rows
    .map((row) => ({
      id: uid("aq"),
      questionNo: String(row["Question No."] ?? row["Question No"] ?? "").trim(),
      category: CAP_CLUSTERS.includes(row["Category"]) ? row["Category"] : CAP_CLUSTERS[CAP_CLUSTERS.length - 1],
      question: String(row["Question"] ?? "").trim(),
      legalReference: String(row["Legal Reference"] ?? "").trim(),
    }))
    .filter((r) => r.question);
}

function AuditChecklistView({ ctx }) {
  const { data } = ctx;
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [form, setForm] = useState(null);
  const [importMsg, setImportMsg] = useState("");
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef(null);
  const canEdit = hasPerm(ctx, "assessment", "edit");

  const sorted = [...data.auditChecklists].sort((a, b) => (a.questionNo || "").localeCompare(b.questionNo || "", undefined, { numeric: true }) || (a.category || "").localeCompare(b.category || ""));
  const filtered = sorted
    .filter((c) => !categoryFilter || c.category === categoryFilter)
    .filter((c) => `${c.questionNo || ""} ${c.question} ${c.category || ""} ${c.legalReference || ""}`.toLowerCase().includes(q.toLowerCase()));

  const onImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg("");
    setImportError("");
    try {
      const imported = await parseAuditChecklistExcel(file);
      if (imported.length === 0) {
        setImportError("No valid rows found. Expected columns: Question No., Category, Question, Legal Reference.");
      } else {
        ctx.update("auditChecklists", (prev) => [...prev, ...imported]);
        setImportMsg(`Imported ${imported.length} question${imported.length === 1 ? "" : "s"}.`);
      }
    } catch {
      setImportError("Couldn't read that file — make sure it's a valid .xlsx or .xls file.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div>
      <div style={{ padding: "0 18px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12.5, color: T.muted }}>{filtered.length} of {sorted.length} questions</span>
        {canEdit && <Btn small onClick={() => setForm({})}><Plus size={15} />New question</Btn>}
      </div>
      <div style={{ display: "flex", gap: 8, padding: "0 18px 10px" }}>
        {canEdit && <Btn variant="ghost" small onClick={() => fileInputRef.current?.click()}><Upload size={13} /> Import Excel</Btn>}
        <Btn variant="ghost" small onClick={() => exportAuditChecklist(filtered)}><Download size={13} /> Export Excel</Btn>
        {canEdit && <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={onImportFile} style={{ display: "none" }} />}
      </div>
      {importMsg && <div style={{ padding: "0 18px 8px", fontSize: 12, color: T.green, fontWeight: 600 }}>{importMsg}</div>}
      {importError && <div style={{ padding: "0 18px 8px", fontSize: 12, color: T.red, fontWeight: 600 }}>{importError}</div>}
      <SearchBar value={q} onChange={setQ} placeholder="Search question no., question, category, legal reference…" />
      <div style={{ padding: "0 18px 10px" }}>
        <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All categories</option>
          {CAP_CLUSTERS.map((cl) => <option key={cl} value={cl}>{cl}</option>)}
        </Select>
      </div>
      <div style={{ padding: "10px 18px" }}>
        {filtered.length === 0 && <EmptyState icon={ListChecks} color={MODULE_COLORS.assessment} title="No checklist questions" hint="Add the first question for auditors to check against." />}
        {filtered.length > 0 && (
          <div style={{ overflowX: "auto", border: `1px solid ${T.border}`, borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: T.bg }}>
                  <th style={checklistThStyle}>Question No.</th>
                  <th style={checklistThStyle}>Category</th>
                  <th style={checklistThStyle}>Question</th>
                  <th style={checklistThStyle}>Legal Reference</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} onClick={canEdit ? () => setForm(c) : undefined} style={{ borderTop: `1px solid ${T.border}`, background: T.surface, cursor: canEdit ? "pointer" : "default" }}>
                    <td style={{ ...checklistTdStyle, color: T.ink2, fontWeight: 700, whiteSpace: "nowrap" }}>{c.questionNo || "—"}</td>
                    <td style={{ ...checklistTdStyle, whiteSpace: "nowrap" }}>{c.category ? <Pill tone="cyan">{c.category}</Pill> : <span style={{ color: T.muted }}>—</span>}</td>
                    <td style={{ ...checklistTdStyle, color: T.ink }}>{c.question}</td>
                    <td style={{ ...checklistTdStyle, color: c.legalReference ? T.ink2 : T.muted }}>{c.legalReference || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {form && <AuditChecklistForm initial={form} ctx={ctx} onClose={() => setForm(null)} />}
    </div>
  );
}

function AuditChecklistForm({ initial, ctx, onClose }) {
  const { update } = ctx;
  const [c, setC] = useState({ questionNo: "", question: "", category: CAP_CLUSTERS[0], legalReference: "", ...initial });
  const save = () => {
    if (!c.question.trim()) return;
    update("auditChecklists", (prev) => c.id && prev.some((x) => x.id === c.id) ? prev.map((x) => (x.id === c.id ? c : x)) : [...prev, { ...c, id: uid("aq") }]);
    onClose();
  };
  const remove = () => { update("auditChecklists", (prev) => prev.filter((x) => x.id !== c.id)); onClose(); };
  return (
    <Sheet title={initial.id ? "Edit checklist question" : "New checklist question"} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Question No."><TextInput value={c.questionNo} onChange={(e) => setC({ ...c, questionNo: e.target.value })} placeholder="e.g. Q-01" /></Field>
        <Field label="Category">
          <Select value={c.category} onChange={(e) => setC({ ...c, category: e.target.value })}>
            {CAP_CLUSTERS.map((cl) => <option key={cl}>{cl}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Question"><TextArea rows={3} value={c.question} onChange={(e) => setC({ ...c, question: e.target.value })} placeholder="e.g. Are all emergency exits unobstructed and clearly marked?" /></Field>
      <Field label="Legal reference"><TextInput value={c.legalReference} onChange={(e) => setC({ ...c, legalReference: e.target.value })} placeholder="e.g. Labor Law Art. 137" /></Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {initial.id && hasPerm(ctx, "assessment", "delete") && <Btn variant="danger" onClick={remove}><Trash2 size={15} /> Delete</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save}>Save</Btn>
      </div>
    </Sheet>
  );
}

/* --- Audit Plan: scheduled audits (Audit No, Audit date, Audit type, Status) --- */
function AuditPlanView({ ctx }) {
  const { data } = ctx;
  const [form, setForm] = useState(null);
  const plans = data.assessmentPlans.filter((p) => {
    const adv = data.advisoryInfo.find((a) => a.id === p.advisoryInfoId);
    return inScope(ctx, adv?.companyId);
  });
  return (
    <div>
      <div style={{ padding: "0 18px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12.5, color: T.muted }}>{plans.length} audit plans</span>
        {hasPerm(ctx, "assessment", "edit") && <Btn small onClick={() => setForm({})}><Plus size={15} />New</Btn>}
      </div>
      <div style={{ padding: "0 18px" }}>
        {plans.length === 0 && <EmptyState icon={ClipboardCheck} color={MODULE_COLORS.assessment} title="No audit plans" hint="Plan a new audit for a cycle." />}
        {plans.map((p) => {
          const adv = data.advisoryInfo.find((a) => a.id === p.advisoryInfoId);
          const co = data.companies.find((c) => c.id === adv?.companyId);
          return (
            <Row key={p.id} onClick={() => ctx.setDetail({ type: "assessment", id: p.id })} left={<ClipboardCheck size={16} color={T.blue} />}
              title={p.auditNo || co?.name || "Unassigned"} sub={`${co?.name || "—"} · ${fmtDate(p.planAssessmentDate)} · ${p.auditType || "—"}`}
              right={<Pill tone={p.status === "Completed" ? "green" : p.status === "Cancelled" ? "muted" : "blue"}>{p.status || "Planned"}</Pill>} />
          );
        })}
      </div>
      {form && <AuditPlanForm initial={form} ctx={ctx} onClose={() => setForm(null)} />}
    </div>
  );
}

function AuditPlanForm({ initial, ctx, onClose }) {
  const { data, update } = ctx;
  const scopedAdvisory = data.advisoryInfo.filter((a) => inScope(ctx, a.companyId));
  const [p, setP] = useState({ advisoryInfoId: scopedAdvisory[0]?.id || "", auditNo: "", planAssessmentDate: "", auditType: AUDIT_TYPES[0], status: AUDIT_PLAN_STATUSES[0], ...initial });
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
    <Sheet title={initial.id ? "Edit audit plan" : "New audit plan"} onClose={onClose}>
      <Field label="Advisory cycle">
        <Select value={p.advisoryInfoId} onChange={(e) => setP({ ...p, advisoryInfoId: e.target.value })}>
          {data.advisoryInfo.filter((a) => inScope(ctx, a.companyId)).map((a) => {
            const co = data.companies.find((c) => c.id === a.companyId);
            return <option key={a.id} value={a.id}>{a.cycleNumber} · {co?.name}</option>;
          })}
        </Select>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Audit No."><TextInput value={p.auditNo} onChange={(e) => setP({ ...p, auditNo: e.target.value })} placeholder="e.g. AUD-2026-01" /></Field>
        <Field label="Audit date"><TextInput type="date" value={p.planAssessmentDate} onChange={(e) => setP({ ...p, planAssessmentDate: e.target.value })} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Audit type">
          <Select value={p.auditType} onChange={(e) => setP({ ...p, auditType: e.target.value })}>
            {AUDIT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={p.status} onChange={(e) => setP({ ...p, status: e.target.value })}>
            {AUDIT_PLAN_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {initial.id && hasPerm(ctx, "assessment", "delete") && <Btn variant="danger" onClick={remove}><Trash2 size={15} /> Delete</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save}>Save</Btn>
      </div>
    </Sheet>
  );
}

function AuditPlanDetail({ id, ctx, onBack }) {
  const { data } = ctx;
  const p = data.assessmentPlans.find((x) => x.id === id);
  const [form, setForm] = useState(null);
  if (!p) return null;
  const adv = data.advisoryInfo.find((a) => a.id === p.advisoryInfoId);
  const co = data.companies.find((c) => c.id === adv?.companyId);
  const caps = data.caps.filter((c) => c.assessmentPlanId === id);
  return (
    <div>
      <div style={{ padding: "14px 18px 0" }}><Btn variant="ghost" small onClick={onBack}><ArrowLeft size={14} />All audit plans</Btn></div>
      <Header title={p.auditNo || co?.name || "Audit plan"} subtitle={co?.name} icon={ClipboardCheck} color={MODULE_COLORS.assessment} action={hasPerm(ctx, "assessment", "edit") ? <Btn small onClick={() => setForm(p)}><Pencil size={13} />Edit</Btn> : null} />
      <div style={{ padding: "0 18px" }}>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
          <div><div style={{ color: T.muted, fontSize: 11.5, fontWeight: 700 }}>AUDIT NO.</div>{p.auditNo || "—"}</div>
          <div><div style={{ color: T.muted, fontSize: 11.5, fontWeight: 700 }}>AUDIT DATE</div>{fmtDate(p.planAssessmentDate)}</div>
          <div><div style={{ color: T.muted, fontSize: 11.5, fontWeight: 700 }}>AUDIT TYPE</div>{p.auditType || "—"}</div>
          <div><div style={{ color: T.muted, fontSize: 11.5, fontWeight: 700 }}>STATUS</div>{p.status || "Planned"}</div>
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
      {form && <AuditPlanForm initial={form} ctx={ctx} onClose={() => setForm(null)} />}
    </div>
  );
}

/* --- Audit Management (recording): actual audits per factory, with NC detail --- */
function AuditRecordsView({ ctx }) {
  const { data } = ctx;
  const [companyFilter, setCompanyFilter] = useState("");
  const [form, setForm] = useState(null);
  const canEdit = hasPerm(ctx, "assessment", "edit");

  const sorted = [...data.auditRecords].filter((r) => inScope(ctx, r.companyId)).sort((a, b) => (b.auditDate || "").localeCompare(a.auditDate || ""));
  const filtered = sorted.filter((r) => !companyFilter || r.companyId === companyFilter);

  return (
    <div>
      <div style={{ padding: "0 18px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12.5, color: T.muted }}>{sorted.length} audits recorded</span>
        {canEdit && <Btn small onClick={() => setForm({})}><Plus size={15} />Record audit</Btn>}
      </div>
      <div style={{ padding: "0 18px 10px" }}>
        <Select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
          <option value="">All factories</option>
          {ctx.visibleCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      <div style={{ padding: "0 18px" }}>
        {filtered.length === 0 && <EmptyState icon={ShieldCheck} color={MODULE_COLORS.assessment} title="No audits recorded" hint="Record the result of a completed audit." />}
        {filtered.map((r) => {
          const co = data.companies.find((c) => c.id === r.companyId);
          const ncCount = (r.ncs || []).length;
          return (
            <Row key={r.id} onClick={() => ctx.setDetail({ type: "auditRecord", id: r.id })} left={<ShieldCheck size={16} color={T.amber} />}
              title={co?.name || "Unassigned"} sub={`${fmtDate(r.auditDate)} · ${r.auditType || "—"}`}
              right={ncCount > 0 ? <Pill tone="amber">{ncCount} NC{ncCount === 1 ? "" : "s"}</Pill> : <Pill tone="green">Clear</Pill>} />
          );
        })}
      </div>
      {form && <AuditRecordForm initial={form} ctx={ctx} onClose={() => setForm(null)} />}
    </div>
  );
}

function AuditRecordForm({ initial, ctx, onClose }) {
  const { update } = ctx;
  const [r, setR] = useState({
    companyId: ctx.scopeCompanyId && ctx.scopeCompanyId !== "__unassigned__" ? ctx.scopeCompanyId : (ctx.visibleCompanies[0]?.id || ""),
    auditDate: todayISO(), auditType: AUDIT_TYPES[0], ncs: [],
    ...initial,
  });
  const save = () => {
    if (!r.companyId || !r.auditDate) return;
    update("auditRecords", (prev) => r.id && prev.some((x) => x.id === r.id) ? prev.map((x) => (x.id === r.id ? r : x)) : [...prev, { ...r, id: uid("ar"), ncs: r.ncs || [] }]);
    onClose();
  };
  const remove = () => { update("auditRecords", (prev) => prev.filter((x) => x.id !== r.id)); onClose(); };
  return (
    <Sheet title={initial.id ? "Edit audit record" : "Record audit"} onClose={onClose}>
      <Field label="Factory / Company">
        <Select value={r.companyId} onChange={(e) => setR({ ...r, companyId: e.target.value })}>
          {ctx.visibleCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Audit date"><TextInput type="date" value={r.auditDate} onChange={(e) => setR({ ...r, auditDate: e.target.value })} /></Field>
        <Field label="Audit type">
          <Select value={r.auditType} onChange={(e) => setR({ ...r, auditType: e.target.value })}>
            {AUDIT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {initial.id && hasPerm(ctx, "assessment", "delete") && <Btn variant="danger" onClick={remove}><Trash2 size={15} /> Delete</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save}>Save</Btn>
      </div>
    </Sheet>
  );
}

function AuditRecordDetail({ id, ctx, onBack }) {
  const { data } = ctx;
  const r = data.auditRecords.find((x) => x.id === id);
  const [form, setForm] = useState(null);
  const [ncForm, setNcForm] = useState(null);
  if (!r) return null;
  const co = data.companies.find((c) => c.id === r.companyId);
  const canEdit = hasPerm(ctx, "assessment", "edit");
  const ncs = r.ncs || [];
  return (
    <div>
      <div style={{ padding: "14px 18px 0" }}><Btn variant="ghost" small onClick={onBack}><ArrowLeft size={14} />All audits</Btn></div>
      <Header title={co?.name || "Audit record"} subtitle={`${fmtDate(r.auditDate)} · ${r.auditType || "—"}`} icon={ShieldCheck} color={MODULE_COLORS.assessment} action={canEdit ? <Btn small onClick={() => setForm(r)}><Pencil size={13} />Edit</Btn> : null} />
      <div style={{ padding: "0 18px" }}>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
          <div><div style={{ color: T.muted, fontSize: 11.5, fontWeight: 700 }}>AUDIT DATE</div>{fmtDate(r.auditDate)}</div>
          <div><div style={{ color: T.muted, fontSize: 11.5, fontWeight: 700 }}>AUDIT TYPE</div>{r.auditType || "—"}</div>
          <div><div style={{ color: T.muted, fontSize: 11.5, fontWeight: 700 }}>NUMBER OF NCs</div>{ncs.length}</div>
        </div>
      </div>
      <div style={{ padding: "6px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <SectionLabel>Non-compliances (NCs)</SectionLabel>
        {canEdit && <Btn small variant="ghost" onClick={() => setNcForm({})}><Plus size={13} />Add NC</Btn>}
      </div>
      <div style={{ padding: "0 18px" }}>
        {ncs.length === 0 && <EmptyRow text="No non-compliances recorded for this audit." />}
        {ncs.map((nc) => (
          <Row key={nc.id} onClick={canEdit ? () => setNcForm(nc) : undefined} left={<AlertTriangle size={16} color={T.amber} />}
            title={nc.description} sub={nc.status || "Open"}
            right={<Pill tone={nc.severity === "Critical" ? "red" : nc.severity === "Major" ? "amber" : "muted"}>{nc.severity || "Minor"}</Pill>} />
        ))}
      </div>
      {form && <AuditRecordForm initial={form} ctx={ctx} onClose={() => setForm(null)} />}
      {ncForm && <AuditNcForm record={r} initial={ncForm} ctx={ctx} onClose={() => setNcForm(null)} />}
    </div>
  );
}

function AuditNcForm({ record, initial, ctx, onClose }) {
  const { update } = ctx;
  const [nc, setNc] = useState({ description: "", severity: AUDIT_NC_SEVERITIES[0], status: AUDIT_NC_STATUSES[0], ...initial });
  const save = () => {
    if (!nc.description.trim()) return;
    update("auditRecords", (prev) => prev.map((r) => {
      if (r.id !== record.id) return r;
      const existing = r.ncs || [];
      const next = nc.id && existing.some((x) => x.id === nc.id)
        ? existing.map((x) => (x.id === nc.id ? nc : x))
        : [...existing, { ...nc, id: uid("nc") }];
      return { ...r, ncs: next };
    }));
    onClose();
  };
  const remove = () => {
    update("auditRecords", (prev) => prev.map((r) => r.id === record.id ? { ...r, ncs: (r.ncs || []).filter((x) => x.id !== nc.id) } : r));
    onClose();
  };
  return (
    <Sheet title={initial.id ? "Edit non-compliance" : "Add non-compliance"} onClose={onClose}>
      <Field label="Description"><TextArea rows={3} value={nc.description} onChange={(e) => setNc({ ...nc, description: e.target.value })} placeholder="Describe the non-compliance found…" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Severity">
          <Select value={nc.severity} onChange={(e) => setNc({ ...nc, severity: e.target.value })}>
            {AUDIT_NC_SEVERITIES.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={nc.status} onChange={(e) => setNc({ ...nc, status: e.target.value })}>
            {AUDIT_NC_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {initial.id && hasPerm(ctx, "assessment", "delete") && <Btn variant="danger" onClick={remove}><Trash2 size={15} /> Delete</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save}>Save</Btn>
      </div>
    </Sheet>
  );
}

/* --- Self-Assessment: factory conducts self-assessment against assigned checklist questions --- */
function selfAssessmentAnswerTone(answer) {
  return answer === "Compliant" ? "green" : answer === "Non-Compliant" ? "red" : answer === "N/A" ? "muted" : "amber";
}

function SelfAssessmentView({ ctx }) {
  const { data } = ctx;
  const [form, setForm] = useState(null);
  const canAssign = hasPerm(ctx, "assessment", "edit");
  const isCompanyUser = ctx.role.role === "user";

  const list = [...data.selfAssessments].filter((s) => inScope(ctx, s.companyId)).sort((a, b) => (b.assignedDate || "").localeCompare(a.assignedDate || ""));

  return (
    <div>
      <div style={{ padding: "0 18px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12.5, color: T.muted }}>{list.length} self-assessments</span>
        {canAssign && <Btn small onClick={() => setForm({})}><Plus size={15} />Assign</Btn>}
      </div>
      <div style={{ padding: "0 18px" }}>
        {list.length === 0 && (
          <EmptyState icon={ListChecks} color={MODULE_COLORS.assessment} title="No self-assessments"
            hint={isCompanyUser ? "No self-assessment has been assigned to you yet." : "Assign checklist questions to a factory for self-assessment."} />
        )}
        {list.map((s) => {
          const co = data.companies.find((c) => c.id === s.companyId);
          const rows = s.questions || [];
          const answered = rows.filter((q) => q.answer).length;
          return (
            <Row key={s.id} onClick={() => ctx.setDetail({ type: "selfAssessment", id: s.id })} left={<ListChecks size={16} color={T.cyan} />}
              title={co?.name || "Unassigned"} sub={`${fmtDate(s.assignedDate)} → ${fmtDate(s.dueDate)} · ${answered}/${rows.length} answered`}
              right={<Pill tone={s.status === "Reviewed" ? "green" : s.status === "Submitted" ? "blue" : "amber"}>{s.status}</Pill>} />
          );
        })}
      </div>
      {form && <SelfAssessmentForm initial={form} ctx={ctx} onClose={() => setForm(null)} />}
    </div>
  );
}

function SelfAssessmentForm({ ctx, onClose }) {
  const { data, update } = ctx;
  const [companyId, setCompanyId] = useState(ctx.visibleCompanies[0]?.id || "");
  const [assignedDate, setAssignedDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set(data.auditChecklists.map((q) => q.id)));

  const toggle = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const save = () => {
    if (!companyId || selectedIds.size === 0) return;
    const questions = data.auditChecklists.filter((q) => selectedIds.has(q.id))
      .map((q) => ({ questionId: q.id, questionNo: q.questionNo, question: q.question, category: q.category, answer: "", remark: "" }));
    const record = { id: uid("sa"), companyId, assignedDate, dueDate, status: "Draft", questions };
    update("selfAssessments", (prev) => [...prev, record]);
    onClose();
  };

  return (
    <Sheet title="Assign self-assessment" onClose={onClose}>
      <Field label="Factory / Company">
        <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
          {ctx.visibleCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Assigned date"><TextInput type="date" value={assignedDate} onChange={(e) => setAssignedDate(e.target.value)} /></Field>
        <Field label="Due date"><TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
      </div>
      <Field label={`Assigned questions (${selectedIds.size}/${data.auditChecklists.length})`}>
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, maxHeight: 260, overflowY: "auto" }}>
          {data.auditChecklists.length === 0 && <div style={{ padding: 12, fontSize: 12.5, color: T.muted }}>No checklist questions exist yet — add some in Audit Checklist first.</div>}
          {data.auditChecklists.map((qz) => (
            <label key={qz.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "9px 10px", borderTop: `1px solid ${T.border}`, cursor: "pointer" }}>
              <input type="checkbox" checked={selectedIds.has(qz.id)} onChange={() => toggle(qz.id)} style={{ marginTop: 3 }} />
              <span style={{ fontSize: 12.5, color: T.ink2 }}>
                {qz.questionNo && <b style={{ color: T.ink }}>{qz.questionNo} · </b>}{qz.question}
              </span>
            </label>
          ))}
        </div>
      </Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={!companyId || selectedIds.size === 0}>Assign</Btn>
      </div>
    </Sheet>
  );
}

function SelfAssessmentDetail({ id, ctx, onBack }) {
  const { data, update } = ctx;
  const sa = data.selfAssessments.find((x) => x.id === id);
  const [rows, setRows] = useState(() => (sa?.questions || []).map((q) => ({ ...q })));
  if (!sa) return null;
  const co = data.companies.find((c) => c.id === sa.companyId);
  const canManage = hasPerm(ctx, "assessment", "edit");
  const canFill = sa.status === "Draft" && inScope(ctx, sa.companyId) && (ctx.role.role === "user" || canManage);

  const setRow = (qId, patch) => setRows((prev) => prev.map((r) => (r.questionId === qId ? { ...r, ...patch } : r)));
  const saveResponses = () => update("selfAssessments", (prev) => prev.map((s) => (s.id === sa.id ? { ...s, questions: rows } : s)));
  const submit = () => update("selfAssessments", (prev) => prev.map((s) => (s.id === sa.id ? { ...s, questions: rows, status: "Submitted" } : s)));
  const markReviewed = () => update("selfAssessments", (prev) => prev.map((s) => (s.id === sa.id ? { ...s, status: "Reviewed" } : s)));
  const reopen = () => update("selfAssessments", (prev) => prev.map((s) => (s.id === sa.id ? { ...s, status: "Draft" } : s)));
  const remove = () => { update("selfAssessments", (prev) => prev.filter((s) => s.id !== sa.id)); onBack(); };

  const answeredCount = rows.filter((r) => r.answer).length;
  const ncCount = rows.filter((r) => r.answer === "Non-Compliant").length;

  return (
    <div>
      <div style={{ padding: "14px 18px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Btn variant="ghost" small onClick={onBack}><ArrowLeft size={14} />All self-assessments</Btn>
        {hasPerm(ctx, "assessment", "delete") && <Btn variant="danger" small onClick={remove}><Trash2 size={13} />Delete</Btn>}
      </div>
      <Header title={co?.name || "Self-assessment"} subtitle={`${fmtDate(sa.assignedDate)} → ${fmtDate(sa.dueDate)}`} icon={ListChecks} color={MODULE_COLORS.assessment}
        action={<Pill tone={sa.status === "Reviewed" ? "green" : sa.status === "Submitted" ? "blue" : "amber"}>{sa.status}</Pill>} />
      <div style={{ padding: "0 18px" }}>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13, marginBottom: 4 }}>
          <div><div style={{ color: T.muted, fontSize: 11.5, fontWeight: 700 }}>ANSWERED</div>{answeredCount} / {rows.length}</div>
          <div><div style={{ color: T.muted, fontSize: 11.5, fontWeight: 700 }}>NON-COMPLIANT</div>{ncCount}</div>
        </div>
      </div>
      <SectionLabel>Assigned questions</SectionLabel>
      <div style={{ padding: "0 18px" }}>
        {rows.length === 0 && <EmptyRow text="No questions were assigned." />}
        {rows.map((r) => (
          <div key={r.questionId} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <span style={{ fontSize: 14, color: T.ink }}>{r.questionNo && <b>{r.questionNo} · </b>}{r.question}</span>
              {r.category && <Pill tone="cyan">{r.category}</Pill>}
            </div>
            {canFill ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                  {SELF_ASSESSMENT_ANSWERS.map((a) => (
                    <button key={a} onClick={() => setRow(r.questionId, { answer: a })} style={{
                      padding: "7px 12px", borderRadius: 999, border: `1px solid ${r.answer === a ? T.accent : T.border}`,
                      background: r.answer === a ? T.accent : T.surface, color: r.answer === a ? "#fff" : T.ink2,
                      fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    }}>{a}</button>
                  ))}
                </div>
                <TextArea rows={2} value={r.remark} onChange={(e) => setRow(r.questionId, { remark: e.target.value })} placeholder="Remark / evidence (optional)" />
              </div>
            ) : (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Pill tone={selfAssessmentAnswerTone(r.answer)}>{r.answer || "Not answered"}</Pill>
                {r.remark && <span style={{ fontSize: 12.5, color: T.ink2 }}>{r.remark}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
      {canFill && (
        <div style={{ display: "flex", gap: 10, padding: "10px 18px 4px" }}>
          <Btn variant="ghost" onClick={saveResponses}>Save progress</Btn>
          <div style={{ flex: 1 }} />
          <Btn onClick={submit}>Submit self-assessment</Btn>
        </div>
      )}
      {canManage && sa.status === "Submitted" && (
        <div style={{ display: "flex", gap: 10, padding: "10px 18px 4px" }}>
          <Btn variant="ghost" onClick={reopen}>Return to factory</Btn>
          <div style={{ flex: 1 }} />
          <Btn onClick={markReviewed}>Mark reviewed</Btn>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   RISK ASSESSMENT
----------------------------------------------------------------*/
const RISK_LEVEL_FILTERS = ["All", "Low", "Medium", "High", "Very High"];

function RiskAssessmentView({ ctx }) {
  const { data } = ctx;
  const [q, setQ] = useState("");
  const [levelFilter, setLevelFilter] = useState("All");
  const [companyFilter, setCompanyFilter] = useState("");
  const [form, setForm] = useState(null);
  const canEdit = hasPerm(ctx, "risk", "edit");

  const enriched = data.riskAssessments
    .filter((r) => inScope(ctx, r.companyId))
    .map((r) => {
      const score = (r.likelihood || 0) * (r.severity || 0);
      return { ...r, score, level: riskLevelOf(score) };
    })
    .sort((a, b) => b.score - a.score || (b.date || "").localeCompare(a.date || ""));

  const filtered = enriched.filter((r) => {
    if (levelFilter !== "All" && r.level !== levelFilter) return false;
    if (companyFilter && r.companyId !== companyFilter) return false;
    const co = data.companies.find((c) => c.id === r.companyId);
    const hay = `${r.description} ${r.area || ""} ${r.category || ""} ${co?.name || ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div>
      <Header title="Risk Assessment" subtitle={`${enriched.length} identified risks`} icon={AlertTriangle} color={MODULE_COLORS.risk}
        action={canEdit ? <Btn small onClick={() => setForm({})}><Plus size={15} />New</Btn> : null} />
      <SearchBar value={q} onChange={setQ} placeholder="Search hazard, area, category…" />
      <div style={{ display: "flex", gap: 6, padding: "10px 18px", overflowX: "auto" }}>
        {RISK_LEVEL_FILTERS.map((f) => (
          <button key={f} onClick={() => setLevelFilter(f)} style={{
            padding: "7px 12px", borderRadius: 999, border: `1px solid ${levelFilter === f ? T.accent : T.border}`,
            background: levelFilter === f ? T.accent : T.surface, color: levelFilter === f ? "#fff" : T.ink2,
            fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", cursor: "pointer", fontFamily: "inherit",
          }}>{f}</button>
        ))}
      </div>
      <div style={{ padding: "0 18px 10px" }}>
        <Select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
          <option value="">All factories</option>
          {ctx.visibleCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      <div style={{ padding: "0 18px" }}>
        {filtered.length === 0 && <EmptyState icon={AlertTriangle} color={MODULE_COLORS.risk} title="No risks found" hint="Identify a hazard or non-compliance issue and rate its risk." />}
        {filtered.map((r) => {
          const co = data.companies.find((c) => c.id === r.companyId);
          return (
            <div key={r.id} onClick={canEdit ? () => setForm(r) : undefined} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 8, cursor: canEdit ? "pointer" : "default" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 14.5, color: T.ink }}>{r.riskNo ? `${r.riskNo} · ` : ""}{co?.name || "Unassigned"}</span>
                <Pill tone={riskLevelTone(r.level)}>{r.level} · {r.score}</Pill>
              </div>
              {(r.hazard || r.area) && <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 4 }}>{r.hazard}{r.hazard && r.area ? " · " : ""}{r.area}</div>}
              <div style={{ fontSize: 13, color: T.ink2, marginTop: 8 }}>{r.description}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                {r.category && <Pill tone="cyan">{r.category}</Pill>}
                <span style={{ fontSize: 11.5, color: T.muted }}>Likelihood {r.likelihood} × Severity {r.severity}</span>
                <Pill tone={r.status === "Closed" ? "green" : r.status === "In Progress" ? "blue" : "amber"}>{r.status}</Pill>
                {r.actualCompletionDate && <span style={{ fontSize: 11.5, color: T.muted }}>Completed {fmtDate(r.actualCompletionDate)}</span>}
              </div>
              {r.recommendedActions && (
                <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 8, background: T.bg, padding: 8, borderRadius: 8 }}>
                  <span style={{ fontWeight: 700, color: T.muted }}>Recommended action: </span>{r.recommendedActions}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {form && <RiskAssessmentForm initial={form} ctx={ctx} onClose={() => setForm(null)} />}
    </div>
  );
}

// Caps aren't directly companyId-scoped (they hang off an audit plan, which
// hangs off an advisory cycle) — this walks that chain so a risk can only
// link to a CAP belonging to the same factory it was raised against.
function capsForCompany(data, companyId) {
  return data.caps.filter((c) => {
    const ap = data.assessmentPlans.find((a) => a.id === c.assessmentPlanId);
    const adv = data.advisoryInfo.find((a) => a.id === ap?.advisoryInfoId);
    return adv?.companyId === companyId;
  });
}

function RiskAssessmentForm({ initial, ctx, onClose }) {
  const { data, update } = ctx;
  const [r, setR] = useState({
    companyId: ctx.scopeCompanyId && ctx.scopeCompanyId !== "__unassigned__" ? ctx.scopeCompanyId : (ctx.visibleCompanies[0]?.id || ""),
    riskNo: "", date: todayISO(), area: "", category: CAP_CLUSTERS[0], hazard: "", description: "",
    likelihood: 3, severity: 3, existingControls: "", recommendedActions: "",
    assignedTo: "", targetDate: "", actualCompletionDate: "", status: RISK_STATUSES[0], linkedCapId: "",
    ...initial,
  });
  const score = (r.likelihood || 0) * (r.severity || 0);
  const level = riskLevelOf(score);
  const companyCaps = capsForCompany(data, r.companyId);

  // Entering an actual completion date means the risk is done — status can
  // only be "Closed" while a date is set, so the two fields can never say
  // different things (e.g. a completion date on a still-"Open" risk).
  const setActualCompletionDate = (val) => {
    setR((prev) => ({ ...prev, actualCompletionDate: val, status: val ? "Closed" : prev.status }));
  };

  const save = () => {
    if (!r.companyId || !r.description.trim()) return;
    const record = { ...r, status: r.actualCompletionDate ? "Closed" : r.status };
    update("riskAssessments", (prev) => record.id && prev.some((x) => x.id === record.id) ? prev.map((x) => (x.id === record.id ? record : x)) : [...prev, { ...record, id: uid("ra") }]);
    onClose();
  };
  const remove = () => { update("riskAssessments", (prev) => prev.filter((x) => x.id !== r.id)); onClose(); };

  return (
    <Sheet title={initial.id ? "Edit risk assessment" : "New risk assessment"} onClose={onClose}>
      <Field label="Factory / Company">
        <Select value={r.companyId} onChange={(e) => setR({ ...r, companyId: e.target.value })}>
          {ctx.visibleCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Risk No."><TextInput value={r.riskNo} onChange={(e) => setR({ ...r, riskNo: e.target.value })} placeholder="e.g. RA-01" /></Field>
        <Field label="Identified date"><TextInput type="date" value={r.date} onChange={(e) => setR({ ...r, date: e.target.value })} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Area / Location"><TextInput value={r.area} onChange={(e) => setR({ ...r, area: e.target.value })} placeholder="e.g. Sewing Line 2" /></Field>
        <Field label="Category">
          <Select value={r.category} onChange={(e) => setR({ ...r, category: e.target.value })}>
            {CAP_CLUSTERS.map((cl) => <option key={cl}>{cl}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Hazard"><TextInput value={r.hazard} onChange={(e) => setR({ ...r, hazard: e.target.value })} placeholder="e.g. Blocked emergency exit" /></Field>
      <Field label="Risk description">
        <TextArea rows={3} value={r.description} onChange={(e) => setR({ ...r, description: e.target.value })} placeholder="Describe the risk scenario and its potential consequence…" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Likelihood (1-5)">
          <Select value={r.likelihood} onChange={(e) => setR({ ...r, likelihood: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} — {RISK_LIKELIHOOD_LABELS[n - 1]}</option>)}
          </Select>
        </Field>
        <Field label="Severity (1-5)">
          <Select value={r.severity} onChange={(e) => setR({ ...r, severity: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} — {RISK_SEVERITY_LABELS[n - 1]}</option>)}
          </Select>
        </Field>
      </div>
      <div style={{ background: T.bg, borderRadius: 10, padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ fontSize: 12.5, color: T.ink2, fontWeight: 700 }}>Risk score {r.likelihood} × {r.severity} = {score}</span>
        <Pill tone={riskLevelTone(level)}>{level}</Pill>
      </div>
      <Field label="Existing controls"><TextArea value={r.existingControls} onChange={(e) => setR({ ...r, existingControls: e.target.value })} placeholder="Controls already in place…" /></Field>
      <Field label="Recommended actions"><TextArea value={r.recommendedActions} onChange={(e) => setR({ ...r, recommendedActions: e.target.value })} placeholder="Actions to reduce likelihood/severity…" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Assigned to"><TextInput value={r.assignedTo} onChange={(e) => setR({ ...r, assignedTo: e.target.value })} /></Field>
        <Field label="Target date"><TextInput type="date" value={r.targetDate} onChange={(e) => setR({ ...r, targetDate: e.target.value })} /></Field>
      </div>
      <Field label="Actual completion date">
        <TextInput type="date" value={r.actualCompletionDate} onChange={(e) => setActualCompletionDate(e.target.value)} />
      </Field>
      <Field label="Status">
        <Select value={r.status} disabled={!!r.actualCompletionDate} onChange={(e) => setR({ ...r, status: e.target.value })}>
          {RISK_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </Select>
        {r.actualCompletionDate && <div style={{ fontSize: 11.5, color: T.muted, marginTop: 6 }}>Locked to Closed while an actual completion date is set — clear the date to change status.</div>}
      </Field>
      <Field label="Linked CAP (optional)">
        <Select value={r.linkedCapId} onChange={(e) => setR({ ...r, linkedCapId: e.target.value })}>
          <option value="">— None —</option>
          {companyCaps.map((c) => <option key={c.id} value={c.id}>{c.ncNumber} · {c.area}</option>)}
        </Select>
      </Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {initial.id && hasPerm(ctx, "risk", "delete") && <Btn variant="danger" onClick={remove}><Trash2 size={15} /> Delete</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save}>Save</Btn>
      </div>
    </Sheet>
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
      <Header title="Improvement Plan" subtitle={`${enriched.length} tracked`} icon={ShieldAlert} color={MODULE_COLORS.caps} action={canEdit ? <Btn small onClick={() => setForm({})}><Plus size={15} />New</Btn> : null} />
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
        {filtered.length === 0 && <EmptyState icon={ShieldAlert} color={MODULE_COLORS.caps} title="No matching improvement plans" hint="Try a different filter or add a new one." />}
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
            {c.rootCause && (
              <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                <span style={{ fontWeight: 700, color: T.muted }}>Root cause: </span>{c.rootCause}
              </div>
            )}
            {c.correctiveActions && (
              <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                <span style={{ fontWeight: 700, color: T.muted }}>Corrective actions: </span>{c.correctiveActions}
              </div>
            )}
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
    <Sheet title={initial.id ? "Edit improvement plan" : "New improvement plan"} onClose={onClose}>
      <Field label="Audit plan">
        <Select value={c.assessmentPlanId} onChange={(e) => setC({ ...c, assessmentPlanId: e.target.value })}>
          {scopedPlans.map((p) => {
            const adv = data.advisoryInfo.find((a) => a.id === p.advisoryInfoId);
            const co = data.companies.find((x) => x.id === adv?.companyId);
            return <option key={p.id} value={p.id}>{p.auditNo ? `${p.auditNo} · ` : ""}{co?.name} · {fmtDate(p.planAssessmentDate)}</option>;
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
        <TextArea rows={5} value={c.rootCause} onChange={(e) => setC({ ...c, rootCause: e.target.value })} placeholder="Pick from the list above, or type your own…" />
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
        <TextArea rows={5} value={c.correctiveActions} onChange={(e) => setC({ ...c, correctiveActions: e.target.value })} placeholder="Pick from the list above, or type your own…" />
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
      <Header title="Meeting Logs" subtitle={`${sorted.length} meetings recorded`} icon={MessageSquare} color={MODULE_COLORS.meetings} action={hasPerm(ctx, "meetings", "edit") ? <Btn small onClick={() => setForm({})}><Plus size={15} />New</Btn> : null} />
      <SearchBar value={q} onChange={setQ} placeholder="Search meetings, participants…" />
      <div style={{ padding: "6px 18px" }}>
        {filtered.length === 0 && <EmptyState icon={MessageSquare} color={MODULE_COLORS.meetings} title="No meeting logs" hint="Record your first meeting." />}
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
      <Header title="Bipartite Committee" subtitle={`${filtered.length} members`} icon={Scale} color={MODULE_COLORS.committee} action={canEdit ? <Btn small onClick={() => setForm({})}><Plus size={15} />New</Btn> : null} />
      <SearchBar value={q} onChange={setQ} placeholder="Search members…" />
      <div style={{ padding: "0 18px 6px" }}>
        <Select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
          <option value="">All companies</option>
          {ctx.visibleCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      <div style={{ padding: "10px 18px" }}>
        {filtered.length === 0 && <EmptyState icon={Scale} color={MODULE_COLORS.committee} title="No committee members" hint="Add members of the bipartite committee." />}
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

const CAP_RECOMMENDATION_COLUMNS = [
  { key: "NC No.", field: "ncNo" },
  { key: "Area", field: "area" },
  { key: "Cluster", field: "cluster" },
  { key: "Root Cause", field: "rootCause" },
  { key: "Proposed CA", field: "proposedCA" },
];

function exportCapRecommendations(list) {
  const rows = list.map((r) => Object.fromEntries(CAP_RECOMMENDATION_COLUMNS.map((c) => [c.key, r[c.field] || ""])));
  exportExcel(rows, "CAP Recommendations", `cap-recommendations-${todayISO()}.xlsx`);
}

async function parseCapRecommendationsExcel(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return rows
    .map((row) => ({
      id: uid("cr"),
      ncNo: String(row["NC No."] ?? row["NC No"] ?? "").trim(),
      area: String(row["Area"] ?? row["Areas of improvement"] ?? "").trim(),
      cluster: CAP_CLUSTERS.includes(row["Cluster"]) ? row["Cluster"] : CAP_CLUSTERS[CAP_CLUSTERS.length - 1],
      rootCause: String(row["Root Cause"] ?? "").trim(),
      proposedCA: String(row["Proposed CA"] ?? "").trim(),
    }))
    .filter((r) => r.ncNo && r.area);
}

function CapRecommendationsView({ ctx }) {
  const { data } = ctx;
  const [q, setQ] = useState("");
  const [clusterFilter, setClusterFilter] = useState("");
  const [form, setForm] = useState(null);
  const [importMsg, setImportMsg] = useState("");
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef(null);

  const filtered = data.capRecommendations.filter((r) => {
    if (clusterFilter && r.cluster !== clusterFilter) return false;
    const hay = `${r.ncNo} ${r.area} ${r.rootCause} ${r.proposedCA}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  const canEdit = hasPerm(ctx, "caprecs", "edit");

  const onImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg("");
    setImportError("");
    try {
      const imported = await parseCapRecommendationsExcel(file);
      if (imported.length === 0) {
        setImportError("No valid rows found. Expected columns: NC No., Area, Cluster, Root Cause, Proposed CA.");
      } else {
        ctx.update("capRecommendations", (prev) => [...prev, ...imported]);
        setImportMsg(`Imported ${imported.length} recommendation${imported.length === 1 ? "" : "s"}.`);
      }
    } catch {
      setImportError("Couldn't read that file — make sure it's a valid .xlsx or .xls file.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div>
      <Header title="CAP Recommendations" subtitle={`${data.capRecommendations.length} reference items`} icon={BookOpen} color={MODULE_COLORS.caprecs} action={canEdit ? <Btn small onClick={() => setForm({})}><Plus size={15} />New</Btn> : null} />
      <div style={{ display: "flex", gap: 8, padding: "0 18px 10px" }}>
        {canEdit && <Btn variant="ghost" small onClick={() => fileInputRef.current?.click()}><Upload size={13} /> Import Excel</Btn>}
        <Btn variant="ghost" small onClick={() => exportCapRecommendations(filtered)}><Download size={13} /> Export Excel</Btn>
        {canEdit && <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={onImportFile} style={{ display: "none" }} />}
      </div>
      {importMsg && <div style={{ padding: "0 18px 8px", fontSize: 12, color: T.green, fontWeight: 600 }}>{importMsg}</div>}
      {importError && <div style={{ padding: "0 18px 8px", fontSize: 12, color: T.red, fontWeight: 600 }}>{importError}</div>}
      <SearchBar value={q} onChange={setQ} placeholder="Search NC no., area, root cause…" />
      <div style={{ padding: "0 18px 6px" }}>
        <Select value={clusterFilter} onChange={(e) => setClusterFilter(e.target.value)}>
          <option value="">All clusters</option>
          {CAP_CLUSTERS.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>
      <div style={{ padding: "10px 18px" }}>
        {filtered.length === 0 && <EmptyState icon={BookOpen} color={MODULE_COLORS.caprecs} title="No recommendations" hint="Build a library of standard root causes and corrective actions." />}
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
   TRAINING
----------------------------------------------------------------*/
function TrainingView({ ctx }) {
  const { data } = ctx;
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [form, setForm] = useState(null);
  const canEdit = hasPerm(ctx, "training", "edit");

  const sorted = [...data.trainings].filter((t) => inScope(ctx, t.companyId)).sort((a, b) => b.date.localeCompare(a.date));
  const filtered = sorted.filter((t) => {
    if (statusFilter !== "All" && t.status !== statusFilter) return false;
    const co = data.companies.find((c) => c.id === t.companyId);
    const hay = `${t.topic} ${t.trainer} ${co?.name || ""} ${(t.participants || []).join(" ")}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div>
      <Header title="Training" subtitle={`${sorted.length} sessions`} icon={GraduationCap} color={MODULE_COLORS.training} action={canEdit ? <Btn small onClick={() => setForm({})}><Plus size={15} />New</Btn> : null} />
      <SearchBar value={q} onChange={setQ} placeholder="Search topic, trainer, participants…" />
      <div style={{ display: "flex", gap: 6, padding: "10px 18px", overflowX: "auto" }}>
        {["All", ...TRAINING_STATUSES].map((f) => (
          <button key={f} onClick={() => setStatusFilter(f)} style={{
            padding: "7px 12px", borderRadius: 999, border: `1px solid ${statusFilter === f ? T.accent : T.border}`,
            background: statusFilter === f ? T.accent : T.surface, color: statusFilter === f ? "#fff" : T.ink2,
            fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", cursor: "pointer", fontFamily: "inherit",
          }}>{f}</button>
        ))}
      </div>
      <div style={{ padding: "0 18px" }}>
        {filtered.length === 0 && <EmptyState icon={GraduationCap} color={MODULE_COLORS.training} title="No training sessions" hint="Schedule your first training session." />}
        {filtered.map((t) => {
          const co = data.companies.find((c) => c.id === t.companyId);
          return (
            <div key={t.id} onClick={canEdit ? () => setForm(t) : undefined} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 8, cursor: canEdit ? "pointer" : "default" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 14.5, color: T.ink }}>{t.topic}</span>
                <Pill tone={trainingTone(t.status)}>{t.status}</Pill>
              </div>
              {co && <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 4 }}>{co.name}</div>}
              <div style={{ fontSize: 12.5, color: T.muted, marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
                <Clock size={12} /> {fmtDate(t.date)} · {t.startTime}–{t.endTime} · {t.deliveryMode}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                {t.trainer && <span style={{ fontSize: 12, color: T.muted }}>Trainer: {t.trainer}</span>}
                {(t.participants || []).length > 0 && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: T.accentDark, fontWeight: 700, fontSize: 12 }}>
                    <UsersIcon size={12} /> {t.participants.length}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {form && <TrainingForm initial={form} ctx={ctx} onClose={() => setForm(null)} />}
    </div>
  );
}

function TrainingForm({ initial, ctx, onClose }) {
  const { update } = ctx;
  const initParticipants = (initial.participants || []).join("\n");
  const [t, setT] = useState({
    companyId: ctx.scopeCompanyId && ctx.scopeCompanyId !== "__unassigned__" ? ctx.scopeCompanyId : "",
    topic: "", trainer: "", date: todayISO(), startTime: "09:00", endTime: "11:00",
    deliveryMode: TRAINING_DELIVERY_MODES[0], status: TRAINING_STATUSES[0], location: "", notes: "",
    ...initial,
  });
  const [participantsText, setParticipantsText] = useState(initParticipants);

  const save = () => {
    if (!t.topic.trim() || !t.date) return;
    const participants = participantsText.split("\n").map((s) => s.trim()).filter(Boolean);
    const record = { ...t, participants };
    update("trainings", (prev) => record.id && prev.some((p) => p.id === record.id) ? prev.map((p) => (p.id === record.id ? record : p)) : [...prev, { ...record, id: uid("tr") }]);
    onClose();
  };
  const remove = () => { update("trainings", (prev) => prev.filter((p) => p.id !== t.id)); onClose(); };

  return (
    <Sheet title={initial.id ? "Edit training session" : "New training session"} onClose={onClose}>
      <Field label="Related company (optional)">
        <Select value={t.companyId} onChange={(e) => setT({ ...t, companyId: e.target.value })}>
          <option value="">— None —</option>
          {ctx.visibleCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Training topic"><TextInput value={t.topic} onChange={(e) => setT({ ...t, topic: e.target.value })} placeholder="e.g. Fire Safety & Emergency Response" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Trainer"><TextInput value={t.trainer} onChange={(e) => setT({ ...t, trainer: e.target.value })} /></Field>
        <Field label="Delivery mode">
          <Select value={t.deliveryMode} onChange={(e) => setT({ ...t, deliveryMode: e.target.value })}>
            {TRAINING_DELIVERY_MODES.map((m) => <option key={m}>{m}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Date"><TextInput type="date" value={t.date} onChange={(e) => setT({ ...t, date: e.target.value })} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Start time"><TextInput type="time" value={t.startTime} onChange={(e) => setT({ ...t, startTime: e.target.value })} /></Field>
        <Field label="End time"><TextInput type="time" value={t.endTime} onChange={(e) => setT({ ...t, endTime: e.target.value })} /></Field>
      </div>
      <Field label="Location"><TextInput value={t.location} onChange={(e) => setT({ ...t, location: e.target.value })} placeholder="e.g. Training Hall" /></Field>
      <Field label="Status">
        <Select value={t.status} onChange={(e) => setT({ ...t, status: e.target.value })}>
          {TRAINING_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </Select>
      </Field>
      <Field label="Participants (one name per line)">
        <TextArea rows={4} value={participantsText} onChange={(e) => setParticipantsText(e.target.value)} placeholder={"Sokha Chan\nRatanak Sok\n…"} />
      </Field>
      <Field label="Notes"><TextArea value={t.notes} onChange={(e) => setT({ ...t, notes: e.target.value })} placeholder="Topics covered, materials used…" /></Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {initial.id && hasPerm(ctx, "training", "delete") && <Btn variant="danger" onClick={remove}><Trash2 size={15} /> Delete</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save}>Save</Btn>
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------
   GRIEVANCE MECHANISM
----------------------------------------------------------------*/
function GrievanceView({ ctx }) {
  const { data } = ctx;
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [form, setForm] = useState(null);
  const canEdit = hasPerm(ctx, "grievance", "edit");

  const sorted = [...data.grievances].filter((g) => inScope(ctx, g.companyId)).sort((a, b) => b.dateReported.localeCompare(a.dateReported));
  const filtered = sorted.filter((g) => {
    if (statusFilter !== "All" && g.status !== statusFilter) return false;
    const co = data.companies.find((c) => c.id === g.companyId);
    const hay = `${g.category} ${g.description} ${co?.name || ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div>
      <Header title="Grievance Mechanism" subtitle={`${sorted.length} reports`} icon={Megaphone} color={MODULE_COLORS.grievance} action={canEdit ? <Btn small onClick={() => setForm({})}><Plus size={15} />New</Btn> : null} />
      <SearchBar value={q} onChange={setQ} placeholder="Search category, description…" />
      <div style={{ display: "flex", gap: 6, padding: "10px 18px", overflowX: "auto" }}>
        {["All", ...GRIEVANCE_STATUSES].map((f) => (
          <button key={f} onClick={() => setStatusFilter(f)} style={{
            padding: "7px 12px", borderRadius: 999, border: `1px solid ${statusFilter === f ? T.accent : T.border}`,
            background: statusFilter === f ? T.accent : T.surface, color: statusFilter === f ? "#fff" : T.ink2,
            fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", cursor: "pointer", fontFamily: "inherit",
          }}>{f}</button>
        ))}
      </div>
      <div style={{ padding: "0 18px" }}>
        {filtered.length === 0 && <EmptyState icon={Megaphone} color={MODULE_COLORS.grievance} title="No grievances recorded" hint="Log a worker complaint or report to begin tracking it." />}
        {filtered.map((g) => {
          const co = data.companies.find((c) => c.id === g.companyId);
          return (
            <div key={g.id} onClick={canEdit ? () => setForm(g) : undefined} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 8, cursor: canEdit ? "pointer" : "default" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, color: T.ink }}>{g.category}</span>
                <Pill tone={grievanceTone(g.status)}>{g.status}</Pill>
              </div>
              {co && <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 4 }}>{co.name}</div>}
              {g.description && (
                <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {g.description}
                </div>
              )}
              <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>
                Reported {fmtDate(g.dateReported)} · {g.reportedBy ? g.reportedBy : "Anonymous"} · via {g.channel}
              </div>
            </div>
          );
        })}
      </div>
      {form && <GrievanceForm initial={form} ctx={ctx} onClose={() => setForm(null)} />}
    </div>
  );
}

function GrievanceForm({ initial, ctx, onClose }) {
  const { update } = ctx;
  const [g, setG] = useState({
    companyId: ctx.scopeCompanyId && ctx.scopeCompanyId !== "__unassigned__" ? ctx.scopeCompanyId : "",
    dateReported: todayISO(), category: GRIEVANCE_CATEGORIES[0], channel: GRIEVANCE_CHANNELS[0],
    description: "", reportedBy: "", status: GRIEVANCE_STATUSES[0], assignedTo: "", resolution: "", resolvedDate: "",
    ...initial,
  });

  const save = () => {
    if (!g.dateReported || !g.description.trim()) return;
    update("grievances", (prev) => g.id && prev.some((p) => p.id === g.id) ? prev.map((p) => (p.id === g.id ? g : p)) : [...prev, { ...g, id: uid("gr") }]);
    onClose();
  };
  const remove = () => { update("grievances", (prev) => prev.filter((p) => p.id !== g.id)); onClose(); };

  return (
    <Sheet title={initial.id ? "Edit grievance report" : "New grievance report"} onClose={onClose}>
      <Field label="Related company">
        <Select value={g.companyId} onChange={(e) => setG({ ...g, companyId: e.target.value })}>
          <option value="">— None —</option>
          {ctx.visibleCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Date reported"><TextInput type="date" value={g.dateReported} onChange={(e) => setG({ ...g, dateReported: e.target.value })} /></Field>
        <Field label="Channel">
          <Select value={g.channel} onChange={(e) => setG({ ...g, channel: e.target.value })}>
            {GRIEVANCE_CHANNELS.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Category">
        <Select value={g.category} onChange={(e) => setG({ ...g, category: e.target.value })}>
          {GRIEVANCE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </Select>
      </Field>
      <Field label="Description"><TextArea rows={4} value={g.description} onChange={(e) => setG({ ...g, description: e.target.value })} placeholder="What was reported…" /></Field>
      <Field label="Reported by (optional — leave blank if anonymous)">
        <TextInput value={g.reportedBy} onChange={(e) => setG({ ...g, reportedBy: e.target.value })} placeholder="Worker name, or leave blank" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Status">
          <Select value={g.status} onChange={(e) => setG({ ...g, status: e.target.value })}>
            {GRIEVANCE_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Assigned to"><TextInput value={g.assignedTo} onChange={(e) => setG({ ...g, assignedTo: e.target.value })} /></Field>
      </div>
      <Field label="Resolution"><TextArea rows={3} value={g.resolution} onChange={(e) => setG({ ...g, resolution: e.target.value })} placeholder="How was this resolved…" /></Field>
      <Field label="Resolved date"><TextInput type="date" value={g.resolvedDate} onChange={(e) => setG({ ...g, resolvedDate: e.target.value })} /></Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {initial.id && hasPerm(ctx, "grievance", "delete") && <Btn variant="danger" onClick={remove}><Trash2 size={15} /> Delete</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save}>Save</Btn>
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------
   DOCUMENTATION
----------------------------------------------------------------*/
function DocumentationView({ ctx }) {
  const [tab, setTab] = useState("policies");
  return (
    <div>
      <Header title="Documentation" subtitle="Policies, procedures, licenses & inspections" icon={FolderOpen} color={MODULE_COLORS.documents} />
      <div style={{ display: "flex", gap: 6, padding: "10px 18px" }}>
        {[{ k: "policies", l: "Policy & Procedure" }, { k: "licenses", l: "License & Inspection" }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            flex: 1, padding: "10px 8px", borderRadius: 10, border: `1px solid ${tab === t.k ? T.accent : T.border}`,
            background: tab === t.k ? T.accent : T.surface, color: tab === t.k ? "#fff" : T.ink2,
            fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>{t.l}</button>
        ))}
      </div>
      {tab === "policies" ? <PolicyView ctx={ctx} /> : <LicenseView ctx={ctx} />}
    </div>
  );
}

function PolicyView({ ctx }) {
  const { data } = ctx;
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null);
  const canEdit = hasPerm(ctx, "documents", "edit");

  const sorted = [...data.policies].filter((p) => inScope(ctx, p.companyId)).sort((a, b) => (b.releasedDate || "").localeCompare(a.releasedDate || ""));
  const filtered = sorted.filter((p) => {
    const co = data.companies.find((c) => c.id === p.companyId);
    const hay = `${p.code} ${p.name} ${p.type} ${co?.name || ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div>
      <div style={{ padding: "0 18px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12.5, color: T.muted }}>{sorted.length} documents</span>
        {canEdit && <Btn small onClick={() => setForm({})}><Plus size={15} />New</Btn>}
      </div>
      <SearchBar value={q} onChange={setQ} placeholder="Search code, name, type…" />
      <div style={{ padding: "10px 18px" }}>
        {filtered.length === 0 && <EmptyState icon={FileText} color={MODULE_COLORS.documents} title="No policies or procedures" hint="Add your first policy or procedure document." />}
        {filtered.map((p) => {
          const co = data.companies.find((c) => c.id === p.companyId);
          return (
            <div key={p.id} onClick={canEdit ? () => setForm(p) : undefined} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 8, cursor: canEdit ? "pointer" : "default" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 14.5, color: T.ink }}>{p.code} · {p.name}</span>
                <Pill tone="accent">{p.type}</Pill>
              </div>
              {co && <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 4 }}>{co.name}</div>}
              <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>Version {p.version || "—"} · Released {fmtDate(p.releasedDate)}</div>
              {p.remark && <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.remark}</div>}
            </div>
          );
        })}
      </div>
      {form && <PolicyForm initial={form} ctx={ctx} onClose={() => setForm(null)} />}
    </div>
  );
}

function PolicyForm({ initial, ctx, onClose }) {
  const { update } = ctx;
  const [p, setP] = useState({
    companyId: ctx.scopeCompanyId && ctx.scopeCompanyId !== "__unassigned__" ? ctx.scopeCompanyId : "",
    code: "", name: "", version: "", releasedDate: todayISO(), type: DOC_TYPES[0], remark: "",
    ...initial,
  });

  const save = () => {
    if (!p.code.trim() || !p.name.trim()) return;
    update("policies", (prev) => p.id && prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, { ...p, id: uid("pol") }]);
    onClose();
  };
  const remove = () => { update("policies", (prev) => prev.filter((x) => x.id !== p.id)); onClose(); };

  return (
    <Sheet title={initial.id ? "Edit policy/procedure" : "New policy/procedure"} onClose={onClose}>
      <Field label="Related company (optional)">
        <Select value={p.companyId} onChange={(e) => setP({ ...p, companyId: e.target.value })}>
          <option value="">— None —</option>
          {ctx.visibleCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Code"><TextInput value={p.code} onChange={(e) => setP({ ...p, code: e.target.value })} placeholder="e.g. POL-01" /></Field>
        <Field label="Version"><TextInput value={p.version} onChange={(e) => setP({ ...p, version: e.target.value })} placeholder="e.g. v1.0" /></Field>
      </div>
      <Field label="Name"><TextInput value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="e.g. Code of Conduct" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Released date"><TextInput type="date" value={p.releasedDate} onChange={(e) => setP({ ...p, releasedDate: e.target.value })} /></Field>
        <Field label="Type">
          <Select value={p.type} onChange={(e) => setP({ ...p, type: e.target.value })}>
            {DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Remark"><TextArea value={p.remark} onChange={(e) => setP({ ...p, remark: e.target.value })} placeholder="Notes about scope, applicability…" /></Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {initial.id && hasPerm(ctx, "documents", "delete") && <Btn variant="danger" onClick={remove}><Trash2 size={15} /> Delete</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save}>Save</Btn>
      </div>
    </Sheet>
  );
}

function LicenseView({ ctx }) {
  const { data } = ctx;
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null);
  const canEdit = hasPerm(ctx, "documents", "edit");

  const sorted = [...data.licenses].filter((l) => inScope(ctx, l.companyId)).sort((a, b) => (a.expiredDate || "").localeCompare(b.expiredDate || ""));
  const filtered = sorted.filter((l) => {
    const co = data.companies.find((c) => c.id === l.companyId);
    const hay = `${l.docNo} ${l.name} ${l.issuedBy} ${co?.name || ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div>
      <div style={{ padding: "0 18px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12.5, color: T.muted }}>{sorted.length} records</span>
        {canEdit && <Btn small onClick={() => setForm({})}><Plus size={15} />New</Btn>}
      </div>
      <SearchBar value={q} onChange={setQ} placeholder="Search doc no., name, issuer…" />
      <div style={{ padding: "10px 18px" }}>
        {filtered.length === 0 && <EmptyState icon={ShieldCheck} color={MODULE_COLORS.documents} title="No license or inspection records" hint="Add your first license or inspection record." />}
        {filtered.map((l) => {
          const co = data.companies.find((c) => c.id === l.companyId);
          const status = licenseStatusOf(l);
          return (
            <div key={l.id} onClick={canEdit ? () => setForm(l) : undefined} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 8, cursor: canEdit ? "pointer" : "default" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 14.5, color: T.ink }}>{l.docNo} · {l.name}</span>
                <Pill tone={licenseTone(status)}>{status}</Pill>
              </div>
              {co && <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 4 }}>{co.name}</div>}
              <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>Issued by {l.issuedBy || "—"} · {fmtDate(l.issueDate)} → {fmtDate(l.expiredDate)}</div>
              {l.expiredDate && <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>Renew by {fmtDate(renewDateOf(l))}</div>}
            </div>
          );
        })}
      </div>
      {form && <LicenseForm initial={form} ctx={ctx} onClose={() => setForm(null)} />}
    </div>
  );
}

function LicenseForm({ initial, ctx, onClose }) {
  const { update } = ctx;
  const [l, setL] = useState({
    companyId: ctx.scopeCompanyId && ctx.scopeCompanyId !== "__unassigned__" ? ctx.scopeCompanyId : "",
    docNo: "", name: "", issuedBy: "", issueDate: todayISO(), expiredDate: "", status: LICENSE_STATUSES[0],
    ...initial,
  });

  const save = () => {
    if (!l.docNo.trim() || !l.name.trim()) return;
    update("licenses", (prev) => l.id && prev.some((x) => x.id === l.id) ? prev.map((x) => (x.id === l.id ? l : x)) : [...prev, { ...l, id: uid("lic") }]);
    onClose();
  };
  const remove = () => { update("licenses", (prev) => prev.filter((x) => x.id !== l.id)); onClose(); };

  return (
    <Sheet title={initial.id ? "Edit license/inspection" : "New license/inspection"} onClose={onClose}>
      <Field label="Related company (optional)">
        <Select value={l.companyId} onChange={(e) => setL({ ...l, companyId: e.target.value })}>
          <option value="">— None —</option>
          {ctx.visibleCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Doc. No."><TextInput value={l.docNo} onChange={(e) => setL({ ...l, docNo: e.target.value })} placeholder="e.g. LIC-01" /></Field>
        <Field label="Issued by"><TextInput value={l.issuedBy} onChange={(e) => setL({ ...l, issuedBy: e.target.value })} /></Field>
      </div>
      <Field label="Name"><TextInput value={l.name} onChange={(e) => setL({ ...l, name: e.target.value })} placeholder="e.g. Fire Safety Certificate" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Issue date"><TextInput type="date" value={l.issueDate} onChange={(e) => setL({ ...l, issueDate: e.target.value })} /></Field>
        <Field label="Expired date"><TextInput type="date" value={l.expiredDate} onChange={(e) => setL({ ...l, expiredDate: e.target.value })} /></Field>
      </div>
      <Field label="Status">
        <Select value={l.status} onChange={(e) => setL({ ...l, status: e.target.value })}>
          {LICENSE_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </Select>
      </Field>
      <Field label={`Renew date (auto: Expired date − ${LICENSE_RENEWAL_WINDOW_DAYS} days)`}>
        <div style={{ ...inputStyle, background: T.bg, color: T.ink2 }}>
          {l.expiredDate ? fmtDate(renewDateOf(l)) : "Set an expired date first"}
        </div>
      </Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {initial.id && hasPerm(ctx, "documents", "delete") && <Btn variant="danger" onClick={remove}><Trash2 size={15} /> Delete</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save}>Save</Btn>
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------
   SYSTEM ADMINISTRATION
----------------------------------------------------------------*/
function SystemAdministrationView({ ctx }) {
  const [tab, setTab] = useState("backup");
  const canEdit = hasPerm(ctx, "sysadmin", "edit");

  return (
    <div>
      <Header title="System Administration" subtitle="Backup, restore & system-wide settings" icon={Settings} color={MODULE_COLORS.sysadmin} />
      <div style={{ display: "flex", gap: 6, padding: "10px 18px" }}>
        {[{ k: "backup", l: "Backup & Restore" }, { k: "datetime", l: "Date & Time" }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            flex: 1, padding: "10px 8px", borderRadius: 10, border: `1px solid ${tab === t.k ? T.accent : T.border}`,
            background: tab === t.k ? T.accent : T.surface, color: tab === t.k ? "#fff" : T.ink2,
            fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>{t.l}</button>
        ))}
      </div>
      {tab === "backup" ? <BackupRestoreTab ctx={ctx} canEdit={canEdit} /> : <DateTimeSettingsTab ctx={ctx} canEdit={canEdit} />}
    </div>
  );
}

function BackupRestoreTab({ ctx, canEdit }) {
  const { data } = ctx;
  const [restoreText, setRestoreText] = useState("");
  const [pendingBackup, setPendingBackup] = useState(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const handleBackup = () => {
    const payload = {
      app: "advisory-desk", version: 1, exportedAt: new Date().toISOString(),
      data: Object.fromEntries(KEYS.map((k) => [k, data[k]])),
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `advisory-desk-backup-${todayISO()}.json`);
  };

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg(""); setError(""); setPendingBackup(null); setRestoreText("");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed.data !== "object") throw new Error("bad shape");
      setPendingBackup(parsed);
    } catch {
      setError("Couldn't read that file — make sure it's a backup .json file downloaded from this page.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const doRestore = () => {
    if (!pendingBackup) return;
    if (!window.confirm("This will overwrite ALL data in Advisory Desk for every user with the contents of this backup file. This cannot be undone. Continue?")) return;
    KEYS.forEach((k) => {
      if (k in pendingBackup.data) ctx.update(k, pendingBackup.data[k]);
    });
    setMsg(`Restored backup from ${pendingBackup.exportedAt ? fmtDate(pendingBackup.exportedAt.slice(0, 10)) : "unknown date"}.`);
    setPendingBackup(null);
    setRestoreText("");
  };

  return (
    <div style={{ padding: "0 18px 20px" }}>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Database size={17} color={T.accent} />
          <span style={{ fontWeight: 700, fontSize: 14.5, color: T.ink }}>Backup</span>
        </div>
        <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 12 }}>
          Download every record in Advisory Desk (companies, visits, improvement plans, meeting logs, users, permissions, and more) as one JSON file.
        </div>
        <Btn small onClick={handleBackup}><Download size={14} /> Download Backup</Btn>
      </div>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Upload size={17} color={T.red} />
          <span style={{ fontWeight: 700, fontSize: 14.5, color: T.ink }}>Restore</span>
        </div>
        {!canEdit ? (
          <div style={{ fontSize: 12.5, color: T.muted }}>You don't have permission to restore backups.</div>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 12 }}>
              Upload a backup file to replace all current data. This affects every user and cannot be undone.
            </div>
            <Btn variant="ghost" small onClick={() => fileInputRef.current?.click()}><Upload size={14} /> Choose Backup File</Btn>
            <input ref={fileInputRef} type="file" accept=".json" onChange={onPickFile} style={{ display: "none" }} />
            {pendingBackup && (
              <div style={{ marginTop: 12, padding: 12, background: T.redSoft, borderRadius: 10 }}>
                <div style={{ fontSize: 12.5, color: T.ink2, marginBottom: 8 }}>
                  Loaded backup exported {pendingBackup.exportedAt ? fmtDate(pendingBackup.exportedAt.slice(0, 10)) : "at an unknown date"}.
                  Type <b>RESTORE</b> below to confirm you want to overwrite all current data.
                </div>
                <TextInput value={restoreText} onChange={(e) => setRestoreText(e.target.value)} placeholder="Type RESTORE to confirm" style={{ marginBottom: 8 }} />
                <Btn variant="danger" small disabled={restoreText !== "RESTORE"} onClick={doRestore}><Trash2 size={14} /> Restore Now (Overwrites Everything)</Btn>
              </div>
            )}
          </>
        )}
      </div>
      {msg && <div style={{ fontSize: 12.5, color: T.green, fontWeight: 600, marginTop: 12 }}>{msg}</div>}
      {error && <div style={{ fontSize: 12.5, color: T.red, fontWeight: 600, marginTop: 12 }}>{error}</div>}
    </div>
  );
}

function DateTimeSettingsTab({ ctx, canEdit }) {
  const { data } = ctx;
  const [timeZone, setTimeZone] = useState(data.systemSettings?.timeZone || "UTC");
  const [preview, setPreview] = useState("");
  const [saved, setSaved] = useState(false);

  const timeZones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return ["UTC", "Asia/Phnom_Penh", "Asia/Bangkok", "Asia/Singapore", "Asia/Tokyo", "Europe/London", "America/New_York"];
    }
  }, []);

  useEffect(() => {
    const format = () => {
      try {
        setPreview(new Intl.DateTimeFormat(undefined, { timeZone, dateStyle: "full", timeStyle: "long" }).format(new Date()));
      } catch {
        setPreview("Unknown time zone");
      }
    };
    format();
    const interval = setInterval(format, 1000);
    return () => clearInterval(interval);
  }, [timeZone]);

  const save = () => {
    ctx.update("systemSettings", (prev) => ({ ...(prev || {}), timeZone }));
    setSaved(true);
  };

  return (
    <div style={{ padding: "0 18px 20px" }}>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Clock size={17} color={T.accent} />
          <span style={{ fontWeight: 700, fontSize: 14.5, color: T.ink }}>System Time Zone</span>
        </div>
        <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 12 }}>
          Sets the reference time zone shown to everyone using Advisory Desk.
        </div>
        <Field label="Time zone">
          <Select value={timeZone} disabled={!canEdit} onChange={(e) => { setTimeZone(e.target.value); setSaved(false); }}>
            {timeZones.map((z) => <option key={z} value={z}>{z}</option>)}
          </Select>
        </Field>
        <div style={{ background: T.bg, borderRadius: 10, padding: 12, marginBottom: canEdit ? 12 : 0 }}>
          <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, letterSpacing: 0.3, marginBottom: 4 }}>CURRENT DATE/TIME IN THIS ZONE</div>
          <div style={{ fontSize: 14.5, color: T.ink, fontWeight: 600 }}>{preview}</div>
        </div>
        {canEdit && <Btn small onClick={save}>Save Time Zone</Btn>}
        {saved && <div style={{ fontSize: 12.5, color: T.green, fontWeight: 600, marginTop: 10 }}>Time zone saved.</div>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   USERS
----------------------------------------------------------------*/
function UsersView({ ctx }) {
  const { data, update, role } = ctx;
  const [tab, setTab] = useState("accounts");
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const isAdmin = role.role === "admin";

  const openForm = (u) => { setForm(u); setSaveError(""); setResetMsg(""); };
  const closeForm = () => { setForm(null); setSaveError(""); setResetMsg(""); };

  const save = async (u) => {
    const email = (u.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { setSaveError("Enter a valid email address."); return; }
    const duplicate = data.users.some((p) => p.id !== u.id && (p.email || "").trim().toLowerCase() === email);
    if (duplicate) { setSaveError("An account with that email already exists."); return; }
    if (!u.id && (u.initialPassword || "").length < 6) { setSaveError("Set an initial password of at least 6 characters."); return; }

    setSaving(true);
    setSaveError("");
    try {
      if (u.id) {
        // Editing an existing account: email is read-only (see UserFields —
        // the client SDK can't change another user's Firebase Auth email
        // without a backend), so this is a plain profile update. Deliberately
        // NOT touching password/authUid here — `u` already carries whatever
        // the record had (UserFields never exposes those fields to edit),
        // and a not-yet-migrated legacy account's plaintext password must
        // survive an admin's edit, or that person could never log in again
        // to self-migrate (see RoleGate).
        update("users", (prev) => prev.map((p) => (p.id === u.id ? { ...u, email: p.email } : p)));
        closeForm();
      } else {
        // New account: admin sets the initial password directly (via a
        // secondary Firebase App instance, so the admin's own session isn't
        // disturbed) — the account is flagged mustChangePassword so the
        // real password never stays admin-known past the first login.
        const authUid = await createAuthUserAsAdmin(email, u.initialPassword);
        update("users", (prev) => [...prev, { ...u, email, id: uid("u"), authUid, password: undefined, initialPassword: undefined, mustChangePassword: true }]);
        closeForm();
      }
    } catch (err) {
      setSaveError(authErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  const remove = (id) => { update("users", (prev) => prev.filter((p) => p.id !== id)); closeForm(); };
  const resendSetupEmail = async (email) => {
    setSaving(true);
    setResetMsg("");
    try {
      await sendReset(email);
      setResetMsg(`Password reset email sent to ${email}.`);
    } catch (err) {
      setSaveError(authErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Header title="User Accounts" subtitle={tab === "accounts" ? `${data.users.length} accounts` : "Who can view, edit, or delete each module"}
        icon={UsersIcon} color={MODULE_COLORS.users}
        action={tab === "accounts" && isAdmin ? <Btn small onClick={() => openForm({})}><Plus size={15} />New</Btn> : null} />
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
              <Row key={u.id} onClick={isAdmin ? () => openForm(u) : undefined} left={<UsersIcon size={16} color={T.accent} />}
                title={u.name} sub={u.role === "user" ? `${u.email} · ${co?.name || "No company assigned"}` : u.email}
                right={<Pill tone={u.role === "admin" ? "accent" : u.role === "manager" ? "blue" : u.role === "user" ? "green" : "muted"}>{ROLE_LABEL[u.role]}</Pill>} />
            );
          })}
        </div>
      ) : (
        isAdmin && <PermissionMatrix ctx={ctx} />
      )}

      {form && isAdmin && (
        <Sheet title={form.id ? "Edit user" : "New user account"} onClose={closeForm}>
          <UserFields form={form} setForm={setForm} companies={data.companies} dashboards={data.customDashboards} />
          {form.id && (
            <div style={{ marginBottom: 14 }}>
              <Btn variant="ghost" small onClick={() => resendSetupEmail(form.email)} disabled={saving}>
                <Mail size={13} /> Send password reset email
              </Btn>
            </div>
          )}
          {saveError && <div style={{ color: T.red, fontSize: 12.5, marginBottom: 12, fontWeight: 600 }}>{saveError}</div>}
          {resetMsg && <div style={{ color: T.green, fontSize: 12.5, marginBottom: 12, fontWeight: 600 }}>{resetMsg}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            {form.id && <Btn variant="danger" onClick={() => remove(form.id)} disabled={saving}><Trash2 size={15} /> Delete</Btn>}
            <div style={{ flex: 1 }} />
            <Btn variant="ghost" onClick={closeForm} disabled={saving}>Cancel</Btn>
            <Btn onClick={() => form.name && (form.role !== "user" || form.companyId) && (form.id || (form.initialPassword || "").length >= 6) && save(form)} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
          </div>
          {form.id && <div style={{ fontSize: 11, color: T.muted, marginTop: 10 }}>Deleting removes this person's access to the app immediately. Their Firebase sign-in account itself isn't deleted — do that from the Firebase Console if needed.</div>}
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

function UserFields({ form, setForm, companies, dashboards = [] }) {
  const emailValid = EMAIL_RE.test(form.email || "");
  return (
    <>
      <Field label="Full name"><TextInput value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label={form.id ? "Email" : "Email (this becomes their sign-in address)"}>
        {form.id ? (
          <>
            <TextInput type="email" value={form.email || ""} disabled style={{ background: T.bg, color: T.muted }} />
            <div style={{ fontSize: 11.5, color: T.muted, marginTop: 6 }}>Can't be changed here — the sign-in email for an existing account can't be updated without the user's own session. Delete and re-create the account if it must change.</div>
          </>
        ) : (
          <>
            <TextInput type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@company.com" />
            {form.email && !emailValid && <div style={{ fontSize: 11.5, color: T.red, marginTop: 6 }}>Enter a valid email address.</div>}
          </>
        )}
      </Field>
      {!form.id && (
        <Field label="Initial password">
          <div style={{ display: "flex", gap: 8 }}>
            <TextInput type="text" value={form.initialPassword || ""} onChange={(e) => setForm({ ...form, initialPassword: e.target.value })} placeholder="At least 6 characters" style={{ flex: 1 }} />
            <Btn type="button" variant="ghost" small onClick={() => setForm({ ...form, initialPassword: randomPassword() })}>Generate</Btn>
          </div>
          <div style={{ fontSize: 11.5, color: T.muted, marginTop: 6 }}>Share this with them however you'd normally communicate — they'll be required to set their own password the moment they first sign in with it.</div>
        </Field>
      )}
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
      <Field label="Assigned dashboard (optional)">
        <Select value={form.dashboardId || ""} onChange={(e) => setForm({ ...form, dashboardId: e.target.value })}>
          <option value="">— Default Overview —</option>
          {dashboards.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <div style={{ fontSize: 11.5, color: T.muted, marginTop: 6 }}>Shown automatically in place of the default Overview as soon as this user logs in. Build dashboards from Dashboard Builder.</div>
      </Field>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: T.muted, marginTop: -6 }}>
        <Lock size={12} /> Signed in via real Firebase Authentication — no password is stored or visible here.
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
const REPORT_TABS = [
  { k: "companies", l: "Company list" },
  { k: "caps", l: "Improvement plan" },
  { k: "risk", l: "Risk assessment" },
  { k: "visits", l: "Visit logs" },
  { k: "meetings", l: "Meeting logs" },
  { k: "committee", l: "Bipartite committee" },
  { k: "training", l: "Training" },
  { k: "grievance", l: "Grievance mechanism" },
  { k: "policies", l: "Policy & procedure" },
  { k: "licenses", l: "License & inspection" },
];

function ReportsView({ ctx }) {
  const [tab, setTab] = useState("companies");
  return (
    <div>
      <Header title="Reports" subtitle="Company list & improvement plan tracking" icon={FileBarChart} color={MODULE_COLORS.reports} />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.ceil(REPORT_TABS.length / 2)}, 1fr)`, gap: 6, padding: "10px 18px" }}>
        {REPORT_TABS.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding: "9px 5px", borderRadius: 10, border: `1px solid ${tab === t.k ? T.accent : T.border}`,
            background: tab === t.k ? T.accent : T.surface, color: tab === t.k ? "#fff" : T.ink2,
            fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", lineHeight: 1.3, textAlign: "center",
            minWidth: 0, overflowWrap: "break-word",
          }}>{t.l}</button>
        ))}
      </div>
      {tab === "companies" && <CompanyReport ctx={ctx} />}
      {tab === "caps" && <CapReport ctx={ctx} />}
      {tab === "risk" && <RiskReport ctx={ctx} />}
      {tab === "visits" && <VisitReport ctx={ctx} />}
      {tab === "meetings" && <MeetingReport ctx={ctx} />}
      {tab === "committee" && <CommitteeReport ctx={ctx} />}
      {tab === "training" && <TrainingReport ctx={ctx} />}
      {tab === "grievance" && <GrievanceReport ctx={ctx} />}
      {tab === "policies" && <PolicyReport ctx={ctx} />}
      {tab === "licenses" && <LicenseReport ctx={ctx} />}
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
      "Advisory Cycles": cycles.length, "Total Improvement Plans": caps.length, "Open Improvement Plans": openCaps,
    };
  });
  const columns = [
    { key: "Company", label: "Company" }, { key: "Type", label: "Type" }, { key: "Address", label: "Address" },
    { key: "Contacts", label: "Contacts" }, { key: "Advisory Cycles", label: "Cycles" },
    { key: "Total Improvement Plans", label: "Total Plans" }, { key: "Open Improvement Plans", label: "Open Plans" },
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
      {companiesFiltered.length === 0 && <EmptyState icon={FileBarChart} color={MODULE_COLORS.reports} title="No matching companies" hint="Try a different search or add companies." />}
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
          onExcel={() => exportExcel(rows, "Improvement Plan", `improvement-plan-report-${todayISO()}.xlsx`)}
          onPdf={() => exportPdf("Improvement Plan Report", rows, columns)}
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
        {enriched.length === 0 && <EmptyState icon={FileBarChart} color={MODULE_COLORS.reports} title="No matching improvement plans" hint="Try clearing a filter." />}
      </div>
    </div>
  );
}

function RiskReport({ ctx }) {
  const { data } = ctx;
  const [levelFilter, setLevelFilter] = useState("All");
  const [companyFilter, setCompanyFilter] = useState("");

  const enrichedAll = data.riskAssessments.map((r) => {
    const co = data.companies.find((c) => c.id === r.companyId);
    const score = (r.likelihood || 0) * (r.severity || 0);
    const linkedCap = data.caps.find((c) => c.id === r.linkedCapId);
    return { ...r, companyName: co?.name || "—", score, level: riskLevelOf(score), linkedCapLabel: linkedCap ? `${linkedCap.ncNumber} · ${linkedCap.area}` : "" };
  });
  const enriched = enrichedAll
    .filter((r) => {
      if (!inScope(ctx, r.companyId)) return false;
      if (levelFilter !== "All" && r.level !== levelFilter) return false;
      if (companyFilter && r.companyId !== companyFilter) return false;
      return true;
    })
    .sort((a, b) => b.score - a.score);

  // Excel export uses the specific column set requested for the "Risk
  // Assessment Report" — deliberately a different, shorter set than the
  // on-screen Risk Register below (e.g. no dates/owner, but adds Additional
  // Controls), so it's built as its own row shape rather than reusing registerRows.
  const excelRows = enriched.map((r) => ({
    "No.": r.riskNo || "", "Hazards": r.hazard || "", "Existing Controls": r.existingControls || "",
    "Likelihood": r.likelihood, "Severity": r.severity, "Risk Score": r.score,
    "Additional Controls": r.recommendedActions || "", "Linked CAP": r.linkedCapLabel || "None",
  }));

  const registerRows = enriched.map((r) => ({
    "Risk No.": r.riskNo || "", "Hazards": r.hazard || "", "Risk Description": r.description,
    "Identified Date": fmtDate(r.date), "Likelihood": r.likelihood, "Severity": r.severity, "Risk Score": r.score,
    "Risk Owner": r.assignedTo || "", "Description of Controls": r.existingControls || "",
    "Target Completion Date": fmtDate(r.targetDate), "Linked CAP": r.linkedCapLabel || "None",
  }));
  const registerColumns = [
    { key: "Risk No.", label: "Risk No." }, { key: "Hazards", label: "Hazards" }, { key: "Risk Description", label: "Description" },
    { key: "Identified Date", label: "Identified" }, { key: "Likelihood", label: "L" }, { key: "Severity", label: "S" },
    { key: "Risk Score", label: "Score" }, { key: "Risk Owner", label: "Owner" }, { key: "Description of Controls", label: "Controls" },
    { key: "Target Completion Date", label: "Target" }, { key: "Linked CAP", label: "Linked CAP" },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 8, padding: "0 18px 10px" }}>
        <Select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} style={{ flex: 1 }}>
          {RISK_LEVEL_FILTERS.map((f) => <option key={f} value={f}>{f === "All" ? "All risk levels" : f}</option>)}
        </Select>
        <Select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} style={{ flex: 1 }}>
          <option value="">All companies</option>
          {ctx.visibleCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      {enriched.length > 0 && (
        <ExportBar
          onExcel={() => exportExcel(excelRows, "Risk Assessment Report", `risk-assessment-report-${todayISO()}.xlsx`)}
          onPdf={() => exportPdf("Risk Register", registerRows, registerColumns)}
        />
      )}
      <div style={{ padding: "0 18px" }}>
        {enriched.length === 0 && <EmptyState icon={AlertTriangle} color={MODULE_COLORS.reports} title="No matching risks" hint="Try clearing a filter." />}
        {enriched.length > 0 && (
          <div style={{ overflowX: "auto", border: `1px solid ${T.border}`, borderRadius: 12, marginBottom: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: T.bg }}>
                  <th style={checklistThStyle}>Risk No.</th>
                  <th style={checklistThStyle}>Hazards</th>
                  <th style={checklistThStyle}>Risk Description</th>
                  <th style={checklistThStyle}>Identified</th>
                  <th style={checklistThStyle}>L</th>
                  <th style={checklistThStyle}>S</th>
                  <th style={checklistThStyle}>Score</th>
                  <th style={checklistThStyle}>Risk Owner</th>
                  <th style={checklistThStyle}>Description of Controls</th>
                  <th style={checklistThStyle}>Target</th>
                  <th style={checklistThStyle}>Linked CAP</th>
                </tr>
              </thead>
              <tbody>
                {enriched.map((r) => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${T.border}`, background: T.surface }}>
                    <td style={{ ...checklistTdStyle, whiteSpace: "nowrap", fontWeight: 700, color: T.ink2 }}>{r.riskNo || "—"}</td>
                    <td style={checklistTdStyle}>{r.hazard || "—"}</td>
                    <td style={checklistTdStyle}>{r.description}</td>
                    <td style={{ ...checklistTdStyle, whiteSpace: "nowrap" }}>{fmtDate(r.date)}</td>
                    <td style={{ ...checklistTdStyle, textAlign: "center" }}>{r.likelihood}</td>
                    <td style={{ ...checklistTdStyle, textAlign: "center" }}>{r.severity}</td>
                    <td style={checklistTdStyle}><Pill tone={riskLevelTone(r.level)}>{r.score}</Pill></td>
                    <td style={checklistTdStyle}>{r.assignedTo || "—"}</td>
                    <td style={checklistTdStyle}>{r.existingControls || "—"}</td>
                    <td style={{ ...checklistTdStyle, whiteSpace: "nowrap" }}>{fmtDate(r.targetDate)}</td>
                    <td style={checklistTdStyle}>{r.linkedCapLabel || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function VisitReport({ ctx }) {
  const { data } = ctx;
  const [companyFilter, setCompanyFilter] = useState("");
  const enrichedAll = data.visits.map((v) => {
    const adv = data.advisoryInfo.find((a) => a.id === v.advisoryInfoId);
    const co = data.companies.find((x) => x.id === adv?.companyId);
    return { ...v, companyId: co?.id || "", companyName: co?.name || "—" };
  });
  const enriched = enrichedAll.filter((v) => {
    if (!inScope(ctx, v.companyId)) return false;
    if (companyFilter && v.companyId !== companyFilter) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));
  const rows = enriched.map((v) => ({
    "Visit No.": v.visitNumber, "Company": v.companyName, "Date": fmtDate(v.date),
    "Start Time": v.startTime, "End Time": v.endTime, "Log": v.log, "Attachments": v.attachmentCount || 0,
  }));
  const columns = [
    { key: "Visit No.", label: "Visit No." }, { key: "Company", label: "Company" }, { key: "Date", label: "Date" },
    { key: "Start Time", label: "Start" }, { key: "End Time", label: "End" }, { key: "Log", label: "Log" },
  ];
  return (
    <div>
      <div style={{ padding: "0 18px 10px" }}>
        <Select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
          <option value="">All companies</option>
          {ctx.visibleCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      {rows.length > 0 && (
        <ExportBar
          onExcel={() => exportExcel(rows, "Visit Logs", `visit-logs-report-${todayISO()}.xlsx`)}
          onPdf={() => exportPdf("Visit Logs Report", rows, columns)}
        />
      )}
      <div style={{ padding: "0 18px" }}>
        {enriched.map((v) => (
          <div key={v.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>{v.visitNumber}</span>
              <span style={{ fontSize: 12, color: T.muted }}>{fmtDate(v.date)}</span>
            </div>
            <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 3 }}>{v.companyName}</div>
            {v.log && <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.log}</div>}
          </div>
        ))}
        {enriched.length === 0 && <EmptyState icon={CalendarClock} color={MODULE_COLORS.visits} title="No matching visits" hint="Try clearing a filter." />}
      </div>
    </div>
  );
}

function MeetingReport({ ctx }) {
  const { data } = ctx;
  const [companyFilter, setCompanyFilter] = useState("");
  const enriched = data.meetingLogs.filter((m) => {
    if (!inScope(ctx, m.companyId)) return false;
    if (companyFilter && m.companyId !== companyFilter) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));
  const rows = enriched.map((m) => {
    const co = data.companies.find((c) => c.id === m.companyId);
    return {
      "Date": fmtDate(m.date), "Company": co?.name || "—", "Log": m.log,
      "Participants": (m.participants || []).join(", "), "Attachments": m.attachmentCount || 0,
    };
  });
  const columns = [
    { key: "Date", label: "Date" }, { key: "Company", label: "Company" }, { key: "Log", label: "Log" }, { key: "Participants", label: "Participants" },
  ];
  return (
    <div>
      <div style={{ padding: "0 18px 10px" }}>
        <Select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
          <option value="">All companies</option>
          {ctx.visibleCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      {rows.length > 0 && (
        <ExportBar
          onExcel={() => exportExcel(rows, "Meeting Logs", `meeting-logs-report-${todayISO()}.xlsx`)}
          onPdf={() => exportPdf("Meeting Logs Report", rows, columns)}
        />
      )}
      <div style={{ padding: "0 18px" }}>
        {enriched.map((m) => {
          const co = data.companies.find((c) => c.id === m.companyId);
          return (
            <div key={m.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>{fmtDate(m.date)}</span>
                {co && <Pill tone="accent">{co.name}</Pill>}
              </div>
              {m.log && <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.log}</div>}
            </div>
          );
        })}
        {enriched.length === 0 && <EmptyState icon={MessageSquare} color={MODULE_COLORS.meetings} title="No matching meeting logs" hint="Try clearing a filter." />}
      </div>
    </div>
  );
}

function CommitteeReport({ ctx }) {
  const { data } = ctx;
  const [companyFilter, setCompanyFilter] = useState("");
  const enriched = data.bipartiteCommittee.filter((b) => {
    if (!inScope(ctx, b.companyId)) return false;
    if (companyFilter && b.companyId !== companyFilter) return false;
    return true;
  });
  const rows = enriched.map((b) => {
    const co = data.companies.find((c) => c.id === b.companyId);
    return {
      "Name": b.name, "Company": co?.name || "—", "Sex": b.sex, "Date Joined": fmtDate(b.dateJoined),
      "Committee Role": b.committeeRole, "Company Role": b.companyRole, "Union Member": b.union, "Phone": b.phone,
    };
  });
  const columns = [
    { key: "Name", label: "Name" }, { key: "Company", label: "Company" }, { key: "Committee Role", label: "Committee Role" },
    { key: "Company Role", label: "Company Role" }, { key: "Union Member", label: "Union" }, { key: "Phone", label: "Phone" },
  ];
  return (
    <div>
      <div style={{ padding: "0 18px 10px" }}>
        <Select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
          <option value="">All companies</option>
          {ctx.visibleCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      {rows.length > 0 && (
        <ExportBar
          onExcel={() => exportExcel(rows, "Bipartite Committee", `bipartite-committee-report-${todayISO()}.xlsx`)}
          onPdf={() => exportPdf("Bipartite Committee Report", rows, columns)}
        />
      )}
      <div style={{ padding: "0 18px" }}>
        {enriched.map((b) => {
          const co = data.companies.find((c) => c.id === b.companyId);
          return (
            <div key={b.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>{b.name}</span>
                <Pill tone="blue">{b.committeeRole}</Pill>
              </div>
              <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 3 }}>{co?.name || "—"} · {b.companyRole}</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>Joined {fmtDate(b.dateJoined)} · Union: {b.union}</div>
            </div>
          );
        })}
        {enriched.length === 0 && <EmptyState icon={Scale} color={MODULE_COLORS.committee} title="No matching committee members" hint="Try clearing a filter." />}
      </div>
    </div>
  );
}

function TrainingReport({ ctx }) {
  const { data } = ctx;
  const [statusFilter, setStatusFilter] = useState("All");
  const [companyFilter, setCompanyFilter] = useState("");
  const enriched = data.trainings.filter((t) => {
    if (!inScope(ctx, t.companyId)) return false;
    if (statusFilter !== "All" && t.status !== statusFilter) return false;
    if (companyFilter && t.companyId !== companyFilter) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));
  const rows = enriched.map((t) => {
    const co = data.companies.find((c) => c.id === t.companyId);
    return {
      "Topic": t.topic, "Company": co?.name || "—", "Trainer": t.trainer, "Date": fmtDate(t.date),
      "Start Time": t.startTime, "End Time": t.endTime, "Delivery Mode": t.deliveryMode, "Status": t.status,
      "Location": t.location, "Participants": (t.participants || []).join(", "), "Notes": t.notes,
    };
  });
  const columns = [
    { key: "Topic", label: "Topic" }, { key: "Company", label: "Company" }, { key: "Trainer", label: "Trainer" },
    { key: "Date", label: "Date" }, { key: "Delivery Mode", label: "Mode" }, { key: "Status", label: "Status" }, { key: "Participants", label: "Participants" },
  ];
  return (
    <div>
      <div style={{ display: "flex", gap: 8, padding: "0 18px 10px" }}>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ flex: 1 }}>
          <option value="All">All statuses</option>
          {TRAINING_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </Select>
        <Select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} style={{ flex: 1 }}>
          <option value="">All companies</option>
          {ctx.visibleCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      {rows.length > 0 && (
        <ExportBar
          onExcel={() => exportExcel(rows, "Training", `training-report-${todayISO()}.xlsx`)}
          onPdf={() => exportPdf("Training Report", rows, columns)}
        />
      )}
      <div style={{ padding: "0 18px" }}>
        {enriched.map((t) => {
          const co = data.companies.find((c) => c.id === t.companyId);
          return (
            <div key={t.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>{t.topic}</span>
                <Pill tone={trainingTone(t.status)}>{t.status}</Pill>
              </div>
              <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 3 }}>{co?.name || "—"}</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>{fmtDate(t.date)} · {t.startTime}–{t.endTime} · {t.deliveryMode} · Trainer: {t.trainer || "—"}</div>
            </div>
          );
        })}
        {enriched.length === 0 && <EmptyState icon={GraduationCap} color={MODULE_COLORS.training} title="No matching training sessions" hint="Try clearing a filter." />}
      </div>
    </div>
  );
}

function GrievanceReport({ ctx }) {
  const { data } = ctx;
  const [statusFilter, setStatusFilter] = useState("All");
  const [companyFilter, setCompanyFilter] = useState("");
  const enriched = data.grievances.filter((g) => {
    if (!inScope(ctx, g.companyId)) return false;
    if (statusFilter !== "All" && g.status !== statusFilter) return false;
    if (companyFilter && g.companyId !== companyFilter) return false;
    return true;
  }).sort((a, b) => b.dateReported.localeCompare(a.dateReported));
  const rows = enriched.map((g) => {
    const co = data.companies.find((c) => c.id === g.companyId);
    return {
      "Date Reported": fmtDate(g.dateReported), "Company": co?.name || "—", "Category": g.category, "Channel": g.channel,
      "Description": g.description, "Reported By": g.reportedBy || "Anonymous", "Status": g.status,
      "Assigned To": g.assignedTo, "Resolution": g.resolution, "Resolved Date": fmtDate(g.resolvedDate),
    };
  });
  const columns = [
    { key: "Date Reported", label: "Date" }, { key: "Company", label: "Company" }, { key: "Category", label: "Category" },
    { key: "Status", label: "Status" }, { key: "Reported By", label: "Reported By" }, { key: "Assigned To", label: "Assigned To" },
  ];
  return (
    <div>
      <div style={{ display: "flex", gap: 8, padding: "0 18px 10px" }}>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ flex: 1 }}>
          <option value="All">All statuses</option>
          {GRIEVANCE_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </Select>
        <Select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} style={{ flex: 1 }}>
          <option value="">All companies</option>
          {ctx.visibleCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      {rows.length > 0 && (
        <ExportBar
          onExcel={() => exportExcel(rows, "Grievance Mechanism", `grievance-report-${todayISO()}.xlsx`)}
          onPdf={() => exportPdf("Grievance Mechanism Report", rows, columns)}
        />
      )}
      <div style={{ padding: "0 18px" }}>
        {enriched.map((g) => {
          const co = data.companies.find((c) => c.id === g.companyId);
          return (
            <div key={g.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>{g.category}</span>
                <Pill tone={grievanceTone(g.status)}>{g.status}</Pill>
              </div>
              <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 3 }}>{co?.name || "—"}</div>
              {g.description && <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.description}</div>}
              <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>Reported {fmtDate(g.dateReported)} · {g.reportedBy || "Anonymous"} · via {g.channel}</div>
            </div>
          );
        })}
        {enriched.length === 0 && <EmptyState icon={Megaphone} color={MODULE_COLORS.grievance} title="No matching grievances" hint="Try clearing a filter." />}
      </div>
    </div>
  );
}

function PolicyReport({ ctx }) {
  const { data } = ctx;
  const [typeFilter, setTypeFilter] = useState("All");
  const [companyFilter, setCompanyFilter] = useState("");
  const enriched = data.policies.filter((p) => {
    if (!inScope(ctx, p.companyId)) return false;
    if (typeFilter !== "All" && p.type !== typeFilter) return false;
    if (companyFilter && p.companyId !== companyFilter) return false;
    return true;
  }).sort((a, b) => (b.releasedDate || "").localeCompare(a.releasedDate || ""));
  const rows = enriched.map((p) => {
    const co = data.companies.find((c) => c.id === p.companyId);
    return {
      "Code": p.code, "Name": p.name, "Company": co?.name || "—", "Version": p.version,
      "Released Date": fmtDate(p.releasedDate), "Type": p.type, "Remark": p.remark,
    };
  });
  const columns = [
    { key: "Code", label: "Code" }, { key: "Name", label: "Name" }, { key: "Company", label: "Company" },
    { key: "Version", label: "Version" }, { key: "Released Date", label: "Released" }, { key: "Type", label: "Type" },
  ];
  return (
    <div>
      <div style={{ display: "flex", gap: 8, padding: "0 18px 10px" }}>
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ flex: 1 }}>
          <option value="All">All types</option>
          {DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
        </Select>
        <Select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} style={{ flex: 1 }}>
          <option value="">All companies</option>
          {ctx.visibleCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      {rows.length > 0 && (
        <ExportBar
          onExcel={() => exportExcel(rows, "Policy & Procedure", `policy-procedure-report-${todayISO()}.xlsx`)}
          onPdf={() => exportPdf("Policy & Procedure Report", rows, columns)}
        />
      )}
      <div style={{ padding: "0 18px" }}>
        {enriched.map((p) => {
          const co = data.companies.find((c) => c.id === p.companyId);
          return (
            <div key={p.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>{p.code} · {p.name}</span>
                <Pill tone="accent">{p.type}</Pill>
              </div>
              <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 3 }}>{co?.name || "—"}</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>Version {p.version || "—"} · Released {fmtDate(p.releasedDate)}</div>
            </div>
          );
        })}
        {enriched.length === 0 && <EmptyState icon={FileText} color={MODULE_COLORS.documents} title="No matching policies" hint="Try clearing a filter." />}
      </div>
    </div>
  );
}

function LicenseReport({ ctx }) {
  const { data } = ctx;
  const [companyFilter, setCompanyFilter] = useState("");
  const enriched = data.licenses.filter((l) => {
    if (!inScope(ctx, l.companyId)) return false;
    if (companyFilter && l.companyId !== companyFilter) return false;
    return true;
  }).sort((a, b) => (a.expiredDate || "").localeCompare(b.expiredDate || ""));
  const rows = enriched.map((l) => {
    const co = data.companies.find((c) => c.id === l.companyId);
    return {
      "Doc No.": l.docNo, "Name": l.name, "Company": co?.name || "—", "Issued By": l.issuedBy,
      "Issue Date": fmtDate(l.issueDate), "Expired Date": fmtDate(l.expiredDate),
      "Status": licenseStatusOf(l), "Renew Date": l.expiredDate ? fmtDate(renewDateOf(l)) : "",
    };
  });
  const columns = [
    { key: "Doc No.", label: "Doc No." }, { key: "Name", label: "Name" }, { key: "Company", label: "Company" },
    { key: "Issued By", label: "Issued By" }, { key: "Expired Date", label: "Expired" }, { key: "Status", label: "Status" }, { key: "Renew Date", label: "Renew By" },
  ];
  return (
    <div>
      <div style={{ padding: "0 18px 10px" }}>
        <Select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
          <option value="">All companies</option>
          {ctx.visibleCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      {rows.length > 0 && (
        <ExportBar
          onExcel={() => exportExcel(rows, "License & Inspection", `license-inspection-report-${todayISO()}.xlsx`)}
          onPdf={() => exportPdf("License & Inspection Report", rows, columns)}
        />
      )}
      <div style={{ padding: "0 18px" }}>
        {enriched.map((l) => {
          const co = data.companies.find((c) => c.id === l.companyId);
          const status = licenseStatusOf(l);
          return (
            <div key={l.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>{l.docNo} · {l.name}</span>
                <Pill tone={licenseTone(status)}>{status}</Pill>
              </div>
              <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 3 }}>{co?.name || "—"}</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>Issued by {l.issuedBy || "—"} · {fmtDate(l.issueDate)} → {fmtDate(l.expiredDate)}</div>
            </div>
          );
        })}
        {enriched.length === 0 && <EmptyState icon={ShieldCheck} color={MODULE_COLORS.documents} title="No matching license/inspection records" hint="Try clearing a filter." />}
      </div>
    </div>
  );
}
