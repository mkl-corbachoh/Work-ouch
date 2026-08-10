import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteDatabase } from "./connection";
import {
  assertNoTransactionControl,
  assertTransactionActive,
} from "./sql-script";

type SeedScript = {
  name: string;
  sql: string;
};

export function discoverSeeds(seedsDirectory: string): string[] {
  return readdirSync(seedsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
}

export function runSeeds(
  database: SqliteDatabase,
  seedsDirectory: string,
): string[] {
  const seeds = discoverSeeds(seedsDirectory);

  if (seeds.length === 0) {
    return [];
  }

  const scripts: SeedScript[] = seeds.map((name) => ({
    name,
    sql: readFileSync(join(seedsDirectory, name), "utf8"),
  }));
  for (const script of scripts) {
    assertNoTransactionControl(script.sql, script.name);
  }

  database.exec("BEGIN IMMEDIATE");
  try {
    for (const script of scripts) {
      database.exec(script.sql);
      assertTransactionActive(database, `executing ${script.name}`);
    }
    assertTransactionActive(database, "completing seeds");
    database.exec("COMMIT");
    return seeds;
  } catch (error) {
    if (database.inTransaction) {
      database.exec("ROLLBACK");
    }
    throw error;
  }
}
