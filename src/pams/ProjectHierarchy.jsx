// Projects → Goals → Objectives → Sub-Objectives (arbitrary depth) →
// Targets → KPIs — the core PAMS performance hierarchy (brief §7), bundled
// into one file matching ASMS's existing per-feature-area convention
// (compare AssessmentsSection.jsx). See docs/pams/UI_SITEMAP.md §4
// "Hierarchy management".

import React, { useEffect, useState } from "react";
import { Briefcase, Target as TargetIcon, Plus, ArrowLeft, ChevronDown, ChevronRight, Gauge } from "lucide-react";
import {
  T, MODULE_COLORS, Field, TextInput, TextArea, Select, Sheet, Btn, Header,
  EmptyState, SectionLabel, EmptyRow, Row, Pill, hasPerm,
} from "../ui.jsx";
import { PROJECT_TYPES, PROJECT_STATUSES, emptyProject, createProject, getProject, listProjectsForFactory, updateProject } from "./projects.js";
import { GOAL_STATUSES, emptyGoal, createGoal, listGoalsForProject, updateGoal, deleteGoal } from "./goals.js";
import { OBJECTIVE_STATUSES, emptyObjective, createObjective, listObjectivesForGoal, updateObjective, deleteObjective } from "./objectives.js";
import { SUB_OBJECTIVE_STATUSES, emptySubObjective, createSubObjective, listAllSubObjectivesForObjective, updateSubObjective, deleteSubObjective, buildSubObjectiveTree } from "./subObjectives.js";
import { TARGET_TYPES, TARGET_DIRECTIONS, TARGET_STATUSES, emptyTarget, createTarget, listTargetsForParent, updateTarget, deleteTarget } from "./targets.js";
import { KPI_CATEGORIES, ensureDefaultKpiLibrarySeeded, listKpis, createKpiLink, listKpiLinksForTarget, deleteKpiLink } from "./kpis.js";
import { validateSiblingWeights } from "./weightValidation.js";
import { ActionsForTarget } from "./ActionsAndTasks.jsx";
import MeasurementEntry from "./MeasurementEntry.jsx";
import { ScoreBadge, ScoreTraceSheet, useScoreTrace } from "./ScoreDisplay.jsx";
import { recalculateProjectScorecard, getScore } from "./scores.js";

export default function ProjectsSection({ companyId, ctx }) {
  const [projects, setProjects] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState(null);
  const canEdit = hasPerm(ctx, "pamsFactory", "edit");

  const reload = () => listProjectsForFactory(companyId).then(setProjects).catch(() => setProjects([]));
  useEffect(reload, [companyId]);

  const save = async (data) => {
    await createProject(companyId, data, ctx);
    setForm(null);
    reload();
  };

  if (openId) return <ProjectDetail id={openId} companyId={companyId} ctx={ctx} canEdit={canEdit} onBack={() => { setOpenId(null); reload(); }} />;

  return (
    <div>
      <SectionLabel>Advisory Projects {projects ? `(${projects.length})` : ""}</SectionLabel>
      <div style={{ padding: "0 18px" }}>
        {projects === null && <div style={{ color: T.muted, fontSize: 13.5, padding: "8px 0" }}>Loading…</div>}
        {projects?.length === 0 && <EmptyRow text="No advisory projects yet." />}
        {projects?.map((p) => (
          <Row key={p.id} onClick={() => setOpenId(p.id)} left={<Briefcase size={16} color={T.accent} />}
            title={p.name} sub={`${p.projectType} · ${p.status}`} right={<Pill tone={p.status === "Active" ? "green" : "muted"}>{p.status}</Pill>} />
        ))}
        {canEdit && <div style={{ textAlign: "center", marginTop: 8 }}><Btn small onClick={() => setForm(emptyProject())}><Plus size={13} />New project</Btn></div>}
      </div>
      {form && <ProjectForm initial={form} onClose={() => setForm(null)} onSave={save} />}
    </div>
  );
}

