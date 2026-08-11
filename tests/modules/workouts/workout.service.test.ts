import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RoutineRepository } from "../../../src/modules/routines/routine.repository";
import {
  createRoutineSchema,
  createRoutineVersionSchema,
} from "../../../src/modules/routines/routine.schemas";
import { RoutineService } from "../../../src/modules/routines/routine.service";
import { WorkoutRepository } from "../../../src/modules/workouts/workout.repository";
import {
  completeWorkoutSchema,
  putWorkoutExerciseSchema,
  startWorkoutSchema,
} from "../../../src/modules/workouts/workout.schemas";
import {
  ExerciseInactiveError,
  ExerciseNotFoundError,
  RoutineExerciseNotFoundError,
  RoutineVersionNotFoundError,
  UserNotFoundError,
  WorkoutCompletionTimeInvalidError,
  WorkoutNotFoundError,
  WorkoutNotInProgressError,
  WorkoutPositionConflictError,
  WorkoutService,
} from "../../../src/modules/workouts/workout.service";
import {
  createMigratedTemporaryDatabase,
  type TemporaryDatabase,
} from "../../helpers/database";
import { insertExercise, insertUser } from "../../helpers/fixtures";

const NOW = new Date("2026-08-11T09:00:00.000Z");

function routineInput(userId = 1) {
  return createRoutineSchema.parse({
    userId,
    name: "Strength A",
    version: {
      name: "Initial",
      exercises: [
        {
          exerciseId: 1,
          position: 1,
          targetRpe: 7,
          sets: [{ setNumber: 1, targetRepsMin: 8, targetRepsMax: 10 }],
        },
        {
          exerciseId: 2,
          position: 2,
          sets: [{ setNumber: 1, targetSeconds: 30 }],
        },
      ],
    },
  });
}

function startInput(overrides: Record<string, unknown> = {}) {
  return startWorkoutSchema.parse({
    userId: 1,
    routineVersionId: 1,
    startedAt: "2026-08-11T10:00:00Z",
    ...overrides,
  });
}

function resultInput(overrides: Record<string, unknown> = {}) {
  return putWorkoutExerciseSchema.parse({
    userId: 1,
    exerciseId: 1,
    position: 1,
    sets: [
      { setNumber: 1, weightKg: 80, reps: 10, rpe: 8, completed: true },
      {
        setNumber: 2,
        durationSeconds: 20,
        completed: false,
        painLevel: 3,
        painArea: "knee",
      },
    ],
    ...overrides,
  });
}

function completionInput(overrides: Record<string, unknown> = {}) {
  return completeWorkoutSchema.parse({
    userId: 1,
    completedAt: "2026-08-11T11:00:00Z",
    overallRpe: 8.5,
    notes: "Done",
    ...overrides,
  });
}

