import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverSeeds, runSeeds } from "../../src/db/seeds";
import {
  createTemporaryDatabase,
  type TemporaryDatabase,
} from "../helpers/database";

describe("seed runner", () => {
  let temporary: TemporaryDatabase | undefined;
  let seedsDirectory: string | undefined;

  afterEach(() => {
    temporary?.cleanup();
    if (seedsDirectory) {
      rmSync(seedsDirectory, { recursive: true, force: true });
    }
  });

  function setup(): TemporaryDatabase {
    temporary = createTemporaryDatabase();
    seedsDirectory = mkdtempSync(join(tmpdir(), "work-ouch-seeds-"));
    return temporary;
  }

  function writeSeed(name: string, sql: string): void {
    if (!seedsDirectory) {
      throw new Error("Seed directory is not initialized");
    }
    writeFileSync(join(seedsDirectory, name), sql);
  }

  it("uses deterministic binary filename order", () => {
    setup();
    vi.spyOn(String.prototype, "localeCompare").mockImplementation(() => {
      throw new Error("localeCompare must not be used for seed ordering");
    });
    writeSeed("10_tenth.sql", "SELECT 1;");
    writeSeed("02_alpha.sql", "SELECT 1;");
    writeSeed("02_Zulu.sql", "SELECT 1;");
    writeSeed("01_first.sql", "SELECT 1;");

    expect(discoverSeeds(seedsDirectory as string)).toEqual([
      "01_first.sql",
      "02_Zulu.sql",
      "02_alpha.sql",
      "10_tenth.sql",
    ]);
  });

  it.each(["COMMIT", "ROLLBACK"])(
    "rejects %s before any seed can leave partial changes",
    (transactionControl) => {
      const { database } = setup();
      database.exec("CREATE TABLE seed_values (id INTEGER PRIMARY KEY)");
      writeSeed("01_before.sql", "INSERT INTO seed_values VALUES (1);");
      writeSeed(
        "02_transaction_control.sql",
        `INSERT INTO seed_values VALUES (2); ${transactionControl}; INSERT INTO seed_values VALUES (3);`,
      );

      expect(() => runSeeds(database, seedsDirectory as string)).toThrow(
        `forbidden transaction control: ${transactionControl}`,
      );
      expect(
        database.prepare("SELECT id FROM seed_values ORDER BY id").all(),
      ).toEqual([]);
      expect(database.inTransaction).toBe(false);
    },
  );

  it("does not treat transaction words in comments or values as statements", () => {
    const { database } = setup();
    database.exec("CREATE TABLE seed_values (value TEXT NOT NULL)");
    writeSeed(
      "01_text.sql",
      "-- COMMIT;\nINSERT INTO seed_values VALUES ('ROLLBACK; END;');",
    );

    expect(runSeeds(database, seedsDirectory as string)).toEqual([
      "01_text.sql",
    ]);
    expect(database.prepare("SELECT value FROM seed_values").get()).toEqual({
      value: "ROLLBACK; END;",
    });
  });
});
