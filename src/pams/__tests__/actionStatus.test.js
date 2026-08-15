import { describe, it, expect } from "vitest";
import { isActionOverdue } from "../actionStatus.js";

describe("isActionOverdue", () => {
  it("is overdue when due date has passed and status is still open", () => {
    expect(isActionOverdue({ status: "In Progress", dueDate: "2026-01-01" }, "2026-06-01")).toBe(true);
  });

  it("is not overdue when due date is in the future", () => {
    expect(isActionOverdue({ status: "In Progress", dueDate: "2026-12-01" }, "2026-06-01")).toBe(false);
  });

  it("is never overdue once closed, even with a past due date", () => {
    for (const status of ["Completed", "Cancelled", "Verified", "Closed"]) {
      expect(isActionOverdue({ status, dueDate: "2020-01-01" }, "2026-06-01")).toBe(false);
    }
  });

  it("is not overdue when there is no due date at all", () => {
    expect(isActionOverdue({ status: "In Progress", dueDate: null }, "2026-06-01")).toBe(false);
    expect(isActionOverdue({ status: "In Progress", dueDate: "" }, "2026-06-01")).toBe(false);
  });

  it("is overdue on the boundary — due exactly today is not yet overdue, due yesterday is", () => {
    expect(isActionOverdue({ status: "In Progress", dueDate: "2026-06-01" }, "2026-06-01")).toBe(false);
    expect(isActionOverdue({ status: "In Progress", dueDate: "2026-05-31" }, "2026-06-01")).toBe(true);
  });
});
