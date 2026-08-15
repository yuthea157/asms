// Pure logic extracted from subObjectives.js so it can be unit tested
// without importing pamsStore.js (which touches ../firebase.js's
// module-load side effects — see auditFields.js's comment for the same
// pattern applied here).

/** Arranges a flat list (from listAllSubObjectivesForObjective) into a tree by parentSubObjectiveId. */
export function buildSubObjectiveTree(flatList) {
  const byParent = new Map();
  for (const so of flatList) {
    const key = so.parentSubObjectiveId || "__root__";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(so);
  }
  function attachChildren(node) {
    return { ...node, children: (byParent.get(node.id) || []).map(attachChildren) };
  }
  return (byParent.get("__root__") || []).map(attachChildren);
}
