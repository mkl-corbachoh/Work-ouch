import type { SqliteDatabase } from "../../db/connection";
import type { Exercise } from "../exercises/exercise.repository";
import type { RoutineVersionDefinitionInput } from "./routine.schemas";

export type RoutineState = {
  id: number;
  userId: number;
  currentVersionNumber: number;
  maxVersionNumber: number;
};

export type ExerciseState = {
  id: number;
  isActive: boolean;
};

export type RoutineSet = {
  id: number;
  setNumber: number;
  setType: "warmup" | "work" | "backoff" | null;
  targetWeightKg: number | null;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetSeconds: number | null;
  targetRpe: number | null;
  effectiveTargetRpe: number | null;
  notes: string | null;
};

export type PlannedExercise = {
  id: number;
  exerciseId: number;
  position: number;
  restSeconds: number | null;
  targetRpe: number | null;
  notes: string | null;
  exercise: Exercise;
  sets: RoutineSet[];
};

export type RoutineVersion = {
  id: number;
  versionNumber: number;
  name: string | null;
  notes: string | null;
  isCurrent: boolean;
  createdAt: string;
  exercises: PlannedExercise[];
};

export type RoutineDetail = {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  version: RoutineVersion;
};

export type RoutineSummary = Omit<RoutineDetail, "version"> & {
  currentVersion: Omit<RoutineVersion, "isCurrent" | "exercises">;
};

type RoutineStateRow = {
  id: number;
  user_id: number;
  current_version_number: number;
  max_version_number: number;
};

type RoutineSummaryRow = {
  routine_id: number;
  user_id: number;
  routine_name: string;
  routine_description: string | null;
  routine_is_active: 0 | 1;
  routine_created_at: string;
  routine_updated_at: string;
  version_id: number;
  version_number: number;
  version_name: string | null;
  version_notes: string | null;
  version_created_at: string;
};

type DetailRow = RoutineSummaryRow & {
  current_version_number: number;
  routine_exercise_id: number;
  exercise_id: number;
  position: number;
  rest_seconds: number | null;
  exercise_target_rpe: number | null;
  routine_exercise_notes: string | null;
  exercise_slug: string;
  exercise_name: string;
  movement_pattern: string | null;
  equipment: string | null;
  exercise_description: string | null;
  technique_notes: string | null;
  safety_notes: string | null;
  video_url: string | null;
  exercise_is_active: 0 | 1;
  exercise_created_at: string;
  exercise_updated_at: string;
  routine_set_id: number;
  set_number: number;
  set_type: "warmup" | "work" | "backoff" | null;
  target_weight_kg: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_seconds: number | null;
  set_target_rpe: number | null;
  routine_set_notes: string | null;
};

function mapRoutineBase(row: RoutineSummaryRow) {
  return {
    id: row.routine_id,
    userId: row.user_id,
    name: row.routine_name,
    description: row.routine_description,
    isActive: row.routine_is_active === 1,
    createdAt: row.routine_created_at,
    updatedAt: row.routine_updated_at,
  };
}

function mapVersionBase(row: RoutineSummaryRow) {
  return {
    id: row.version_id,
    versionNumber: row.version_number,
    name: row.version_name,
    notes: row.version_notes,
    createdAt: row.version_created_at,
  };
}

function mapExercise(row: DetailRow): Exercise {
  return {
    id: row.exercise_id,
    slug: row.exercise_slug,
    name: row.exercise_name,
    movementPattern: row.movement_pattern,
    equipment: row.equipment,
    description: row.exercise_description,
    techniqueNotes: row.technique_notes,
    safetyNotes: row.safety_notes,
    videoUrl: row.video_url,
    isActive: row.exercise_is_active === 1,
    createdAt: row.exercise_created_at,
    updatedAt: row.exercise_updated_at,
  };
}

export class RoutineRepository {
  constructor(private readonly database: SqliteDatabase) {}

  withImmediateTransaction<T>(operation: () => T): T {
    return this.database.transaction(operation).immediate();
  }

  userExists(userId: number): boolean {
    return (
      this.database.prepare("SELECT 1 FROM users WHERE id = ?").get(userId) !==
      undefined
    );
  }

  findExerciseStates(exerciseIds: number[]): ExerciseState[] {
    const uniqueIds = [...new Set(exerciseIds)];
    if (uniqueIds.length === 0) return [];
    const placeholders = uniqueIds.map(() => "?").join(", ");
    const rows = this.database
      .prepare(
        `SELECT id, is_active FROM exercises WHERE id IN (${placeholders})`,
      )
      .all(...uniqueIds) as Array<{ id: number; is_active: 0 | 1 }>;
    return rows.map((row) => ({ id: row.id, isActive: row.is_active === 1 }));
  }

