import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RoutineRepository } from "../../../src/modules/routines/routine.repository";
import type { RoutineVersionDefinitionInput } from "../../../src/modules/routines/routine.schemas";
import {
  createMigratedTemporaryDatabase,
  type TemporaryDatabase,
} from "../../helpers/database";
import {
  FIXTURE_TIMESTAMP,
  insertExercise,
  insertUser,
} from "../../helpers/fixtures";

function versionDefinition(
  overrides: Partial<RoutineVersionDefinitionInput> = {},
): RoutineVersionDefinitionInput {
  return {
    name: "Initial",
    notes: null,
    exercises: [
      {
        exerciseId: 1,
        position: 1,
        restSeconds: 90,
        targetRpe: 7,
        notes: null,
        sets: [
          {
            setNumber: 1,
            setType: "work",
            targetWeightKg: 80,
            targetRepsMin: 8,
            targetRepsMax: 10,
            targetSeconds: null,
            targetRpe: null,
            notes: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("RoutineRepository", () => {
  let temporary: TemporaryDatabase;
  let repository: RoutineRepository;

  beforeEach(() => {
    temporary = createMigratedTemporaryDatabase();
    repository = new RoutineRepository(temporary.database);
    insertUser(temporary.database);
    insertExercise(temporary.database);
  });

  afterEach(() => temporary.cleanup());

  function createRoutine(definition = versionDefinition()): number {
    return repository.withImmediateTransaction(() => {
      const routineId = repository.insertRoutine(
        1,
        "Strength A",
        "Main session",
        FIXTURE_TIMESTAMP,
      );
      const versionId = repository.insertVersion(
        routineId,
        1,
        definition,
        FIXTURE_TIMESTAMP,
      );
      repository.sealVersion(versionId);
      expect(repository.finalizeInitialVersion(routineId)).toBe(true);
      return routineId;
    });
  }

  function createRoutineWithExplicitIds({
    routineId = 1,
    versionId = 1,
    routineExerciseId = 1,
    setId = 1,
  }: {
    routineId?: number;
    versionId?: number;
    routineExerciseId?: number;
    setId?: number;
  }): void {
    temporary.database.exec("BEGIN");
    try {
      temporary.database
        .prepare(
          `
            INSERT INTO routines (
              id, user_id, name, current_version_number, created_at, updated_at
            ) VALUES (?, 1, 'Explicit ids', 1, ?, ?)
          `,
        )
        .run(routineId, FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP);
      temporary.database
        .prepare(
          `
            INSERT INTO routine_versions (
              id, routine_id, version_number, is_sealed, created_at
            ) VALUES (?, ?, 1, 0, ?)
          `,
        )
        .run(versionId, routineId, FIXTURE_TIMESTAMP);
      temporary.database
        .prepare(
          `
            INSERT INTO routine_exercises (
              id, routine_version_id, exercise_id, position,
              rest_seconds_is_set, target_rpe_is_set
            ) VALUES (?, ?, 1, 1, 0, 0)
          `,
        )
        .run(routineExerciseId, versionId);
      temporary.database
        .prepare(
          `
            INSERT INTO routine_sets (
              id, routine_exercise_id, set_number,
              target_weight_kg_is_set,
              target_reps_min_is_set, target_reps_max_is_set,
              target_seconds, target_seconds_is_set, target_rpe_is_set
            ) VALUES (?, ?, 1, 0, 0, 0, 30, 1, 0)
          `,
        )
        .run(setId, routineExerciseId);
      temporary.database
        .prepare("UPDATE routine_versions SET is_sealed = 1 WHERE id = ?")
        .run(versionId);
      temporary.database
        .prepare(
          `
            UPDATE routines
            SET pending_version_number = NULL, protocol_state = 0
            WHERE id = ?
          `,
        )
        .run(routineId);
      temporary.database.exec("COMMIT");
    } catch (error) {
      temporary.database.exec("ROLLBACK");
      throw error;
    }
  }

  it("performs referential lookups and maps state", () => {
    expect(repository.userExists(1)).toBe(true);
    expect(repository.userExists(999)).toBe(false);
    expect(repository.findExerciseStates([1, 1, 999])).toEqual([
      { id: 1, isActive: true },
    ]);
    expect(repository.findRoutineState(999)).toBeNull();

    const routineId = createRoutine();
    expect(repository.findRoutineState(routineId)).toEqual({
      id: routineId,
      userId: 1,
      currentVersionNumber: 1,
      maxVersionNumber: 1,
    });
  });

  it.each([
    ["routines", { routineId: Number.MAX_SAFE_INTEGER }, "routine"],
    ["routine_versions", { versionId: Number.MAX_SAFE_INTEGER }, "version"],
    [
      "routine_exercises",
      { routineExerciseId: Number.MAX_SAFE_INTEGER },
      "version",
    ],
    ["routine_sets", { setId: Number.MAX_SAFE_INTEGER }, "version"],
  ] as const)(
    "refuses to allocate an id after Number.MAX_SAFE_INTEGER in %s",
    (_table, ids, operation) => {
      createRoutineWithExplicitIds(ids);

      expect(() =>
        repository.withImmediateTransaction(() => {
          if (operation === "routine") {
            repository.insertRoutine(1, "Overflow", null, FIXTURE_TIMESTAMP);
            return;
          }
          const routineId = "routineId" in ids ? Number(ids.routineId) : 1;
          repository.insertVersion(
            routineId,
            2,
            versionDefinition(),
            FIXTURE_TIMESTAMP,
          );
        }),
      ).toThrow();
      expect(
        temporary.database
          .prepare("SELECT COUNT(*) AS count FROM routines")
          .get(),
      ).toEqual({ count: 1 });
      expect(
        temporary.database
          .prepare("SELECT COUNT(*) AS count FROM routine_versions")
          .get(),
      ).toEqual({ count: 1 });
    },
  );

  it("writes an unsealed aggregate, seals it, and maps complete ordered detail", () => {
    insertExercise(temporary.database, {
      id: 2,
      slug: "plank",
      name: "Plank",
    });
    const routineId = createRoutine(
      versionDefinition({
        notes: "First version",
        exercises: [
          {
            exerciseId: 2,
            position: 2,
            restSeconds: null,
            targetRpe: null,
            notes: "Hold position",
            sets: [
              {
                setNumber: 2,
                setType: null,
                targetWeightKg: null,
                targetRepsMin: null,
                targetRepsMax: null,
                targetSeconds: 45,
                targetRpe: 8,
                notes: null,
              },
              {
                setNumber: 1,
                setType: "warmup",
                targetWeightKg: null,
                targetRepsMin: null,
                targetRepsMax: null,
                targetSeconds: 30,
                targetRpe: null,
                notes: null,
              },
            ],
          },
          versionDefinition()
            .exercises[0] as RoutineVersionDefinitionInput["exercises"][number],
        ],
      }),
    );

    const detail = repository.findDetail(routineId);
    expect(detail).toMatchObject({
      id: routineId,
      userId: 1,
      name: "Strength A",
      description: "Main session",
      isActive: true,
      version: {
        versionNumber: 1,
        name: "Initial",
        notes: "First version",
        isCurrent: true,
      },
    });
    expect(detail?.version.exercises.map(({ position }) => position)).toEqual([
      1, 2,
    ]);
    expect(
      detail?.version.exercises[1]?.sets.map(({ setNumber }) => setNumber),
    ).toEqual([1, 2]);
    expect(detail?.version.exercises[0]?.sets[0]).toMatchObject({
      targetRpe: null,
      effectiveTargetRpe: 7,
    });
    expect(detail?.version.exercises[1]?.sets[0]).toMatchObject({
      targetRpe: null,
      effectiveTargetRpe: null,
    });
    expect(detail?.version.exercises[1]?.sets[1]).toMatchObject({
      targetRpe: 8,
      effectiveTargetRpe: 8,
    });
    expect(detail?.version.exercises[0]?.exercise).toMatchObject({
      slug: "back-squat",
      isActive: true,
    });
  });

  it("advances current while preserving historical rows exactly", () => {
    const routineId = createRoutine();
    const historicalBefore = repository.findDetail(routineId, 1);

    repository.withImmediateTransaction(() => {
      const versionId = repository.insertVersion(
        routineId,
        2,
        versionDefinition({ name: "Second" }),
        "2026-08-11T11:00:00.000Z",
      );
      repository.sealVersion(versionId);
      expect(
        repository.advanceCurrentVersion(
          routineId,
          1,
          2,
          "2026-08-11T11:00:00.000Z",
        ),
      ).toBe(true);
    });

    expect(repository.findDetail(routineId)?.version).toMatchObject({
      versionNumber: 2,
      isCurrent: true,
    });
    const historicalAfter = repository.findDetail(routineId, 1);
    expect(historicalAfter?.updatedAt).toBe("2026-08-11T11:00:00.000Z");
    expect(historicalAfter?.version).toEqual({
      ...historicalBefore?.version,
      isCurrent: false,
    });
  });

  it("lists only one owner with current summaries in stable name order", () => {
    createRoutine();
    insertUser(temporary.database, {
      id: 2,
      email: "other@example.com",
      displayName: "Other",
    });
    repository.withImmediateTransaction(() => {
      const id = repository.insertRoutine(1, "alpha", null, FIXTURE_TIMESTAMP);
      const versionId = repository.insertVersion(
        id,
        1,
        versionDefinition({ name: "Alpha current" }),
        FIXTURE_TIMESTAMP,
      );
      repository.sealVersion(versionId);
      expect(repository.finalizeInitialVersion(id)).toBe(true);
    });
    repository.withImmediateTransaction(() => {
      const id = repository.insertRoutine(
        2,
        "Aardvark",
        null,
        FIXTURE_TIMESTAMP,
      );
      const versionId = repository.insertVersion(
        id,
        1,
        versionDefinition(),
        FIXTURE_TIMESTAMP,
      );
      repository.sealVersion(versionId);
      expect(repository.finalizeInitialVersion(id)).toBe(true);
    });

    expect(repository.list(1).map(({ name }) => name)).toEqual([
      "alpha",
      "Strength A",
    ]);
    expect(repository.list(1)[0]?.currentVersion).toMatchObject({
      versionNumber: 1,
      name: "Alpha current",
    });
  });

  it("keeps historical planning readable with the current inactive catalog row", () => {
    const routineId = createRoutine();
    temporary.database
      .prepare(
        "UPDATE exercises SET name = 'Edited Squat', is_active = 0 WHERE id = 1",
      )
      .run();

    expect(
      repository.findDetail(routineId, 1)?.version.exercises[0],
    ).toMatchObject({
      exerciseId: 1,
      position: 1,
      exercise: { name: "Edited Squat", isActive: false },
    });
  });

  it("returns null for absent routine versions", () => {
    const routineId = createRoutine();
    expect(repository.findDetail(routineId, 999)).toBeNull();
    expect(repository.findDetail(999)).toBeNull();
  });

  it("rolls back every write when aggregate construction fails", () => {
    temporary.database.exec(`
      CREATE TRIGGER fail_second_set
      BEFORE INSERT ON routine_sets
      WHEN NEW.set_number = 2
      BEGIN
        SELECT RAISE(ABORT, 'injected failure');
      END;
    `);
    const definition = versionDefinition({
      exercises: [
        {
          ...(versionDefinition()
            .exercises[0] as RoutineVersionDefinitionInput["exercises"][number]),
          sets: [
            versionDefinition().exercises[0]
              ?.sets[0] as RoutineVersionDefinitionInput["exercises"][number]["sets"][number],
            {
              ...(versionDefinition().exercises[0]
                ?.sets[0] as RoutineVersionDefinitionInput["exercises"][number]["sets"][number]),
              setNumber: 2,
            },
          ],
        },
      ],
    });

    expect(() => createRoutine(definition)).toThrow("injected failure");
    expect(
      temporary.database
        .prepare("SELECT COUNT(*) AS count FROM routines")
        .get(),
    ).toEqual({ count: 0 });
    expect(
      temporary.database
        .prepare("SELECT COUNT(*) AS count FROM routine_sets")
        .get(),
    ).toEqual({ count: 0 });
  });
});
