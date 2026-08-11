import { describe, expect, it } from "vitest";
import {
  cancelWorkoutSchema,
  completeWorkoutSchema,
  putWorkoutExerciseSchema,
  startWorkoutSchema,
  workoutDetailQuerySchema,
  workoutExerciseParamsSchema,
  workoutIdParamsSchema,
  workoutListQuerySchema,
  workoutSetSchema,
} from "../../../src/modules/workouts/workout.schemas";

function validSet(overrides: Record<string, unknown> = {}) {
  return { setNumber: 1, completed: true, ...overrides };
}

function validResult(overrides: Record<string, unknown> = {}) {
  return {
    userId: 1,
    exerciseId: 1,
    position: 1,
    sets: [validSet()],
    ...overrides,
  };
}

describe("workout schemas", () => {
  it("normalizes offset timestamps to canonical UTC milliseconds", () => {
    expect(
      startWorkoutSchema.parse({
        userId: 1,
        routineVersionId: 2,
        startedAt: "2026-08-11T12:00:00+02:00",
      }),
    ).toEqual({
      userId: 1,
      routineVersionId: 2,
      startedAt: "2026-08-11T10:00:00.000Z",
    });
    expect(
      completeWorkoutSchema.parse({
        userId: 1,
        completedAt: "2026-08-11T10:30:00.12Z",
      }),
    ).toEqual({
      userId: 1,
      completedAt: "2026-08-11T10:30:00.120Z",
      overallRpe: null,
      notes: null,
    });
  });

  it.each([
    ["missing zone", "2026-08-11T10:00:00"],
    ["date only", "2026-08-11"],
    ["invalid date", "2026-02-30T10:00:00Z"],
    ["invalid value", "soon"],
  ])("rejects timestamp with %s", (_label, startedAt) => {
    expect(
      startWorkoutSchema.safeParse({
        userId: 1,
        routineVersionId: 1,
        startedAt,
      }).success,
    ).toBe(false);
  });

  it("normalizes omitted nullable result fields and accepts an empty set list", () => {
    expect(putWorkoutExerciseSchema.parse(validResult({ sets: [] }))).toEqual({
      userId: 1,
      exerciseId: 1,
      position: 1,
      notes: null,
      sets: [],
    });
    expect(workoutSetSchema.parse(validSet())).toEqual({
      setNumber: 1,
      weightKg: null,
      reps: null,
      durationSeconds: null,
      rpe: null,
      completed: true,
      painLevel: null,
      painArea: null,
      notes: null,
    });
  });

  it("accepts zero result values, fractional finite RPE/weight, and incomplete sets", () => {
    expect(
      workoutSetSchema.parse(
        validSet({
          weightKg: 0.5,
          reps: 0,
          durationSeconds: 0,
          rpe: 7.5,
          completed: false,
          painLevel: 0,
          painArea: " knee ",
          notes: " stopped ",
        }),
      ),
    ).toMatchObject({
      weightKg: 0.5,
      reps: 0,
      durationSeconds: 0,
      rpe: 7.5,
      completed: false,
      painLevel: 0,
      painArea: "knee",
      notes: "stopped",
    });
  });

  it.each([
    ["zero set number", validSet({ setNumber: 0 })],
    ["unsafe set number", validSet({ setNumber: 9007199254740992 })],
    ["negative weight", validSet({ weightKg: -1 })],
    ["infinite weight", validSet({ weightKg: Number.POSITIVE_INFINITY })],
    ["fractional reps", validSet({ reps: 1.5 })],
    ["negative reps", validSet({ reps: -1 })],
    ["fractional duration", validSet({ durationSeconds: 1.5 })],
    ["low RPE", validSet({ rpe: 0 })],
    ["high RPE", validSet({ rpe: 11 })],
    ["fractional pain", validSet({ painLevel: 1.5 })],
    ["high pain", validSet({ painLevel: 11 })],
    ["coerced boolean", validSet({ completed: 1 })],
    ["empty pain area", validSet({ painArea: " " })],
    ["long pain area", validSet({ painArea: "x".repeat(201) })],
    ["long notes", validSet({ notes: "x".repeat(5001) })],
    ["unknown field", validSet({ targetReps: 8 })],
  ])("rejects invalid set: %s", (_label, input) => {
    expect(workoutSetSchema.safeParse(input).success).toBe(false);
  });

  it("rejects duplicate set numbers and managed or unknown result fields", () => {
    expect(
      putWorkoutExerciseSchema.safeParse(
        validResult({ sets: [validSet(), validSet()] }),
      ).success,
    ).toBe(false);
    expect(
      putWorkoutExerciseSchema.safeParse(validResult({ id: 1 })).success,
    ).toBe(false);
    expect(
      putWorkoutExerciseSchema.safeParse(validResult({ routineExerciseId: 1 }))
        .success,
    ).toBe(false);
  });

  it.each([
    [startWorkoutSchema, { userId: 1, startedAt: "2026-08-11T10:00:00Z" }],
    [
      startWorkoutSchema,
      {
        userId: 1,
        routineVersionId: 1,
        startedAt: "2026-08-11T10:00:00Z",
        status: "in_progress",
      },
    ],
    [cancelWorkoutSchema, { userId: 1, notes: null }],
    [
      completeWorkoutSchema,
      {
        userId: 1,
        completedAt: "2026-08-11T11:00:00Z",
        overallRpe: 11,
      },
    ],
    [
      completeWorkoutSchema,
      {
        userId: 1,
        completedAt: "2026-08-11T11:00:00Z",
        status: "completed",
      },
    ],
  ])("rejects missing, invalid, or managed body %#", (schema, input) => {
    expect(schema.safeParse(input).success).toBe(false);
  });

  it.each([
    [workoutIdParamsSchema, { id: "1" }, { id: 1 }],
    [
      workoutExerciseParamsSchema,
      { id: "1", routineExerciseId: "2" },
      { id: 1, routineExerciseId: 2 },
    ],
    [workoutListQuerySchema, { userId: "1" }, { userId: 1 }],
    [
      workoutListQuerySchema,
      { userId: "1", status: "completed" },
      { userId: 1, status: "completed" },
    ],
    [workoutDetailQuerySchema, { userId: "1" }, { userId: 1 }],
  ])("parses canonical params and queries", (schema, input, expected) => {
    expect(schema.parse(input)).toEqual(expected);
  });

  it.each([
    [workoutIdParamsSchema, { id: "01" }],
    [workoutIdParamsSchema, { id: "9007199254740992" }],
    [workoutExerciseParamsSchema, { id: "1" }],
    [workoutListQuerySchema, {}],
    [workoutListQuerySchema, { userId: ["1", "2"] }],
    [workoutListQuerySchema, { userId: "1", page: "1" }],
    [workoutListQuerySchema, { userId: "1", status: "done" }],
    [workoutDetailQuerySchema, { userId: "1", status: "completed" }],
  ])("rejects invalid or repeated params/query %#", (schema, input) => {
    expect(schema.safeParse(input).success).toBe(false);
  });
});
