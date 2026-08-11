import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../src/db/migrations";
import {
  createTemporaryDatabase,
  type TemporaryDatabase,
} from "../helpers/database";
import { FIXTURE_TIMESTAMP, insertUser } from "../helpers/fixtures";

const MIGRATIONS_DIRECTORY = resolve("database/migrations");

describe("users migration", () => {
  let temporary: TemporaryDatabase;

  beforeEach(() => {
    temporary = createTemporaryDatabase();
    runMigrations(temporary.database, MIGRATIONS_DIRECTORY);
  });

  afterEach(() => temporary.cleanup());

  it("creates only the minimal referential user table", () => {
    const columns = temporary.database
      .prepare("PRAGMA table_info(users)")
      .all() as Array<{ name: string; notnull: number }>;

    expect(columns.map(({ name }) => name)).toEqual([
      "id",
      "email",
      "display_name",
      "created_at",
      "updated_at",
    ]);
    expect(
      columns
        .filter(({ name }) => name !== "id")
        .every(({ notnull }) => notnull === 1),
    ).toBe(true);
    expect(
      temporary.database
        .prepare("PRAGMA table_list")
        .all()
        .find((table) => (table as { name: string }).name === "users"),
    ).toMatchObject({ strict: 1 });
  });

  it("supports explicit fixtures without a seed or public API", () => {
    expect(insertUser(temporary.database)).toBe(1);
    expect(temporary.database.prepare("SELECT * FROM users").get()).toEqual({
      id: 1,
      email: "owner@example.com",
      display_name: "Routine Owner",
      created_at: FIXTURE_TIMESTAMP,
      updated_at: FIXTURE_TIMESTAMP,
    });
  });

  it.each([
    ["empty email", { email: "" }],
    ["untrimmed email", { email: " owner@example.com" }],
    ["empty display name", { displayName: " " }],
    ["empty created timestamp", { createdAt: "" }],
    ["untrimmed updated timestamp", { updatedAt: `${FIXTURE_TIMESTAMP} ` }],
  ])("rejects %s", (_label, overrides) => {
    expect(() => insertUser(temporary.database, overrides)).toThrow();
  });

  it("keeps email unique", () => {
    insertUser(temporary.database);
    expect(() =>
      insertUser(temporary.database, { id: 2, displayName: "Another User" }),
    ).toThrow(/UNIQUE constraint failed: users.email/);
  });

  it("rejects a textual binding for the numeric user id", () => {
    expect(() =>
      temporary.database
        .prepare(
          `
            INSERT INTO users (id, email, display_name, created_at, updated_at)
            VALUES (?, 'text-id@example.com', 'Text Id', ?, ?)
          `,
        )
        .run("2", FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP),
    ).toThrow(/CHECK constraint failed/);
  });
});
