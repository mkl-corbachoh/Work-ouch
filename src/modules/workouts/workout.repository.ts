import type { SqliteDatabase } from "../../db/connection";
import type { Exercise } from "../exercises/exercise.repository";
import type {
  PlannedExercise,
  RoutineDetail,
  RoutineSet,
} from "../routines/routine.repository";
import type {
  PutWorkoutExerciseInput,
  WorkoutSetInput,
  WorkoutStatus,
} from "./workout.schemas";

export type RoutineVersionState = {
  id: number;
  routineId: number;
  userId: number;
  isSealed: boolean;
};

export type WorkoutState = {
  id: number;
  userId: number;
  routineVersionId: number;
  status: WorkoutStatus;
  startedAt: string;
};

export type ExerciseState = {
  id: number;
  isActive: boolean;
};

export type WorkoutSet = {
  id: number;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  rpe: number | null;
  completed: boolean;
  painLevel: number | null;
  painArea: string | null;
  notes: string | null;
};

export type WorkoutExerciseResult = {
  id: number;
  routineExerciseId: number;
  exerciseId: number;
  position: number;
  notes: string | null;
  plannedExercise: {
    id: number;
    exerciseId: number;
    exercise: Exercise;
  };
  performedExercise: Exercise;
  sets: WorkoutSet[];
};

export type WorkoutSession = {
  id: number;
  userId: number;
  routineId: number;
  routineVersionId: number;
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number | null;
  status: WorkoutStatus;
  overallRpe: number | null;
  notes: string | null;
  createdAt: string;
};

export type WorkoutDetail = WorkoutSession & {
  planning: RoutineDetail;
  results: WorkoutExerciseResult[];
};

export type WorkoutSummary = WorkoutSession & {
  routine: {
    id: number;
    name: string;
    isActive: boolean;
  };
  routineVersion: {
    id: number;
    versionNumber: number;
    name: string | null;
  };
};

type WorkoutStateRow = {
  id: number;
  user_id: number;
  routine_version_id: number;
  status: WorkoutStatus;
  started_at: string;
};

type SessionRow = WorkoutStateRow & {
  routine_id: number;
  completed_at: string | null;
  duration_seconds: number | null;
  overall_rpe: number | null;
  notes: string | null;
  created_at: string;
};

type SummaryRow = SessionRow & {
  routine_name: string;
  routine_is_active: 0 | 1;
  version_number: number;
  version_name: string | null;
};

