// Live overdue-actions alert panel — escalation is computed on read
// (docs/pams/ARCHITECTURE.md §5, same principle as ASMS's existing
// capStatusOf()), while genuinely stored pams_notifications (evidence
// returned, recommendation escalated, etc.) stream in live via
// subscribeToNotifications's real onSnapshot listener. Wired into Factory
// Performance → Overview.

import React, { useEffect, useState } from "react";
import { Bell, AlertTriangle } from "lucide-react";
import { T, SectionLabel, EmptyRow, Row, Pill } from "../ui.jsx";
import { listActionsForFactory, isActionOverdue } from "./actions.js";
import { subscribeToNotifications, markNotificationRead } from "./notifications.js";

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function NotificationsPanel({ factoryIds, ctx }) {
  const [overdueActions, setOverdueActions] = useState([]);
  const [liveNotifications, setLiveNotifications] = useState([]);

  useEffect(() => {
    Promise.all(factoryIds.map((id) => listActionsForFactory(id))).then((lists) => {
      const all = lists.flat().filter((a) => isActionOverdue(a, todayISO()));
      setOverdueActions(all);
    }).catch(() => setOverdueActions([]));
  }, [factoryIds.join(",")]);

  useEffect(() => {
    const unsubscribe = subscribeToNotifications(factoryIds, (notifs) => setLiveNotifications(notifs.filter((n) => !n.read)));
    return unsubscribe;
  }, [factoryIds.join(",")]);

  const totalAlerts = overdueActions.length + liveNotifications.length;
  if (totalAlerts === 0) return null;

  return (
    <div>
      <SectionLabel><Bell size={11} style={{ verticalAlign: -1, marginRight: 4 }} />Alerts ({totalAlerts})</SectionLabel>
      <div style={{ padding: "0 18px" }}>
        {overdueActions.map((a) => (
          <Row key={a.id} left={<AlertTriangle size={15} color={T.red} />} title={a.title} sub={`Overdue since ${a.dueDate}`} right={<Pill tone="red">Overdue</Pill>} />
        ))}
        {liveNotifications.map((n) => (
          <Row key={n.id} onClick={() => markNotificationRead(n.id, ctx)} left={<Bell size={15} color={T.accent} />} title={n.message} sub={n.type} right={<Pill tone="accent">New</Pill>} />
        ))}
      </div>
    </div>
  );
}
