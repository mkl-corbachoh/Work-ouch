import { rmSync } from "node:fs";
import { resolve } from "node:path";
import type { AppConfig } from "../config";
import { readConfig } from "../config";
import { closeDatabase, openDatabase } from "./connection";
import { type MigrationResult, runMigrations } from "./migrations";
import { runSeeds } from "./seeds";

export type DatabaseCommand = "migrate" | "reset" | "seed";

export type DatabaseDirectories = {
  migrations: string;
  seeds: string;
};

export type DatabaseCommandResult = {
  migrations: MigrationResult;
  seeds: string[];
};

export const defaultDatabaseDirectories: DatabaseDirectories = {
  migrations: resolve("database/migrations"),
  seeds: resolve("database/seeds"),
};

function deleteDatabaseFiles(databasePath: string): void {
  if (databasePath === ":memory:") {
    return;
  }

  for (const path of [
    databasePath,
    `${databasePath}-wal`,
    `${databasePath}-shm`,
  ]) {
    rmSync(path, { force: true });
  }
}

export function executeDatabaseCommand(
  command: DatabaseCommand,
  config: AppConfig,
  directories: DatabaseDirectories = defaultDatabaseDirectories,
): DatabaseCommandResult {
  if (command === "reset") {
    if (config.nodeEnv === "production") {
      throw new Error("Database reset is not allowed in production");
    }
    deleteDatabaseFiles(config.databasePath);
  }

  const database = openDatabase(config.databasePath);
  try {
    const migrations = runMigrations(database, directories.migrations);
    const seeds =
      command === "seed" ? runSeeds(database, directories.seeds) : [];
    return { migrations, seeds };
  } finally {
    closeDatabase(database);
  }
}

function parseCommand(value: string | undefined): DatabaseCommand {
  if (value === "migrate" || value === "reset" || value === "seed") {
    return value;
  }
  throw new Error("Usage: db:cli <migrate|reset|seed>");
}

export function main(
  argv: string[] = process.argv.slice(2),
  environment: NodeJS.ProcessEnv = process.env,
): void {
  try {
    const command = parseCommand(argv[0]);
    const result = executeDatabaseCommand(command, readConfig(environment));

    process.stdout.write(
      `${JSON.stringify({ command, ...result, message: result.seeds.length === 0 && command === "seed" ? "No seed files found" : "Database command completed" })}\n`,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown database command error";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}
