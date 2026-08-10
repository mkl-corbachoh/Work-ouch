import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeDatabase, openDatabase } from "../../src/db/connection";
import {
  assertNotDevelopmentDatabase,
  createTemporaryDatabase,
  type TemporaryDatabase,
} from "../helpers/database";

describe("SQLite connection", () => {
  let temporary: TemporaryDatabase | undefined;

  afterEach(() => temporary?.cleanup());

  it("creates parent directories and enables foreign keys and WAL", () => {
    temporary = createTemporaryDatabase();
    closeDatabase(temporary.database);

    const nestedPath = join(temporary.directory, "nested", "training.db");
    const database = openDatabase(nestedPath);

    expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(database.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(existsSync(nestedPath)).toBe(true);

    closeDatabase(database);
  });

  it("uses an isolated temporary path and rejects the development path", () => {
    temporary = createTemporaryDatabase();

    expect(temporary.databasePath).not.toBe("./data/training.db");
    expect(() => assertNotDevelopmentDatabase("./data/training.db")).toThrow(
      "Tests must not use",
    );
  });
});
