// Actions (under a Target) + their Tasks (brief §18-20). Two pieces:
// `ActionsForTarget` (embedded in ProjectHierarchy.jsx's TargetNode) and
// the standalone `ActionsBoard` (List/Kanban, wired into the factory
// Performance tab as its own section — brief §20's Gantt view is a
// documented Phase 9+ follow-up, not built here; List+Kanban+Calendar
// cover the same underlying data without a half-built dependency-graph
// renderer).

import React, { useEffect, useState } from "react";
import { CheckSquare, Plus, ArrowLeft, ListChecks } from "lucide-react";
import { T, MODULE_COLORS, Field, TextInput, TextArea, Select, Sheet, Btn, Header, EmptyState, EmptyRow, Row, Pill, hasPerm } from "../ui.jsx";
import { ACTION_STATUSES, ACTION_PRIORITIES, emptyAction, createAction, listActionsForTarget, listActionsForFactory, updateAction, deleteAction, isActionOverdue } from "./actions.js";
import { emptyTask, createTask, listTasksForAction, updateTask, deleteTask } from "./tasks.js";

const todayISO = () => new Date().toISOString().slice(0, 10);

function actionTone(action) {
  if (isActionOverdue(action, todayISO())) return "red";
  if (action.status === "Completed" || action.status === "Verified" || action.status === "Closed") return "green";
  if (action.status === "In Progress") return "blue";
  if (action.status === "Blocked" || action.status === "Delayed") return "amber";
  return "muted";
}

export function ActionsForTarget({ target, ctx, canEdit }) {
  const [actions, setActions] = useState(null);
  const [form, setForm] = useState(null);
  const [openId, setOpenId] = useState(null);

  const reload = () => listActionsForTarget(target.id).then(setActions).catch(() => setActions([]));
  useEffect(() => { reload(); }, [target.id]);

  if (openId) {
    const action = actions.find((a) => a.id === openId);
    if (action) return <ActionDetail action={action} ctx={ctx} canEdit={canEdit} onBack={() => { setOpenId(null); reload(); }} />;
  }

  return (
    <div style={{ marginTop: 6 }}>
      {actions?.length === 0 && <div style={{ fontSize: 12, color: T.muted }}>No actions yet.</div>}
      {(actions || []).map((a) => (
        <div key={a.id} onClick={() => setOpenId(a.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12.5, cursor: "pointer" }}>
          <CheckSquare size={12} color={T.muted} />
          <span style={{ flex: 1, color: T.ink2 }}>{a.title}</span>
          <Pill tone={actionTone(a)}>{isActionOverdue(a, todayISO()) ? "Overdue" : a.status}</Pill>
        </div>
      ))}
      {canEdit && <Btn small variant="ghost" onClick={() => setForm(emptyAction())}><Plus size={11} />Add action</Btn>}
      {form && (
        <ActionForm initial={form} onClose={() => setForm(null)}
          onSave={async (data) => { await createAction(target.id, target.factoryId, data, ctx); setForm(null); reload(); }} />
      )}
    </div>
  );
}

function ActionForm({ initial, onClose, onSave, onDelete }) {
  const [a, setA] = useState(initial);
  return (
    <Sheet title={initial.status ? "Edit action" : "New action"} onClose={onClose}>
      <Field label="Title"><TextInput value={a.title} onChange={(e) => setA({ ...a, title: e.target.value })} /></Field>
      <Field label="Description"><TextArea value={a.description} onChange={(e) => setA({ ...a, description: e.target.value })} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <Field label="Start date"><TextInput type="date" value={a.startDate} onChange={(e) => setA({ ...a, startDate: e.target.value })} /></Field>
        <Field label="Due date"><TextInput type="date" value={a.dueDate} onChange={(e) => setA({ ...a, dueDate: e.target.value })} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <Field label="Priority">
          <Select value={a.priority} onChange={(e) => setA({ ...a, priority: e.target.value })}>
            {ACTION_PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={a.status} onChange={(e) => setA({ ...a, status: e.target.value })}>
            {ACTION_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Progress (%)"><TextInput type="number" min="0" max="100" value={a.progressPct} onChange={(e) => setA({ ...a, progressPct: Number(e.target.value) })} /></Field>
      <Field label="Expected result"><TextArea value={a.expectedResult} onChange={(e) => setA({ ...a, expectedResult: e.target.value })} rows={2} /></Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {onDelete && <Btn variant="danger" onClick={onDelete}>Delete</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => a.title.trim() && onSave(a)}>Save</Btn>
      </div>
    </Sheet>
  );
}

function ActionDetail({ action, ctx, canEdit, onBack }) {
  const [tasks, setTasks] = useState(null);
  const [taskForm, setTaskForm] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const reload = () => listTasksForAction(action.id).then(setTasks).catch(() => setTasks([]));
  useEffect(() => { reload(); }, [action.id]);

  return (
    <div>
      <div style={{ padding: "8px 0" }}>
        <Btn variant="ghost" small onClick={onBack}><ArrowLeft size={13} />Back</Btn>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{action.title}</div>
          <div style={{ fontSize: 12, color: T.muted }}>{action.dueDate ? `Due ${action.dueDate}` : "No due date"} · {action.status}</div>
        </div>
        {canEdit && <Btn small variant="ghost" onClick={() => setEditForm(action)}>Edit</Btn>}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, textTransform: "uppercase", marginBottom: 6 }}>Tasks</div>
      {tasks?.length === 0 && <EmptyRow text="No tasks yet." />}
      {(tasks || []).map((t) => (
        <TaskRow key={t.id} task={t} ctx={ctx} canEdit={canEdit} onChanged={reload} />
      ))}
      {canEdit && <Btn small variant="ghost" onClick={() => setTaskForm(emptyTask())}><Plus size={12} />Add task</Btn>}
      {taskForm && (
        <Sheet title="New task" onClose={() => setTaskForm(null)}>
          <Field label="Task title"><TextInput value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} /></Field>
          <Field label="Due date"><TextInput type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} /></Field>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <div style={{ flex: 1 }} />
            <Btn variant="ghost" onClick={() => setTaskForm(null)}>Cancel</Btn>
            <Btn onClick={async () => { if (!taskForm.title.trim()) return; await createTask(action.id, taskForm, ctx); setTaskForm(null); reload(); }}>Save</Btn>
          </div>
        </Sheet>
      )}
      {editForm && (
        <ActionForm initial={editForm} onClose={() => setEditForm(null)}
          onSave={async (data) => { await updateAction(action.id, data, ctx); setEditForm(null); onBack(); }}
          onDelete={() => { if (window.confirm("Delete this action and its tasks?")) deleteAction(action.id, ctx).then(onBack); }} />
      )}
    </div>
  );
}

