import type { SqliteDatabase } from "../../src/db/connection";

export const FIXTURE_TIMESTAMP = "2026-08-11T10:00:00.000Z";

export function insertUser(
  database: SqliteDatabase,
  overrides: Partial<{
    id: number;
    email: string;
    displayName: string;
    createdAt: string;
    updatedAt: string;
  }> = {},
): number {
  const user = {
    id: 1,
    email: "owner@example.com",
    displayName: "Routine Owner",
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
    ...overrides,
  };

  database
    .prepare(
      `
        INSERT INTO users (id, email, display_name, created_at, updated_at)
        VALUES (@id, @email, @displayName, @createdAt, @updatedAt)
      `,
    )
    .run(user);

  return user.id;
}

export function insertExercise(
  database: SqliteDatabase,
  overrides: Partial<{
    id: number;
    slug: string;
    name: string;
    isActive: number;
  }> = {},
): number {
  const exercise = {
    id: 1,
    slug: "back-squat",
    name: "Back Squat",
    isActive: 1,
    ...overrides,
    timestamp: FIXTURE_TIMESTAMP,
  };

  database
    .prepare(
      `
        INSERT INTO exercises (
          id, slug, name, is_active, created_at, updated_at
        ) VALUES (
          @id, @slug, @name, @isActive, @timestamp, @timestamp
        )
      `,
    )
    .run(exercise);

  return exercise.id;
}
