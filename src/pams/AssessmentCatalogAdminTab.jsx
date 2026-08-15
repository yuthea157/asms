// Admin management screen for the PAMS assessment category/item catalog
// (docs/pams/UI_SITEMAP.md §4 "Assessment categories/items (admin)").
// Wired into System Administration alongside Backup & Restore / Date &
// Time — see App.jsx's SystemAdministrationView.

import React, { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { T, Field, TextInput, Sheet, Btn, EmptyRow, Row } from "../ui.jsx";
import {
  createAssessmentCategory, createAssessmentItem, deleteAssessmentCategory, deleteAssessmentItem,
  ensureDefaultAssessmentCatalogSeeded, listAllAssessmentItemsGroupedByCategory,
  renameAssessmentCategory, renameAssessmentItem,
} from "./assessmentCategories.js";

export default function AssessmentCatalogAdminTab({ ctx, canEdit }) {
  const [grouped, setGrouped] = useState(null);
  const [openCategoryId, setOpenCategoryId] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null); // { id?, name }
  const [editingItem, setEditingItem] = useState(null); // { id?, categoryId, text }

  const reload = () => listAllAssessmentItemsGroupedByCategory().then(setGrouped).catch(() => setGrouped([]));
  useEffect(() => {
    ensureDefaultAssessmentCatalogSeeded(ctx).then(reload);
  }, []);

  const saveCategory = async () => {
    if (!editingCategory?.name?.trim()) return;
    if (editingCategory.id) await renameAssessmentCategory(editingCategory.id, editingCategory.name.trim(), ctx);
    else await createAssessmentCategory(editingCategory.name.trim(), (grouped?.length || 0) + 1, ctx);
    setEditingCategory(null);
    reload();
  };
  const removeCategory = async (id) => {
    if (!window.confirm("Delete this category and all its items? This cannot be undone.")) return;
    await deleteAssessmentCategory(id, ctx);
    reload();
  };
  const saveItem = async () => {
    if (!editingItem?.text?.trim()) return;
    const cat = grouped.find((g) => g.category.id === editingItem.categoryId);
    if (editingItem.id) await renameAssessmentItem(editingItem.id, editingItem.text.trim(), ctx);
    else await createAssessmentItem(editingItem.categoryId, editingItem.text.trim(), (cat?.items.length || 0) + 1, ctx);
    setEditingItem(null);
    reload();
  };
  const removeItem = async (id) => {
    if (!window.confirm("Delete this assessment item?")) return;
    await deleteAssessmentItem(id, ctx);
    reload();
  };

  if (grouped === null) return <div style={{ padding: 24, color: T.muted, fontSize: 13.5 }}>Loading…</div>;

  return (
    <div style={{ padding: "10px 18px" }}>
      {grouped.map(({ category, items }) => (
        <div key={category.id} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
            <div onClick={() => setOpenCategoryId((v) => (v === category.id ? null : category.id))} style={{ fontSize: 14, fontWeight: 800, color: T.ink, cursor: "pointer" }}>
              {category.name} ({items.length})
            </div>
            {canEdit && (
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => setEditingCategory({ id: category.id, name: category.name })} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Pencil size={13} color={T.muted} /></button>
                {!category.isSystemDefault && <button onClick={() => removeCategory(category.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Trash2 size={13} color={T.red} /></button>}
              </div>
            )}
          </div>
          {openCategoryId === category.id && (
            <div style={{ paddingLeft: 8 }}>
              {items.length === 0 && <EmptyRow text="No items in this category." />}
              {items.map((item) => (
                <Row key={item.id} left={<span style={{ width: 6, height: 6, borderRadius: 3, background: T.accent }} />} title={item.text}
                  right={canEdit ? (
                    <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setEditingItem({ id: item.id, categoryId: category.id, text: item.text })} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Pencil size={13} color={T.muted} /></button>
                      <button onClick={() => removeItem(item.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Trash2 size={13} color={T.red} /></button>
                    </div>
                  ) : null} />
              ))}
              {canEdit && (
                <Btn small variant="ghost" onClick={() => setEditingItem({ categoryId: category.id, text: "" })}><Plus size={13} />Add item</Btn>
              )}
            </div>
          )}
        </div>
      ))}
      {canEdit && (
        <Btn variant="ghost" onClick={() => setEditingCategory({ name: "" })}><Plus size={15} />Add category</Btn>
      )}

      {editingCategory && (
        <Sheet title={editingCategory.id ? "Rename category" : "New category"} onClose={() => setEditingCategory(null)}>
          <Field label="Category name"><TextInput value={editingCategory.name} onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })} /></Field>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <div style={{ flex: 1 }} />
            <Btn variant="ghost" onClick={() => setEditingCategory(null)}>Cancel</Btn>
            <Btn onClick={saveCategory}>Save</Btn>
          </div>
        </Sheet>
      )}
      {editingItem && (
        <Sheet title={editingItem.id ? "Rename item" : "New item"} onClose={() => setEditingItem(null)}>
          <Field label="Item text"><TextInput value={editingItem.text} onChange={(e) => setEditingItem({ ...editingItem, text: e.target.value })} /></Field>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <div style={{ flex: 1 }} />
            <Btn variant="ghost" onClick={() => setEditingItem(null)}>Cancel</Btn>
            <Btn onClick={saveItem}>Save</Btn>
          </div>
        </Sheet>
      )}
    </div>
  );
}