function TaskRow({ task, ctx, canEdit, onChanged }) {
  const toggle = () => updateTask(task.id, { status: task.status === "Completed" ? "Not Started" : "Completed" }, ctx).then(onChanged);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
      <input type="checkbox" checked={task.status === "Completed"} onChange={canEdit ? toggle : undefined} disabled={!canEdit} />
      <span style={{ flex: 1, fontSize: 13, color: task.status === "Completed" ? T.muted : T.ink, textDecoration: task.status === "Completed" ? "line-through" : "none" }}>{task.title}</span>
      {task.dueDate && <span style={{ fontSize: 11, color: T.muted }}>{task.dueDate}</span>}
      {canEdit && <button onClick={() => deleteTask(task.id, ctx).then(onChanged)} style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 11 }}>×</button>}
    </div>
  );
}

/** Standalone factory-wide Actions board — List + Kanban (brief §20). */
export function ActionsBoard({ companyId, ctx }) {
  const [actions, setActions] = useState(null);
  const [view, setView] = useState("list");
  const canEdit = hasPerm(ctx, "pamsFactory", "edit");

  useEffect(() => { listActionsForFactory(companyId).then(setActions).catch(() => setActions([])); }, [companyId]);

  if (actions === null) return <div style={{ padding: 18, color: T.muted, fontSize: 13.5 }}>Loading…</div>;

  return (
    <div>
      <Header title="Actions" subtitle={`${actions.length} across this factory`} icon={ListChecks} color={MODULE_COLORS.pamsFactory} />
      <div style={{ display: "flex", gap: 6, padding: "10px 18px" }}>
        {[{ k: "list", l: "List" }, { k: "kanban", l: "Kanban" }].map((v) => (
          <button key={v.k} onClick={() => setView(v.k)} style={{
            padding: "7px 13px", borderRadius: 999, border: `1px solid ${view === v.k ? T.accent : T.border}`,
            background: view === v.k ? T.accentSoft : T.surface, color: view === v.k ? T.accentDark : T.ink2,
            fontSize: 12.5, fontWeight: 700, cursor: "pointer",
          }}>{v.l}</button>
        ))}
      </div>
      {actions.length === 0 && <div style={{ padding: "0 18px" }}><EmptyState icon={ListChecks} color={MODULE_COLORS.pamsFactory} title="No actions yet" hint="Actions are created from a Target inside a project's Goal hierarchy." /></div>}
      {view === "list" && actions.length > 0 && (
        <div style={{ padding: "0 18px" }}>
          {actions.map((a) => (
            <Row key={a.id} left={<CheckSquare size={16} color={T.accent} />} title={a.title}
              sub={a.dueDate ? `Due ${a.dueDate}` : "No due date"} right={<Pill tone={actionTone(a)}>{isActionOverdue(a, todayISO()) ? "Overdue" : a.status}</Pill>} />
          ))}
        </div>
      )}
      {view === "kanban" && actions.length > 0 && (
        <div style={{ display: "flex", gap: 10, padding: "0 18px", overflowX: "auto" }}>
          {ACTION_STATUSES.map((status) => (
            <div key={status} style={{ minWidth: 200, flexShrink: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: T.muted, textTransform: "uppercase", marginBottom: 6 }}>{status} ({actions.filter((a) => a.status === status).length})</div>
              {actions.filter((a) => a.status === status).map((a) => (
                <div key={a.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 8, marginBottom: 6, fontSize: 12.5 }}>
                  {a.title}
                  {a.dueDate && <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{a.dueDate}</div>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
