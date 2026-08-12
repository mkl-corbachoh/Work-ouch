import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../src/db/migrations";
import { runSeeds } from "../../src/db/seeds";
import {
  createTemporaryDatabase,
  type TemporaryDatabase,
} from "../helpers/database";

const MIGRATIONS_DIRECTORY = resolve("database/migrations");
const SEEDS_DIRECTORY = resolve("database/seeds");

const expectedTypes = [
  { code: "basal_metabolism_kcal", name: "Basal metabolism", unit: "kcal/day" },
  { code: "bmi", name: "Body mass index", unit: null },
  { code: "body_fat_pct", name: "Body fat", unit: "%" },
  { code: "bone_mass_kg", name: "Bone mass", unit: "kg" },
  { code: "metabolic_age", name: "Metabolic age", unit: "years" },
  { code: "muscle_mass_kg", name: "Muscle mass", unit: "kg" },
  { code: "visceral_fat", name: "Visceral fat", unit: null },
  { code: "water_pct", name: "Body water", unit: "%" },
  { code: "weight_kg", name: "Weight", unit: "kg" },
];

describe("body metric types seed", () => {
  let temporary: TemporaryDatabase;
  let copiedSeedsDirectory: string | undefined;
  let metricSeedsDirectory: string | undefined;

  beforeEach(() => {
    temporary = createTemporaryDatabase();
    runMigrations(temporary.database, MIGRATIONS_DIRECTORY);
    metricSeedsDirectory = mkdtempSync(
      join(tmpdir(), "work-ouch-metric-seeds-"),
    );
    writeFileSync(
      join(metricSeedsDirectory, "0001_body_metric_types.sql"),
      readFileSync(join(SEEDS_DIRECTORY, "0001_body_metric_types.sql"), "utf8"),
    );
  });

  afterEach(() => {
    temporary.cleanup();
    if (copiedSeedsDirectory) {
      rmSync(copiedSeedsDirectory, { recursive: true, force: true });
    }
    if (metricSeedsDirectory) {
      rmSync(metricSeedsDirectory, { recursive: true, force: true });
    }
  });

  function readTypes(): Array<{
    code: string;
    name: string;
    unit: string | null;
  }> {
    return temporary.database
      .prepare(
        "SELECT code, name, unit FROM body_metric_types ORDER BY code, id",
      )
      .all() as Array<{ code: string; name: string; unit: string | null }>;
  }

  it("creates exactly the nine initial types without creating users", () => {
    expect(
      runSeeds(temporary.database, metricSeedsDirectory as string),
    ).toEqual(["0001_body_metric_types.sql"]);
    expect(readTypes()).toEqual(expectedTypes);
    expect(
      temporary.database.prepare("SELECT COUNT(*) AS count FROM users").get(),
    ).toEqual({ count: 0 });
  });

  it("is idempotent and does not overwrite a preexisting seeded code", () => {
    temporary.database
      .prepare(
        `
          INSERT INTO body_metric_types (id, code, name, unit, description)
          VALUES (41, 'weight_kg', 'Operator weight', 'custom', 'Keep me')
        `,
      )
      .run();

    runSeeds(temporary.database, metricSeedsDirectory as string);
    runSeeds(temporary.database, metricSeedsDirectory as string);

    expect(
      temporary.database
        .prepare(
          `
            SELECT id, name, unit, description
            FROM body_metric_types WHERE code = 'weight_kg'
          `,
        )
        .get(),
    ).toEqual({
      id: 41,
      name: "Operator weight",
      unit: "custom",
      description: "Keep me",
    });
    expect(readTypes()).toHaveLength(9);
  });

  it("preserves custom types and allocates IDs rather than assigning code-specific IDs", () => {
    temporary.database
      .prepare(
        `
          INSERT INTO body_metric_types (id, code, name)
          VALUES (100, 'custom_score', 'Custom score')
        `,
      )
      .run();
    runSeeds(temporary.database, metricSeedsDirectory as string);

    expect(
      temporary.database
        .prepare("SELECT id FROM body_metric_types WHERE code = 'custom_score'")
        .get(),
    ).toEqual({ id: 100 });
    const seededIds = temporary.database
      .prepare(
        "SELECT id FROM body_metric_types WHERE code <> 'custom_score' ORDER BY id",
      )
      .all() as Array<{ id: number }>;
    expect(seededIds.map(({ id }) => id)).toEqual([
      101, 102, 103, 104, 105, 106, 107, 108, 109,
    ]);
  });

  it("rolls back the actual seed when a later seed fails", () => {
    copiedSeedsDirectory = mkdtempSync(join(tmpdir(), "work-ouch-body-seeds-"));
    writeFileSync(
      join(copiedSeedsDirectory, "0001_body_metric_types.sql"),
      readFileSync(join(SEEDS_DIRECTORY, "0001_body_metric_types.sql"), "utf8"),
    );
    writeFileSync(
      join(copiedSeedsDirectory, "0002_broken.sql"),
      "INVALID SQL;",
    );

    expect(() =>
      runSeeds(temporary.database, copiedSeedsDirectory as string),
    ).toThrow();
    expect(readTypes()).toEqual([]);
  });
});
