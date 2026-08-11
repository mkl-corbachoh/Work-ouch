import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../src/db/migrations";
import {
  createTemporaryDatabase,
  type TemporaryDatabase,
} from "../helpers/database";
import {
  FIXTURE_TIMESTAMP,
  insertExercise,
  insertUser,
} from "../helpers/fixtures";

const MIGRATIONS_DIRECTORY = resolve("database/migrations");
const STARTED_AT = "2026-08-11T10:00:00.000Z";

describe("workouts migration", () => {
  let temporary: TemporaryDatabase;

  beforeEach(() => {
    temporary = createTemporaryDatabase();
    runMigrations(temporary.database, MIGRATIONS_DIRECTORY);
    insertUser(temporary.database);
    insertUser(temporary.database, {
      id: 2,
      email: "other@example.com",
      displayName: "Other",
    });
    insertExercise(temporary.database);
    insertExercise(temporary.database, {
      id: 2,
      slug: "front-squat",
      name: "Front Squat",
    });
    insertExercise(temporary.database, {
      id: 3,
      slug: "inactive-squat",
      name: "Inactive Squat",
      isActive: 0,
    });
    createSealedRoutine({
      routineId: 1,
      versionId: 1,
      routineExerciseId: 1,
      routineSetId: 1,
      userId: 1,
      secondRoutineExerciseId: 4,
      secondRoutineSetId: 4,
    });
    createSealedRoutine({
      routineId: 2,
      versionId: 2,
      routineExerciseId: 2,
      routineSetId: 2,
      userId: 2,
    });
    createSealedRoutine({
      routineId: 3,
      versionId: 3,
      routineExerciseId: 3,
      routineSetId: 3,
      userId: 1,
    });
  });

  afterEach(() => temporary.cleanup());

  function createSealedRoutine(input: {
    routineId: number;
    versionId: number;
    routineExerciseId: number;
    routineSetId: number;
    userId: number;
    secondRoutineExerciseId?: number;
    secondRoutineSetId?: number;
  }): void {
    const database = temporary.database;
    database.exec("BEGIN");
    try {
      database
        .prepare(
          `
            INSERT INTO routines (
              id, user_id, name, current_version_number, created_at, updated_at
            ) VALUES (?, ?, ?, 1, ?, ?)
          `,
        )
        .run(
          input.routineId,
          input.userId,
          `Routine ${input.routineId}`,
          FIXTURE_TIMESTAMP,
          FIXTURE_TIMESTAMP,
        );
      database
        .prepare(
          `
            INSERT INTO routine_versions (
              id, routine_id, version_number, is_sealed, created_at
            ) VALUES (?, ?, 1, 0, ?)
          `,
        )
        .run(input.versionId, input.routineId, FIXTURE_TIMESTAMP);
      database
        .prepare(
          `
            INSERT INTO routine_exercises (
              id, routine_version_id, exercise_id, position,
              rest_seconds_is_set, target_rpe_is_set
            ) VALUES (?, ?, 1, 1, 0, 0)
          `,
        )
        .run(input.routineExerciseId, input.versionId);
      database
        .prepare(
          `
            INSERT INTO routine_sets (
              id, routine_exercise_id, set_number, target_weight_kg_is_set,
              target_reps_min, target_reps_min_is_set,
              target_reps_max, target_reps_max_is_set,
              target_seconds_is_set, target_rpe_is_set
            ) VALUES (?, ?, 1, 0, 8, 1, 10, 1, 0, 0)
          `,
        )
        .run(input.routineSetId, input.routineExerciseId);
      if (
        input.secondRoutineExerciseId !== undefined &&
        input.secondRoutineSetId !== undefined
      ) {
        database
          .prepare(
            `
              INSERT INTO routine_exercises (
                id, routine_version_id, exercise_id, position,
                rest_seconds_is_set, target_rpe_is_set
              ) VALUES (?, ?, 2, 2, 0, 0)
            `,
          )
          .run(input.secondRoutineExerciseId, input.versionId);
        database
          .prepare(
            `
              INSERT INTO routine_sets (
                id, routine_exercise_id, set_number, target_weight_kg_is_set,
                target_reps_min_is_set, target_reps_max_is_set,
                target_seconds, target_seconds_is_set, target_rpe_is_set
              ) VALUES (?, ?, 1, 0, 0, 0, 30, 1, 0)
            `,
          )
          .run(input.secondRoutineSetId, input.secondRoutineExerciseId);
      }
      database
        .prepare("UPDATE routine_versions SET is_sealed = 1 WHERE id = ?")
        .run(input.versionId);
      database
        .prepare(
          `
            UPDATE routines
            SET pending_version_number = NULL, protocol_state = 0
            WHERE id = ?
          `,
        )
        .run(input.routineId);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  function insertSession(
    overrides: Partial<{
      id: number | bigint | string;
      userId: number | string;
      routineId: number;
      versionId: number;
      sealed: number;
      startedAt: string;
      status: string;
      completedAt: string | null;
      overallRpe: number | null;
      overallRpeIsSet: number;
      notes: string | null;
    }> = {},
  ): void {
    const session = {
      id: 1,
      userId: 1,
      routineId: 1,
      versionId: 1,
      sealed: 1,
      startedAt: STARTED_AT,
      status: "in_progress",
      completedAt: null,
      overallRpe: null,
      overallRpeIsSet: 0,
      notes: null,
      ...overrides,
    };
    temporary.database
      .prepare(
        `
          INSERT INTO workout_sessions (
            id, user_id, routine_id, routine_version_id,
            routine_version_is_sealed, started_at, completed_at, status,
            overall_rpe, overall_rpe_is_set, notes, created_at
          ) VALUES (
            @id, @userId, @routineId, @versionId, @sealed, @startedAt,
            @completedAt, @status, @overallRpe, @overallRpeIsSet, @notes,
            @startedAt
          )
        `,
      )
      .run(session);
  }

  function insertResult(
    overrides: Partial<{
      id: number | string;
      sessionId: number;
      versionId: number;
      plannedId: number;
      exerciseId: number | string;
      position: number | string;
      notes: string | null;
    }> = {},
  ): void {
    temporary.database
      .prepare(
        `
          INSERT INTO workout_exercises (
            id, workout_session_id, routine_version_id,
            routine_exercise_id, exercise_id, position, notes
          ) VALUES (
            @id, @sessionId, @versionId, @plannedId,
            @exerciseId, @position, @notes
          )
        `,
      )
      .run({
        id: 1,
        sessionId: 1,
        versionId: 1,
        plannedId: 1,
        exerciseId: 1,
        position: 1,
        notes: null,
        ...overrides,
      });
  }

  function insertSet(
    overrides: Partial<{
      id: number | bigint | string;
      workoutExerciseId: number;
      setNumber: number | string;
      weightKg: number | string | null;
      weightKgIsSet: number;
      reps: number | string | null;
      repsIsSet: number;
      durationSeconds: number | string | null;
      durationSecondsIsSet: number;
      rpe: number | string | null;
      rpeIsSet: number;
      completed: number | string;
      painLevel: number | string | null;
      painLevelIsSet: number;
    }> = {},
  ): void {
    temporary.database
      .prepare(
        `
          INSERT INTO workout_sets (
            id, workout_exercise_id, set_number, weight_kg, weight_kg_is_set,
            reps, reps_is_set, duration_seconds, duration_seconds_is_set,
            rpe, rpe_is_set, completed, pain_level, pain_level_is_set
          ) VALUES (
            @id, @workoutExerciseId, @setNumber, @weightKg, @weightKgIsSet,
            @reps, @repsIsSet, @durationSeconds, @durationSecondsIsSet,
            @rpe, @rpeIsSet, @completed, @painLevel, @painLevelIsSet
          )
        `,
      )
      .run({
        id: 1,
        workoutExerciseId: 1,
        setNumber: 1,
        weightKg: null,
        weightKgIsSet: 0,
        reps: null,
        repsIsSet: 0,
        durationSeconds: null,
        durationSecondsIsSet: 0,
        rpe: null,
        rpeIsSet: 0,
        completed: 1,
        painLevel: null,
        painLevelIsSet: 0,
        ...overrides,
      });
  }

  it("applies 0001-0004 once and creates strict workout tables", () => {
    expect(runMigrations(temporary.database, MIGRATIONS_DIRECTORY)).toEqual({
      applied: [],
      skipped: [
        "0001_create_exercises.sql",
        "0002_create_users.sql",
        "0003_create_routines.sql",
        "0004_create_workouts.sql",
      ],
    });
    const tables = temporary.database
      .prepare("PRAGMA table_list")
      .all() as Array<{
      name: string;
      strict: 0 | 1;
    }>;
    expect(
      tables
        .filter(({ name }) => name.startsWith("workout_"))
        .map(({ name, strict }) => ({ name, strict }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    ).toEqual([
      { name: "workout_exercises", strict: 1 },
      { name: "workout_sessions", strict: 1 },
      { name: "workout_sets", strict: 1 },
    ]);
  });

  it("requires a same-user sealed routine version through composite foreign keys", () => {
    expect(() => insertSession({ userId: 2 })).toThrow(
      /FOREIGN KEY constraint failed/,
    );
    expect(() => insertSession({ versionId: 2 })).toThrow(
      /FOREIGN KEY constraint failed/,
    );
    expect(() => insertSession({ sealed: 0 })).toThrow(
      /CHECK constraint failed/,
    );
    expect(() => insertSession({ routineId: 3, versionId: 1 })).toThrow(
      /FOREIGN KEY constraint failed/,
    );
    insertSession();
  });

  it("requires the planned exercise to belong exactly to the session version", () => {
    insertSession();
    expect(() => insertResult({ plannedId: 3 })).toThrow(
      /FOREIGN KEY constraint failed/,
    );
    expect(() => insertResult({ versionId: 3 })).toThrow(
      /FOREIGN KEY constraint failed/,
    );
    insertResult();
  });

  it("requires unique planned results, actual positions, and set numbers", () => {
    insertSession();
    insertResult();
    insertSet();
    expect(() => insertResult({ id: 2, position: 2 })).toThrow(
      "workout exercise requires an active in-progress session",
    );
    expect(() => insertResult({ id: 2, plannedId: 3 })).toThrow(
      "workout result position conflict",
    );
    expect(() => insertSet({ id: 2 })).toThrow(
      "workout set requires an active in-progress result",
    );
  });

  it("accepts only canonical UTC timestamps and derives coherent integer duration", () => {
    for (const startedAt of [
      "2026-08-11T10:00:00Z",
      "2026-08-11T12:00:00.000+02:00",
      "2026-02-30T10:00:00.000Z",
      "not-a-date",
    ]) {
      expect(() => insertSession({ startedAt })).toThrow(
        /CHECK constraint failed/,
      );
    }
    insertSession();
    temporary.database
      .prepare(
        `
          UPDATE workout_sessions
          SET status = 'completed', completed_at = ?,
              overall_rpe = 8.5, overall_rpe_is_set = 1, notes = 'Done'
          WHERE id = 1
        `,
      )
      .run("2026-08-11T11:30:00.500Z");
    expect(
      temporary.database
        .prepare(
          `
            SELECT status, completed_at, duration_seconds, overall_rpe, notes
            FROM workout_sessions WHERE id = 1
          `,
        )
        .get(),
    ).toEqual({
      status: "completed",
      completed_at: "2026-08-11T11:30:00.500Z",
      duration_seconds: 5401,
      overall_rpe: 8.5,
      notes: "Done",
    });
  });

  it("rejects completion before start and terminal fields on cancellation", () => {
    insertSession();
    expect(() =>
      temporary.database
        .prepare(
          `
            UPDATE workout_sessions
            SET status = 'completed', completed_at = ?
            WHERE id = 1
          `,
        )
        .run("2026-08-11T09:59:59.999Z"),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      temporary.database
        .prepare(
          `
            UPDATE workout_sessions
            SET status = 'cancelled', notes = 'not allowed'
            WHERE id = 1
          `,
        )
        .run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it("makes terminal states irreversible and blocks direct child writes", () => {
    insertSession();
    insertResult();
    insertSet();
    temporary.database
      .prepare("UPDATE workout_sessions SET status = 'cancelled' WHERE id = 1")
      .run();

    expect(() =>
      temporary.database
        .prepare(
          "UPDATE workout_sessions SET status = 'completed' WHERE id = 1",
        )
        .run(),
    ).toThrow("invalid workout terminal transition");
    expect(() =>
      temporary.database
        .prepare("UPDATE workout_exercises SET notes = 'late' WHERE id = 1")
        .run(),
    ).toThrow("workout exercise is not writable");
    expect(() => insertResult({ id: 2, plannedId: 3, position: 2 })).toThrow(
      "workout exercise requires an active in-progress session",
    );
    expect(() =>
      temporary.database
        .prepare("UPDATE workout_sets SET completed = 0 WHERE id = 1")
        .run(),
    ).toThrow("workout set is not writable");
    expect(() => insertSet({ id: 2, setNumber: 2 })).toThrow(
      "workout set requires an active in-progress result",
    );
    expect(() =>
      temporary.database.prepare("DELETE FROM workout_sets WHERE id = 1").run(),
    ).toThrow("workout set is not writable");
    expect(() =>
      temporary.database
        .prepare("DELETE FROM workout_exercises WHERE id = 1")
        .run(),
    ).toThrow("workout exercises cannot be deleted");
    expect(() =>
      temporary.database
        .prepare("DELETE FROM workout_sessions WHERE id = 1")
        .run(),
    ).toThrow("workout sessions cannot be deleted");
  });

  it("blocks REPLACE and identity changes while allowing an in-progress full set sync", () => {
    insertSession();
    insertResult();
    insertSet();
    expect(() =>
      temporary.database
        .prepare(
          `
            INSERT OR REPLACE INTO workout_sessions (
              id, user_id, routine_id, routine_version_id,
              routine_version_is_sealed, started_at, status, created_at
            ) VALUES (1, 1, 1, 1, 1, ?, 'in_progress', ?)
          `,
        )
        .run(STARTED_AT, STARTED_AT),
    ).toThrow("workout sessions must be created in progress");
    expect(() =>
      temporary.database
        .prepare(
          `
            INSERT OR REPLACE INTO workout_exercises (
              id, workout_session_id, routine_version_id,
              routine_exercise_id, exercise_id, position
            ) VALUES (2, 1, 1, 1, 1, 2)
          `,
        )
        .run(),
    ).toThrow("workout exercise requires an active in-progress session");
    expect(() =>
      temporary.database
        .prepare(
          `
            INSERT OR REPLACE INTO workout_sets (
              id, workout_exercise_id, set_number,
              weight_kg_is_set, reps_is_set, duration_seconds_is_set,
              rpe_is_set, completed, pain_level_is_set
            ) VALUES (2, 1, 1, 0, 0, 0, 0, 1, 0)
          `,
        )
        .run(),
    ).toThrow("workout set requires an active in-progress result");
    expect(() =>
      temporary.database
        .prepare(
          "UPDATE workout_exercises SET routine_exercise_id = 3 WHERE id = 1",
        )
        .run(),
    ).toThrow("workout exercise is not writable");
    expect(() =>
      temporary.database
        .prepare("UPDATE workout_sets SET set_number = 2 WHERE id = 1")
        .run(),
    ).toThrow("workout set is not writable");

    temporary.database
      .prepare("UPDATE workout_sets SET reps = 8, reps_is_set = 1 WHERE id = 1")
      .run();
    temporary.database.prepare("DELETE FROM workout_sets WHERE id = 1").run();
    expect(
      temporary.database
        .prepare("SELECT COUNT(*) AS count FROM workout_sets")
        .get(),
    ).toEqual({ count: 0 });
  });

  it("aborts UPDATE OR REPLACE position conflicts before either result can be deleted", () => {
    insertSession();
    insertResult();
    insertResult({
      id: 2,
      plannedId: 4,
      exerciseId: 2,
      position: 2,
    });
    insertSet();
    insertSet({ id: 2, setNumber: 2 });
    const before = temporary.database
      .prepare(
        `
          SELECT id, workout_session_id, routine_exercise_id, exercise_id, position
          FROM workout_exercises
          ORDER BY id
        `,
      )
      .all();
    const setsBefore = temporary.database
      .prepare(
        `
          SELECT id, workout_exercise_id, set_number
          FROM workout_sets
          ORDER BY id
        `,
      )
      .all();

    expect(() =>
      temporary.database
        .prepare(
          "UPDATE OR REPLACE workout_exercises SET position = 2 WHERE id = 1",
        )
        .run(),
    ).toThrow("workout result position conflict");
    expect(() =>
      temporary.database
        .prepare(
          `
            UPDATE OR REPLACE workout_exercises
            SET routine_exercise_id = 4
            WHERE id = 1
          `,
        )
        .run(),
    ).toThrow("workout exercise is not writable");
    expect(() =>
      temporary.database
        .prepare(
          "UPDATE OR REPLACE workout_sets SET set_number = 2 WHERE id = 1",
        )
        .run(),
    ).toThrow("workout set is not writable");

    expect(
      temporary.database
        .prepare(
          `
            SELECT id, workout_session_id, routine_exercise_id, exercise_id, position
            FROM workout_exercises
            ORDER BY id
          `,
        )
        .all(),
    ).toEqual(before);
    expect(before).toHaveLength(2);
    expect(
      temporary.database
        .prepare(
          `
            SELECT id, workout_exercise_id, set_number
            FROM workout_sets
            ORDER BY id
          `,
        )
        .all(),
    ).toEqual(setsBefore);
    expect(setsBefore).toHaveLength(2);
  });

  it("requires the performed exercise to be active for result writes but keeps history readable", () => {
    insertSession();
    expect(() => insertResult({ exerciseId: 3 })).toThrow(
      "workout exercise requires an active in-progress session",
    );
    insertResult();
    insertSet();
    temporary.database
      .prepare("UPDATE exercises SET is_active = 0 WHERE id = 1")
      .run();

    expect(
      temporary.database
        .prepare("SELECT exercise_id FROM workout_exercises WHERE id = 1")
        .get(),
    ).toEqual({ exercise_id: 1 });
    expect(() =>
      temporary.database
        .prepare("UPDATE workout_sets SET completed = 0 WHERE id = 1")
        .run(),
    ).toThrow("workout set is not writable");
    temporary.database
      .prepare("UPDATE workout_exercises SET exercise_id = 2 WHERE id = 1")
      .run();
    temporary.database
      .prepare("UPDATE workout_sets SET completed = 0 WHERE id = 1")
      .run();
  });

  it.each([
    ["session id", () => insertSession({ id: "1" })],
    ["session owner", () => insertSession({ userId: "1" })],
    [
      "result id",
      () => {
        insertSession();
        insertResult({ id: "1" });
      },
    ],
    [
      "result exercise",
      () => {
        insertSession();
        insertResult({ exerciseId: "1" });
      },
    ],
    [
      "result position",
      () => {
        insertSession();
        insertResult({ position: "1" });
      },
    ],
    [
      "set number",
      () => {
        insertSession();
        insertResult();
        insertSet({ setNumber: "1" });
      },
    ],
    [
      "set completed",
      () => {
        insertSession();
        insertResult();
        insertSet({ completed: "1" });
      },
    ],
    [
      "set weight",
      () => {
        insertSession();
        insertResult();
        insertSet({ weightKg: "10", weightKgIsSet: 1 });
      },
    ],
    [
      "set reps",
      () => {
        insertSession();
        insertResult();
        insertSet({ reps: "8", repsIsSet: 1 });
      },
    ],
  ])("rejects textual numeric bindings for %s", (_label, operation) => {
    expect(operation).toThrow(/CHECK constraint failed/);
  });

  it.each([
    ["negative weight", { weightKg: -1, weightKgIsSet: 1 }],
    ["fractional reps", { reps: 1.5, repsIsSet: 1 }],
    ["negative reps", { reps: -1, repsIsSet: 1 }],
    ["fractional duration", { durationSeconds: 1.5, durationSecondsIsSet: 1 }],
    ["low RPE", { rpe: 0, rpeIsSet: 1 }],
    ["high RPE", { rpe: 11, rpeIsSet: 1 }],
    ["fractional pain", { painLevel: 1.5, painLevelIsSet: 1 }],
    ["high pain", { painLevel: 11, painLevelIsSet: 1 }],
  ])("rejects invalid numeric value: %s", (_label, overrides) => {
    insertSession();
    insertResult();
    expect(() => insertSet(overrides)).toThrow(/CHECK constraint failed/);
  });

  it("rejects NaN, infinity, unsafe integers, and inconsistent markers", () => {
    expect(() => insertSession({ id: 9007199254740992n })).toThrow(
      /CHECK constraint failed/,
    );
    expect(() =>
      insertSession({ overallRpe: Number.NaN, overallRpeIsSet: 1 }),
    ).toThrow();
    insertSession();
    insertResult();
    for (const values of [
      { weightKg: Number.NaN, weightKgIsSet: 1 },
      { weightKg: Number.POSITIVE_INFINITY, weightKgIsSet: 1 },
      { reps: Number.NaN, repsIsSet: 1 },
      { durationSeconds: Number.NaN, durationSecondsIsSet: 1 },
      { rpe: Number.NaN, rpeIsSet: 1 },
      { painLevel: Number.NaN, painLevelIsSet: 1 },
      { reps: 8, repsIsSet: 0 },
      { weightKg: null, weightKgIsSet: 1 },
    ]) {
      expect(() => insertSet(values)).toThrow(/CHECK constraint failed/);
    }
  });

  it("defines support and history indices without destructive cascades", () => {
    const indices = temporary.database
      .prepare(
        `
          SELECT name FROM sqlite_master
          WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex%'
        `,
      )
      .all() as Array<{ name: string }>;
    expect(indices.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "routines_id_user_unique",
        "routine_versions_id_routine_sealed_unique",
        "routine_exercises_id_version_unique",
        "workout_sessions_user_started_idx",
        "workout_sessions_user_status_started_idx",
        "workout_sessions_version_idx",
        "workout_exercises_planned_version_idx",
      ]),
    );

    for (const table of [
      "workout_sessions",
      "workout_exercises",
      "workout_sets",
    ]) {
      const foreignKeys = temporary.database
        .prepare(`PRAGMA foreign_key_list(${table})`)
        .all() as Array<{ on_delete: string; on_update: string }>;
      expect(foreignKeys.length).toBeGreaterThan(0);
      expect(
        foreignKeys.every(
          ({ on_delete, on_update }) =>
            on_delete === "NO ACTION" && on_update === "NO ACTION",
        ),
      ).toBe(true);
    }
  });
});
