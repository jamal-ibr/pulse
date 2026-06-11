import { describe, test, expect } from "vitest";
import { deferTask, isAvoided, isOverdue, validateScariness } from "../src/lib/task-logic";

describe("task defer logic", () => {
  test("defer increments count immutably", () => {
    const task = { scariness: 5, deferCount: 1, status: "todo" };
    const deferred = deferTask(task);
    expect(deferred.deferCount).toBe(2);
    expect(task.deferCount).toBe(1); // original untouched
  });

  test("avoidance requires scariness 4+ and 2+ defers", () => {
    expect(isAvoided({ scariness: 4, deferCount: 2, status: "todo" })).toBe(true);
    expect(isAvoided({ scariness: 3, deferCount: 5, status: "todo" })).toBe(false);
    expect(isAvoided({ scariness: 5, deferCount: 1, status: "todo" })).toBe(false);
    expect(isAvoided({ scariness: 5, deferCount: 3, status: "done" })).toBe(false);
  });

  test("overdue detection", () => {
    expect(isOverdue({ scariness: 1, deferCount: 0, status: "todo", dueDate: "2026-06-10" }, "2026-06-11")).toBe(true);
    expect(isOverdue({ scariness: 1, deferCount: 0, status: "todo", dueDate: "2026-06-11" }, "2026-06-11")).toBe(false);
    expect(isOverdue({ scariness: 1, deferCount: 0, status: "done", dueDate: "2026-06-01" }, "2026-06-11")).toBe(false);
  });

  test("scariness validation", () => {
    expect(validateScariness(1)).toBe(true);
    expect(validateScariness(5)).toBe(true);
    expect(validateScariness(0)).toBe(false);
    expect(validateScariness(6)).toBe(false);
    expect(validateScariness(2.5)).toBe(false);
  });
});
