import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteDatabase } from "./connection";
import {
  assertNoTransactionControl,
  assertTransactionActive,
} from "./sql-script";

const MIGRATION_NAME = /^(\d{4})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;

export type Migration = {
  version: number;
  name: string;
  path: string;
};

export type MigrationResult = {
  applied: string[];
  skipped: string[];
};

type AppliedMigration = {
  version: number;
  name: string;
};

export function discoverMigrations(migrationsDirectory: string): Migration[] {
  const migrations: Migration[] = [];
  const versions = new Set<number>();

  for (const entry of readdirSync(migrationsDirectory, {
    withFileTypes: true,
  })) {
    if (!entry.isFile() || !entry.name.endsWith(".sql")) {
      continue;
    }

    const match = MIGRATION_NAME.exec(entry.name);
    if (!match?.[1] || Number(match[1]) < 1) {
      throw new Error(`Invalid migration filename: ${entry.name}`);
    }

    const version = Number(match[1]);
    if (versions.has(version)) {
      throw new Error(`Duplicate migration version: ${version}`);
    }

    versions.add(version);
    migrations.push({
      version,
      name: entry.name,
      path: join(migrationsDirectory, entry.name),
    });
  }

  return migrations.sort((left, right) => left.version - right.version);
}

function ensureMigrationTable(database: SqliteDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    )
  `);
}

export function runMigrations(
  database: SqliteDatabase,
  migrationsDirectory: string,
): MigrationResult {
  const migrations = discoverMigrations(migrationsDirectory);
  const result: MigrationResult = { applied: [], skipped: [] };

  ensureMigrationTable(database);

  const findApplied = database.prepare<[number], AppliedMigration>(
    "SELECT version, name FROM schema_migrations WHERE version = ?",
  );
  const recordApplied = database.prepare<[number, string, string]>(
    "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
  );

  for (const migration of migrations) {
    const sql = readFileSync(migration.path, "utf8");
    assertNoTransactionControl(sql, migration.name);
    database.exec("BEGIN IMMEDIATE");

    try {
      const existing = findApplied.get(migration.version);
      if (existing) {
        if (existing.name !== migration.name) {
          throw new Error(
            `Migration version ${migration.version} was applied as ${existing.name}, not ${migration.name}`,
          );
        }

        assertTransactionActive(database, `checking ${migration.name}`);
        database.exec("COMMIT");
        result.skipped.push(migration.name);
        continue;
      }

      database.exec(sql);
      assertTransactionActive(database, `executing ${migration.name}`);
      recordApplied.run(
        migration.version,
        migration.name,
        new Date().toISOString(),
      );
      assertTransactionActive(database, `recording ${migration.name}`);
      database.exec("COMMIT");
      result.applied.push(migration.name);
    } catch (error) {
      if (database.inTransaction) {
        database.exec("ROLLBACK");
      }
      throw error;
    }
  }

  return result;
}