function ProjectForm({ initial, onClose, onSave }) {
  const [p, setP] = useState(initial);
  return (
    <Sheet title="New advisory project" onClose={onClose}>
      <Field label="Project name"><TextInput value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
      <Field label="Project type">
        <Select value={p.projectType} onChange={(e) => setP({ ...p, projectType: e.target.value })}>
          {PROJECT_TYPES.map((t) => <option key={t}>{t}</option>)}
        </Select>
      </Field>
      <Field label="Description"><TextArea value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <Field label="Start date"><TextInput type="date" value={p.startDate} onChange={(e) => setP({ ...p, startDate: e.target.value })} /></Field>
        <Field label="End date"><TextInput type="date" value={p.endDate} onChange={(e) => setP({ ...p, endDate: e.target.value })} /></Field>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => p.name.trim() && onSave(p)}>Save</Btn>
      </div>
    </Sheet>
  );
}

function ProjectDetail({ id, companyId, ctx, canEdit, onBack }) {
  const [project, setProject] = useState(undefined);
  const [goals, setGoals] = useState(null);
  const [goalForm, setGoalForm] = useState(null);
  const [recalculating, setRecalculating] = useState(false);
  const trace = useScoreTrace();

  const reload = () => {
    getProject(id).then(setProject);
    listGoalsForProject(id).then(setGoals).catch(() => setGoals([]));
  };
  useEffect(reload, [id]);

  if (project === undefined) return <div style={{ padding: 24, color: T.muted, fontSize: 13.5 }}>Loading…</div>;
  if (!project) return <div style={{ padding: 18 }}><Btn variant="ghost" onClick={onBack}><ArrowLeft size={15} />Back</Btn></div>;

  const goalWeightError = canEdit ? validateSiblingWeights((goals || []).map((g) => g.weight), { allowDraft: (goals || []).length === 0 }) : null;

  const recalculate = async () => {
    setRecalculating(true);
    try { await recalculateProjectScorecard(id, companyId, ctx); reload(); }
    finally { setRecalculating(false); }
  };

  return (
    <div>
      <div style={{ padding: "14px 18px 0" }}>
        <Btn variant="ghost" small onClick={onBack}><ArrowLeft size={14} />All projects</Btn>
      </div>
      <Header title={project.name} subtitle={`${project.projectType} · ${project.status}`} icon={Briefcase} color={MODULE_COLORS.pamsFactory}
        action={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {project.latestSummary && <ScoreBadge score={project.latestSummary.score} ratingName={project.latestSummary.ratingName} ragStatus={project.latestSummary.ragStatus} />}
            {canEdit && <Btn small variant="ghost" onClick={recalculate} disabled={recalculating}>{recalculating ? "Recalculating…" : "Recalculate scorecard"}</Btn>}
          </div>
        } />
      {goalWeightError && <div style={{ margin: "0 18px 10px", background: T.amberSoft, color: T.amber, padding: "8px 12px", borderRadius: 10, fontSize: 13 }}>Goal weights: {goalWeightError}</div>}

      <div style={{ padding: "0 18px" }}>
        {goals?.length === 0 && <EmptyRow text="No goals yet." />}
        {(goals || []).map((goal) => (
          <GoalNode key={goal.id} goal={goal} companyId={companyId} projectId={id} ctx={ctx} canEdit={canEdit} onChanged={reload} />
        ))}
        {canEdit && <Btn small variant="ghost" onClick={() => setGoalForm(emptyGoal())}><Plus size={13} />Add goal</Btn>}
      </div>

      {goalForm && (
        <GenericLevelForm title="New goal" initial={goalForm} extraFields="goal"
          onClose={() => setGoalForm(null)}
          onSave={async (data) => { await createGoal(companyId, id, data, ctx); setGoalForm(null); reload(); }} />
      )}
    </div>
  );
}

