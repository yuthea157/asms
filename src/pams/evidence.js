// pams_evidence — polymorphic evidence attachment, files in Firebase
// Storage (not base64-in-Firestore). See docs/pams/ARCHITECTURE.md §4 and
// docs/pams/DOMAIN_MODEL.md §4.

import { storage } from "../firebase.js";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { createRecord, deleteRecord, listRecords, updateRecord, where } from "./pamsStore.js";

const MAX_EVIDENCE_BYTES = 10_000_000; // 10MB — generous for a compressed image/PDF/office doc, small enough to keep Storage usage sane at PAMS's real target volume (docs/pams/ARCHITECTURE.md §7)

/**
 * Uploads a File to Firebase Storage and creates its pams_evidence record.
 * `entityType`/`entityId` are the polymorphic attachment target (e.g.
 * "Assessment", the assessment's id).
 */
export async function uploadEvidence({ file, entityType, entityId, factoryId, title, documentType, period }, ctx) {
  if (file.size > MAX_EVIDENCE_BYTES) {
    throw new Error(`"${file.name}" is too large (max ${Math.round(MAX_EVIDENCE_BYTES / 1_000_000)}MB).`);
  }
  const evidenceId = `ev_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const storagePath = `pams-evidence/${factoryId}/${entityType}/${entityId}/${evidenceId}${extension}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file, { contentType: file.type || "application/octet-stream" });
  const downloadUrl = await getDownloadURL(storageRef);

  const id = await createRecord("pams_evidence", {
    entityType, entityId, factoryId,
    title: title || file.name, documentType: documentType || "Other", period: period || null,
    storagePath, downloadUrl, mimeType: file.type || "application/octet-stream", sizeBytes: file.size,
    verificationStatus: "Submitted", verifiedBy: null, verifiedAt: null, reviewerComment: null,
  }, ctx);
  return { id, storagePath, downloadUrl };
}

export function listEvidenceFor(entityType, entityId) {
  return listRecords("pams_evidence", [where("entityType", "==", entityType), where("entityId", "==", entityId)]);
}

export async function deleteEvidence(evidenceRecord, ctx) {
  try {
    await deleteObject(ref(storage, evidenceRecord.storagePath));
  } catch {
    // Storage object already gone (e.g. manually removed) — still clean up
    // the Firestore record rather than leaving an orphaned reference.
  }
  await deleteRecord("pams_evidence", evidenceRecord.id, ctx);
}

/**
 * Verification workflow (docs/pams/SECURITY.md §6) — Submitted →
 * UnderReview → Verified, or → Returned → Resubmitted → UnderReview.
 */
export function setEvidenceVerificationStatus(id, status, ctx, reviewerComment = null) {
  const patch = { verificationStatus: status, reviewerComment };
  if (status === "Verified") {
    patch.verifiedBy = ctx?.role?.id || null;
    patch.verifiedAt = new Date().toISOString();
  }
  return updateRecord("pams_evidence", id, patch, ctx);
}
