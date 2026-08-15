import { describe, expect, it } from "vitest";
import type { Workout } from "../src/types";
import {
  addSet,
  initializeDraft,
  removeSet,
  serializeDraft,
} from "../src/workoutDraft";

const workout: Workout = {
  id: 4,
  status: "in_progress",
  routineVersionId: 8,
  startedAt: "2026-01-01T00:00:00.000Z",
  planning: {
    name: "Strength",
    version: {
      id: 8,
      versionNumber: 1,
      name: "A",
      notes: null,
      isCurrent: true,
      exercises: [
        {
          id: 11,
          exerciseId: 2,
          position: 1,
          sets: [
            {
              setNumber: 1,
              targetWeightKg: 50,
              targetRepsMin: 5,
              targetRepsMax: 5,
              targetSeconds: null,
              targetRpe: null,
              notes: null,
            },
          ],
        },
      ],
    },
  },
  results: [
    {
      routineExerciseId: 11,
      exerciseId: 3,
      sets: [
        {
          setNumber: 1,
          weightKg: 72.5,
          reps: 4,
          durationSeconds: null,
          rpe: 9,
          completed: true,
          painLevel: 2,
          painArea: "left knee",
          notes: "slow",
        },
      ],
      notes: "substituted",
    },
  ],
};
const planned = workout.planning?.version.exercises[0];
if (!planned) throw new Error("fixture is incomplete");
describe("complete workout drafts", () => {
  it("preserves every existing actual value", () => {
    const draft = initializeDraft(workout, planned);
    expect(serializeDraft(draft)).toMatchObject({
      exerciseId: 3,
      notes: "substituted",
      sets: [
        {
          weightKg: 72.5,
          reps: 4,
          rpe: 9,
          painLevel: 2,
          painArea: "left knee",
          notes: "slow",
        },
      ],
    });
  });
  it("makes omission explicit and never silently reuses removed sets", () => {
    const draft = initializeDraft(workout, planned);
    const withNew = addSet(draft);
    expect(withNew.sets).toHaveLength(2);
    expect(removeSet(withNew, 1).sets).toHaveLength(1);
    expect(serializeDraft(removeSet(withNew, 1)).sets[0].setNumber).toBe(2);
  });
});
