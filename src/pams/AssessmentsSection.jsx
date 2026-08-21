// Assessments section of the factory Performance tab (docs/pams/
// UI_SITEMAP.md §4 "Assessment" screens, collapsed into one file matching
// ASMS's existing per-module convention). List → take (wizard, Draft) →
// detail (read-only, Submitted/Reviewed).

import React, { useEffect, useState } from "react";
import { ClipboardCheck, Plus, ArrowLeft, Upload, CheckCircle2, FileText, Trash2 } from "lucide-react";
import {
  T, MODULE_COLORS, Field, TextInput, TextArea, Select, Sheet, Btn, Header,
  EmptyState, SectionLabel, EmptyRow, Row, Pill, hasPerm,
} from "../ui.jsx";
import { ASSESSMENT_TYPES, createDraftAssessment, getAssessment, listAssessmentsForFactory, markAssessmentReviewed, reopenAssessment, submitAssessment, updateItemResult } from "./assessments.js";
import { listAllAssessmentItemsGroupedByCategory } from "./assessmentCategories.js";
import { deleteEvidence, listEvidenceFor, signedEvidenceUrl, uploadEvidence } from "./evidence.js";
import { resolveDefaultRating } from "./defaultRating.js";

export default function AssessmentsSection({ companyId, ctx }) {
  const [assessments, setAssessments] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [newTypeForm, setNewTypeForm] = useState(false);
  const [error, setError] = useState("");

  const canEdit = hasPerm(ctx, "pamsFactory", "edit");

  const reload = () => listAssessmentsForFactory(companyId).then(setAssessments).catch(() => setAssessments([]));
  useEffect(() => { reload(); }, [companyId]);

  const createAssessment = async (assessmentType) => {
    setError("");
    try {
      const id = await createDraftAssessment({ factoryId: companyId, projectId: null, assessmentType }, ctx);
      setNewTypeForm(false);
      setOpenId(id);
    } catch (e) {
      setError(e?.message || "Could not create the assessment.");
    }
  };

  if (openId) {
    return <AssessmentDetail id={openId} ctx={ctx} canEdit={canEdit} onBack={() => { setOpenId(null); reload(); }} />;
  }

  return (
    <div>
      <SectionLabel>Assessments {assessments ? `(${assessments.length})` : ""}</SectionLabel>
      {error && <div style={{ margin: "0 18px 10px", background: T.redSoft, color: T.red, padding: "8px 12px", borderRadius: 10, fontSize: 13 }}>{error}</div>}
      <div style={{ padding: "0 18px" }}>
        {assessments === null && <div style={{ color: T.muted, fontSize: 13.5, padding: "8px 0" }}>Loading…</div>}
        {assessments?.length === 0 && <EmptyRow text="No assessments yet." />}
        {assessments?.map((a) => (
          <Row key={a.id} onClick={() => setOpenId(a.id)} left={<ClipboardCheck size={16} color={T.accent} />}
            title={`${a.assessmentType} Assessment`} sub={`${a.assessmentDate} · ${a.status}`}
            right={a.overallScore != null ? <Pill tone={ratingTone(a.overallRatingLabel)}>{a.overallScore} · {a.overallRatingLabel}</Pill> : <Pill>{a.status}</Pill>} />
        ))}
        {canEdit && (
          <div style={{ textAlign: "center", marginTop: 8 }}>
            <Btn small onClick={() => setNewTypeForm(true)}><Plus size={13} />New assessment</Btn>
          </div>
        )}
      </div>

      {newTypeForm && (
        <Sheet title="New assessment" onClose={() => setNewTypeForm(false)}>
          <Field label="Assessment type">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ASSESSMENT_TYPES.map((t) => (
                <Btn key={t} variant="ghost" onClick={() => createAssessment(t)}>{t}</Btn>
              ))}
            </div>
          </Field>
        </Sheet>
      )}
    </div>
  );
}

