import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RoutineRepository } from "../../../src/modules/routines/routine.repository";
import type { RoutineVersionDefinitionInput } from "../../../src/modules/routines/routine.schemas";
import {
  WorkoutPositionConstraintError,
  WorkoutRepository,
} from "../../../src/modules/workouts/workout.repository";
import { putWorkoutExerciseSchema } from "../../../src/modules/workouts/workout.schemas";
import {
  createMigratedTemporaryDatabase,
  type TemporaryDatabase,
} from "../../helpers/database";
import {
  FIXTURE_TIMESTAMP,
  insertExercise,
  insertUser,
} from "../../helpers/fixtures";

function definition(name = "Initial"): RoutineVersionDefinitionInput {
  return {
    name,
    notes: "Plan notes",
    exercises: [
      {
        exerciseId: 1,
        position: 1,
        restSeconds: 90,
        targetRpe: 7,
        notes: null,
        sets: [
          {
            setNumber: 1,
            setType: "work",
            targetWeightKg: 80,
            targetRepsMin: 8,
            targetRepsMax: 10,
            targetSeconds: null,
            targetRpe: null,
            notes: null,
          },
        ],
      },
      {
        exerciseId: 2,
        position: 2,
        restSeconds: null,
        targetRpe: null,
        notes: null,
        sets: [
          {
            setNumber: 1,
            setType: null,
            targetWeightKg: null,
            targetRepsMin: null,
            targetRepsMax: null,
            targetSeconds: 30,
            targetRpe: 8,
            notes: null,
          },
        ],
      },
    ],
  };
}

function resultInput(overrides: Record<string, unknown> = {}) {
  return putWorkoutExerciseSchema.parse({
    userId: 1,
    exerciseId: 1,
    position: 1,
    notes: "Performed",
    sets: [
      {
        setNumber: 1,
        weightKg: 82.5,
        reps: 9,
        rpe: 8,
        completed: true,
        painLevel: 0,
      },
      {
        setNumber: 2,
        durationSeconds: 30,
        completed: false,
        painArea: "knee",
      },
    ],
    ...overrides,
  });
}