function GoalNode({ goal, companyId, projectId, ctx, canEdit, onChanged }) {
  const [expanded, setExpanded] = useState(false);
  const [objectives, setObjectives] = useState(null);
  const [objForm, setObjForm] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const reload = () => listObjectivesForGoal(goal.id).then(setObjectives).catch(() => setObjectives([]));
  useEffect(() => { if (expanded) reload(); }, [expanded]);

  const objWeightError = canEdit && objectives ? validateSiblingWeights(objectives.map((o) => o.weight), { allowDraft: objectives.length === 0 }) : null;

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setExpanded((v) => !v)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
            {expanded ? <ChevronDown size={15} color={T.muted} /> : <ChevronRight size={15} color={T.muted} />}
          </button>
          <div style={{ flex: 1, cursor: "pointer" }} onClick={() => canEdit && setEditForm(goal)}>
            <span style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>{goal.title}</span>
            <span style={{ fontSize: 12, color: T.muted, marginLeft: 8 }}>weight {goal.weight}%</span>
          </div>
          {goal.latestSummary && <ScoreBadge score={goal.latestSummary.score} ratingName={goal.latestSummary.ratingName} ragStatus={goal.latestSummary.ragStatus} />}
          <Pill tone="muted">{goal.status}</Pill>
        </div>
      </div>
      {expanded && (
        <div style={{ paddingLeft: 20, marginTop: 6 }}>
          {objWeightError && <div style={{ marginBottom: 6, fontSize: 12, color: T.amber }}>Objective weights: {objWeightError}</div>}
          {objectives?.length === 0 && <EmptyRow text="No objectives yet." />}
          {(objectives || []).map((obj) => (
            <ObjectiveNode key={obj.id} objective={obj} companyId={companyId} projectId={projectId} ctx={ctx} canEdit={canEdit} onChanged={reload} />
          ))}
          {canEdit && <Btn small variant="ghost" onClick={() => setObjForm(emptyObjective())}><Plus size={12} />Add objective</Btn>}
        </div>
      )}
      {objForm && (
        <GenericLevelForm title="New objective" initial={objForm}
          onClose={() => setObjForm(null)}
          onSave={async (data) => { await createObjective(goal.id, data, ctx); setObjForm(null); reload(); }} />
      )}
      {editForm && (
        <GenericLevelForm title="Edit goal" initial={editForm}
          onClose={() => setEditForm(null)}
          onSave={async (data) => { await updateGoal(goal.id, data, ctx); setEditForm(null); onChanged(); }}
          onDelete={() => { if (window.confirm("Delete this goal?")) deleteGoal(goal.id, ctx).then(() => { setEditForm(null); onChanged(); }); }} />
      )}
    </div>
  );
}

function ObjectiveNode({ objective, companyId, projectId, ctx, canEdit, onChanged }) {
  const [expanded, setExpanded] = useState(false);
  const [flatSubs, setFlatSubs] = useState(null);
  const [targets, setTargets] = useState(null);
  const [subForm, setSubForm] = useState(null); // { parentSubObjectiveId }
  const [targetForm, setTargetForm] = useState(null); // { parentType, parentId }
  const [editForm, setEditForm] = useState(null);

  const reload = () => {
    listAllSubObjectivesForObjective(objective.id).then(setFlatSubs).catch(() => setFlatSubs([]));
    listTargetsForParent("objective", objective.id).then(setTargets).catch(() => setTargets([]));
  };
  useEffect(() => { if (expanded) reload(); }, [expanded]);

  const tree = flatSubs ? buildSubObjectiveTree(flatSubs) : [];

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
        <button onClick={() => setExpanded((v) => !v)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
          {expanded ? <ChevronDown size={14} color={T.muted} /> : <ChevronRight size={14} color={T.muted} />}
        </button>
        <div style={{ flex: 1, cursor: "pointer" }} onClick={() => canEdit && setEditForm(objective)}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{objective.title}</span>
          <span style={{ fontSize: 11.5, color: T.muted, marginLeft: 8 }}>weight {objective.weight}%</span>
        </div>
        {objective.latestSummary && <ScoreBadge score={objective.latestSummary.score} ratingName={objective.latestSummary.ratingName} ragStatus={objective.latestSummary.ragStatus} />}
      </div>
      {expanded && (
        <div style={{ paddingLeft: 20 }}>
          {tree.map((so) => (
            <SubObjectiveNode key={so.id} node={so} objectiveId={objective.id} companyId={companyId} projectId={projectId} ctx={ctx} canEdit={canEdit} onChanged={reload} depth={0} />
          ))}
          {(targets || []).map((t) => (
            <TargetNode key={t.id} target={t} ctx={ctx} canEdit={canEdit} onChanged={reload} />
          ))}
          {canEdit && (
            <div style={{ display: "flex", gap: 8 }}>
              <Btn small variant="ghost" onClick={() => setSubForm({ parentSubObjectiveId: null })}><Plus size={12} />Add sub-objective</Btn>
              <Btn small variant="ghost" onClick={() => setTargetForm({ parentType: "objective", parentId: objective.id })}><TargetIcon size={12} />Add target</Btn>
            </div>
          )}
        </div>
      )}
      {subForm && (
        <GenericLevelForm title="New sub-objective" initial={emptySubObjective()}
          onClose={() => setSubForm(null)}
          onSave={async (data) => { await createSubObjective(objective.id, subForm.parentSubObjectiveId, data, ctx); setSubForm(null); reload(); }} />
      )}
      {targetForm && (
        <TargetForm onClose={() => setTargetForm(null)}
          onSave={async (data) => {
            await createTarget({ parentType: targetForm.parentType, parentId: targetForm.parentId, objectiveId: objective.id, factoryId: companyId, projectId }, data, ctx);
            setTargetForm(null); reload();
          }} />
      )}
      {editForm && (
        <GenericLevelForm title="Edit objective" initial={editForm}
          onClose={() => setEditForm(null)}
          onSave={async (data) => { await updateObjective(objective.id, data, ctx); setEditForm(null); onChanged(); }}
          onDelete={() => { if (window.confirm("Delete this objective?")) deleteObjective(objective.id, ctx).then(() => { setEditForm(null); onChanged(); }); }} />
      )}
    </div>
  );
}

