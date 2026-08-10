import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../../../src/config";
import {
  type DatabaseDirectories,
  executeDatabaseCommand,
} from "../../../src/db/cli";
import { closeDatabase, openDatabase } from "../../../src/db/connection";

describe("database CLI commands", () => {
  let directory: string;
  let directories: DatabaseDirectories;
  let config: AppConfig;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "work-ouch-cli-"));
    directories = {
      migrations: join(directory, "migrations"),
      seeds: join(directory, "seeds"),
    };
    config = {
      databasePath: join(directory, "training.db"),
      port: 3000,
      nodeEnv: "test",
    };

    for (const child of Object.values(directories)) {
      const database = openDatabase(join(child, ".directory-placeholder.db"));
      closeDatabase(database);
      rmSync(join(child, ".directory-placeholder.db"), { force: true });
    }
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it("migrates repeatedly without reapplying files", () => {
    writeFileSync(
      join(directories.migrations, "0001_example.sql"),
      "CREATE TABLE example (id INTEGER PRIMARY KEY);",
    );

    expect(
      executeDatabaseCommand("migrate", config, directories).migrations.applied,
    ).toEqual(["0001_example.sql"]);
    expect(
      executeDatabaseCommand("migrate", config, directories).migrations.skipped,
    ).toEqual(["0001_example.sql"]);
  });

  it("rejects reset in production without deleting the database", () => {
    const database = openDatabase(config.databasePath);
    database.exec("CREATE TABLE keep_me (id INTEGER PRIMARY KEY)");
    closeDatabase(database);

    expect(() =>
      executeDatabaseCommand(
        "reset",
        { ...config, nodeEnv: "production" },
        directories,
      ),
    ).toThrow("not allowed in production");
    expect(existsSync(config.databasePath)).toBe(true);
  });

  it("removes the database and sidecars before migrating a reset database", () => {
    writeFileSync(
      join(directories.migrations, "0001_fresh.sql"),
      "CREATE TABLE fresh (id INTEGER PRIMARY KEY);",
    );
    writeFileSync(config.databasePath, "obsolete");
    writeFileSync(`${config.databasePath}-wal`, "obsolete");
    writeFileSync(`${config.databasePath}-shm`, "obsolete");

    executeDatabaseCommand("reset", config, directories);

    const database = openDatabase(config.databasePath);
    expect(
      database
        .prepare("SELECT name FROM sqlite_master WHERE name = 'fresh'")
        .get(),
    ).toEqual({ name: "fresh" });
    closeDatabase(database);
  });

  it("treats an empty seed directory as a successful no-op", () => {
    expect(executeDatabaseCommand("seed", config, directories).seeds).toEqual(
      [],
    );
  });

  it("runs ordered idempotent seeds after migrations", () => {
    writeFileSync(
      join(directories.migrations, "0001_catalog.sql"),
      "CREATE TABLE catalog (id INTEGER PRIMARY KEY, value TEXT NOT NULL);",
    );
    writeFileSync(
      join(directories.seeds, "02_second.sql"),
      "INSERT OR IGNORE INTO catalog (id, value) VALUES (2, 'second');",
    );
    writeFileSync(
      join(directories.seeds, "01_first.sql"),
      "INSERT OR IGNORE INTO catalog (id, value) VALUES (1, 'first');",
    );

    expect(executeDatabaseCommand("seed", config, directories).seeds).toEqual([
      "01_first.sql",
      "02_second.sql",
    ]);
    executeDatabaseCommand("seed", config, directories);

    const database = openDatabase(config.databasePath);
    expect(
      database.prepare("SELECT value FROM catalog ORDER BY id").all(),
    ).toEqual([{ value: "first" }, { value: "second" }]);
    closeDatabase(database);
  });

  it("rolls back all seeds when one fails", () => {
    writeFileSync(
      join(directories.migrations, "0001_catalog.sql"),
      "CREATE TABLE catalog (id INTEGER PRIMARY KEY);",
    );
    writeFileSync(
      join(directories.seeds, "01_first.sql"),
      "INSERT INTO catalog VALUES (1);",
    );
    writeFileSync(join(directories.seeds, "02_broken.sql"), "INVALID SQL;");

    expect(() => executeDatabaseCommand("seed", config, directories)).toThrow();

    const database = openDatabase(config.databasePath);
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM catalog").get(),
    ).toEqual({ count: 0 });
    closeDatabase(database);
  });
});
