// pams_evidence — polymorphic evidence attachment, files in Supabase
// Storage (bucket "pams-evidence", private + signed URLs — not
// base64-in-Firestore). See docs/pams/ARCHITECTURE.md §4 and
// docs/pams/DOMAIN_MODEL.md §4.

import { supabase } from "../supabase.js";
import { createRecord, deleteRecord, listRecords, updateRecord, where } from "./pamsStore.js";

const MAX_EVIDENCE_BYTES = 10_000_000; // 10MB — generous for a compressed image/PDF/office doc, small enough to keep Storage usage sane at PAMS's real target volume (docs/pams/ARCHITECTURE.md §7)
const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Uploads a File to Supabase Storage and creates its pams_evidence
 * record. `entityType`/`entityId` are the polymorphic attachment target
 * (e.g. "Assessment", the assessment's id).
 */
export async function uploadEvidence({ file, entityType, entityId, factoryId, title, documentType, period }, ctx) {
  if (file.size > MAX_EVIDENCE_BYTES) {
    throw new Error(`"${file.name}" is too large (max ${Math.round(MAX_EVIDENCE_BYTES / 1_000_000)}MB).`);
  }
  const evidenceId = `ev_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  // Drops the old "pams-evidence/" path prefix -- that's the bucket name
  // itself now, not part of the object path within it.
  const storagePath = `${factoryId}/${entityType}/${entityId}/${evidenceId}${extension}`;

  const { error: uploadErr } = await supabase.storage
    .from("pams-evidence")
    .upload(storagePath, file, { contentType: file.type || "application/octet-stream" });
  if (uploadErr) throw uploadErr;

  const id = await createRecord("pams_evidence", {
    entityType, entityId, factoryId,
    title: title || file.name, documentType: documentType || "Other", period: period || null,
    // downloadUrl is deliberately not stored -- a fresh signed URL is
    // generated on every read instead (see signedEvidenceUrl below),
    // avoiding storing a URL that can go stale.
    storagePath, mimeType: file.type || "application/octet-stream", sizeBytes: file.size,
    verificationStatus: "Submitted", verifiedBy: null, verifiedAt: null, reviewerComment: null,
  }, ctx);
  return { id, storagePath };
}

export function listEvidenceFor(entityType, entityId) {
  return listRecords("pams_evidence", [where("entityType", "==", entityType), where("entityId", "==", entityId)]);
}

/** Resolves a time-limited signed URL for displaying/downloading a private evidence object. */
export async function signedEvidenceUrl(storagePath) {
  const { data, error } = await supabase.storage.from("pams-evidence").createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteEvidence(evidenceRecord, ctx) {
  await supabase.storage.from("pams-evidence").remove([evidenceRecord.storagePath]).catch(() => {
    // Storage object already gone (e.g. manually removed) — still clean up
    // the record rather than leaving an orphaned reference.
  });
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
