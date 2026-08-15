import { describe, expect, it } from "vitest";
import type { RoutineDetail, RoutineSummary, Workout } from "../src/types";

describe("backend-shaped contracts", () => {
  it("keeps summary and detail version branches distinct", () => {
    const summary: RoutineSummary = {
      id: 1,
      name: "A",
      description: null,
      currentVersion: { id: 9, versionNumber: 2, name: "v2", notes: null },
    };
    const detail: RoutineDetail = {
      id: 1,
      name: "A",
      description: null,
      version: { ...summary.currentVersion, isCurrent: true, exercises: [] },
    };
    expect(summary).not.toHaveProperty("currentVersion.exercises");
    expect(detail.version.id).toBe(9);
  });
  it("models workout planning as name plus version", () => {
    const value: Workout = {
      id: 1,
      status: "completed",
      routineVersionId: 9,
      startedAt: "2026-01-01T00:00:00.000Z",
      planning: {
        name: "A",
        version: {
          id: 9,
          versionNumber: 2,
          name: "v2",
          notes: null,
          isCurrent: true,
          exercises: [],
        },
      },
      results: [],
    };
    expect(value.planning?.name).toBe("A");
    expect(value.planning?.version.exercises).toEqual([]);
  });
});
