// Pure logic extracted from actions.js for isolated unit testing (see
// auditFields.js's comment for why this pattern exists throughout PAMS).

const CLOSED_STATUSES = ["Completed", "Cancelled", "Verified", "Closed"];

/** brief §19/§56's "Overdue" derivation — a pure function of status+dueDate, computed on read like ASMS's existing capStatusOf(), never a stored flag that could go stale. */
export function isActionOverdue(action, todayISO) {
  if (CLOSED_STATUSES.includes(action.status)) return false;
  return !!action.dueDate && action.dueDate < todayISO;
}
