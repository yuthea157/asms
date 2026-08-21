// Shared upload/signed-URL helpers for the two legacy base64-blob
// attachment patterns (visit photos, audit-tool evidence) now that both
// live as real objects in the Supabase Storage "legacy-attachments"
// bucket instead of inline data URLs inside a Firestore blob doc. See
// storageShim.js's attachments:* key handling for the other half of this
// (it persists {id, name, storagePath, mimeType, sizeBytes} rows once a
// file has already been uploaded via uploadLegacyAttachment below).

import { supabase } from "./supabase.js";

const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Uploads a File to the legacy-attachments bucket and returns the
 * metadata shape storageShim.js's attachments:* keys expect. Does NOT
 * persist anything to the `attachments` table itself — the caller
 * accumulates these into an array and calls
 * `window.storage.set("attachments:{parentId}", JSON.stringify(items), true)`
 * the same way it always has, once the whole set for that parent is ready.
 */
export async function uploadLegacyAttachment(file, parentType, parentId, id) {
  const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const storagePath = `${parentType}/${parentId}/${id}${extension}`;
  const { error } = await supabase.storage
    .from("legacy-attachments")
    .upload(storagePath, file, { contentType: file.type || "application/octet-stream" });
  if (error) throw error;
  return { id, name: file.name, storagePath, mimeType: file.type || "application/octet-stream", sizeBytes: file.size };
}

/** Resolves a time-limited signed URL for displaying/downloading a private legacy attachment. */
export async function signedLegacyAttachmentUrl(storagePath) {
  const { data, error } = await supabase.storage.from("legacy-attachments").createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}
