import { describe, expect, it } from "vitest";
import {
  createRoutineSchema,
  createRoutineVersionSchema,
  routineDetailQuerySchema,
  routineIdParamsSchema,
  routineListQuerySchema,
  routineSetSchema,
} from "../../../src/modules/routines/routine.schemas";

function validSet(overrides: Record<string, unknown> = {}) {
  return { setNumber: 1, targetRepsMin: 8, targetRepsMax: 12, ...overrides };
}

function validExercise(overrides: Record<string, unknown> = {}) {
  return { exerciseId: 1, position: 1, sets: [validSet()], ...overrides };
}

function validRoutine(overrides: Record<string, unknown> = {}) {
  return {
    userId: 1,
    name: "Strength A",
    version: { exercises: [validExercise()] },
    ...overrides,
  };
}

describe("routine schemas", () => {
  it("trims text and normalizes every omitted optional field to null", () => {
    expect(
      createRoutineSchema.parse(validRoutine({ name: " Strength A " })),
    ).toEqual({
      userId: 1,
      name: "Strength A",
      description: null,
      version: {
        name: null,
        notes: null,
        exercises: [
          {
            exerciseId: 1,
            position: 1,
            restSeconds: null,
            targetRpe: null,
            notes: null,
            sets: [
              {
                setNumber: 1,
                setType: null,
                targetWeightKg: null,
                targetRepsMin: 8,
                targetRepsMax: 12,
                targetSeconds: null,
                targetRpe: null,
                notes: null,
              },
            ],
          },
        ],
      },
    });
  });

  it("accepts repetitions, duration, both targets, optional weight, and all set types", () => {
    for (const set of [
      validSet({ setType: "warmup", targetWeightKg: 0 }),
      validSet({ setType: "work", targetSeconds: 30 }),
      validSet({
        setType: "backoff",
        targetRepsMin: undefined,
        targetRepsMax: undefined,
        targetSeconds: 0,
      }),
    ]) {
      expect(routineSetSchema.safeParse(set).success).toBe(true);
    }
  });

  it.each([
    ["missing targets", { setNumber: 1 }],
    ["weight only", { setNumber: 1, targetWeightKg: 20 }],
    ["only minimum reps", { setNumber: 1, targetRepsMin: 8 }],
    ["only maximum reps", { setNumber: 1, targetRepsMax: 12 }],
    ["reversed reps", validSet({ targetRepsMin: 12, targetRepsMax: 8 })],
    ["zero reps", validSet({ targetRepsMin: 0 })],
    ["negative seconds", validSet({ targetSeconds: -1 })],
    ["fractional seconds", validSet({ targetSeconds: 1.5 })],
    ["negative weight", validSet({ targetWeightKg: -1 })],
    ["low RPE", validSet({ targetRpe: 0 })],
    ["high RPE", validSet({ targetRpe: 11 })],
    ["infinite RPE", validSet({ targetRpe: Number.POSITIVE_INFINITY })],
    ["unknown set type", validSet({ setType: "drop" })],
    ["unknown field", validSet({ actualReps: 10 })],
  ])("rejects %s", (_label, input) => {
    expect(routineSetSchema.safeParse(input).success).toBe(false);
  });

  it("allows a repeated catalog exercise at distinct positions", () => {
    const input = validRoutine({
      version: {
        exercises: [validExercise(), validExercise({ position: 2 })],
      },
    });
    expect(createRoutineSchema.safeParse(input).success).toBe(true);
  });

  it.each([
    ["empty exercise list", validRoutine({ version: { exercises: [] } })],
    [
      "empty set list",
      validRoutine({ version: { exercises: [validExercise({ sets: [] })] } }),
    ],
    [
      "duplicate positions",
      validRoutine({
        version: { exercises: [validExercise(), validExercise()] },
      }),
    ],
    [
      "duplicate set numbers",
      validRoutine({
        version: {
          exercises: [validExercise({ sets: [validSet(), validSet()] })],
        },
      }),
    ],
    ["zero user", validRoutine({ userId: 0 })],
    [
      "unsafe exercise id",
      validRoutine({
        version: {
          exercises: [
            validExercise({ exerciseId: Number.MAX_SAFE_INTEGER + 1 }),
          ],
        },
      }),
    ],
    [
      "negative rest",
      validRoutine({
        version: { exercises: [validExercise({ restSeconds: -1 })] },
      }),
    ],
    ["empty name", validRoutine({ name: " " })],
    ["long name", validRoutine({ name: "x".repeat(201) })],
    ["empty description", validRoutine({ description: " " })],
    [
      "long notes",
      validRoutine({
        version: { notes: "x".repeat(5001), exercises: [validExercise()] },
      }),
    ],
    [
      "server version number",
      validRoutine({
        version: { versionNumber: 1, exercises: [validExercise()] },
      }),
    ],
    ["server activity", validRoutine({ isActive: false })],
    [
      "unknown nested field",
      validRoutine({
        version: { exercises: [validExercise({ exercise: {} })] },
      }),
    ],
  ])("rejects %s", (_label, input) => {
    expect(createRoutineSchema.safeParse(input).success).toBe(false);
  });

  it("validates the flat complete-version body", () => {
    expect(
      createRoutineVersionSchema.parse({
        userId: 1,
        name: " Phase 2 ",
        exercises: [validExercise()],
      }),
    ).toMatchObject({ userId: 1, name: "Phase 2", notes: null });
    expect(
      createRoutineVersionSchema.safeParse({
        userId: 1,
        version: { exercises: [validExercise()] },
      }).success,
    ).toBe(false);
  });

  it.each([
    [routineIdParamsSchema, { id: "1" }, { id: 1 }],
    [routineListQuerySchema, { userId: "2" }, { userId: 2 }],
    [
      routineDetailQuerySchema,
      { userId: "2", versionNumber: "3" },
      { userId: 2, versionNumber: 3 },
    ],
  ])("parses canonical params and queries", (schema, input, expected) => {
    expect(schema.parse(input)).toEqual(expected);
  });

  it.each([
    [routineIdParamsSchema, { id: "01" }],
    [routineIdParamsSchema, { id: "9007199254740992" }],
    [routineListQuerySchema, {}],
    [routineListQuerySchema, { userId: ["1", "2"] }],
    [routineListQuerySchema, { userId: "1", page: "1" }],
    [routineDetailQuerySchema, { userId: "1", versionNumber: ["1", "2"] }],
    [routineDetailQuerySchema, { userId: "1", includeInactive: "true" }],
  ])("rejects invalid or unknown params/query %#", (schema, input) => {
    expect(schema.safeParse(input).success).toBe(false);
  });
});