describe("WorkoutService", () => {
  let temporary: TemporaryDatabase;
  let routines: RoutineService;
  let service: WorkoutService;
  let routineVersionId: number;
  let plannedIds: number[];

  beforeEach(() => {
    temporary = createMigratedTemporaryDatabase();
    insertUser(temporary.database);
    insertUser(temporary.database, {
      id: 2,
      email: "other@example.com",
      displayName: "Other",
    });
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
    routines = new RoutineService(
      new RoutineRepository(temporary.database),
      () => NOW,
    );
    const routine = routines.create(routineInput());
    routineVersionId = routine.version.id;
    plannedIds = routine.version.exercises.map(({ id }) => id);
    service = new WorkoutService(
      new WorkoutRepository(temporary.database),
      () => NOW,
    );
  });

  afterEach(() => temporary.cleanup());

  function start(overrides: Record<string, unknown> = {}) {
    return service.start(startInput({ routineVersionId, ...overrides }));
  }

  function planningSnapshot(): string {
    const snapshot = Object.fromEntries(
      ["routines", "routine_versions", "routine_exercises", "routine_sets"].map(
        (table) => [
          table,
          temporary.database
            .prepare(`SELECT * FROM ${table} ORDER BY id`)
            .all(),
        ],
      ),
    );
    return JSON.stringify(snapshot);
  }

  it("starts a session for an owned sealed version and returns complete planning", () => {
    expect(start()).toMatchObject({
      id: 1,
      userId: 1,
      routineVersionId,
      startedAt: "2026-08-11T10:00:00.000Z",
      status: "in_progress",
      createdAt: NOW.toISOString(),
      planning: {
        version: {
          id: routineVersionId,
          exercises: [{ id: plannedIds[0] }, { id: plannedIds[1] }],
        },
      },
      results: [],
    });
  });

  it("can start an owned historical sealed version", () => {
    const historicalId = routineVersionId;
    const routineId = routines.get(1, 1).id;
    routines.createVersion(
      routineId,
      createRoutineVersionSchema.parse({
        userId: 1,
        name: "Second",
        exercises: [
          {
            exerciseId: 1,
            position: 1,
            sets: [{ setNumber: 1, targetRepsMin: 5, targetRepsMax: 5 }],
          },
        ],
      }),
    );
    expect(
      start({ routineVersionId: historicalId }).planning.version,
    ).toMatchObject({ id: historicalId, versionNumber: 1, isCurrent: false });
  });

  it("rejects absent users and absent or foreign routine versions without writes", () => {
    expect(() => start({ userId: 999 })).toThrow(UserNotFoundError);
    expect(() => start({ routineVersionId: 999 })).toThrow(
      RoutineVersionNotFoundError,
    );
    const foreign = routines.create(routineInput(2));
    expect(() => start({ routineVersionId: foreign.version.id })).toThrow(
      RoutineVersionNotFoundError,
    );
    expect(
      temporary.database
        .prepare("SELECT COUNT(*) AS count FROM workout_sessions")
        .get(),
    ).toEqual({ count: 0 });
  });

  it("records planned-as-performed and substitutions without changing planning", () => {
    const before = planningSnapshot();
    const workout = start();
    const same = service.putResult(
      workout.id,
      plannedIds[0] as number,
      resultInput(),
    );
    expect(same.results[0]).toMatchObject({
      routineExerciseId: plannedIds[0],
      exerciseId: 1,
      plannedExercise: { exerciseId: 1 },
      performedExercise: { id: 1 },
      sets: [{ setNumber: 1 }, { setNumber: 2 }],
    });

    const substituted = service.putResult(
      workout.id,
      plannedIds[0] as number,
      resultInput({ exerciseId: 3 }),
    );
    expect(substituted.results[0]).toMatchObject({
      routineExerciseId: plannedIds[0],
      exerciseId: 3,
      plannedExercise: { exerciseId: 1 },
      performedExercise: { id: 3 },
    });
    expect(planningSnapshot()).toBe(before);
  });

  it("makes repeated PUT idempotent and replaces sets while preserving natural-key ids", () => {
    const workout = start();
    const first = service.putResult(
      workout.id,
      plannedIds[0] as number,
      resultInput(),
    ).results[0];
    const repeated = service.putResult(
      workout.id,
      plannedIds[0] as number,
      resultInput(),
    ).results[0];
    expect(repeated).toEqual(first);

    const replacement = resultInput({
      sets: [
        { setNumber: 1, reps: 8, completed: true },
        { setNumber: 3, durationSeconds: 45, completed: true },
      ],
    });
    const replaced = service.putResult(
      workout.id,
      plannedIds[0] as number,
      replacement,
    ).results[0];
    expect(replaced?.id).toBe(first?.id);
    expect(replaced?.sets).toMatchObject([
      { id: first?.sets[0]?.id, setNumber: 1, reps: 8 },
      { setNumber: 3, durationSeconds: 45 },
    ]);
    expect(
      temporary.database
        .prepare("SELECT COUNT(*) AS count FROM workout_exercises")
        .get(),
    ).toEqual({ count: 1 });
    expect(
      temporary.database
        .prepare("SELECT COUNT(*) AS count FROM workout_sets")
        .get(),
    ).toEqual({ count: 2 });
  });

  it("rejects wrong planned references, performed exercises, and position conflicts", () => {
    const workout = start();
    expect(() => service.putResult(workout.id, 999, resultInput())).toThrow(
      RoutineExerciseNotFoundError,
    );
    expect(() =>
      service.putResult(
        workout.id,
        plannedIds[0] as number,
        resultInput({ exerciseId: 999 }),
      ),
    ).toThrow(ExerciseNotFoundError);
    temporary.database
      .prepare("UPDATE exercises SET is_active = 0 WHERE id = 3")
      .run();
    expect(() =>
      service.putResult(
        workout.id,
        plannedIds[0] as number,
        resultInput({ exerciseId: 3 }),
      ),
    ).toThrow(ExerciseInactiveError);

    service.putResult(workout.id, plannedIds[0] as number, resultInput());
    expect(() =>
      service.putResult(
        workout.id,
        plannedIds[1] as number,
        resultInput({ exerciseId: 2 }),
      ),
    ).toThrow(WorkoutPositionConflictError);
  });

  it("hides absent and foreign workouts and validates users for writes", () => {
    const workout = start();
    expect(() => service.get(workout.id, 2)).toThrow(WorkoutNotFoundError);
    expect(() => service.get(999, 1)).toThrow(WorkoutNotFoundError);
    expect(() =>
      service.putResult(
        workout.id,
        plannedIds[0] as number,
        resultInput({ userId: 2 }),
      ),
    ).toThrow(WorkoutNotFoundError);
    expect(() =>
      service.putResult(
        workout.id,
        plannedIds[0] as number,
        resultInput({ userId: 999 }),
      ),
    ).toThrow(UserNotFoundError);
  });

  it("completes with coherent duration despite omitted exercises and incomplete sets", () => {
    const workout = start();
    service.putResult(
      workout.id,
      plannedIds[0] as number,
      resultInput({ sets: [{ setNumber: 1, completed: false }] }),
    );
    expect(service.complete(workout.id, completionInput())).toMatchObject({
      status: "completed",
      completedAt: "2026-08-11T11:00:00.000Z",
      durationSeconds: 3600,
      overallRpe: 8.5,
      notes: "Done",
      results: [{ sets: [{ completed: false }] }],
    });
  });

  it("rejects an earlier completion and leaves the session in progress", () => {
    const workout = start();
    expect(() =>
      service.complete(
        workout.id,
        completionInput({ completedAt: "2026-08-11T09:59:59Z" }),
      ),
    ).toThrow(WorkoutCompletionTimeInvalidError);
    expect(service.get(workout.id, 1).status).toBe("in_progress");
  });

  it("cancels without completion fields and makes both terminal states irreversible", () => {
    const cancelled = start();
    expect(service.cancel(cancelled.id, 1)).toMatchObject({
      status: "cancelled",
      completedAt: null,
      durationSeconds: null,
      overallRpe: null,
      notes: null,
    });
    expect(() => service.cancel(cancelled.id, 1)).toThrow(
      WorkoutNotInProgressError,
    );
    expect(() => service.complete(cancelled.id, completionInput())).toThrow(
      WorkoutNotInProgressError,
    );
    expect(() =>
      service.putResult(cancelled.id, plannedIds[0] as number, resultInput()),
    ).toThrow(WorkoutNotInProgressError);

    const completed = start({ startedAt: "2026-08-11T12:00:00Z" });
    service.complete(
      completed.id,
      completionInput({ completedAt: "2026-08-11T13:00:00Z" }),
    );
    expect(() => service.cancel(completed.id, 1)).toThrow(
      WorkoutNotInProgressError,
    );
  });

  it("lists only the selected owner in descending time order with status filtering", () => {
    const first = start({ startedAt: "2026-08-11T10:00:00Z" });
    const second = start({ startedAt: "2026-08-11T11:00:00Z" });
    service.cancel(first.id, 1);
    expect(service.list(1).map(({ id }) => id)).toEqual([second.id, first.id]);
    expect(service.list(1, "cancelled").map(({ id }) => id)).toEqual([
      first.id,
    ]);
    expect(() => service.list(999)).toThrow(UserNotFoundError);
  });

  it("rolls back an entire PUT after a midway set failure", () => {
    const workout = start();
    const before = planningSnapshot();
    temporary.database.exec(`
      CREATE TRIGGER fail_second_workout_set
      BEFORE INSERT ON workout_sets
      WHEN NEW.set_number = 2
      BEGIN
        SELECT RAISE(ABORT, 'injected workout failure');
      END;
    `);
    expect(() =>
      service.putResult(workout.id, plannedIds[0] as number, resultInput()),
    ).toThrow("injected workout failure");
    expect(service.get(workout.id, 1).results).toEqual([]);
    expect(planningSnapshot()).toBe(before);
  });

  it("revalidates performed activity after writes and rolls back concurrent deactivation", () => {
    const workout = start();
    temporary.database.exec(`
      CREATE TRIGGER deactivate_performed_after_result
      AFTER INSERT ON workout_exercises
      BEGIN
        UPDATE exercises SET is_active = 0 WHERE id = NEW.exercise_id;
      END;
    `);
    expect(() =>
      service.putResult(
        workout.id,
        plannedIds[0] as number,
        resultInput({ sets: [] }),
      ),
    ).toThrow(ExerciseInactiveError);
    expect(service.get(workout.id, 1).results).toEqual([]);
    expect(
      temporary.database
        .prepare("SELECT is_active FROM exercises WHERE id = 1")
        .get(),
    ).toEqual({ is_active: 1 });
  });

  it("never changes any routine row across all workout operations", () => {
    const before = planningSnapshot();
    const workout = start();
    service.putResult(
      workout.id,
      plannedIds[0] as number,
      resultInput({ exerciseId: 3 }),
    );
    service.complete(workout.id, completionInput());
    service.get(workout.id, 1);
    service.list(1);
    expect(planningSnapshot()).toBe(before);
  });
});
