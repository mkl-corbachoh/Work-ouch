import { readFileSync } from "node:fs";
import { ExerciseRepository } from "../modules/exercises/exercise.repository";
import { createExerciseSchema } from "../modules/exercises/exercise.schemas";
import { MeasurementRepository } from "../modules/measurements/measurement.repository";
import {
  createBodyMeasurementSchema,
  createBodyMetricTypeSchema,
} from "../modules/measurements/measurement.schemas";
import { MeasurementService } from "../modules/measurements/measurement.service";
import { RoutineRepository } from "../modules/routines/routine.repository";
import { createRoutineSchema } from "../modules/routines/routine.schemas";
import { RoutineService } from "../modules/routines/routine.service";
import type { SqliteDatabase } from "./connection";

type SeedData = {
  generatedAt: string;
  user: { id: number; email: string; displayName: string; key: string };
  bodyMetricTypes: Array<{
    code: string;
    name: string;
    unit: string | null;
    description: string | null;
  }>;
  bodyMeasurements: Array<{
    userKey: string;
    measuredAt: string;
    source: string | null;
    notes: string | null;
    metrics: Record<string, number>;
  }>;
  exercises: Array<{
    key: string;
    slug: string;
    name: string;
    movementPattern: string | null;
    equipment: string | null;
    techniqueNotes: string | null;
    safetyNotes: string | null;
    isActive: boolean;
  }>;
  routines: Array<{
    key: string;
    userKey: string;
    name: string;
    description: string | null;
    version: {
      name: string | null;
      notes: string | null;
      exercises: Array<{
        exerciseKey: string;
        position: number;
        restSeconds: number | null;
        targetRpe: number | null;
        notes: string | null;
        sets: Array<{
          setNumber: number;
          setType: "warmup" | "work" | "backoff";
          targetWeightKg: number | null;
          targetRepsMin: number | null;
          targetRepsMax: number | null;
          targetSeconds: number | null;
          targetRpe: number | null;
          notes: string | null;
        }>;
      }>;
    };
  }>;
};

function readSeed(path: string): SeedData {
  const data = JSON.parse(readFileSync(path, "utf8")) as SeedData;
  if (
    !data.user ||
    !Array.isArray(data.exercises) ||
    !Array.isArray(data.routines)
  ) {
    throw new Error(
      "Invalid seed data: user, exercises and routines are required",
    );
  }
  return data;
}

function timestamp(data: SeedData): string {
  const parsed = new Date(data.generatedAt);
  if (Number.isNaN(parsed.valueOf()))
    throw new Error("Invalid seed generatedAt");
  return parsed.toISOString();
}

export function importSeedData(
  database: SqliteDatabase,
  path: string,
): { exercises: number; routines: number; measurements: number } {
  const data = readSeed(path);
  const createdAt = timestamp(data);
  const user = data.user;
  const run = () => {
    const insertMetricType = database.prepare(
      "INSERT INTO body_metric_types (id, code, name, unit, description) VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM body_metric_types), ?, ?, ?, ?)",
    );
    for (const type of data.bodyMetricTypes ?? []) {
      createBodyMetricTypeSchema.parse(type);
      if (
        !database
          .prepare("SELECT 1 FROM body_metric_types WHERE code = ?")
          .get(type.code)
      )
        insertMetricType.run(type.code, type.name, type.unit, type.description);
    }
    database
      .prepare(`
      INSERT INTO users (id, email, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = excluded.updated_at
    `)
      .run(user.id, user.email, user.displayName, createdAt, createdAt);

    const exercises = new ExerciseRepository(database);
    const exerciseIds = new Map<string, number>();
    for (const item of data.exercises) {
      const input = createExerciseSchema.parse({
        slug: item.slug,
        name: item.name,
        movementPattern: item.movementPattern,
        equipment: item.equipment,
        description: null,
        techniqueNotes: item.techniqueNotes,
        safetyNotes: item.safetyNotes,
        videoUrl: null,
        isActive: item.isActive,
      });
      const existing = database
        .prepare("SELECT id FROM exercises WHERE slug = ?")
        .get(item.slug) as { id: number } | undefined;
      const exercise = existing
        ? exercises.findById(existing.id)
        : exercises.create(input);
      if (!exercise) throw new Error(`Could not import exercise ${item.key}`);
      exerciseIds.set(item.key, exercise.id);
    }

    const routines = new RoutineService(
      new RoutineRepository(database),
      () => new Date(createdAt),
    );
    let routineCount = 0;
    for (const item of data.routines) {
      if (item.userKey !== user.key)
        throw new Error(`Unknown routine user ${item.userKey}`);
      const existing = database
        .prepare("SELECT id FROM routines WHERE user_id = ? AND name = ?")
        .get(user.id, item.name) as { id: number } | undefined;
      if (existing) continue;
      const input = createRoutineSchema.parse({
        userId: user.id,
        name: item.name,
        description: item.description,
        version: {
          name: item.version.name,
          notes: item.version.notes,
          exercises: item.version.exercises.map((exercise) => ({
            position: exercise.position,
            restSeconds: exercise.restSeconds,
            targetRpe: exercise.targetRpe,
            notes: exercise.notes,
            sets: exercise.sets,
            exerciseId: exerciseIds.get(exercise.exerciseKey),
          })),
        },
      });
      routines.create(input);
      routineCount += 1;
    }

    const measurementService = new MeasurementService(
      new MeasurementRepository(database),
      () => new Date(createdAt),
    );
    let measurementCount = 0;
    for (const item of data.bodyMeasurements) {
      if (item.userKey !== user.key)
        throw new Error(`Unknown measurement user ${item.userKey}`);
      const input = createBodyMeasurementSchema.parse({
        measuredAt: item.measuredAt,
        source: item.source,
        notes: item.notes,
        metrics: item.metrics,
      });
      const existing = database
        .prepare(
          "SELECT 1 FROM body_measurements WHERE user_id = ? AND measured_at = ? AND ((source = ?) OR (source IS NULL AND ? IS NULL))",
        )
        .get(user.id, input.measuredAt, input.source, input.source);
      if (existing) continue;
      measurementService.createMeasurement(user.id, input);
      measurementCount += 1;
    }
    return {
      exercises: data.exercises.length,
      routines: routineCount,
      measurements: measurementCount,
    };
  };
  return database.transaction(run).immediate();
}
