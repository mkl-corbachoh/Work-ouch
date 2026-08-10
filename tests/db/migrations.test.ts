import { mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverMigrations, runMigrations } from "../../src/db/migrations";
import {
  createTemporaryDatabase,
  type TemporaryDatabase,
} from "../helpers/database";

describe("migration runner", () => {
  let temporary: TemporaryDatabase | undefined;
  let migrationsDirectory: string | undefined;

  afterEach(() => {
    temporary?.cleanup();
    if (migrationsDirectory) {
      rmSync(migrationsDirectory, { recursive: true, force: true });
    }
  });

  function setup(): TemporaryDatabase {
    temporary = createTemporaryDatabase();
    migrationsDirectory = mkdtempSync(join(tmpdir(), "work-ouch-migrations-"));
    return temporary;
  }

  function writeMigration(name: string, sql: string): void {
    if (!migrationsDirectory) {
      throw new Error("Migration directory is not initialized");
    }
    writeFileSync(join(migrationsDirectory, name), sql);
  }

  it("discovers valid migrations in numeric order", () => {
    setup();
    writeMigration(
      "0002_second.sql",
      "CREATE TABLE second (id INTEGER PRIMARY KEY);",
    );
    writeMigration(
      "0001_first.sql",
      "CREATE TABLE first (id INTEGER PRIMARY KEY);",
    );

    expect(
      discoverMigrations(migrationsDirectory as string).map(({ name }) => name),
    ).toEqual(["0001_first.sql", "0002_second.sql"]);
  });

  it("applies each migration exactly once", () => {
    const { database } = setup();
    writeMigration(
      "0001_counter.sql",
      "CREATE TABLE counter (value INTEGER NOT NULL); INSERT INTO counter VALUES (1);",
    );

    expect(runMigrations(database, migrationsDirectory as string)).toEqual({
      applied: ["0001_counter.sql"],
      skipped: [],
    });
    expect(runMigrations(database, migrationsDirectory as string)).toEqual({
      applied: [],
      skipped: ["0001_counter.sql"],
    });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM counter").get(),
    ).toEqual({ count: 1 });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get(),
    ).toEqual({
      count: 1,
    });
  });

  it("applies a migration containing a valid SQLite trigger block", () => {
    const { database } = setup();
    writeMigration(
      "0001_audit_trigger.sql",
      `
        CREATE TABLE source (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE audit (source_id INTEGER NOT NULL, value TEXT NOT NULL);
        CREATE TRIGGER "END"
        AFTER INSERT ON source
        BEGIN
          INSERT INTO audit (source_id, value) VALUES (NEW.id, NEW.value);
        END;
      `,
    );

    expect(
      runMigrations(database, migrationsDirectory as string).applied,
    ).toEqual(["0001_audit_trigger.sql"]);
    database
      .prepare("INSERT INTO source (id, value) VALUES (?, ?)")
      .run(1, "created");
    expect(
      database.prepare("SELECT source_id, value FROM audit").get(),
    ).toEqual({
      source_id: 1,
      value: "created",
    });
  });

  it.each(["1_bad.sql", "0001-BAD.sql", "0000_zero.sql", "readme.sql"])(
    "rejects invalid migration filename %s",
    (name) => {
      setup();
      writeMigration(name, "SELECT 1;");

      expect(() => discoverMigrations(migrationsDirectory as string)).toThrow(
        "Invalid migration filename",
      );
    },
  );

  it("rejects duplicate numeric versions", () => {
    setup();
    writeMigration("0001_first.sql", "SELECT 1;");
    writeMigration("0001_other.sql", "SELECT 1;");

    expect(() => discoverMigrations(migrationsDirectory as string)).toThrow(
      "Duplicate migration version",
    );
  });

  it("rejects a changed name for an applied version", () => {
    const { database } = setup();
    writeMigration(
      "0001_original.sql",
      "CREATE TABLE original (id INTEGER PRIMARY KEY);",
    );
    runMigrations(database, migrationsDirectory as string);
    renameSync(
      join(migrationsDirectory as string, "0001_original.sql"),
      join(migrationsDirectory as string, "0001_changed.sql"),
    );

    expect(() =>
      runMigrations(database, migrationsDirectory as string),
    ).toThrow("was applied as 0001_original.sql");
  });

  it("rolls back SQL changes and bookkeeping when a migration fails", () => {
    const { database } = setup();
    writeMigration(
      "0001_broken.sql",
      "CREATE TABLE partial (id INTEGER PRIMARY KEY); INVALID SQL;",
    );

    expect(() =>
      runMigrations(database, migrationsDirectory as string),
    ).toThrow();
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'partial'",
        )
        .get(),
    ).toBeUndefined();
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get(),
    ).toEqual({
      count: 0,
    });
  });

  it.each([
    ["BEGIN", "BEGIN IMMEDIATE"],
    ["COMMIT", "COMMIT"],
    ["END", "END TRANSACTION"],
    ["ROLLBACK", "ROLLBACK"],
    ["SAVEPOINT", "SAVEPOINT migration_escape"],
    ["RELEASE", "RELEASE SAVEPOINT migration_escape"],
  ])(
    "rejects %s before it can alter the runner transaction",
    (transactionControl, statement) => {
      const { database } = setup();
      writeMigration(
        "0001_transaction_control.sql",
        `CREATE TABLE partial (id INTEGER PRIMARY KEY); ${statement}; CREATE TABLE after_control (id INTEGER PRIMARY KEY);`,
      );

      expect(() =>
        runMigrations(database, migrationsDirectory as string),
      ).toThrow(`forbidden transaction control: ${transactionControl}`);
      expect(
        database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('partial', 'after_control')",
          )
          .all(),
      ).toEqual([]);
      expect(
        database
          .prepare("SELECT COUNT(*) AS count FROM schema_migrations")
          .get(),
      ).toEqual({ count: 0 });
      expect(database.inTransaction).toBe(false);
    },
  );
});