describe("WorkoutRepository", () => {
  let temporary: TemporaryDatabase;
  let routines: RoutineRepository;
  let repository: WorkoutRepository;
  let routineId: number;
  let versionId: number;
  let plannedIds: number[];

  beforeEach(() => {
    temporary = createMigratedTemporaryDatabase();
    insertUser(temporary.database);
    insertExercise(temporary.database);
    insertExercise(temporary.database, {
      id: 2,
      slug: "plank",
      name: "Plank",
    });
    insertExercise(temporary.database, {
      id: 3,
      slug: "front-squat",
      name: "Front Squat",
    });
    routines = new RoutineRepository(temporary.database);
    repository = new WorkoutRepository(temporary.database);
    routineId = routines.withImmediateTransaction(() => {
      const id = routines.insertRoutine(
        1,
        "Strength A",
        "Main workout",
        FIXTURE_TIMESTAMP,
      );
      versionId = routines.insertVersion(
        id,
        1,
        definition(),
        FIXTURE_TIMESTAMP,
      );
      routines.sealVersion(versionId);
      expect(routines.finalizeInitialVersion(id)).toBe(true);
      return id;
    });
    plannedIds = (
      temporary.database
        .prepare(
          `
            SELECT id FROM routine_exercises
            WHERE routine_version_id = ? ORDER BY position
          `,
        )
        .all(versionId) as Array<{ id: number }>
    ).map(({ id }) => id);
  });

  afterEach(() => temporary.cleanup());

  function start(
    startedAt = "2026-08-11T10:00:00.000Z",
    createdAt = FIXTURE_TIMESTAMP,
  ): number {
    return repository.withImmediateTransaction(() =>
      repository.insertSession(1, routineId, versionId, startedAt, createdAt),
    );
  }

  it("performs ownership, version, planned exercise, and catalog lookups", () => {
    expect(repository.userExists(1)).toBe(true);
    expect(repository.userExists(999)).toBe(false);
    expect(repository.findRoutineVersionState(versionId)).toEqual({
      id: versionId,
      routineId,
      userId: 1,
      isSealed: true,
    });
    expect(repository.findRoutineVersionState(999)).toBeNull();
    expect(
      repository.plannedExerciseBelongsToVersion(
        plannedIds[0] as number,
        versionId,
      ),
    ).toBe(true);
    expect(repository.plannedExerciseBelongsToVersion(999, versionId)).toBe(
      false,
    );
    expect(repository.findExerciseState(1)).toEqual({ id: 1, isActive: true });
    expect(repository.findExerciseState(999)).toBeNull();
  });

  it("creates an in-progress session and reads exact complete planning with no results", () => {
    const workoutId = start();
    expect(repository.findWorkoutState(workoutId)).toEqual({
      id: workoutId,
      userId: 1,
      routineVersionId: versionId,
      status: "in_progress",
      startedAt: "2026-08-11T10:00:00.000Z",
    });
    expect(repository.findDetail(workoutId)).toMatchObject({
      id: workoutId,
      userId: 1,
      routineId,
      routineVersionId: versionId,
      status: "in_progress",
      completedAt: null,
      durationSeconds: null,
      overallRpe: null,
      notes: null,
      planning: {
        id: routineId,
        name: "Strength A",
        version: {
          id: versionId,
          versionNumber: 1,
          name: "Initial",
          exercises: [
            {
              id: plannedIds[0],
              position: 1,
              exercise: { id: 1, name: "Back Squat" },
              sets: [{ setNumber: 1, effectiveTargetRpe: 7 }],
            },
            {
              id: plannedIds[1],
              position: 2,
              exercise: { id: 2, name: "Plank" },
              sets: [{ setNumber: 1, effectiveTargetRpe: 8 }],
            },
          ],
        },
      },
      results: [],
    });
  });

  it("reads the historical version selected at start after current advances", () => {
    const workoutId = start();
    routines.withImmediateTransaction(() => {
      const next = routines.insertVersion(
        routineId,
        2,
        definition("Second"),
        "2026-08-11T11:00:00.000Z",
      );
      routines.sealVersion(next);
      expect(
        routines.advanceCurrentVersion(
          routineId,
          1,
          2,
          "2026-08-11T11:00:00.000Z",
        ),
      ).toBe(true);
    });
    expect(repository.findDetail(workoutId)?.planning.version).toMatchObject({
      id: versionId,
      versionNumber: 1,
      name: "Initial",
      isCurrent: false,
    });
  });

  it("upserts one planned result and synchronizes sets with stable natural-key ids", () => {
    const workoutId = start();
    const plannedId = plannedIds[0] as number;
    repository.withImmediateTransaction(() => {
      const resultId = repository.upsertResult(
        workoutId,
        versionId,
        plannedId,
        resultInput(),
      );
      repository.synchronizeSets(resultId, resultInput().sets);
    });
    const first = repository.findDetail(workoutId)?.results[0];
    expect(first).toMatchObject({
      routineExerciseId: plannedId,
      exerciseId: 1,
      position: 1,
      plannedExercise: { id: plannedId, exerciseId: 1 },
      performedExercise: { id: 1, name: "Back Squat" },
      sets: [
        { setNumber: 1, weightKg: 82.5, reps: 9, completed: true },
        {
          setNumber: 2,
          durationSeconds: 30,
          completed: false,
          painArea: "knee",
        },
      ],
    });
    const firstResultId = first?.id;
    const firstSetId = first?.sets[0]?.id;

    const replacement = resultInput({
      exerciseId: 3,
      notes: null,
      sets: [
        { setNumber: 1, reps: 10, completed: true },
        { setNumber: 3, durationSeconds: 45, completed: true },
      ],
    });
    repository.withImmediateTransaction(() => {
      const resultId = repository.upsertResult(
        workoutId,
        versionId,
        plannedId,
        replacement,
      );
      repository.synchronizeSets(resultId, replacement.sets);
    });
    const replaced = repository.findDetail(workoutId)?.results[0];
    expect(replaced?.id).toBe(firstResultId);
    expect(replaced).toMatchObject({
      routineExerciseId: plannedId,
      exerciseId: 3,
      performedExercise: { id: 3, name: "Front Squat" },
      sets: [
        { id: firstSetId, setNumber: 1, reps: 10 },
        { setNumber: 3, durationSeconds: 45 },
      ],
    });
    expect(replaced?.sets.some(({ setNumber }) => setNumber === 2)).toBe(false);

    repository.withImmediateTransaction(() => {
      const resultId = repository.upsertResult(
        workoutId,
        versionId,
        plannedId,
        replacement,
      );
      repository.synchronizeSets(resultId, replacement.sets);
    });
    expect(repository.findDetail(workoutId)?.results[0]).toEqual(replaced);
  });

  it("supports a result with no sets and removes every omitted prior set", () => {
    const workoutId = start();
    const plannedId = plannedIds[0] as number;
    repository.withImmediateTransaction(() => {
      const resultId = repository.upsertResult(
        workoutId,
        versionId,
        plannedId,
        resultInput(),
      );
      repository.synchronizeSets(resultId, resultInput().sets);
      repository.synchronizeSets(resultId, []);
    });
    expect(repository.findDetail(workoutId)?.results[0]?.sets).toEqual([]);
  });

  it("translates only the actual-position uniqueness conflict", () => {
    const workoutId = start();
    repository.withImmediateTransaction(() => {
      repository.upsertResult(
        workoutId,
        versionId,
        plannedIds[0] as number,
        resultInput(),
      );
    });
    expect(() =>
      repository.withImmediateTransaction(() =>
        repository.upsertResult(
          workoutId,
          versionId,
          plannedIds[1] as number,
          resultInput({ exerciseId: 2 }),
        ),
      ),
    ).toThrow(WorkoutPositionConstraintError);
  });

  it("completes or cancels once and maps terminal fields", () => {
    const completedId = start();
    repository.withImmediateTransaction(() => {
      expect(
        repository.complete(
          completedId,
          "2026-08-11T10:30:00.000Z",
          8.5,
          "Good session",
        ),
      ).toBe(true);
    });
    expect(repository.findDetail(completedId)).toMatchObject({
      status: "completed",
      completedAt: "2026-08-11T10:30:00.000Z",
      durationSeconds: 1800,
      overallRpe: 8.5,
      notes: "Good session",
    });

    const cancelledId = start("2026-08-11T11:00:00.000Z");
    repository.withImmediateTransaction(() => {
      expect(repository.cancel(cancelledId)).toBe(true);
    });
    expect(repository.findDetail(cancelledId)).toMatchObject({
      status: "cancelled",
      completedAt: null,
      durationSeconds: null,
      overallRpe: null,
      notes: null,
    });
  });

  it("lists only the owner newest first and filters by status", () => {
    const first = start("2026-08-11T10:00:00.000Z");
    const second = start("2026-08-11T11:00:00.000Z");
    repository.withImmediateTransaction(() => {
      repository.cancel(first);
    });
    expect(repository.list(1).map(({ id }) => id)).toEqual([second, first]);
    expect(repository.list(1, "cancelled").map(({ id }) => id)).toEqual([
      first,
    ]);
    expect(repository.list(1)[0]).toMatchObject({
      routine: { id: routineId, name: "Strength A" },
      routineVersion: { id: versionId, versionNumber: 1, name: "Initial" },
    });
    expect(repository.list(2)).toEqual([]);
  });

  it("refuses to allocate ids beyond Number.MAX_SAFE_INTEGER", () => {
    temporary.database
      .prepare(
        `
          INSERT INTO workout_sessions (
            id, user_id, routine_id, routine_version_id,
            routine_version_is_sealed, started_at, status,
            overall_rpe_is_set, created_at
          ) VALUES (?, 1, ?, ?, 1, ?, 'in_progress', 0, ?)
        `,
      )
      .run(
        Number.MAX_SAFE_INTEGER,
        routineId,
        versionId,
        "2026-08-11T09:00:00.000Z",
        FIXTURE_TIMESTAMP,
      );
    expect(() => start()).toThrow();
  });

  it("returns null for an absent workout", () => {
    expect(repository.findWorkoutState(999)).toBeNull();
    expect(repository.findDetail(999)).toBeNull();
  });
});
