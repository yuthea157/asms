// The "Performance" tab on the existing Company detail screen —
// docs/pams/UI_SITEMAP.md §3. Phase 2 scope: factory profile (industry,
// workforce, management contacts, program status) + departments. Later
// phases add Scorecard/Projects/Goals/.../Reports sections to this same
// tab without touching CompanyDetail itself again (see App.jsx's own
// "Performance" tab hookup, which just renders this component).

import React, { useEffect, useState } from "react";
import {
  Building2, Factory, Plus, Trash2, Pencil, Users as UsersIcon, MapPin,
} from "lucide-react";
import {
  T, MODULE_COLORS, Field, TextInput, Select, Sheet, Btn, Header, EmptyState,
  SectionLabel, EmptyRow, Row, Pill, hasPerm,
} from "../ui.jsx";
import { INDUSTRY_TYPES, INDUSTRY_TYPE_LABELS } from "./industryProfiles.js";
import { emptyFactoryProfile, getFactoryProfile, saveFactoryProfile } from "./factoryProfiles.js";
import { createDepartment, deleteDepartment, listDepartmentsForFactory, renameDepartment, seedDefaultDepartments } from "./departments.js";
import AssessmentsSection from "./AssessmentsSection.jsx";
import ProjectsSection from "./ProjectHierarchy.jsx";
import { ActionsBoard } from "./ActionsAndTasks.jsx";
import CalendarView from "./CalendarView.jsx";
import AdvisorySection from "./AdvisorySection.jsx";
import IssuesSection from "./IssuesSection.jsx";
import FactoryScorecard from "./FactoryScorecard.jsx";

const FACTORY_STATUSES = ["Active", "Inactive", "Exited"];

export default function FactoryProfileTab({ companyId, ctx }) {
  const [profile, setProfile] = useState(undefined); // undefined = loading, null = doesn't exist yet
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");

  const reload = () => {
    getFactoryProfile(companyId).then(setProfile).catch(() => setProfile(null));
    listDepartmentsForFactory(companyId).then(setDepartments).catch(() => setDepartments([]));
  };
  useEffect(reload, [companyId]);

  const canEdit = hasPerm(ctx, "pamsFactory", "edit");

  const save = async (data) => {
    setError("");
    const isFirstSave = !profile;
    try {
      await saveFactoryProfile(companyId, data, ctx);
      if (isFirstSave) await seedDefaultDepartments(companyId, data.industryType, ctx);
      setForm(null);
      reload();
    } catch (e) {
      setError(e?.message || "Could not save the factory profile.");
    }
  };

  if (profile === undefined) {
    return <div style={{ padding: 24, color: T.muted, fontSize: 13.5 }}>Loading factory profile…</div>;
  }

  if (!profile) {
    return (
      <div>
        <EmptyState icon={Factory} color={MODULE_COLORS.pamsFactory} title="No factory profile yet"
          hint="Set up this factory's industry type, workforce, and department list to start using PAMS for it." />
        {canEdit && (
          <div style={{ textAlign: "center" }}>
            <Btn onClick={() => setForm(emptyFactoryProfile())}><Plus size={15} />Set up factory profile</Btn>
          </div>
        )}
        {form && <FactoryProfileForm initial={form} isEdit={false} onClose={() => setForm(null)} onSave={save} error={error} />}
      </div>
    );
  }

  const companyName = ctx.data.companies.find((c) => c.id === companyId)?.name || "";

  return (
    <div>
      <FactoryScorecard companyId={companyId} companyName={companyName} ctx={ctx} />

      <Header title="Factory Profile" subtitle={INDUSTRY_TYPE_LABELS[profile.industryType] || profile.industryType}
        icon={Factory} color={MODULE_COLORS.pamsFactory}
        action={canEdit ? <Btn small onClick={() => setForm(profile)}><Pencil size={13} />Edit</Btn> : null} />

      <div style={{ padding: "0 18px" }}>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 8, fontSize: 13.5, color: T.ink2, marginBottom: 10 }}>
            <MapPin size={15} color={T.muted} style={{ flexShrink: 0, marginTop: 1 }} />
            {[profile.district, profile.province, profile.country].filter(Boolean).join(", ") || "No location on file"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
            <ProfileStat label="Legal name" value={profile.legalName} />
            <ProfileStat label="Brand" value={profile.brand} />
            <ProfileStat label="Ownership" value={profile.ownership} />
            <ProfileStat label="Parent group" value={profile.parentCompanyGroup} />
          </div>
          <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 10, paddingTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <UsersIcon size={15} color={T.muted} />
            <span style={{ fontSize: 13.5, color: T.ink2 }}>
              {profile.workerCountTotal || "—"} workers
              {(profile.workerCountMale || profile.workerCountFemale) && ` (${profile.workerCountMale || 0} male, ${profile.workerCountFemale || 0} female)`}
              {" · "}{profile.productionLineCount || "—"} production lines
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13, marginTop: 10 }}>
            <ProfileStat label="General Manager" value={profile.generalManagerName} />
            <ProfileStat label="HR Manager" value={profile.hrManagerName} />
            <ProfileStat label="Compliance Manager" value={profile.complianceManagerName} />
            <ProfileStat label="Production Manager" value={profile.productionManagerName} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <Pill tone={profile.factoryStatus === "Active" ? "green" : profile.factoryStatus === "Exited" ? "muted" : "amber"}>{profile.factoryStatus || "Active"}</Pill>
            {profile.advisoryStatus && <Pill tone="accent">{profile.advisoryStatus}</Pill>}
            {profile.riskClassification && <Pill tone="red">{profile.riskClassification} risk</Pill>}
          </div>
        </div>
      </div>

      <DepartmentsSection companyId={companyId} departments={departments} canEdit={canEdit} onChanged={reload} ctx={ctx} />

      <AssessmentsSection companyId={companyId} ctx={ctx} />

      <ProjectsSection companyId={companyId} ctx={ctx} />

      <ActionsBoard companyId={companyId} ctx={ctx} />

      <CalendarView companyId={companyId} ctx={ctx} />

      <AdvisorySection companyId={companyId} ctx={ctx} />

      <IssuesSection companyId={companyId} ctx={ctx} />

      {form && <FactoryProfileForm initial={form} isEdit={true} onClose={() => setForm(null)} onSave={save} error={error} />}
    </div>
  );
}