  findRoutineState(routineId: number): RoutineState | null {
    const row = this.database
      .prepare(
        `
          SELECT
            routines.id,
            routines.user_id,
            routines.current_version_number,
            MAX(routine_versions.version_number) AS max_version_number
          FROM routines
          JOIN routine_versions ON routine_versions.routine_id = routines.id
          WHERE routines.id = ?
          GROUP BY routines.id
        `,
      )
      .get(routineId) as RoutineStateRow | undefined;

    return row
      ? {
          id: row.id,
          userId: row.user_id,
          currentVersionNumber: row.current_version_number,
          maxVersionNumber: row.max_version_number,
        }
      : null;
  }

  insertRoutine(
    userId: number,
    name: string,
    description: string | null,
    timestamp: string,
  ): number {
    const row = this.database
      .prepare(
        `
          INSERT INTO routines (
            id, user_id, name, description, is_active, current_version_number,
            created_at, updated_at
          ) VALUES (
            (
              SELECT CASE
                WHEN COALESCE(MAX(id), 0) < 9007199254740991
                THEN COALESCE(MAX(id), 0) + 1
              END
              FROM routines
            ),
            ?, ?, ?, 1, 1, ?, ?
          )
          RETURNING id
        `,
      )
      .get(userId, name, description, timestamp, timestamp) as { id: number };
    return row.id;
  }

  insertVersion(
    routineId: number,
    versionNumber: number,
    definition: RoutineVersionDefinitionInput,
    timestamp: string,
  ): number {
    const versionRow = this.database
      .prepare(
        `
          INSERT INTO routine_versions (
            id, routine_id, version_number, name, notes, is_sealed, created_at
          ) VALUES (
            (
              SELECT CASE
                WHEN COALESCE(MAX(id), 0) < 9007199254740991
                THEN COALESCE(MAX(id), 0) + 1
              END
              FROM routine_versions
            ),
            ?, ?, ?, ?, 0, ?
          )
          RETURNING id
        `,
      )
      .get(
        routineId,
        versionNumber,
        definition.name,
        definition.notes,
        timestamp,
      ) as { id: number };
    const versionId = versionRow.id;
    const insertExercise = this.database.prepare(
      `
        INSERT INTO routine_exercises (
          id, routine_version_id, exercise_id, position, rest_seconds,
          rest_seconds_is_set, target_rpe, target_rpe_is_set, notes
        ) VALUES (
          (
            SELECT CASE
              WHEN COALESCE(MAX(id), 0) < 9007199254740991
              THEN COALESCE(MAX(id), 0) + 1
            END
            FROM routine_exercises
          ),
          ?, ?, ?, ?, ?, ?, ?, ?
        )
        RETURNING id
      `,
    );
    const insertSet = this.database.prepare(
      `
        INSERT INTO routine_sets (
          id, routine_exercise_id, set_number, set_type, target_weight_kg,
          target_weight_kg_is_set, target_reps_min, target_reps_min_is_set,
          target_reps_max, target_reps_max_is_set, target_seconds,
          target_seconds_is_set, target_rpe, target_rpe_is_set, notes
        ) VALUES (
          (
            SELECT CASE
              WHEN COALESCE(MAX(id), 0) < 9007199254740991
              THEN COALESCE(MAX(id), 0) + 1
            END
            FROM routine_sets
          ),
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `,
    );

    for (const exercise of definition.exercises) {
      const exerciseRow = insertExercise.get(
        versionId,
        exercise.exerciseId,
        exercise.position,
        exercise.restSeconds,
        exercise.restSeconds === null ? 0 : 1,
        exercise.targetRpe,
        exercise.targetRpe === null ? 0 : 1,
        exercise.notes,
      ) as { id: number };
      const routineExerciseId = exerciseRow.id;
      for (const set of exercise.sets) {
        insertSet.run(
          routineExerciseId,
          set.setNumber,
          set.setType,
          set.targetWeightKg,
          set.targetWeightKg === null ? 0 : 1,
          set.targetRepsMin,
          set.targetRepsMin === null ? 0 : 1,
          set.targetRepsMax,
          set.targetRepsMax === null ? 0 : 1,
          set.targetSeconds,
          set.targetSeconds === null ? 0 : 1,
          set.targetRpe,
          set.targetRpe === null ? 0 : 1,
          set.notes,
        );
      }
    }

    return versionId;
  }

  sealVersion(versionId: number): void {
    this.database
      .prepare("UPDATE routine_versions SET is_sealed = 1 WHERE id = ?")
      .run(versionId);
  }

  finalizeInitialVersion(routineId: number): boolean {
    return (
      this.database
        .prepare(
          `
            UPDATE routines
            SET pending_version_number = NULL, protocol_state = 0
            WHERE id = ?
              AND current_version_number = 1
              AND pending_version_number = 1
              AND protocol_state = 1
          `,
        )
        .run(routineId).changes === 1
    );
  }

  advanceCurrentVersion(
    routineId: number,
    previousVersionNumber: number,
    nextVersionNumber: number,
    timestamp: string,
  ): boolean {
    return (
      this.database
        .prepare(
          `
            UPDATE routines
            SET
              current_version_number = ?,
              pending_version_number = NULL,
              protocol_state = 0,
              updated_at = ?
            WHERE id = ? AND current_version_number = ?
          `,
        )
        .run(nextVersionNumber, timestamp, routineId, previousVersionNumber)
        .changes === 1
    );
  }