function ratingTone(label) {
  if (label === "Excellent" || label === "Very Good") return "green";
  if (label === "Good" || label === "Needs Improvement") return "amber";
  if (label === "Poor") return "red";
  return "muted";
}

function AssessmentDetail({ id, ctx, canEdit, onBack }) {
  const [assessment, setAssessment] = useState(undefined);
  const [catalog, setCatalog] = useState(null);
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = () => getAssessment(id).then(setAssessment).catch(() => setAssessment(null));
  useEffect(() => { reload(); }, [id]);
  useEffect(() => {
    listAllAssessmentItemsGroupedByCategory().then((g) => {
      setCatalog(g);
      if (g.length) setActiveCategoryId((prev) => prev || g[0].category.id);
    });
  }, []);

  if (assessment === undefined || catalog === null) {
    return <div style={{ padding: 24, color: T.muted, fontSize: 13.5 }}>Loading…</div>;
  }
  if (!assessment) {
    return <div style={{ padding: 18 }}><Btn variant="ghost" onClick={onBack}><ArrowLeft size={15} />Back</Btn></div>;
  }

  const isDraft = assessment.status === "Draft";
  const resultByItemId = Object.fromEntries(assessment.itemResults.map((r) => [r.itemId, r]));
  const activeCategory = catalog.find((g) => g.category.id === activeCategoryId);

  const saveItem = async (itemId, patch) => {
    setError("");
    try {
      await updateItemResult(id, itemId, patch, ctx);
      reload();
    } catch (e) {
      setError(e?.message || "Could not save.");
    }
  };

  const submit = async () => {
    setBusy(true); setError("");
    try {
      await submitAssessment(id, ctx);
      reload();
    } catch (e) {
      setError(e?.message || "Could not submit the assessment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ padding: "14px 18px 0" }}>
        <Btn variant="ghost" small onClick={onBack}><ArrowLeft size={14} />All assessments</Btn>
      </div>
      <Header title={`${assessment.assessmentType} Assessment`} subtitle={`${assessment.assessmentDate} · ${assessment.status}`}
        icon={ClipboardCheck} color={MODULE_COLORS.pamsFactory}
        action={
          <div style={{ display: "flex", gap: 8 }}>
            {assessment.overallScore != null && <Pill tone={ratingTone(assessment.overallRatingLabel)}>{assessment.overallScore} · {assessment.overallRatingLabel}</Pill>}
            {canEdit && isDraft && <Btn small onClick={submit} disabled={busy}><CheckCircle2 size={13} />Submit</Btn>}
            {canEdit && assessment.status === "Submitted" && <Btn small variant="ghost" onClick={() => markAssessmentReviewed(id, ctx).then(reload)}>Mark Reviewed</Btn>}
            {canEdit && !isDraft && <Btn small variant="ghost" onClick={() => reopenAssessment(id, ctx).then(reload)}>Reopen</Btn>}
          </div>
        } />

      {error && <div style={{ margin: "0 18px 10px", background: T.redSoft, color: T.red, padding: "8px 12px", borderRadius: 10, fontSize: 13 }}>{error}</div>}

      <div style={{ display: "flex", gap: 6, padding: "10px 18px", flexWrap: "wrap" }}>
        {catalog.map(({ category }) => {
          const catResults = assessment.itemResults.filter((r) => r.categoryId === category.id);
          const scoredCount = catResults.filter((r) => typeof r.score === "number").length;
          return (
            <button key={category.id} onClick={() => setActiveCategoryId(category.id)} style={{
              padding: "7px 13px", borderRadius: 999, border: `1px solid ${activeCategoryId === category.id ? T.accent : T.border}`,
              background: activeCategoryId === category.id ? T.accentSoft : T.surface, color: activeCategoryId === category.id ? T.accentDark : T.ink2,
              fontSize: 12.5, fontWeight: 700, cursor: "pointer",
            }}>{category.name} ({scoredCount}/{catResults.length})</button>
          );
        })}
      </div>

      {activeCategory && (
        <div style={{ padding: "0 18px" }}>
          {activeCategory.items.map((item) => (
            <AssessmentItemRow key={item.id} item={item} result={resultByItemId[item.id]} assessmentId={id} ctx={ctx}
              canEdit={canEdit && isDraft} onSave={(patch) => saveItem(item.id, patch)} />
          ))}
        </div>
      )}
    </div>
  );
}

function AssessmentItemRow({ item, result, assessmentId, ctx, canEdit, onSave }) {
  const [expanded, setExpanded] = useState(false);
  const [local, setLocal] = useState(result || {});
  const [evidence, setEvidence] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => setLocal(result || {}), [result]);

  const reloadEvidence = () => listEvidenceFor("AssessmentItem", `${assessmentId}:${item.id}`).then(setEvidence).catch(() => setEvidence([]));
  useEffect(() => { if (expanded) reloadEvidence(); }, [expanded]);

  const rating = typeof local.score === "number" ? resolveDefaultRating(local.score) : null;

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadEvidence({ file, entityType: "AssessmentItem", entityId: `${assessmentId}:${item.id}`, factoryId: null, title: file.name }, ctx);
      reloadEvidence();
    } catch {
      // best-effort — evidence upload failure shouldn't block scoring
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 12, marginBottom: 8 }}>
      <div onClick={() => setExpanded((v) => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{item.text}</div>
        {rating && <Pill tone={ratingTone(rating.name)}>{local.score} · {rating.name}</Pill>}
      </div>
      {expanded && (
        <div style={{ marginTop: 10, borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink2 }}>Score (0-100)</span>
            <TextInput type="number" min="0" max="100" disabled={!canEdit} value={local.score ?? ""}
              onChange={(e) => setLocal({ ...local, score: e.target.value === "" ? null : Number(e.target.value) })}
              onBlur={() => canEdit && onSave({ score: local.score })} />
          </div>
          <Field label="Observation"><TextArea disabled={!canEdit} value={local.observation || ""} onChange={(e) => setLocal({ ...local, observation: e.target.value })} onBlur={() => canEdit && onSave({ observation: local.observation })} rows={2} /></Field>
          <Field label="Finding"><TextArea disabled={!canEdit} value={local.finding || ""} onChange={(e) => setLocal({ ...local, finding: e.target.value })} onBlur={() => canEdit && onSave({ finding: local.finding })} rows={2} /></Field>
          <Field label="Risk"><TextArea disabled={!canEdit} value={local.risk || ""} onChange={(e) => setLocal({ ...local, risk: e.target.value })} onBlur={() => canEdit && onSave({ risk: local.risk })} rows={2} /></Field>
          <Field label="Recommended action"><TextArea disabled={!canEdit} value={local.recommendedAction || ""} onChange={(e) => setLocal({ ...local, recommendedAction: e.target.value })} onBlur={() => canEdit && onSave({ recommendedAction: local.recommendedAction })} rows={2} /></Field>

          <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, textTransform: "uppercase", marginTop: 6, marginBottom: 6 }}>Evidence</div>
          {(evidence || []).map((ev) => (
            <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13 }}>
              <FileText size={14} color={T.muted} />
              <a
                href="#"
                onClick={async (e) => { e.preventDefault(); const url = await signedEvidenceUrl(ev.storagePath); window.open(url, "_blank", "noreferrer"); }}
                style={{ color: T.accent, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >{ev.title}</a>
              {canEdit && <button onClick={() => deleteEvidence(ev, ctx).then(reloadEvidence)} style={{ background: "none", border: "none", cursor: "pointer" }}><Trash2 size={13} color={T.red} /></button>}
            </div>
          ))}
          {canEdit && (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: T.accent, cursor: "pointer", marginTop: 6 }}>
              <Upload size={13} />{uploading ? "Uploading…" : "Attach evidence"}
              <input type="file" onChange={handleUpload} style={{ display: "none" }} disabled={uploading} />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
