// Pure logic extracted from pamsStore.js specifically so it can be unit
// tested without importing anything that touches Firebase (pamsStore.js
// itself imports ../firebase.js, which calls initializeApp()/
// signInAnonymously() as a module-load side effect — importing it in a
// test would make a real network call against whatever project .env
// points at). See docs/pams/TEST_PLAN.md §1's same principle applied to
// the scoring engine.

/**
 * Stamps who/when on every write, matching the brief's audit-field
 * requirement — there is no server-side interceptor to do this
 * automatically in a backend-less app, so it happens here, once, rather
 * than being re-implemented (or forgotten) per screen.
 *
 * `nowValue` is injected (rather than this function calling
 * `serverTimestamp()` itself) so it stays a pure function: pamsStore.js
 * passes the real `serverTimestamp()` sentinel in the app, tests pass a
 * plain value.
 */
export function withAuditFields(patch, ctx, nowValue, { isCreate = false } = {}) {
  const uid = ctx?.role?.id || null;
  return isCreate
    ? { ...patch, createdByUserId: uid, createdAt: nowValue, updatedByUserId: uid, updatedAt: nowValue }
    : { ...patch, updatedByUserId: uid, updatedAt: nowValue };
}