type PlanningRow = {
  routine_id: number;
  user_id: number;
  routine_name: string;
  routine_description: string | null;
  routine_is_active: 0 | 1;
  current_version_number: number;
  routine_created_at: string;
  routine_updated_at: string;
  version_id: number;
  version_number: number;
  version_name: string | null;
  version_notes: string | null;
  version_created_at: string;
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

type ResultRow = {
  workout_exercise_id: number;
  routine_exercise_id: number;
  performed_exercise_id: number;
  position: number;
  result_notes: string | null;
  planned_exercise_id: number;
  planned_slug: string;
  planned_name: string;
  planned_movement_pattern: string | null;
  planned_equipment: string | null;
  planned_description: string | null;
  planned_technique_notes: string | null;
  planned_safety_notes: string | null;
  planned_video_url: string | null;
  planned_is_active: 0 | 1;
  planned_created_at: string;
  planned_updated_at: string;
  performed_slug: string;
  performed_name: string;
  performed_movement_pattern: string | null;
  performed_equipment: string | null;
  performed_description: string | null;
  performed_technique_notes: string | null;
  performed_safety_notes: string | null;
  performed_video_url: string | null;
  performed_is_active: 0 | 1;
  performed_created_at: string;
  performed_updated_at: string;
  workout_set_id: number | null;
  set_number: number | null;
  weight_kg: number | null;
  reps: number | null;
  duration_seconds: number | null;
  rpe: number | null;
  completed: 0 | 1 | null;
  pain_level: number | null;
  pain_area: string | null;
  set_notes: string | null;
};

export class WorkoutPositionConstraintError extends Error {
  constructor(options?: ErrorOptions) {
    super("Workout result position is already used", options);
    this.name = "WorkoutPositionConstraintError";
  }
}

function isPositionConflict(error: unknown): boolean {
  return (
    (error instanceof Error &&
      "code" in error &&
      error.code === "SQLITE_CONSTRAINT_UNIQUE" &&
      error.message.includes(
        "workout_exercises.workout_session_id, workout_exercises.position",
      )) ||
    (error instanceof Error &&
      error.message.includes("workout result position conflict"))
  );
}

function mapSession(row: SessionRow): WorkoutSession {
  return {
    id: row.id,
    userId: row.user_id,
    routineId: row.routine_id,
    routineVersionId: row.routine_version_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationSeconds: row.duration_seconds,
    status: row.status,
    overallRpe: row.overall_rpe,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function mapPlanningExercise(row: PlanningRow): Exercise {
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

function mapResultExercise(
  row: ResultRow,
  prefix: "planned" | "performed",
): Exercise {
  const id =
    prefix === "planned" ? row.planned_exercise_id : row.performed_exercise_id;
  return {
    id,
    slug: row[`${prefix}_slug`],
    name: row[`${prefix}_name`],
    movementPattern: row[`${prefix}_movement_pattern`],
    equipment: row[`${prefix}_equipment`],
    description: row[`${prefix}_description`],
    techniqueNotes: row[`${prefix}_technique_notes`],
    safetyNotes: row[`${prefix}_safety_notes`],
    videoUrl: row[`${prefix}_video_url`],
    isActive: row[`${prefix}_is_active`] === 1,
    createdAt: row[`${prefix}_created_at`],
    updatedAt: row[`${prefix}_updated_at`],
  };
}

export class WorkoutRepository {
  constructor(private readonly database: SqliteDatabase) {}

  withImmediateTransaction<T>(operation: () => T): T {
    return this.database.transaction(operation).immediate();
  }

  withReadTransaction<T>(operation: () => T): T {
    return this.database.transaction(operation).deferred();
  }

  userExists(userId: number): boolean {
    return (
      this.database.prepare("SELECT 1 FROM users WHERE id = ?").get(userId) !==
      undefined
    );
  }

  findRoutineVersionState(versionId: number): RoutineVersionState | null {
    const row = this.database
      .prepare(
        `
          SELECT
            routine_versions.id,
            routine_versions.routine_id,
            routines.user_id,
            routine_versions.is_sealed
          FROM routine_versions
          JOIN routines ON routines.id = routine_versions.routine_id
          WHERE routine_versions.id = ?
        `,
      )
      .get(versionId) as
      | {
          id: number;
          routine_id: number;
          user_id: number;
          is_sealed: 0 | 1;
        }
      | undefined;
    return row
      ? {
          id: row.id,
          routineId: row.routine_id,
          userId: row.user_id,
          isSealed: row.is_sealed === 1,
        }
      : null;
  }

  findWorkoutState(workoutId: number): WorkoutState | null {
    const row = this.database
      .prepare(
        `
          SELECT id, user_id, routine_version_id, status, started_at
          FROM workout_sessions WHERE id = ?
        `,
      )
      .get(workoutId) as WorkoutStateRow | undefined;
    return row
      ? {
          id: row.id,
          userId: row.user_id,
          routineVersionId: row.routine_version_id,
          status: row.status,
          startedAt: row.started_at,
        }
      : null;
  }

  plannedExerciseBelongsToVersion(
    routineExerciseId: number,
    routineVersionId: number,
  ): boolean {
    return (
      this.database
        .prepare(
          `
            SELECT 1 FROM routine_exercises
            WHERE id = ? AND routine_version_id = ?
          `,
        )
        .get(routineExerciseId, routineVersionId) !== undefined
    );
  }

  findExerciseState(exerciseId: number): ExerciseState | null {
    const row = this.database
      .prepare("SELECT id, is_active FROM exercises WHERE id = ?")
      .get(exerciseId) as { id: number; is_active: 0 | 1 } | undefined;
    return row ? { id: row.id, isActive: row.is_active === 1 } : null;
  }

  insertSession(
    userId: number,
    routineId: number,
    routineVersionId: number,
    startedAt: string,
    createdAt: string,
  ): number {
    const row = this.database
      .prepare(
        `
          INSERT INTO workout_sessions (
            id, user_id, routine_id, routine_version_id,
            routine_version_is_sealed, started_at, status,
            overall_rpe_is_set, created_at
          ) VALUES (
            (
              SELECT CASE
                WHEN COALESCE(MAX(id), 0) < 9007199254740991
                THEN COALESCE(MAX(id), 0) + 1
              END
              FROM workout_sessions
            ),
            ?, ?, ?, 1, ?, 'in_progress', 0, ?
          )
          RETURNING id
        `,
      )
      .get(userId, routineId, routineVersionId, startedAt, createdAt) as {
      id: number;
    };
    return row.id;
  }

  upsertResult(
    workoutId: number,
    routineVersionId: number,
    routineExerciseId: number,
    input: PutWorkoutExerciseInput,
  ): number {
    const existing = this.database
      .prepare(
        `
          SELECT id FROM workout_exercises
          WHERE workout_session_id = ? AND routine_exercise_id = ?
        `,
      )
      .get(workoutId, routineExerciseId) as { id: number } | undefined;

    try {
      if (existing) {
        this.database
          .prepare(
            `
              UPDATE workout_exercises
              SET exercise_id = ?, position = ?, notes = ?
              WHERE id = ?
            `,
          )
          .run(input.exerciseId, input.position, input.notes, existing.id);
        return existing.id;
      }

      const row = this.database
        .prepare(
          `
            INSERT INTO workout_exercises (
              id, workout_session_id, routine_version_id,
              routine_exercise_id, exercise_id, position, notes
            ) VALUES (
              (
                SELECT CASE
                  WHEN COALESCE(MAX(id), 0) < 9007199254740991
                  THEN COALESCE(MAX(id), 0) + 1
                END
                FROM workout_exercises
              ),
              ?, ?, ?, ?, ?, ?
            )
            RETURNING id
          `,
        )
        .get(
          workoutId,
          routineVersionId,
          routineExerciseId,
          input.exerciseId,
          input.position,
          input.notes,
        ) as { id: number };
      return row.id;
    } catch (error) {
      if (isPositionConflict(error)) {
        throw new WorkoutPositionConstraintError({ cause: error });
      }
      throw error;
    }
  }

  synchronizeSets(workoutExerciseId: number, sets: WorkoutSetInput[]): void {
    const existing = this.database
      .prepare(
        `
          SELECT id, set_number FROM workout_sets
          WHERE workout_exercise_id = ?
        `,
      )
      .all(workoutExerciseId) as Array<{ id: number; set_number: number }>;
    const idsByNumber = new Map(
      existing.map(({ id, set_number }) => [set_number, id]),
    );
    const update = this.database.prepare(
      `
        UPDATE workout_sets
        SET
          weight_kg = @weightKg,
          weight_kg_is_set = @weightKgIsSet,
          reps = @reps,
          reps_is_set = @repsIsSet,
          duration_seconds = @durationSeconds,
          duration_seconds_is_set = @durationSecondsIsSet,
          rpe = @rpe,
          rpe_is_set = @rpeIsSet,
          completed = @completed,
          pain_level = @painLevel,
          pain_level_is_set = @painLevelIsSet,
          pain_area = @painArea,
          notes = @notes
        WHERE id = @id
      `,
    );
    const insert = this.database.prepare(
      `
        INSERT INTO workout_sets (
          id, workout_exercise_id, set_number,
          weight_kg, weight_kg_is_set, reps, reps_is_set,
          duration_seconds, duration_seconds_is_set, rpe, rpe_is_set,
          completed, pain_level, pain_level_is_set, pain_area, notes
        ) VALUES (
          (
            SELECT CASE
              WHEN COALESCE(MAX(id), 0) < 9007199254740991
              THEN COALESCE(MAX(id), 0) + 1
            END
            FROM workout_sets
          ),
          @workoutExerciseId, @setNumber,
          @weightKg, @weightKgIsSet, @reps, @repsIsSet,
          @durationSeconds, @durationSecondsIsSet, @rpe, @rpeIsSet,
          @completed, @painLevel, @painLevelIsSet, @painArea, @notes
        )
      `,
    );

    for (const set of sets) {
      const values = {
        ...set,
        id: idsByNumber.get(set.setNumber),
        workoutExerciseId,
        weightKgIsSet: set.weightKg === null ? 0 : 1,
        repsIsSet: set.reps === null ? 0 : 1,
        durationSecondsIsSet: set.durationSeconds === null ? 0 : 1,
        rpeIsSet: set.rpe === null ? 0 : 1,
        completed: set.completed ? 1 : 0,
        painLevelIsSet: set.painLevel === null ? 0 : 1,
      };
      if (values.id === undefined) insert.run(values);
      else update.run(values);
    }

    const retainedNumbers = sets.map(({ setNumber }) => setNumber);
    if (retainedNumbers.length === 0) {
      this.database
        .prepare("DELETE FROM workout_sets WHERE workout_exercise_id = ?")
        .run(workoutExerciseId);
      return;
    }
    const placeholders = retainedNumbers.map(() => "?").join(", ");
    this.database
      .prepare(
        `
          DELETE FROM workout_sets
          WHERE workout_exercise_id = ?
            AND set_number NOT IN (${placeholders})
        `,
      )
      .run(workoutExerciseId, ...retainedNumbers);
  }

  complete(
    workoutId: number,
    completedAt: string,
    overallRpe: number | null,
    notes: string | null,
  ): boolean {
    return (
      this.database
        .prepare(
          `
            UPDATE workout_sessions
            SET
              status = 'completed',
              completed_at = ?,
              overall_rpe = ?,
              overall_rpe_is_set = ?,
              notes = ?
            WHERE id = ? AND status = 'in_progress'
          `,
        )
        .run(
          completedAt,
          overallRpe,
          overallRpe === null ? 0 : 1,
          notes,
          workoutId,
        ).changes === 1
    );
  }

  cancel(workoutId: number): boolean {
    return (
      this.database
        .prepare(
          `
            UPDATE workout_sessions SET status = 'cancelled'
            WHERE id = ? AND status = 'in_progress'
          `,
        )
        .run(workoutId).changes === 1
    );
  }

  list(userId: number, status?: WorkoutStatus): WorkoutSummary[] {
    const rows = this.database
      .prepare(
        `
          SELECT
            workout_sessions.id,
            workout_sessions.user_id,
            workout_sessions.routine_id,
            workout_sessions.routine_version_id,
            workout_sessions.started_at,
            workout_sessions.completed_at,
            workout_sessions.duration_seconds,
            workout_sessions.status,
            workout_sessions.overall_rpe,
            workout_sessions.notes,
            workout_sessions.created_at,
            routines.name AS routine_name,
            routines.is_active AS routine_is_active,
            routine_versions.version_number,
            routine_versions.name AS version_name
          FROM workout_sessions
          JOIN routines ON routines.id = workout_sessions.routine_id
          JOIN routine_versions
            ON routine_versions.id = workout_sessions.routine_version_id
          WHERE workout_sessions.user_id = ?
            AND (? IS NULL OR workout_sessions.status = ?)
          ORDER BY workout_sessions.started_at DESC, workout_sessions.id DESC
        `,
      )
      .all(userId, status ?? null, status ?? null) as SummaryRow[];
    return rows.map((row) => ({
      ...mapSession(row),
      routine: {
        id: row.routine_id,
        name: row.routine_name,
        isActive: row.routine_is_active === 1,
      },
      routineVersion: {
        id: row.routine_version_id,
        versionNumber: row.version_number,
        name: row.version_name,
      },
    }));
  }

  findDetail(workoutId: number): WorkoutDetail | null {
    const sessionRow = this.database
      .prepare(
        `
          SELECT
            id, user_id, routine_id, routine_version_id, started_at,
            completed_at, duration_seconds, status, overall_rpe, notes,
            created_at
          FROM workout_sessions WHERE id = ?
        `,
      )
      .get(workoutId) as SessionRow | undefined;
    if (!sessionRow) return null;

    const planningRows = this.database
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
          FROM routine_versions
          JOIN routines ON routines.id = routine_versions.routine_id
          JOIN routine_exercises
            ON routine_exercises.routine_version_id = routine_versions.id
          JOIN exercises ON exercises.id = routine_exercises.exercise_id
          JOIN routine_sets
            ON routine_sets.routine_exercise_id = routine_exercises.id
          WHERE routine_versions.id = ? AND routine_versions.is_sealed = 1
          ORDER BY routine_exercises.position, routine_sets.set_number
        `,
      )
      .all(sessionRow.routine_version_id) as PlanningRow[];
    const firstPlanning = planningRows[0];
    if (!firstPlanning) {
      throw new Error("Workout planning could not be read");
    }

    const plannedExercises = new Map<number, PlannedExercise>();
    for (const row of planningRows) {
      let planned = plannedExercises.get(row.routine_exercise_id);
      if (!planned) {
        planned = {
          id: row.routine_exercise_id,
          exerciseId: row.exercise_id,
          position: row.position,
          restSeconds: row.rest_seconds,
          targetRpe: row.exercise_target_rpe,
          notes: row.routine_exercise_notes,
          exercise: mapPlanningExercise(row),
          sets: [],
        };
        plannedExercises.set(row.routine_exercise_id, planned);
      }
      const set: RoutineSet = {
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
      };
      planned.sets.push(set);
    }

    const resultRows = this.database
      .prepare(
        `
          SELECT
            workout_exercises.id AS workout_exercise_id,
            workout_exercises.routine_exercise_id,
            workout_exercises.exercise_id AS performed_exercise_id,
            workout_exercises.position,
            workout_exercises.notes AS result_notes,
            planned.id AS planned_exercise_id,
            planned.slug AS planned_slug,
            planned.name AS planned_name,
            planned.movement_pattern AS planned_movement_pattern,
            planned.equipment AS planned_equipment,
            planned.description AS planned_description,
            planned.technique_notes AS planned_technique_notes,
            planned.safety_notes AS planned_safety_notes,
            planned.video_url AS planned_video_url,
            planned.is_active AS planned_is_active,
            planned.created_at AS planned_created_at,
            planned.updated_at AS planned_updated_at,
            performed.slug AS performed_slug,
            performed.name AS performed_name,
            performed.movement_pattern AS performed_movement_pattern,
            performed.equipment AS performed_equipment,
            performed.description AS performed_description,
            performed.technique_notes AS performed_technique_notes,
            performed.safety_notes AS performed_safety_notes,
            performed.video_url AS performed_video_url,
            performed.is_active AS performed_is_active,
            performed.created_at AS performed_created_at,
            performed.updated_at AS performed_updated_at,
            workout_sets.id AS workout_set_id,
            workout_sets.set_number,
            workout_sets.weight_kg,
            workout_sets.reps,
            workout_sets.duration_seconds,
            workout_sets.rpe,
            workout_sets.completed,
            workout_sets.pain_level,
            workout_sets.pain_area,
            workout_sets.notes AS set_notes
          FROM workout_exercises
          JOIN routine_exercises
            ON routine_exercises.id = workout_exercises.routine_exercise_id
          JOIN exercises AS planned
            ON planned.id = routine_exercises.exercise_id
          JOIN exercises AS performed
            ON performed.id = workout_exercises.exercise_id
          LEFT JOIN workout_sets
            ON workout_sets.workout_exercise_id = workout_exercises.id
          WHERE workout_exercises.workout_session_id = ?
          ORDER BY workout_exercises.position, workout_sets.set_number
        `,
      )
      .all(workoutId) as ResultRow[];
    const results = new Map<number, WorkoutExerciseResult>();
    for (const row of resultRows) {
      let result = results.get(row.workout_exercise_id);
      if (!result) {
        result = {
          id: row.workout_exercise_id,
          routineExerciseId: row.routine_exercise_id,
          exerciseId: row.performed_exercise_id,
          position: row.position,
          notes: row.result_notes,
          plannedExercise: {
            id: row.routine_exercise_id,
            exerciseId: row.planned_exercise_id,
            exercise: mapResultExercise(row, "planned"),
          },
          performedExercise: mapResultExercise(row, "performed"),
          sets: [],
        };
        results.set(row.workout_exercise_id, result);
      }
      if (
        row.workout_set_id !== null &&
        row.set_number !== null &&
        row.completed !== null
      ) {
        result.sets.push({
          id: row.workout_set_id,
          setNumber: row.set_number,
          weightKg: row.weight_kg,
          reps: row.reps,
          durationSeconds: row.duration_seconds,
          rpe: row.rpe,
          completed: row.completed === 1,
          painLevel: row.pain_level,
          painArea: row.pain_area,
          notes: row.set_notes,
        });
      }
    }

    return {
      ...mapSession(sessionRow),
      planning: {
        id: firstPlanning.routine_id,
        userId: firstPlanning.user_id,
        name: firstPlanning.routine_name,
        description: firstPlanning.routine_description,
        isActive: firstPlanning.routine_is_active === 1,
        createdAt: firstPlanning.routine_created_at,
        updatedAt: firstPlanning.routine_updated_at,
        version: {
          id: firstPlanning.version_id,
          versionNumber: firstPlanning.version_number,
          name: firstPlanning.version_name,
          notes: firstPlanning.version_notes,
          isCurrent:
            firstPlanning.version_number ===
            firstPlanning.current_version_number,
          createdAt: firstPlanning.version_created_at,
          exercises: [...plannedExercises.values()],
        },
      },
      results: [...results.values()],
    };
  }
}
