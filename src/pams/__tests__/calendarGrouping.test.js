import { describe, it, expect } from "vitest";
import { groupByMonth } from "../calendarGrouping.js";

describe("groupByMonth", () => {
  it("groups events by their date's year-month", () => {
    const events = [
      { date: "2026-03-05", label: "a" },
      { date: "2026-03-20", label: "b" },
      { date: "2026-04-01", label: "c" },
    ];
    const grouped = groupByMonth(events);
    expect(Object.keys(grouped)).toEqual(["2026-03", "2026-04"]);
    expect(grouped["2026-03"]).toHaveLength(2);
    expect(grouped["2026-04"]).toHaveLength(1);
  });

  it("returns an empty object for no events", () => {
    expect(groupByMonth([])).toEqual({});
  });
});
