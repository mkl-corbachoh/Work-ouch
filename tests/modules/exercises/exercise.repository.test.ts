import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ExerciseRepository,
  ExerciseSlugConflictError,
} from "../../../src/modules/exercises/exercise.repository";
import type { CreateExerciseInput } from "../../../src/modules/exercises/exercise.schemas";
import {
  createMigratedTemporaryDatabase,
  type TemporaryDatabase,
} from "../../helpers/database";

const CREATED_AT = new Date("2026-08-11T10:00:00.000Z");
const UPDATED_AT = new Date("2026-08-11T11:00:00.000Z");

function validExercise(
  overrides: Partial<CreateExerciseInput> = {},
): CreateExerciseInput {
  return {
    slug: "back-squat",
    name: "Back Squat",
    movementPattern: null,
    equipment: null,
    description: null,
    techniqueNotes: null,
    safetyNotes: null,
    videoUrl: null,
    isActive: true,
    ...overrides,
  };
}

describe("ExerciseRepository", () => {
  let temporary: TemporaryDatabase;
  let currentTime: Date;
  let repository: ExerciseRepository;

  beforeEach(() => {
    temporary = createMigratedTemporaryDatabase();
    currentTime = CREATED_AT;
    repository = new ExerciseRepository(temporary.database, () => currentTime);
  });

  afterEach(() => temporary.cleanup());

  it("creates and maps a complete exercise with UTC timestamps", () => {
    const exercise = repository.create(
      validExercise({
        movementPattern: "Squat",
        equipment: "Barbell",
        description: "A compound lower-body exercise.",
        techniqueNotes: "Keep the torso braced.",
        safetyNotes: "Use safety pins.",
        videoUrl: "https://example.com/back-squat",
        isActive: false,
      }),
    );

    expect(exercise).toEqual({
      id: 1,
      slug: "back-squat",
      name: "Back Squat",
      movementPattern: "Squat",
      equipment: "Barbell",
      description: "A compound lower-body exercise.",
      techniqueNotes: "Keep the torso braced.",
      safetyNotes: "Use safety pins.",
      videoUrl: "https://example.com/back-squat",
      isActive: false,
      createdAt: CREATED_AT.toISOString(),
      updatedAt: CREATED_AT.toISOString(),
    });
    expect(
      temporary.database
        .prepare(
          "SELECT movement_pattern, is_active, created_at FROM exercises WHERE id = 1",
        )
        .get(),
    ).toEqual({
      movement_pattern: "Squat",
      is_active: 0,
      created_at: CREATED_AT.toISOString(),
    });
  });

  it("translates only a duplicate slug and leaves no partial row", () => {
    repository.create(validExercise({ isActive: false }));

    expect(() =>
      repository.create(validExercise({ name: "Different Name" })),
    ).toThrow(ExerciseSlugConflictError);
    expect(
      temporary.database
        .prepare("SELECT COUNT(*) AS count FROM exercises")
        .get(),
    ).toEqual({ count: 1 });
  });

  it("lists active exercises by case-insensitive name, binary name, then id", () => {
    repository.create(validExercise({ slug: "beta", name: "beta" }));
    repository.create(validExercise({ slug: "alpha-lower", name: "alpha" }));
    repository.create(validExercise({ slug: "alpha-upper", name: "Alpha" }));
    repository.create(validExercise({ slug: "alpha-upper-2", name: "Alpha" }));
    repository.create(
      validExercise({ slug: "inactive", name: "Aardvark", isActive: false }),
    );

    expect(repository.list(false).map(({ slug }) => slug)).toEqual([
      "alpha-upper",
      "alpha-upper-2",
      "alpha-lower",
      "beta",
    ]);
    expect(repository.list(true).map(({ slug }) => slug)).toEqual([
      "inactive",
      "alpha-upper",
      "alpha-upper-2",
      "alpha-lower",
      "beta",
    ]);
  });

  it("finds active and inactive exercises and returns null for absence", () => {
    const inactive = repository.create(validExercise({ isActive: false }));

    expect(repository.findById(inactive.id)).toEqual(inactive);
    expect(repository.findById(999)).toBeNull();
  });

  it("patches only sent fields, clears metadata, and updates the timestamp", () => {
    const created = repository.create(
      validExercise({
        equipment: "Barbell",
        description: "Original description",
      }),
    );
    currentTime = UPDATED_AT;

    expect(
      repository.patch(created.id, {
        name: "Barbell Back Squat",
        description: null,
      }),
    ).toEqual({
      ...created,
      name: "Barbell Back Squat",
      description: null,
      equipment: "Barbell",
      updatedAt: UPDATED_AT.toISOString(),
    });
  });

  it("deactivates and reactivates without deleting the exercise", () => {
    const created = repository.create(validExercise());

    expect(repository.patch(created.id, { isActive: false })?.isActive).toBe(
      false,
    );
    expect(repository.list(false)).toEqual([]);
    expect(repository.patch(created.id, { isActive: true })?.isActive).toBe(
      true,
    );
    expect(repository.list(false)).toHaveLength(1);
  });

  it("returns null when patching an absent exercise", () => {
    expect(repository.patch(999, { name: "Missing" })).toBeNull();
  });
});