function ProfileStat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
      <div style={{ color: T.ink, marginTop: 1 }}>{value || "—"}</div>
    </div>
  );
}

function FactoryProfileForm({ initial, isEdit, onClose, onSave, error }) {
  const [p, setP] = useState({ ...emptyFactoryProfile(), ...initial });
  const set = (patch) => setP((prev) => ({ ...prev, ...patch }));

  return (
    <Sheet title={isEdit ? "Edit factory profile" : "Set up factory profile"} onClose={onClose}>
      {error && <div style={{ background: T.redSoft, color: T.red, padding: "8px 12px", borderRadius: 10, fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <SectionLabel>Industry</SectionLabel>
      <Field label="Industry type">
        <Select value={p.industryType} onChange={(e) => set({ industryType: e.target.value })}>
          {INDUSTRY_TYPES.map((t) => <option key={t} value={t}>{INDUSTRY_TYPE_LABELS[t]}</option>)}
        </Select>
      </Field>

      <SectionLabel>Organization</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <Field label="Legal name"><TextInput value={p.legalName} onChange={(e) => set({ legalName: e.target.value })} /></Field>
        <Field label="Brand / customer"><TextInput value={p.brand} onChange={(e) => set({ brand: e.target.value })} /></Field>
        <Field label="Ownership"><TextInput value={p.ownership} onChange={(e) => set({ ownership: e.target.value })} /></Field>
        <Field label="Parent company / group"><TextInput value={p.parentCompanyGroup} onChange={(e) => set({ parentCompanyGroup: e.target.value })} /></Field>
      </div>

      <SectionLabel>Location</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
        <Field label="Country"><TextInput value={p.country} onChange={(e) => set({ country: e.target.value })} /></Field>
        <Field label="Province"><TextInput value={p.province} onChange={(e) => set({ province: e.target.value })} /></Field>
        <Field label="District"><TextInput value={p.district} onChange={(e) => set({ district: e.target.value })} /></Field>
      </div>

      <SectionLabel>Management</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <Field label="General Manager"><TextInput value={p.generalManagerName} onChange={(e) => set({ generalManagerName: e.target.value })} /></Field>
        <Field label="HR Manager"><TextInput value={p.hrManagerName} onChange={(e) => set({ hrManagerName: e.target.value })} /></Field>
        <Field label="Compliance Manager"><TextInput value={p.complianceManagerName} onChange={(e) => set({ complianceManagerName: e.target.value })} /></Field>
        <Field label="Production Manager"><TextInput value={p.productionManagerName} onChange={(e) => set({ productionManagerName: e.target.value })} /></Field>
      </div>

      <SectionLabel>Workforce & production</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
        <Field label="Total workers"><TextInput type="number" min="0" value={p.workerCountTotal} onChange={(e) => set({ workerCountTotal: e.target.value })} /></Field>
        <Field label="Male workers"><TextInput type="number" min="0" value={p.workerCountMale} onChange={(e) => set({ workerCountMale: e.target.value })} /></Field>
        <Field label="Female workers"><TextInput type="number" min="0" value={p.workerCountFemale} onChange={(e) => set({ workerCountFemale: e.target.value })} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <Field label="Production lines"><TextInput type="number" min="0" value={p.productionLineCount} onChange={(e) => set({ productionLineCount: e.target.value })} /></Field>
        <Field label="Production capacity"><TextInput value={p.productionCapacity} onChange={(e) => set({ productionCapacity: e.target.value })} placeholder="e.g. 50,000 pcs/month" /></Field>
      </div>
      <Field label="Main products"><TextInput value={p.mainProducts} onChange={(e) => set({ mainProducts: e.target.value })} /></Field>
      <Field label="Main export markets"><TextInput value={p.mainExportMarkets} onChange={(e) => set({ mainExportMarkets: e.target.value })} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <Field label="Working hours"><TextInput value={p.workingHours} onChange={(e) => set({ workingHours: e.target.value })} placeholder="e.g. 8:00–17:00" /></Field>
        <Field label="Shift structure"><TextInput value={p.shiftStructure} onChange={(e) => set({ shiftStructure: e.target.value })} placeholder="e.g. Single shift" /></Field>
      </div>

      <SectionLabel>Program status</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <Field label="Factory status">
          <Select value={p.factoryStatus} onChange={(e) => set({ factoryStatus: e.target.value })}>
            {FACTORY_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Risk classification"><TextInput value={p.riskClassification} onChange={(e) => set({ riskClassification: e.target.value })} placeholder="e.g. Low / Medium / High" /></Field>
        <Field label="Program enrollment date"><TextInput type="date" value={p.programEnrollmentDate} onChange={(e) => set({ programEnrollmentDate: e.target.value })} /></Field>
        <Field label="Program exit date"><TextInput type="date" value={p.programExitDate} onChange={(e) => set({ programExitDate: e.target.value })} /></Field>
      </div>
      <Field label="Advisory status"><TextInput value={p.advisoryStatus} onChange={(e) => set({ advisoryStatus: e.target.value })} placeholder="e.g. Under Advisory" /></Field>

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => onSave(p)}>Save</Btn>
      </div>
    </Sheet>
  );
}

function DepartmentsSection({ companyId, departments, canEdit, onChanged, ctx }) {
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState(null); // { id, name }
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!newName.trim() || busy) return;
    setBusy(true);
    try { await createDepartment(companyId, newName.trim(), ctx); setNewName(""); onChanged(); }
    finally { setBusy(false); }
  };
  const rename = async () => {
    if (!editing?.name.trim() || busy) return;
    setBusy(true);
    try { await renameDepartment(editing.id, editing.name.trim(), ctx); setEditing(null); onChanged(); }
    finally { setBusy(false); }
  };
  const remove = async (id) => {
    if (!window.confirm("Remove this department?")) return;
    setBusy(true);
    try { await deleteDepartment(id, ctx); onChanged(); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <SectionLabel>Departments ({departments.length})</SectionLabel>
      <div style={{ padding: "0 18px" }}>
        {departments.length === 0 && <EmptyRow text="No departments yet." />}
        {departments.map((d) => (
          <Row key={d.id} left={<Building2 size={15} color={T.accent} />} title={d.name}
            right={canEdit ? (
              <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setEditing({ id: d.id, name: d.name })} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Pencil size={13} color={T.muted} /></button>
                <button onClick={() => remove(d.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Trash2 size={13} color={T.red} /></button>
              </div>
            ) : null} />
        ))}
        {canEdit && (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <TextInput value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New department name" style={{ flex: 1 }} />
            <Btn small onClick={add} disabled={busy}><Plus size={13} />Add</Btn>
          </div>
        )}
      </div>
      {editing && (
        <Sheet title="Rename department" onClose={() => setEditing(null)}>
          <Field label="Department name"><TextInput value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <div style={{ flex: 1 }} />
            <Btn variant="ghost" onClick={() => setEditing(null)}>Cancel</Btn>
            <Btn onClick={rename} disabled={busy}>Save</Btn>
          </div>
        </Sheet>
      )}
    </div>
  );
}
