// pams_measurements — append-only, never overwritten (brief §21). See
// docs/pams/DOMAIN_MODEL.md §3 and docs/pams/SECURITY.md §6's
// verification workflow. Every create here also (re)computes and stores
// this measurement's own score — see scores.js, which this file calls
// into rather than duplicating the scoring math.

import { createRecord, getRecord, listRecords, orderBy, updateRecord, where } from "./pamsStore.js";
import { scoreAndStoreMeasurement } from "./scores.js";

export function emptyMeasurement() {
  return { period: "", plannedValue: "", actualValue: "", comment: "" };
}

/**
 * Creates a new measurement and immediately scores it (brief's MEASURE →
 * SCORE steps happen together, matching how an advisor actually works —
 * enter this month's number, see the achievement right away). Rejects a
 * second measurement for a period whose existing row is already Verified
 * (docs/pams/DOMAIN_MODEL.md §3 — must use recordCorrectingMeasurement
 * instead).
 */
export async function recordMeasurement({ kpiLink, target, period, actualValue, plannedValue, comment }, ctx) {
  const existing = await listMeasurementsForKpiLink(kpiLink.id, { period });
  const verified = existing.find((m) => m.verificationStatus === "Verified");
  if (verified) {
    throw new Error(`Period ${period} already has a verified measurement — use "Correct" to supersede it instead of creating a new one.`);
  }
  const unverified = existing.find((m) => m.verificationStatus !== "Verified");

  const data = {
    kpiLinkId: kpiLink.id, targetId: target.id, factoryId: target.factoryId,
    period, plannedValue: plannedValue ?? null, actualValue,
    achievementPct: null, scoreId: null, comment: comment || "",
    submittedBy: ctx?.role?.id || null, submittedAt: new Date().toISOString(),
    verificationStatus: "Submitted", verifiedBy: null, verifiedAt: null,
    supersedesMeasurementId: null,
  };

  let id;
  if (unverified) {
    // Unverified rows may be edited in place (docs/pams/DOMAIN_MODEL.md §3).
    await updateRecord("pams_measurements", unverified.id, data, ctx);
    id = unverified.id;
  } else {
    id = await createRecord("pams_measurements", data, ctx);
  }

  await scoreAndStoreMeasurement({ measurementId: id, kpiLink, target, actualValue, period }, ctx);
  return id;
}

/**
 * Corrects a VERIFIED measurement — never edits it, creates a new row
 * pointing back at the original via supersedesMeasurementId (brief §21,
 * docs/pams/DOMAIN_MODEL.md §3's forward-pointing correction pattern).
 */
export async function recordCorrectingMeasurement({ originalMeasurement, kpiLink, target, actualValue, comment }, ctx) {
  const data = {
    kpiLinkId: kpiLink.id, targetId: target.id, factoryId: target.factoryId,
    period: originalMeasurement.period, plannedValue: originalMeasurement.plannedValue, actualValue,
    achievementPct: null, scoreId: null, comment: comment || "",
    submittedBy: ctx?.role?.id || null, submittedAt: new Date().toISOString(),
    verificationStatus: "Submitted", verifiedBy: null, verifiedAt: null,
    supersedesMeasurementId: originalMeasurement.id,
  };
  const id = await createRecord("pams_measurements", data, ctx);
  await scoreAndStoreMeasurement({ measurementId: id, kpiLink, target, actualValue, period: originalMeasurement.period }, ctx);
  return id;
}

export function listMeasurementsForKpiLink(kpiLinkId, { period } = {}) {
  const constraints = [where("kpiLinkId", "==", kpiLinkId)];
  if (period) constraints.push(where("period", "==", period));
  return listRecords("pams_measurements", constraints);
}
export function listMeasurementHistoryForTarget(targetId) {
  return listRecords("pams_measurements", [where("targetId", "==", targetId), orderBy("period", "desc")]);
}
export function getMeasurement(id) {
  return getRecord("pams_measurements", id);
}

/** Verification workflow (docs/pams/SECURITY.md §6). */
export function setMeasurementUnderReview(id, ctx) {
  return updateRecord("pams_measurements", id, { verificationStatus: "UnderReview" }, ctx);
}
export function returnMeasurement(id, comment, ctx) {
  return updateRecord("pams_measurements", id, { verificationStatus: "Returned", comment }, ctx);
}
export function resubmitMeasurement(id, ctx) {
  return updateRecord("pams_measurements", id, { verificationStatus: "Resubmitted" }, ctx);
}
/**
 * Verify — the segregation-of-duties check (docs/pams/SECURITY.md §4):
 * an officer/user cannot verify their own submission. admin/manager may
 * self-verify, matching how ASMS already treats those two roles as
 * trusted throughout the app.
 */
export function verifyMeasurement(id, measurement, ctx) {
  const verifierRole = ctx?.role?.role;
  const isSelfVerification = ctx?.role?.id && ctx.role.id === measurement.submittedBy;
  if (isSelfVerification && verifierRole !== "admin" && verifierRole !== "manager") {
    throw new Error("You cannot verify a measurement you submitted yourself.");
  }
  return updateRecord("pams_measurements", id, {
    verificationStatus: "Verified", verifiedBy: ctx?.role?.id || null, verifiedAt: new Date().toISOString(),
  }, ctx);
}
