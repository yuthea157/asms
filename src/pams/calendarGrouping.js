// Pure logic extracted from CalendarView.jsx for isolated unit testing
// (see auditFields.js's comment for why this pattern exists throughout
// PAMS).

export function groupByMonth(events) {
  const groups = {};
  for (const e of events) {
    const month = e.date.slice(0, 7); // "YYYY-MM"
    if (!groups[month]) groups[month] = [];
    groups[month].push(e);
  }
  return groups;
}
