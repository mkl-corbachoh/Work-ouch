import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  closeDatabase,
  openDatabase,
  type SqliteDatabase,
} from "../../src/db/connection";

const DEVELOPMENT_DATABASE = resolve("./data/training.db");

export type TemporaryDatabase = {
  database: SqliteDatabase;
  databasePath: string;
  directory: string;
  cleanup: () => void;
};

export function createTemporaryDatabase(): TemporaryDatabase {
  const directory = mkdtempSync(join(tmpdir(), "work-ouch-test-"));
  const databasePath = join(directory, "training.test.db");

  if (resolve(databasePath) === DEVELOPMENT_DATABASE) {
    throw new Error("Tests must not use ./data/training.db");
  }

  const database = openDatabase(databasePath);

  return {
    database,
    databasePath,
    directory,
    cleanup: () => {
      closeDatabase(database);
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

export function assertNotDevelopmentDatabase(databasePath: string): void {
  if (resolve(databasePath) === DEVELOPMENT_DATABASE) {
    throw new Error("Tests must not use ./data/training.db");
  }
}