function SubObjectiveNode({ node, objectiveId, companyId, projectId, ctx, canEdit, onChanged, depth }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const [targets, setTargets] = useState(null);
  const [subForm, setSubForm] = useState(false);
  const [targetForm, setTargetForm] = useState(false);
  const [editForm, setEditForm] = useState(null);

  useEffect(() => { if (expanded) listTargetsForParent("subObjective", node.id).then(setTargets).catch(() => setTargets([])); }, [expanded]);

  return (
    <div style={{ marginBottom: 4, paddingLeft: depth * 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}>
        <button onClick={() => setExpanded((v) => !v)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
          {expanded ? <ChevronDown size={13} color={T.muted} /> : <ChevronRight size={13} color={T.muted} />}
        </button>
        <div style={{ flex: 1, cursor: "pointer" }} onClick={() => canEdit && setEditForm(node)}>
          <span style={{ fontSize: 13, color: T.ink }}>{node.title}</span>
          <span style={{ fontSize: 11, color: T.muted, marginLeft: 6 }}>weight {node.weight}%</span>
        </div>
        {node.latestSummary && <ScoreBadge score={node.latestSummary.score} ratingName={node.latestSummary.ratingName} ragStatus={node.latestSummary.ragStatus} />}
      </div>
      {expanded && (
        <div style={{ paddingLeft: 18 }}>
          {(node.children || []).map((child) => (
            <SubObjectiveNode key={child.id} node={child} objectiveId={objectiveId} companyId={companyId} projectId={projectId} ctx={ctx} canEdit={canEdit} onChanged={onChanged} depth={depth + 1} />
          ))}
          {(targets || []).map((t) => <TargetNode key={t.id} target={t} ctx={ctx} canEdit={canEdit} onChanged={() => listTargetsForParent("subObjective", node.id).then(setTargets)} />)}
          {canEdit && (
            <div style={{ display: "flex", gap: 8 }}>
              <Btn small variant="ghost" onClick={() => setSubForm(true)}><Plus size={11} />Add sub-objective</Btn>
              <Btn small variant="ghost" onClick={() => setTargetForm(true)}><TargetIcon size={11} />Add target</Btn>
            </div>
          )}
        </div>
      )}
      {subForm && (
        <GenericLevelForm title="New sub-objective" initial={emptySubObjective()}
          onClose={() => setSubForm(false)}
          onSave={async (data) => { await createSubObjective(objectiveId, node.id, data, ctx); setSubForm(false); onChanged(); }} />
      )}
      {targetForm && (
        <TargetForm onClose={() => setTargetForm(false)}
          onSave={async (data) => {
            await createTarget({ parentType: "subObjective", parentId: node.id, objectiveId, factoryId: companyId, projectId }, data, ctx);
            setTargetForm(false);
            listTargetsForParent("subObjective", node.id).then(setTargets);
          }} />
      )}
      {editForm && (
        <GenericLevelForm title="Edit sub-objective" initial={editForm}
          onClose={() => setEditForm(null)}
          onSave={async (data) => { await updateSubObjective(node.id, data, ctx); setEditForm(null); onChanged(); }}
          onDelete={() => { if (window.confirm("Delete this sub-objective?")) deleteSubObjective(node.id, ctx).then(() => { setEditForm(null); onChanged(); }); }} />
      )}
    </div>
  );
}

function TargetNode({ target, ctx, canEdit, onChanged }) {
  const [expanded, setExpanded] = useState(false);
  const [kpiLinks, setKpiLinks] = useState(null);
  const [kpiForm, setKpiForm] = useState(false);
  const [editForm, setEditForm] = useState(null);

  useEffect(() => { if (expanded) listKpiLinksForTarget(target.id).then(setKpiLinks).catch(() => setKpiLinks([])); }, [expanded]);

  return (
    <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: 8, marginBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button onClick={() => setExpanded((v) => !v)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
          {expanded ? <ChevronDown size={13} color={T.muted} /> : <ChevronRight size={13} color={T.muted} />}
        </button>
        <TargetIcon size={13} color={T.accent} />
        <div style={{ flex: 1, cursor: "pointer" }} onClick={() => canEdit && setEditForm(target)}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{target.title}</span>
          <span style={{ fontSize: 11, color: T.muted, marginLeft: 6 }}>
            {target.baseline || "—"} → {target.targetValue || "—"} {target.unit} ({target.direction}) · weight {target.weight}%
          </span>
        </div>
        {target.latestSummary && <ScoreBadge score={target.latestSummary.score} ratingName={target.latestSummary.ratingName} ragStatus={target.latestSummary.ragStatus} />}
      </div>
      {expanded && (
        <div style={{ paddingLeft: 20, marginTop: 6 }}>
          {kpiLinks?.length === 0 && <div style={{ fontSize: 12, color: T.muted }}>No KPIs attached.</div>}
          {(kpiLinks || []).map((link) => <KpiLinkRow key={link.id} link={link} target={target} ctx={ctx} canEdit={canEdit} onChanged={() => listKpiLinksForTarget(target.id).then(setKpiLinks)} />)}
          {canEdit && <Btn small variant="ghost" onClick={() => setKpiForm(true)}><Gauge size={11} />Attach KPI</Btn>}

          <div style={{ fontSize: 11, fontWeight: 800, color: T.muted, textTransform: "uppercase", marginTop: 10, marginBottom: 2 }}>Actions</div>
          <ActionsForTarget target={target} ctx={ctx} canEdit={canEdit} />
        </div>
      )}
      {kpiForm && (
        <AttachKpiForm target={target} ctx={ctx} onClose={() => setKpiForm(false)}
          onSaved={() => { setKpiForm(false); listKpiLinksForTarget(target.id).then(setKpiLinks); }} />
      )}
      {editForm && (
        <TargetForm initial={editForm} onClose={() => setEditForm(null)}
          onSave={async (data) => { await updateTarget(target.id, data, ctx); setEditForm(null); onChanged(); }}
          onDelete={() => { if (window.confirm("Delete this target?")) deleteTarget(target.id, ctx).then(() => { setEditForm(null); onChanged(); }); }} />
      )}
    </div>
  );
}

function KpiLinkRow({ link, target, ctx, canEdit, onChanged }) {
  const [kpi, setKpi] = useState(null);
  useEffect(() => { listKpis().then((all) => setKpi(all.find((k) => k.id === link.kpiId))); }, [link.kpiId]);
  return (
    <div style={{ padding: "4px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
        <Gauge size={12} color={T.muted} />
        <span style={{ flex: 1, color: T.ink2 }}>{kpi?.name || link.kpiId} — {link.baseline || "—"} → {link.targetValue || "—"} (weight {link.weight}%)</span>
        {canEdit && <button onClick={() => deleteKpiLink(link.id, ctx).then(onChanged)} style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 11 }}>Remove</button>}
      </div>
      <div style={{ paddingLeft: 20 }}>
        <MeasurementEntry kpiLink={link} target={target} ctx={ctx} />
      </div>
    </div>
  );
}

function AttachKpiForm({ target, ctx, onClose, onSaved }) {
  const [kpis, setKpis] = useState(null);
  const [kpiId, setKpiId] = useState("");
  const [baseline, setBaseline] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [weight, setWeight] = useState(100);

  useEffect(() => { ensureDefaultKpiLibrarySeeded(ctx).then(() => listKpis().then((all) => { setKpis(all); if (all[0]) setKpiId(all[0].id); })); }, []);

  return (
    <Sheet title="Attach KPI" onClose={onClose}>
      <Field label="KPI">
        {kpis === null ? <div style={{ color: T.muted, fontSize: 13 }}>Loading…</div> : (
          <Select value={kpiId} onChange={(e) => setKpiId(e.target.value)}>
            {KPI_CATEGORIES.map((cat) => (
              <optgroup key={cat} label={cat}>
                {kpis.filter((k) => k.category === cat).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </optgroup>
            ))}
          </Select>
        )}
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <Field label="Baseline"><TextInput value={baseline} onChange={(e) => setBaseline(e.target.value)} /></Field>
        <Field label="Target value"><TextInput value={targetValue} onChange={(e) => setTargetValue(e.target.value)} /></Field>
      </div>
      <Field label="Weight within this target (%)"><TextInput type="number" value={weight} onChange={(e) => setWeight(e.target.value)} /></Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={async () => { if (!kpiId) return; await createKpiLink(kpiId, target.id, target.factoryId, { baseline, targetValue, weight: Number(weight) }, ctx); onSaved(); }}>Attach</Btn>
      </div>
    </Sheet>
  );
}

function TargetForm({ initial, onClose, onSave, onDelete }) {
  const [t, setT] = useState(initial || emptyTarget());
  return (
    <Sheet title={initial ? "Edit target" : "New target"} onClose={onClose}>
      <Field label="Target title"><TextInput value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <Field label="Type">
          <Select value={t.targetType} onChange={(e) => setT({ ...t, targetType: e.target.value })}>
            {TARGET_TYPES.map((x) => <option key={x}>{x}</option>)}
          </Select>
        </Field>
        <Field label="Direction">
          <Select value={t.direction} onChange={(e) => setT({ ...t, direction: e.target.value })}>
            {TARGET_DIRECTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
          </Select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
        <Field label="Baseline"><TextInput value={t.baseline} onChange={(e) => setT({ ...t, baseline: e.target.value })} /></Field>
        <Field label="Target value"><TextInput value={t.targetValue} onChange={(e) => setT({ ...t, targetValue: e.target.value })} /></Field>
        <Field label="Unit"><TextInput value={t.unit} onChange={(e) => setT({ ...t, unit: e.target.value })} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
        <Field label="Weight (%)"><TextInput type="number" value={t.weight} onChange={(e) => setT({ ...t, weight: Number(e.target.value) })} /></Field>
        <Field label="Start date"><TextInput type="date" value={t.startDate} onChange={(e) => setT({ ...t, startDate: e.target.value })} /></Field>
        <Field label="Due date"><TextInput type="date" value={t.endDate} onChange={(e) => setT({ ...t, endDate: e.target.value })} /></Field>
      </div>
      <Field label="Status">
        <Select value={t.status} onChange={(e) => setT({ ...t, status: e.target.value })}>
          {TARGET_STATUSES.map((x) => <option key={x}>{x}</option>)}
        </Select>
      </Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {onDelete && <Btn variant="danger" onClick={onDelete}>Delete</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => t.title.trim() && onSave(t)}>Save</Btn>
      </div>
    </Sheet>
  );
}

/**
 * One shared form shell for Goal/Objective/Sub-Objective — the three
 * levels that all share the same core field set (title, description,
 * owner, baseline, target, weight, dates, status). Target has enough
 * extra fields (type/direction/unit) to warrant its own TargetForm above.
 */
function GenericLevelForm({ title, initial, onClose, onSave, onDelete }) {
  const [v, setV] = useState(initial);
  const statuses = GOAL_STATUSES; // identical set for goal/objective/sub-objective today
  return (
    <Sheet title={title} onClose={onClose}>
      <Field label="Title"><TextInput value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
      <Field label="Description"><TextArea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <Field label="Baseline"><TextInput value={v.baseline} onChange={(e) => setV({ ...v, baseline: e.target.value })} /></Field>
        <Field label="Target"><TextInput value={v.target || v.expectedOutcome || ""} onChange={(e) => setV({ ...v, target: e.target.value, expectedOutcome: e.target.value })} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
        <Field label="Weight (%)"><TextInput type="number" value={v.weight} onChange={(e) => setV({ ...v, weight: Number(e.target.value) })} /></Field>
        <Field label="Start date"><TextInput type="date" value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} /></Field>
        <Field label="End date"><TextInput type="date" value={v.endDate} onChange={(e) => setV({ ...v, endDate: e.target.value })} /></Field>
      </div>
      <Field label="Status">
        <Select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })}>
          {statuses.map((s) => <option key={s}>{s}</option>)}
        </Select>
      </Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {onDelete && <Btn variant="danger" onClick={onDelete}>Delete</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => v.title.trim() && onSave(v)}>Save</Btn>
      </div>
    </Sheet>
  );
}
