import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../src/db/migrations";
import {
  createTemporaryDatabase,
  type TemporaryDatabase,
} from "../helpers/database";

const MIGRATIONS_DIRECTORY = resolve("database/migrations");
const TIMESTAMP = "2026-08-11T10:00:00.000Z";

describe("exercise migration", () => {
  let temporary: TemporaryDatabase;

  beforeEach(() => {
    temporary = createTemporaryDatabase();
    runMigrations(temporary.database, MIGRATIONS_DIRECTORY);
  });

  afterEach(() => temporary.cleanup());

  function insertExercise(overrides: Record<string, unknown> = {}): unknown {
    const exercise = {
      slug: "back-squat",
      name: "Back Squat",
      movementPattern: null,
      equipment: null,
      description: null,
      techniqueNotes: null,
      safetyNotes: null,
      videoUrl: null,
      isActive: 1,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
      ...overrides,
    };

    return temporary.database
      .prepare(
        `
          INSERT INTO exercises (
            slug, name, movement_pattern, equipment, description,
            technique_notes, safety_notes, video_url, is_active,
            created_at, updated_at
          ) VALUES (
            @slug, @name, @movementPattern, @equipment, @description,
            @techniqueNotes, @safetyNotes, @videoUrl, @isActive,
            @createdAt, @updatedAt
          )
        `,
      )
      .run(exercise);
  }

  it("applies the real migration once with the expected columns", () => {
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

    const columns = temporary.database
      .prepare("PRAGMA table_info(exercises)")
      .all() as Array<{ name: string; notnull: number; dflt_value: unknown }>;

    expect(columns.map(({ name }) => name)).toEqual([
      "id",
      "slug",
      "name",
      "movement_pattern",
      "equipment",
      "description",
      "technique_notes",
      "safety_notes",
      "video_url",
      "is_active",
      "created_at",
      "updated_at",
    ]);
    expect(columns.find(({ name }) => name === "slug")?.notnull).toBe(1);
    expect(columns.find(({ name }) => name === "name")?.notnull).toBe(1);
    expect(columns.find(({ name }) => name === "is_active")?.dflt_value).toBe(
      "1",
    );
    expect(
      temporary.database
        .prepare("SELECT COUNT(*) AS count FROM schema_migrations")
        .get(),
    ).toEqual({ count: 5 });
  });

  it.each([
    ["slug", { slug: " Back-squat" }],
    ["slug", { slug: "back--squat" }],
    ["slug", { slug: "back_squat" }],
    ["name", { name: " " }],
    ["metadata trim", { equipment: " barbell " }],
    ["metadata empty", { description: "" }],
    ["metadata length", { safetyNotes: "x".repeat(5001) }],
    ["boolean", { isActive: 2 }],
  ])("enforces the %s check", (_label, overrides) => {
    expect(() => insertExercise(overrides)).toThrow();
  });

  it("keeps slugs unique even when the existing exercise is inactive", () => {
    insertExercise({ isActive: 0 });

    expect(() => insertExercise({ name: "Another Squat" })).toThrow(
      /UNIQUE constraint failed: exercises.slug/,
    );
  });

  it("creates both deterministic-listing indices", () => {
    const indices = temporary.database
      .prepare("PRAGMA index_list(exercises)")
      .all() as Array<{ name: string }>;

    expect(indices.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "exercises_name_idx",
        "exercises_active_name_idx",
      ]),
    );
  });

  it("prevents slug changes while allowing editorial updates", () => {
    insertExercise();

    expect(() =>
      temporary.database
        .prepare("UPDATE exercises SET slug = ? WHERE slug = ?")
        .run("front-squat", "back-squat"),
    ).toThrow("exercise slug is immutable");

    expect(
      temporary.database
        .prepare("UPDATE exercises SET name = ?, is_active = ? WHERE slug = ?")
        .run("Barbell Back Squat", 0, "back-squat").changes,
    ).toBe(1);
  });
});
