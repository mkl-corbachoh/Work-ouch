import type { SqliteDatabase } from "../../db/connection";
import type {
  CreateExerciseInput,
  PatchExerciseInput,
} from "./exercise.schemas";

export type Exercise = {
  id: number;
  slug: string;
  name: string;
  movementPattern: string | null;
  equipment: string | null;
  description: string | null;
  techniqueNotes: string | null;
  safetyNotes: string | null;
  videoUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type ExerciseRow = {
  id: number;
  slug: string;
  name: string;
  movement_pattern: string | null;
  equipment: string | null;
  description: string | null;
  technique_notes: string | null;
  safety_notes: string | null;
  video_url: string | null;
  is_active: 0 | 1;
  created_at: string;
  updated_at: string;
};

const EXERCISE_COLUMNS = `
  id, slug, name, movement_pattern, equipment, description,
  technique_notes, safety_notes, video_url, is_active, created_at, updated_at
`;

const PATCH_COLUMNS = {
  name: "name",
  movementPattern: "movement_pattern",
  equipment: "equipment",
  description: "description",
  techniqueNotes: "technique_notes",
  safetyNotes: "safety_notes",
  videoUrl: "video_url",
  isActive: "is_active",
} as const satisfies Record<keyof PatchExerciseInput, string>;

export class ExerciseSlugConflictError extends Error {
  constructor(options?: ErrorOptions) {
    super("An exercise with this slug already exists", options);
    this.name = "ExerciseSlugConflictError";
  }
}

function isExerciseSlugConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "SQLITE_CONSTRAINT_UNIQUE" &&
    error.message.includes("exercises.slug")
  );
}

function mapExercise(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    movementPattern: row.movement_pattern,
    equipment: row.equipment,
    description: row.description,
    techniqueNotes: row.technique_notes,
    safetyNotes: row.safety_notes,
    videoUrl: row.video_url,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ExerciseRepository {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {}

  create(input: CreateExerciseInput): Exercise {
    const timestamp = this.now().toISOString();

    try {
      const row = this.database
        .prepare(
          `
            INSERT INTO exercises (
              slug, name, movement_pattern, equipment, description,
              technique_notes, safety_notes, video_url, is_active,
              created_at, updated_at
            ) VALUES (
              @slug, @name, @movementPattern, @equipment, @description,
              @techniqueNotes, @safetyNotes, @videoUrl, @isActive,
              @createdAt, @updatedAt
            )
            RETURNING ${EXERCISE_COLUMNS}
          `,
        )
        .get({
          ...input,
          isActive: input.isActive ? 1 : 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        }) as ExerciseRow;

      return mapExercise(row);
    } catch (error) {
      if (isExerciseSlugConflict(error)) {
        throw new ExerciseSlugConflictError({ cause: error });
      }
      throw error;
    }
  }

  list(includeInactive: boolean): Exercise[] {
    const where = includeInactive ? "" : "WHERE is_active = 1";
    const rows = this.database
      .prepare(
        `
          SELECT ${EXERCISE_COLUMNS}
          FROM exercises
          ${where}
          ORDER BY name COLLATE NOCASE ASC, name ASC, id ASC
        `,
      )
      .all() as ExerciseRow[];

    return rows.map(mapExercise);
  }

  findById(id: number): Exercise | null {
    const row = this.database
      .prepare(`SELECT ${EXERCISE_COLUMNS} FROM exercises WHERE id = ?`)
      .get(id) as ExerciseRow | undefined;

    return row ? mapExercise(row) : null;
  }

  patch(id: number, input: PatchExerciseInput): Exercise | null {
    const entries = Object.entries(input) as Array<
      [keyof PatchExerciseInput, PatchExerciseInput[keyof PatchExerciseInput]]
    >;
    const assignments = entries.map(
      ([field]) => `${PATCH_COLUMNS[field]} = @${field}`,
    );
    const values = Object.fromEntries(
      entries.map(([field, value]) => [
        field,
        field === "isActive" ? (value ? 1 : 0) : value,
      ]),
    );

    const row = this.database
      .prepare(
        `
          UPDATE exercises
          SET ${assignments.join(", ")}, updated_at = @updatedAt
          WHERE id = @id
          RETURNING ${EXERCISE_COLUMNS}
        `,
      )
      .get({ id, ...values, updatedAt: this.now().toISOString() }) as
      | ExerciseRow
      | undefined;

    return row ? mapExercise(row) : null;
  }
}
