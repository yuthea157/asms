// Calendar (brief §53) — Phase 5 scope: Target due dates and Action due
// dates, grouped by month (a deadline list, not a literal month-grid
// widget, given the time this session had left). Advisory visit dates,
// review meetings, CAP deadlines, and recommendation follow-ups join this
// same list once their modules exist (Phase 7-8) — the grouping/sorting
// logic below is written generically over a `{date, label, type}` shape
// specifically so adding another event source later is one more
// `listX().then(...)` call, not a rewrite.

import React, { useEffect, useState } from "react";
import { CalendarClock, CheckSquare, Target as TargetIcon } from "lucide-react";
import { T, MODULE_COLORS, Header, EmptyState, SectionLabel, Pill } from "../ui.jsx";
import { listActionsForFactory } from "./actions.js";
import { listTargetsForFactory } from "./targets.js";
import { groupByMonth } from "./calendarGrouping.js";

export default function CalendarView({ companyId, ctx }) {
  const [events, setEvents] = useState(null);

  useEffect(() => {
    Promise.all([listActionsForFactory(companyId), listTargetsForFactory(companyId)]).then(([actions, targets]) => {
      const evts = [
        ...actions.filter((a) => a.dueDate).map((a) => ({ date: a.dueDate, label: a.title, type: "Action", status: a.status })),
        ...targets.filter((t) => t.endDate).map((t) => ({ date: t.endDate, label: t.title, type: "Target", status: t.status })),
      ].sort((x, y) => x.date.localeCompare(y.date));
      setEvents(evts);
    }).catch(() => setEvents([]));
  }, [companyId]);

  if (events === null) return <div style={{ padding: 18, color: T.muted, fontSize: 13.5 }}>Loading…</div>;

  const grouped = groupByMonth(events);

  return (
    <div>
      <Header title="Calendar" subtitle="Upcoming target and action deadlines" icon={CalendarClock} color={MODULE_COLORS.pamsFactory} />
      {events.length === 0 && <div style={{ padding: "0 18px" }}><EmptyState icon={CalendarClock} color={MODULE_COLORS.pamsFactory} title="No deadlines yet" hint="Target due dates and action due dates will appear here." /></div>}
      {Object.entries(grouped).map(([month, monthEvents]) => (
        <div key={month}>
          <SectionLabel>{month}</SectionLabel>
          <div style={{ padding: "0 18px" }}>
            {monthEvents.map((e, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                {e.type === "Action" ? <CheckSquare size={15} color={T.accent} /> : <TargetIcon size={15} color={T.accent} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, color: T.ink }}>{e.label}</div>
                  <div style={{ fontSize: 11.5, color: T.muted }}>{e.date} · {e.type}</div>
                </div>
                <Pill tone="muted">{e.status}</Pill>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
