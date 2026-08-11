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

describe("routines migration", () => {
  let temporary: TemporaryDatabase;

  beforeEach(() => {
    temporary = createTemporaryDatabase();
    runMigrations(temporary.database, MIGRATIONS_DIRECTORY);
    insertUser(temporary.database);
    insertExercise(temporary.database);
  });

  afterEach(() => temporary.cleanup());

  function insertRoutine(id = 1, currentVersionNumber = 1): void {
    temporary.database
      .prepare(
        `
          INSERT INTO routines (
            id, user_id, name, current_version_number, created_at, updated_at
          ) VALUES (?, 1, 'Strength A', ?, ?, ?)
        `,
      )
      .run(id, currentVersionNumber, FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP);
  }

  function insertVersion(
    id = 1,
    routineId = 1,
    versionNumber = 1,
    sealed = 0,
  ): void {
    temporary.database
      .prepare(
        `
          INSERT INTO routine_versions (
            id, routine_id, version_number, is_sealed, created_at
          ) VALUES (?, ?, ?, ?, ?)
        `,
      )
      .run(id, routineId, versionNumber, sealed, FIXTURE_TIMESTAMP);
  }

  function insertPlannedExercise(id = 1, versionId = 1, position = 1): void {
    temporary.database
      .prepare(
        `
          INSERT INTO routine_exercises (
            id, routine_version_id, exercise_id, position,
            rest_seconds_is_set, target_rpe_is_set
          ) VALUES (?, ?, 1, ?, 0, 0)
        `,
      )
      .run(id, versionId, position);
  }

  function insertSet(id = 1, routineExerciseId = 1, setNumber = 1): void {
    temporary.database
      .prepare(
        `
          INSERT INTO routine_sets (
            id, routine_exercise_id, set_number, target_weight_kg_is_set,
            target_reps_min, target_reps_min_is_set,
            target_reps_max, target_reps_max_is_set,
            target_seconds_is_set, target_rpe_is_set
          ) VALUES (?, ?, ?, 0, 8, 1, 12, 1, 0, 0)
        `,
      )
      .run(id, routineExerciseId, setNumber);
  }

  function createSealedRoutine(): void {
    temporary.database.exec("BEGIN");
    try {
      insertRoutine();
      insertVersion();
      insertPlannedExercise();
      insertSet();
      temporary.database
        .prepare("UPDATE routine_versions SET is_sealed = 1 WHERE id = 1")
        .run();
      temporary.database
        .prepare(
          `
            UPDATE routines
            SET pending_version_number = NULL, protocol_state = 0
            WHERE id = 1
          `,
        )
        .run();
      temporary.database.exec("COMMIT");
    } catch (error) {
      temporary.database.exec("ROLLBACK");
      throw error;
    }
  }

  function expectDeferredCommitFailure(): void {
    expect(() => temporary.database.exec("COMMIT")).toThrow(
      /FOREIGN KEY constraint failed/,
    );
    expect(temporary.database.inTransaction).toBe(true);
    temporary.database.exec("ROLLBACK");
  }

  it("applies 0001-0005 once and creates the routine aggregate tables", () => {
    expect(runMigrations(temporary.database, MIGRATIONS_DIRECTORY)).toEqual({
      applied: [],
      skipped: [
        "0001_create_exercises.sql",
        "0002_create_users.sql",
        "0003_create_routines.sql",
        "0004_create_workouts.sql",
        "0005_create_body_tracking.sql",
      ],
    });
    expect(
      temporary.database
        .prepare(
          `
            SELECT name FROM sqlite_master
            WHERE type = 'table' AND name LIKE 'routine%'
            ORDER BY name
          `,
        )
        .all(),
    ).toEqual([
      { name: "routine_exercises" },
      { name: "routine_protocol_states" },
      { name: "routine_sets" },
      { name: "routine_versions" },
      { name: "routines" },
    ]);
    expect(
      temporary.database
        .prepare("SELECT COUNT(*) AS count FROM schema_migrations")
        .get(),
    ).toEqual({ count: 5 });
    const strictTables = temporary.database
      .prepare("PRAGMA table_list")
      .all() as Array<{ name: string; strict: 0 | 1 }>;
    expect(
      strictTables
        .filter(({ name }) => name.startsWith("routine"))
        .every(({ strict }) => strict === 1),
    ).toBe(true);
  });

  it("keeps the singleton protocol guard immutable without any routines", () => {
    expect(() =>
      temporary.database
        .prepare("UPDATE routine_protocol_states SET state = 0 WHERE state = 0")
        .run(),
    ).toThrow("routine protocol state is immutable");
    expect(() =>
      temporary.database
        .prepare("DELETE FROM routine_protocol_states WHERE state = 0")
        .run(),
    ).toThrow("routine protocol state is immutable");
    expect(
      temporary.database
        .prepare("SELECT state FROM routine_protocol_states")
        .all(),
    ).toEqual([{ state: 0 }]);
  });

  it("defines foreign keys without destructive cascades and a deferred sealed pointer", () => {
    const routineForeignKeys = temporary.database
      .prepare("PRAGMA foreign_key_list(routines)")
      .all() as Array<{
      table: string;
      from: string;
      to: string;
      on_delete: string;
    }>;

    expect(routineForeignKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "users", from: "user_id", to: "id" }),
        expect.objectContaining({
          table: "routine_versions",
          from: "current_version_number",
          to: "version_number",
          on_delete: "NO ACTION",
        }),
        expect.objectContaining({
          table: "routine_versions",
          from: "current_version_is_sealed",
          to: "is_sealed",
        }),
      ]),
    );

    temporary.database.exec("BEGIN");
    insertRoutine();
    expect(() => temporary.database.exec("COMMIT")).toThrow(
      /FOREIGN KEY constraint failed/,
    );
    if (temporary.database.inTransaction) temporary.database.exec("ROLLBACK");
  });

  it("creates a complete routine with an obligatory sealed current version", () => {
    createSealedRoutine();

    expect(
      temporary.database
        .prepare(
          `
            SELECT routines.current_version_number, routine_versions.is_sealed
            FROM routines
            JOIN routine_versions
              ON routine_versions.routine_id = routines.id
             AND routine_versions.version_number = routines.current_version_number
          `,
        )
        .get(),
    ).toEqual({ current_version_number: 1, is_sealed: 1 });
  });

  it.each([
    ["routine owner FK", () => insertRoutine(1)],
    ["version routine FK", () => insertVersion(1, 999)],
    [
      "planned exercise catalog FK",
      () => {
        createSealedRoutine();
        temporary.database.prepare("DELETE FROM exercises WHERE id = 1").run();
      },
    ],
  ])("enforces the %s", (_label, operation) => {
    if (_label === "routine owner FK") {
      temporary.database.prepare("DELETE FROM users WHERE id = 1").run();
    }
    expect(operation).toThrow();
  });

  it.each([
    ["routine name", "UPDATE routines SET name = '' WHERE id = 1"],
    ["routine active flag", "UPDATE routines SET is_active = 2 WHERE id = 1"],
    [
      "exercise position",
      "INSERT INTO routine_exercises (id, routine_version_id, exercise_id, position, rest_seconds, rest_seconds_is_set, target_rpe, target_rpe_is_set) VALUES (2, 1, 1, 0, NULL, 0, NULL, 0)",
    ],
    [
      "rest seconds",
      "INSERT INTO routine_exercises (id, routine_version_id, exercise_id, position, rest_seconds, rest_seconds_is_set, target_rpe, target_rpe_is_set) VALUES (2, 1, 1, 2, -1, 1, NULL, 0)",
    ],
    [
      "exercise RPE",
      "INSERT INTO routine_exercises (id, routine_version_id, exercise_id, position, rest_seconds, rest_seconds_is_set, target_rpe, target_rpe_is_set) VALUES (2, 1, 1, 2, NULL, 0, 11, 1)",
    ],
    [
      "set number",
      "INSERT INTO routine_sets (id, routine_exercise_id, set_number, set_type, target_weight_kg, target_weight_kg_is_set, target_reps_min, target_reps_min_is_set, target_reps_max, target_reps_max_is_set, target_seconds, target_seconds_is_set, target_rpe, target_rpe_is_set) VALUES (2, 1, 0, NULL, NULL, 0, NULL, 0, NULL, 0, 1, 1, NULL, 0)",
    ],
    [
      "set type",
      "INSERT INTO routine_sets (id, routine_exercise_id, set_number, set_type, target_weight_kg, target_weight_kg_is_set, target_reps_min, target_reps_min_is_set, target_reps_max, target_reps_max_is_set, target_seconds, target_seconds_is_set, target_rpe, target_rpe_is_set) VALUES (2, 1, 2, 'drop', NULL, 0, NULL, 0, NULL, 0, 1, 1, NULL, 0)",
    ],
    [
      "weight",
      "INSERT INTO routine_sets (id, routine_exercise_id, set_number, set_type, target_weight_kg, target_weight_kg_is_set, target_reps_min, target_reps_min_is_set, target_reps_max, target_reps_max_is_set, target_seconds, target_seconds_is_set, target_rpe, target_rpe_is_set) VALUES (2, 1, 2, NULL, -1, 1, NULL, 0, NULL, 0, 1, 1, NULL, 0)",
    ],
    [
      "repetition pair",
      "INSERT INTO routine_sets (id, routine_exercise_id, set_number, set_type, target_weight_kg, target_weight_kg_is_set, target_reps_min, target_reps_min_is_set, target_reps_max, target_reps_max_is_set, target_seconds, target_seconds_is_set, target_rpe, target_rpe_is_set) VALUES (2, 1, 2, NULL, NULL, 0, 8, 1, NULL, 0, 1, 1, NULL, 0)",
    ],
    [
      "repetition order",
      "INSERT INTO routine_sets (id, routine_exercise_id, set_number, set_type, target_weight_kg, target_weight_kg_is_set, target_reps_min, target_reps_min_is_set, target_reps_max, target_reps_max_is_set, target_seconds, target_seconds_is_set, target_rpe, target_rpe_is_set) VALUES (2, 1, 2, NULL, NULL, 0, 12, 1, 8, 1, NULL, 0, NULL, 0)",
    ],
    [
      "set target",
      "INSERT INTO routine_sets (id, routine_exercise_id, set_number, set_type, target_weight_kg, target_weight_kg_is_set, target_reps_min, target_reps_min_is_set, target_reps_max, target_reps_max_is_set, target_seconds, target_seconds_is_set, target_rpe, target_rpe_is_set) VALUES (2, 1, 2, NULL, 10, 1, NULL, 0, NULL, 0, NULL, 0, NULL, 0)",
    ],
    [
      "duration",
      "INSERT INTO routine_sets (id, routine_exercise_id, set_number, set_type, target_weight_kg, target_weight_kg_is_set, target_reps_min, target_reps_min_is_set, target_reps_max, target_reps_max_is_set, target_seconds, target_seconds_is_set, target_rpe, target_rpe_is_set) VALUES (2, 1, 2, NULL, NULL, 0, NULL, 0, NULL, 0, -1, 1, NULL, 0)",
    ],
    [
      "set RPE",
      "INSERT INTO routine_sets (id, routine_exercise_id, set_number, set_type, target_weight_kg, target_weight_kg_is_set, target_reps_min, target_reps_min_is_set, target_reps_max, target_reps_max_is_set, target_seconds, target_seconds_is_set, target_rpe, target_rpe_is_set) VALUES (2, 1, 2, NULL, NULL, 0, NULL, 0, NULL, 0, 1, 1, 0, 1)",
    ],
  ])("enforces the %s check", (_label, sql) => {
    temporary.database.exec("BEGIN");
    insertRoutine();
    insertVersion();
    insertPlannedExercise();
    insertSet();

    expect(() => temporary.database.exec(sql)).toThrow(
      /CHECK constraint failed/,
    );
    temporary.database.exec("ROLLBACK");
  });

  it("enforces unique version numbers, positions, and set numbers", () => {
    temporary.database.exec("BEGIN");
    insertRoutine();
    insertVersion();
    insertPlannedExercise();
    insertSet();

    expect(() => insertVersion(2, 1, 1)).toThrow(/UNIQUE|next pending/);
    expect(() => insertPlannedExercise(2, 1, 1)).toThrow(/UNIQUE/);
    expect(() => insertSet(2, 1, 1)).toThrow(/UNIQUE/);
    temporary.database.exec("ROLLBACK");
  });

  it("provides the planned listing and ordered-read indices", () => {
    const indexNames = temporary.database
      .prepare(
        `
          SELECT name FROM sqlite_master
          WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex%'
        `,
      )
      .all() as Array<{ name: string }>;

    expect(indexNames.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "routines_user_name_idx",
        "routine_versions_routine_number_idx",
        "routine_exercises_version_position_idx",
        "routine_exercises_exercise_idx",
        "routine_sets_exercise_number_idx",
      ]),
    );
  });

  it("requires unsealed construction and complete content before sealing", () => {
    temporary.database.exec("BEGIN");
    insertRoutine();
    expect(() => insertVersion(1, 1, 1, 1)).toThrow(
      "routine versions must be created unsealed",
    );
    insertVersion();
    expect(() =>
      temporary.database
        .prepare("UPDATE routine_versions SET is_sealed = 1 WHERE id = 1")
        .run(),
    ).toThrow("a sealed routine version requires an exercise");
    insertPlannedExercise();
    expect(() =>
      temporary.database
        .prepare("UPDATE routine_versions SET is_sealed = 1 WHERE id = 1")
        .run(),
    ).toThrow("every routine exercise requires a set");
    temporary.database.exec("ROLLBACK");
  });

  it("rejects committing a sealed initial version before protocol finalization", () => {
    temporary.database.exec("BEGIN");
    insertRoutine();
    insertVersion();
    insertPlannedExercise();
    insertSet();
    temporary.database
      .prepare("UPDATE routine_versions SET is_sealed = 1 WHERE id = 1")
      .run();

    expectDeferredCommitFailure();
    expect(
      temporary.database
        .prepare("SELECT COUNT(*) AS count FROM routines")
        .get(),
    ).toEqual({ count: 0 });
  });

  it("rejects committing an incomplete next version", () => {
    createSealedRoutine();
    temporary.database.exec("BEGIN");
    insertVersion(2, 1, 2);

    expectDeferredCommitFailure();
    expect(
      temporary.database
        .prepare("SELECT MAX(version_number) AS maximum FROM routine_versions")
        .get(),
    ).toEqual({ maximum: 1 });
  });

  it("rejects a version gap before it can alter protocol state", () => {
    createSealedRoutine();

    expect(() => insertVersion(99, 1, 99)).toThrow(
      "routine version must be the next pending version",
    );
    expect(
      temporary.database
        .prepare(
          "SELECT current_version_number, pending_version_number, protocol_state FROM routines",
        )
        .get(),
    ).toEqual({
      current_version_number: 1,
      pending_version_number: null,
      protocol_state: 0,
    });
  });

  it("rejects committing a sealed next version without advancing the pointer", () => {
    createSealedRoutine();
    temporary.database.exec("BEGIN");
    insertVersion(2, 1, 2);
    insertPlannedExercise(2, 2, 1);
    insertSet(2, 2, 1);
    temporary.database
      .prepare("UPDATE routine_versions SET is_sealed = 1 WHERE id = 2")
      .run();

    expectDeferredCommitFailure();
    expect(
      temporary.database
        .prepare("SELECT COUNT(*) AS count FROM routine_versions")
        .get(),
    ).toEqual({ count: 1 });
  });

  it("rejects textual bindings for integer and real routine fields", () => {
    const database = temporary.database;
    database.exec("BEGIN");

    expect(() =>
      database
        .prepare(
          `
            INSERT INTO routines (
              id, user_id, name, current_version_number, created_at, updated_at
            ) VALUES (?, 1, 'Text id', 1, ?, ?)
          `,
        )
        .run("2", FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      database
        .prepare(
          `
            INSERT INTO routines (
              id, user_id, name, current_version_number, created_at, updated_at
            ) VALUES (2, ?, 'Text owner', 1, ?, ?)
          `,
        )
        .run("1", FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP),
    ).toThrow(/CHECK constraint failed/);

    insertRoutine();
    expect(() =>
      database
        .prepare(
          `
            INSERT INTO routine_versions (
              id, routine_id, version_number, is_sealed, created_at
            ) VALUES (2, 1, ?, 0, ?)
          `,
        )
        .run("1", FIXTURE_TIMESTAMP),
    ).toThrow();
    insertVersion();

    expect(() =>
      database
        .prepare(
          `
            INSERT INTO routine_exercises (
              id, routine_version_id, exercise_id, position, rest_seconds,
              rest_seconds_is_set, target_rpe, target_rpe_is_set
            ) VALUES (2, 1, 1, ?, 90, 1, 7, 1)
          `,
        )
        .run("2"),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      database
        .prepare(
          `
            INSERT INTO routine_exercises (
              id, routine_version_id, exercise_id, position, rest_seconds,
              rest_seconds_is_set, target_rpe, target_rpe_is_set
            ) VALUES (2, 1, 1, 2, ?, 1, 7, 1)
          `,
        )
        .run("90"),
    ).toThrow(/CHECK constraint failed/);
    insertPlannedExercise();

    for (const [field, value] of [
      ["setNumber", "2"],
      ["weight", "20"],
      ["minimum", "8"],
      ["maximum", "12"],
      ["seconds", "30"],
      ["rpe", "7"],
    ] as const) {
      const values = {
        setNumber: 2,
        weight: 20,
        minimum: 8,
        maximum: 12,
        seconds: 30,
        rpe: 7,
        [field]: value,
      };
      expect(() =>
        database
          .prepare(
            `
              INSERT INTO routine_sets (
                id, routine_exercise_id, set_number, target_weight_kg,
                target_weight_kg_is_set, target_reps_min,
                target_reps_min_is_set, target_reps_max,
                target_reps_max_is_set, target_seconds,
                target_seconds_is_set, target_rpe, target_rpe_is_set
              ) VALUES (
                2, 1, @setNumber, @weight, 1,
                @minimum, 1, @maximum, 1, @seconds, 1, @rpe, 1
              )
            `,
          )
          .run(values),
      ).toThrow();
    }
    database.exec("ROLLBACK");
  });

  it("rejects adjacent SQLite integers above Number.MAX_SAFE_INTEGER before mapping", () => {
    const adjacentUnsafeIds = [9007199254740992n, 9007199254740993n];
    expect(Number(adjacentUnsafeIds[0])).toBe(Number(adjacentUnsafeIds[1]));

    for (const [index, id] of adjacentUnsafeIds.entries()) {
      expect(() =>
        temporary.database
          .prepare(
            `
              INSERT INTO users (id, email, display_name, created_at, updated_at)
              VALUES (?, ?, 'Unsafe Id', ?, ?)
            `,
          )
          .run(
            id,
            `unsafe-${index}@example.com`,
            FIXTURE_TIMESTAMP,
            FIXTURE_TIMESTAMP,
          ),
      ).toThrow(/CHECK constraint failed/);
    }
  });

  it("rejects fractional integers and non-finite real bindings", () => {
    temporary.database.exec("BEGIN");
    insertRoutine();
    insertVersion();
    insertPlannedExercise();

    expect(() =>
      temporary.database
        .prepare(
          `
            INSERT INTO routine_sets (
              id, routine_exercise_id, set_number, target_weight_kg_is_set,
              target_reps_min_is_set, target_reps_max_is_set,
              target_seconds, target_seconds_is_set, target_rpe_is_set
            ) VALUES (2, 1, 1.5, 0, 0, 0, 30, 1, 0)
          `,
        )
        .run(),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      temporary.database
        .prepare(
          `
            INSERT INTO routine_sets (
              id, routine_exercise_id, set_number, target_seconds,
              target_seconds_is_set, target_weight_kg,
              target_weight_kg_is_set, target_reps_min_is_set,
              target_reps_max_is_set, target_rpe_is_set
            ) VALUES (2, 1, 2, 30, 1, ?, 1, 0, 0, 0)
          `,
        )
        .run(Number.POSITIVE_INFINITY),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      temporary.database
        .prepare(
          `
            INSERT INTO routine_sets (
              id, routine_exercise_id, set_number, target_seconds,
              target_seconds_is_set, target_weight_kg,
              target_weight_kg_is_set, target_reps_min_is_set,
              target_reps_max_is_set, target_rpe_is_set
            ) VALUES (3, 1, 3, 30, 1, ?, 1, 0, 0, 0)
          `,
        )
        .run(Number.NaN),
    ).toThrow(/CHECK constraint failed/);
    temporary.database.exec("ROLLBACK");
  });

  it("rejects NaN bindings in every nullable integer field", () => {
    temporary.database.exec("BEGIN");
    insertRoutine();
    insertVersion();

    expect(() =>
      temporary.database
        .prepare(
          `
            INSERT INTO routine_exercises (
              id, routine_version_id, exercise_id, position,
              rest_seconds, rest_seconds_is_set, target_rpe_is_set
            ) VALUES (2, 1, 1, 2, ?, 1, 0)
          `,
        )
        .run(Number.NaN),
    ).toThrow(/CHECK constraint failed/);
    insertPlannedExercise();

    for (const [
      minimum,
      minimumIsSet,
      maximum,
      maximumIsSet,
      seconds,
      secondsIsSet,
    ] of [
      [Number.NaN, 1, 12, 1, 30, 1],
      [8, 1, Number.NaN, 1, 30, 1],
      [null, 0, null, 0, Number.NaN, 1],
    ] as const) {
      expect(() =>
        temporary.database
          .prepare(
            `
              INSERT INTO routine_sets (
                id, routine_exercise_id, set_number,
                target_weight_kg_is_set,
                target_reps_min, target_reps_min_is_set,
                target_reps_max, target_reps_max_is_set,
                target_seconds, target_seconds_is_set,
                target_rpe_is_set
              ) VALUES (2, 1, 2, 0, ?, ?, ?, ?, ?, ?, 0)
            `,
          )
          .run(
            minimum,
            minimumIsSet,
            maximum,
            maximumIsSet,
            seconds,
            secondsIsSet,
          ),
      ).toThrow(/CHECK constraint failed/);
    }
    temporary.database.exec("ROLLBACK");
  });

  it("rejects inactive exercises during construction but preserves later deactivation", () => {
    temporary.database
      .prepare("UPDATE exercises SET is_active = 0 WHERE id = 1")
      .run();
    temporary.database.exec("BEGIN");
    insertRoutine();
    insertVersion();
    expect(() => insertPlannedExercise()).toThrow(
      "routine exercise must reference an active exercise",
    );
    temporary.database.exec("ROLLBACK");

    temporary.database
      .prepare("UPDATE exercises SET is_active = 1 WHERE id = 1")
      .run();
    temporary.database.exec("BEGIN");
    insertRoutine();
    insertVersion();
    insertPlannedExercise();
    insertSet();
    temporary.database
      .prepare("UPDATE exercises SET is_active = 0 WHERE id = 1")
      .run();
    expect(() =>
      temporary.database
        .prepare("UPDATE routine_versions SET is_sealed = 1 WHERE id = 1")
        .run(),
    ).toThrow("a sealed routine version requires active exercises");
    temporary.database.exec("ROLLBACK");

    temporary.database
      .prepare("UPDATE exercises SET is_active = 1 WHERE id = 1")
      .run();
    createSealedRoutine();
    expect(
      temporary.database
        .prepare("UPDATE exercises SET is_active = 0 WHERE id = 1")
        .run().changes,
    ).toBe(1);
  });

  it("makes sealed versions and all planned children immutable to direct SQL", () => {
    createSealedRoutine();

    expect(() =>
      temporary.database
        .prepare("UPDATE routine_versions SET name = 'Changed' WHERE id = 1")
        .run(),
    ).toThrow("routine version is immutable");
    expect(() =>
      temporary.database
        .prepare("DELETE FROM routine_versions WHERE id = 1")
        .run(),
    ).toThrow("sealed routine version cannot be deleted");
    expect(() =>
      temporary.database
        .prepare("UPDATE routine_exercises SET position = 2 WHERE id = 1")
        .run(),
    ).toThrow("routine exercise is immutable");
    expect(() =>
      temporary.database
        .prepare("DELETE FROM routine_exercises WHERE id = 1")
        .run(),
    ).toThrow("routine exercise is immutable");
    expect(() =>
      temporary.database
        .prepare("UPDATE routine_sets SET set_number = 2 WHERE id = 1")
        .run(),
    ).toThrow("routine set is immutable");
    expect(() =>
      temporary.database.prepare("DELETE FROM routine_sets WHERE id = 1").run(),
    ).toThrow("routine set is immutable");
    expect(() => insertPlannedExercise(2, 1, 2)).toThrow(
      "sealed routine version cannot accept exercises",
    );
    expect(() => insertSet(2, 1, 2)).toThrow(
      "sealed routine version cannot accept sets",
    );
  });

  it("moves the pointer only one version forward to a sealed own version", () => {
    createSealedRoutine();
    expect(() =>
      temporary.database
        .prepare("UPDATE routines SET current_version_number = 3 WHERE id = 1")
        .run(),
    ).toThrow("invalid routine version protocol transition");

    temporary.database.exec("BEGIN");
    insertVersion(2, 1, 2);
    insertPlannedExercise(2, 2, 1);
    insertSet(2, 2, 1);
    temporary.database
      .prepare("UPDATE routine_versions SET is_sealed = 1 WHERE id = 2")
      .run();
    temporary.database
      .prepare(
        `
          UPDATE routines
          SET
            current_version_number = 2,
            pending_version_number = NULL,
            protocol_state = 0
          WHERE id = 1
        `,
      )
      .run();
    temporary.database.exec("COMMIT");

    expect(
      temporary.database
        .prepare("SELECT current_version_number FROM routines WHERE id = 1")
        .get(),
    ).toEqual({ current_version_number: 2 });
  });

  it("rolls back all aggregate rows after a construction failure", () => {
    expect(() => {
      temporary.database.exec("BEGIN");
      insertRoutine();
      insertVersion();
      insertPlannedExercise();
      insertSet();
      insertSet(2, 1, 1);
      temporary.database.exec("COMMIT");
    }).toThrow(/UNIQUE/);
    if (temporary.database.inTransaction) temporary.database.exec("ROLLBACK");

    for (const table of [
      "routines",
      "routine_versions",
      "routine_exercises",
      "routine_sets",
    ]) {
      expect(
        temporary.database
          .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
          .get(),
      ).toEqual({ count: 0 });
    }
  });
});