  list(userId: number): RoutineSummary[] {
    const rows = this.database
      .prepare(
        `
          SELECT
            routines.id AS routine_id,
            routines.user_id,
            routines.name AS routine_name,
            routines.description AS routine_description,
            routines.is_active AS routine_is_active,
            routines.created_at AS routine_created_at,
            routines.updated_at AS routine_updated_at,
            routine_versions.id AS version_id,
            routine_versions.version_number,
            routine_versions.name AS version_name,
            routine_versions.notes AS version_notes,
            routine_versions.created_at AS version_created_at
          FROM routines
          JOIN routine_versions
            ON routine_versions.routine_id = routines.id
           AND routine_versions.version_number = routines.current_version_number
           AND routine_versions.is_sealed = 1
          WHERE routines.user_id = ?
          ORDER BY routines.name COLLATE NOCASE, routines.name, routines.id
        `,
      )
      .all(userId) as RoutineSummaryRow[];

    return rows.map((row) => ({
      ...mapRoutineBase(row),
      currentVersion: mapVersionBase(row),
    }));
  }

  findDetail(routineId: number, versionNumber?: number): RoutineDetail | null {
    const rows = this.database
      .prepare(
        `
          SELECT
            routines.id AS routine_id,
            routines.user_id,
            routines.name AS routine_name,
            routines.description AS routine_description,
            routines.is_active AS routine_is_active,
            routines.current_version_number,
            routines.created_at AS routine_created_at,
            routines.updated_at AS routine_updated_at,
            routine_versions.id AS version_id,
            routine_versions.version_number,
            routine_versions.name AS version_name,
            routine_versions.notes AS version_notes,
            routine_versions.created_at AS version_created_at,
            routine_exercises.id AS routine_exercise_id,
            routine_exercises.exercise_id,
            routine_exercises.position,
            routine_exercises.rest_seconds,
            routine_exercises.target_rpe AS exercise_target_rpe,
            routine_exercises.notes AS routine_exercise_notes,
            exercises.slug AS exercise_slug,
            exercises.name AS exercise_name,
            exercises.movement_pattern,
            exercises.equipment,
            exercises.description AS exercise_description,
            exercises.technique_notes,
            exercises.safety_notes,
            exercises.video_url,
            exercises.is_active AS exercise_is_active,
            exercises.created_at AS exercise_created_at,
            exercises.updated_at AS exercise_updated_at,
            routine_sets.id AS routine_set_id,
            routine_sets.set_number,
            routine_sets.set_type,
            routine_sets.target_weight_kg,
            routine_sets.target_reps_min,
            routine_sets.target_reps_max,
            routine_sets.target_seconds,
            routine_sets.target_rpe AS set_target_rpe,
            routine_sets.notes AS routine_set_notes
          FROM routines
          JOIN routine_versions
            ON routine_versions.routine_id = routines.id
           AND routine_versions.version_number = COALESCE(?, routines.current_version_number)
           AND routine_versions.is_sealed = 1
          JOIN routine_exercises
            ON routine_exercises.routine_version_id = routine_versions.id
          JOIN exercises ON exercises.id = routine_exercises.exercise_id
          JOIN routine_sets
            ON routine_sets.routine_exercise_id = routine_exercises.id
          WHERE routines.id = ?
          ORDER BY routine_exercises.position, routine_sets.set_number
        `,
      )
      .all(versionNumber ?? null, routineId) as DetailRow[];
    const first = rows[0];
    if (!first) return null;

    const exercises = new Map<number, PlannedExercise>();
    for (const row of rows) {
      let plannedExercise = exercises.get(row.routine_exercise_id);
      if (!plannedExercise) {
        plannedExercise = {
          id: row.routine_exercise_id,
          exerciseId: row.exercise_id,
          position: row.position,
          restSeconds: row.rest_seconds,
          targetRpe: row.exercise_target_rpe,
          notes: row.routine_exercise_notes,
          exercise: mapExercise(row),
          sets: [],
        };
        exercises.set(row.routine_exercise_id, plannedExercise);
      }
      plannedExercise.sets.push({
        id: row.routine_set_id,
        setNumber: row.set_number,
        setType: row.set_type,
        targetWeightKg: row.target_weight_kg,
        targetRepsMin: row.target_reps_min,
        targetRepsMax: row.target_reps_max,
        targetSeconds: row.target_seconds,
        targetRpe: row.set_target_rpe,
        effectiveTargetRpe: row.set_target_rpe ?? row.exercise_target_rpe,
        notes: row.routine_set_notes,
      });
    }

    return {
      ...mapRoutineBase(first),
      version: {
        ...mapVersionBase(first),
        isCurrent: first.version_number === first.current_version_number,
        exercises: [...exercises.values()],
      },
    };
  }
}
