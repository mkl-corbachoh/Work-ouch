import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../src/db/migrations";
import {
  createTemporaryDatabase,
  type TemporaryDatabase,
} from "../helpers/database";
import { FIXTURE_TIMESTAMP, insertUser } from "../helpers/fixtures";

const MIGRATIONS_DIRECTORY = resolve("database/migrations");
const MEASURED_AT = "2026-08-11T10:00:00.000Z";

describe("body tracking migration", () => {
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
    insertMetricType();
    insertMetricType({ id: 2, code: "bmi", name: "BMI", unit: null });
  });

  afterEach(() => temporary.cleanup());

  function insertMetricType(
    overrides: Partial<{
      id: number | bigint | string;
      code: string;
      name: string;
      unit: string | null;
      description: string | null;
    }> = {},
  ): void {
    temporary.database
      .prepare(
        `
          INSERT INTO body_metric_types (id, code, name, unit, description)
          VALUES (@id, @code, @name, @unit, @description)
        `,
      )
      .run({
        id: 1,
        code: "weight_kg",
        name: "Weight",
        unit: "kg",
        description: null,
        ...overrides,
      });
  }

  function insertValue(
    overrides: Partial<{
      id: number | bigint | string;
      measurementId: number | bigint | string;
      metricTypeId: number | bigint | string;
      value: number | bigint | string | null;
    }> = {},
  ): void {
    temporary.database
      .prepare(
        `
          INSERT INTO body_measurement_values (
            id, measurement_id, metric_type_id, value
          ) VALUES (@id, @measurementId, @metricTypeId, @value)
        `,
      )
      .run({
        id: 1,
        measurementId: 1,
        metricTypeId: 1,
        value: 72.5,
        ...overrides,
      });
  }

  function insertMeasurement(
    overrides: Partial<{
      id: number | bigint | string;
      userId: number | bigint | string;
      measuredAt: string;
      source: string | null;
      notes: string | null;
      createdAt: string;
    }> = {},
  ): void {
    temporary.database
      .prepare(
        `
          INSERT INTO body_measurements (
            id, user_id, measured_at, source, notes, created_at
          ) VALUES (@id, @userId, @measuredAt, @source, @notes, @createdAt)
        `,
      )
      .run({
        id: 1,
        userId: 1,
        measuredAt: MEASURED_AT,
        source: null,
        notes: null,
        createdAt: FIXTURE_TIMESTAMP,
        ...overrides,
      });
  }

  function createMeasurement(): void {
    temporary.database.exec("BEGIN");
    try {
      insertValue();
      insertMeasurement();
      temporary.database.exec("COMMIT");
    } catch (error) {
      temporary.database.exec("ROLLBACK");
      throw error;
    }
  }

  it("applies 0001-0005 once and creates three strict tables", () => {
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
    const tables = temporary.database
      .prepare("PRAGMA table_list")
      .all() as Array<{
      name: string;
      strict: 0 | 1;
    }>;
    expect(
      tables
        .filter(({ name }) => name.startsWith("body_"))
        .map(({ name, strict }) => ({ name, strict }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    ).toEqual([
      { name: "body_measurement_values", strict: 1 },
      { name: "body_measurements", strict: 1 },
      { name: "body_metric_types", strict: 1 },
    ]);
  });

  it("enforces metric type text rules and unique binary snake-case codes", () => {
    for (const code of [
      "",
      " weight",
      "Weight",
      "weight-kg",
      "_weight",
      "weight_",
      "weight__kg",
    ]) {
      expect(() =>
        insertMetricType({ id: 3, code, name: "Invalid" }),
      ).toThrow();
    }
    expect(() =>
      insertMetricType({ id: 3, code: "weight_kg", name: "Duplicate" }),
    ).toThrow("body metric type already exists");
    expect(() =>
      insertMetricType({ id: 3, code: "height_cm", name: " Height" }),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      insertMetricType({ id: 3, code: "height_cm", name: "Height", unit: "" }),
    ).toThrow(/CHECK constraint failed/);
    insertMetricType({ id: 3, code: "metric2", name: "Metric 2" });
  });

  it("rejects embedded NUL even when the visible prefix looks valid", () => {
    for (const code of [
      "valid_code\0INVALID-CONTENT",
      `valid_code\0${"x".repeat(101)}`,
    ]) {
      expect(() =>
        insertMetricType({ id: 3, code, name: "Invalid NUL" }),
      ).toThrow(/CHECK constraint failed/);
    }
    expect(
      temporary.database
        .prepare("SELECT COUNT(*) AS count FROM body_metric_types")
        .get(),
    ).toEqual({ count: 2 });
  });

  it("requires canonical UTC timestamps and valid optional text", () => {
    for (const measuredAt of [
      "2026-08-11T10:00:00Z",
      "2026-08-11T12:00:00.000+02:00",
      "2026-02-30T10:00:00.000Z",
      "not-a-date",
    ]) {
      temporary.database.exec("BEGIN");
      insertValue();
      expect(() => insertMeasurement({ measuredAt })).toThrow(
        /CHECK constraint failed/,
      );
      temporary.database.exec("ROLLBACK");
    }
    temporary.database.exec("BEGIN");
    insertValue();
    expect(() => insertMeasurement({ source: "" })).toThrow(
      /CHECK constraint failed/,
    );
    temporary.database.exec("ROLLBACK");
  });

  it("enforces the deferred values-first protocol atomically", () => {
    expect(() => insertMeasurement()).toThrow(
      "body measurement requires values first",
    );

    temporary.database.exec("BEGIN");
    insertValue();
    expect(() => temporary.database.exec("COMMIT")).toThrow(
      /FOREIGN KEY constraint failed/,
    );
    temporary.database.exec("ROLLBACK");

    createMeasurement();
    expect(
      temporary.database
        .prepare("SELECT id, user_id FROM body_measurements")
        .all(),
    ).toEqual([{ id: 1, user_id: 1 }]);
    expect(
      temporary.database
        .prepare("SELECT measurement_id, value FROM body_measurement_values")
        .all(),
    ).toEqual([{ measurement_id: 1, value: 72.5 }]);
  });

  it("rejects nonexistent users, metric types, and duplicate metric values", () => {
    temporary.database.exec("BEGIN");
    insertValue();
    expect(() => insertMeasurement({ userId: 999 })).toThrow(
      /FOREIGN KEY constraint failed/,
    );
    temporary.database.exec("ROLLBACK");

    temporary.database.exec("BEGIN");
    expect(() => insertValue({ metricTypeId: 999 })).toThrow(
      /FOREIGN KEY constraint failed/,
    );
    temporary.database.exec("ROLLBACK");

    temporary.database.exec("BEGIN");
    insertValue();
    expect(() => insertValue({ id: 2 })).toThrow(
      "body measurement values can only be inserted before their measurement",
    );
    temporary.database.exec("ROLLBACK");
  });

  it("allows repeated user timestamps as distinct immutable measurements", () => {
    createMeasurement();
    temporary.database.exec("BEGIN");
    insertValue({ id: 2, measurementId: 2 });
    insertMeasurement({ id: 2 });
    temporary.database.exec("COMMIT");
    expect(
      temporary.database
        .prepare("SELECT id FROM body_measurements ORDER BY id")
        .all(),
    ).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("blocks later inserts, updates, deletes, and INSERT OR REPLACE", () => {
    createMeasurement();
    expect(() => insertValue({ id: 2, metricTypeId: 2, value: 22 })).toThrow(
      "body measurement values can only be inserted before their measurement",
    );
    expect(() =>
      temporary.database
        .prepare("UPDATE body_measurements SET notes = 'changed' WHERE id = 1")
        .run(),
    ).toThrow("body measurements are immutable");
    expect(() =>
      temporary.database
        .prepare("UPDATE body_measurement_values SET value = 70 WHERE id = 1")
        .run(),
    ).toThrow("body measurement values are immutable");
    expect(() =>
      temporary.database
        .prepare("DELETE FROM body_measurements WHERE id = 1")
        .run(),
    ).toThrow("body measurements cannot be deleted");
    expect(() =>
      temporary.database
        .prepare("DELETE FROM body_metric_types WHERE id = 1")
        .run(),
    ).toThrow("body metric types cannot be deleted");
    expect(() =>
      temporary.database
        .prepare("UPDATE body_metric_types SET code = 'mass_kg' WHERE id = 1")
        .run(),
    ).toThrow("body metric type identity is immutable");

    expect(() =>
      temporary.database
        .prepare(
          "INSERT OR REPLACE INTO body_metric_types (id, code, name) VALUES (3, 'weight_kg', 'Changed')",
        )
        .run(),
    ).toThrow("body metric type already exists");
    expect(() =>
      temporary.database
        .prepare(
          `
            INSERT OR REPLACE INTO body_measurements (
              id, user_id, measured_at, created_at
            ) VALUES (1, 1, ?, ?)
          `,
        )
        .run(MEASURED_AT, FIXTURE_TIMESTAMP),
    ).toThrow("body measurement requires values first");
    expect(() =>
      temporary.database
        .prepare(
          `
            INSERT OR REPLACE INTO body_measurement_values (
              id, measurement_id, metric_type_id, value
            ) VALUES (2, 1, 1, 99)
          `,
        )
        .run(),
    ).toThrow(
      "body measurement values can only be inserted before their measurement",
    );
    expect(
      temporary.database
        .prepare("SELECT value FROM body_measurement_values")
        .get(),
    ).toEqual({ value: 72.5 });
  });

  it.each([
    [
      "metric type id",
      () => insertMetricType({ id: "3", code: "height_cm", name: "Height" }),
    ],
    ["measurement value id", () => insertValue({ id: "1" })],
    ["measurement foreign key", () => insertValue({ measurementId: "1" })],
    ["metric type foreign key", () => insertValue({ metricTypeId: "1" })],
    ["value", () => insertValue({ value: "72" })],
  ])("rejects textual numeric bindings for %s", (_label, operation) => {
    temporary.database.exec("BEGIN");
    expect(operation).toThrow();
    temporary.database.exec("ROLLBACK");
  });

  it("accepts every SQLite integer plus finite fractions, zero, and negatives", () => {
    temporary.database.exec("BEGIN");
    insertValue({
      id: 1,
      metricTypeId: 1,
      value: -9223372036854775808n,
    });
    insertValue({ id: 2, metricTypeId: 2, value: -10.5 });
    insertMeasurement();
    temporary.database.exec("COMMIT");
    expect(
      temporary.database
        .prepare(
          `
            SELECT typeof(value) AS storage_type, CAST(value AS TEXT) AS value
            FROM body_measurement_values ORDER BY id
          `,
        )
        .all(),
    ).toEqual([
      { storage_type: "integer", value: "-9223372036854775808" },
      { storage_type: "real", value: "-10.5" },
    ]);
  });

  it("rejects unsafe IDs, null, NaN, and infinite values", () => {
    insertMetricType({
      id: Number.MAX_SAFE_INTEGER,
      code: "safe_limit",
      name: "Safe limit",
    });
    expect(() =>
      insertMetricType({
        id: 9007199254740992n,
        code: "height_cm",
        name: "Height",
      }),
    ).toThrow(/CHECK constraint failed/);
    for (const value of [
      null,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      temporary.database.exec("BEGIN");
      expect(() => insertValue({ value })).toThrow();
      temporary.database.exec("ROLLBACK");
    }
  });

  it("defines NO ACTION foreign keys and required history/support indices", () => {
    for (const table of ["body_measurements", "body_measurement_values"]) {
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
    const indices = temporary.database
      .prepare(
        `
          SELECT name FROM sqlite_master
          WHERE type = 'index' AND tbl_name LIKE 'body_%'
        `,
      )
      .all() as Array<{ name: string }>;
    expect(indices.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "body_measurements_user_measured_idx",
        "body_measurement_values_type_measurement_idx",
      ]),
    );
  });
});
