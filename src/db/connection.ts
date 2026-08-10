import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";

export type SqliteDatabase = Database.Database;

function isFileDatabase(databasePath: string): boolean {
  return databasePath !== ":memory:";
}

export function openDatabase(databasePath: string): SqliteDatabase {
  if (isFileDatabase(databasePath)) {
    mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  }

  const database = new Database(databasePath);

  try {
    database.pragma("foreign_keys = ON");
    database.pragma("journal_mode = WAL");
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function closeDatabase(database: SqliteDatabase): void {
  if (database.open) {
    database.close();
  }
}
