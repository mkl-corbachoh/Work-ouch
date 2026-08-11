import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RoutineRepository } from "../../../src/modules/routines/routine.repository";
import {
  createRoutineSchema,
  createRoutineVersionSchema,
} from "../../../src/modules/routines/routine.schemas";
import {
  ExerciseInactiveError,
  ExerciseNotFoundError,
  RoutineNotFoundError,
  RoutineService,
  RoutineVersionNotFoundError,
  UserNotFoundError,
} from "../../../src/modules/routines/routine.service";
import {
  createMigratedTemporaryDatabase,
  type TemporaryDatabase,
} from "../../helpers/database";
import { insertExercise, insertUser } from "../../helpers/fixtures";

const FIRST_TIME = new Date("2026-08-11T10:00:00.000Z");

function set(setNumber = 1) {
  return { setNumber, targetRepsMin: 8, targetRepsMax: 12 };
}

function exercise(exerciseId = 1, position = 1) {
  return { exerciseId, position, targetRpe: 7, sets: [set()] };
}

function createInput(overrides: Record<string, unknown> = {}) {
  return createRoutineSchema.parse({
    userId: 1,
    name: "Strength A",
    version: { name: "Initial", exercises: [exercise()] },
    ...overrides,
  });
}

function versionInput(overrides: Record<string, unknown> = {}) {
  return createRoutineVersionSchema.parse({
    userId: 1,
    name: "Next",
    exercises: [exercise()],
    ...overrides,
  });
}

describe("RoutineService", () => {
  let temporary: TemporaryDatabase;
  let currentTime: Date;
  let service: RoutineService;

  beforeEach(() => {
    temporary = createMigratedTemporaryDatabase();
    insertUser(temporary.database);
    insertExercise(temporary.database);
    currentTime = FIRST_TIME;
    service = new RoutineService(
      new RoutineRepository(temporary.database),
      () => currentTime,
    );
  });

  afterEach(() => temporary.cleanup());

  it("creates version 1 atomically and returns the complete current detail", () => {
    expect(service.create(createInput())).toMatchObject({
      id: 1,
      userId: 1,
      name: "Strength A",
      isActive: true,
      createdAt: FIRST_TIME.toISOString(),
      updatedAt: FIRST_TIME.toISOString(),
      version: {
        versionNumber: 1,
        name: "Initial",
        isCurrent: true,
        exercises: [
          {
            exerciseId: 1,
            position: 1,
            targetRpe: 7,
            sets: [{ setNumber: 1, effectiveTargetRpe: 7 }],
          },
        ],
      },
    });
  });

  it("creates versions 2 and 3 sequentially and changes current atomically", () => {
    const routine = service.create(createInput());
    currentTime = new Date("2026-08-11T11:00:00.000Z");
    expect(
      service.createVersion(routine.id, versionInput({ name: "Second" }))
        .version,
    ).toMatchObject({ versionNumber: 2, name: "Second", isCurrent: true });
    currentTime = new Date("2026-08-11T12:00:00.000Z");
    expect(
      service.createVersion(routine.id, versionInput({ name: "Third" }))
        .version,
    ).toMatchObject({ versionNumber: 3, name: "Third", isCurrent: true });

    expect(service.get(routine.id, 1).version.versionNumber).toBe(3);
    expect(
      temporary.database
        .prepare(
          "SELECT version_number, is_sealed FROM routine_versions ORDER BY version_number",
        )
        .all(),
    ).toEqual([
      { version_number: 1, is_sealed: 1 },
      { version_number: 2, is_sealed: 1 },
      { version_number: 3, is_sealed: 1 },
    ]);
  });

  it("preserves exact historical planning when creating a new version", () => {
    const routine = service.create(createInput());
    const before = service.get(routine.id, 1, 1).version;
    service.createVersion(
      routine.id,
      versionInput({
        exercises: [{ ...exercise(), sets: [set(1), set(2)] }],
      }),
    );

    expect(service.get(routine.id, 1, 1).version).toEqual({
      ...before,
      isCurrent: false,
    });
  });

  it("enforces user existence for create, version creation, and listing", () => {
    expect(() => service.create(createInput({ userId: 999 }))).toThrow(
      UserNotFoundError,
    );
    const routine = service.create(createInput());
    expect(() =>
      service.createVersion(routine.id, versionInput({ userId: 999 })),
    ).toThrow(UserNotFoundError);
    expect(() => service.list(999)).toThrow(UserNotFoundError);
  });

  it("rejects absent and inactive exercises without partial writes", () => {
    expect(() =>
      service.create(createInput({ version: { exercises: [exercise(999)] } })),
    ).toThrow(ExerciseNotFoundError);
    expect(
      temporary.database
        .prepare("SELECT COUNT(*) AS count FROM routines")
        .get(),
    ).toEqual({ count: 0 });

    temporary.database
      .prepare("UPDATE exercises SET is_active = 0 WHERE id = 1")
      .run();
    expect(() => service.create(createInput())).toThrow(ExerciseInactiveError);
    expect(
      temporary.database
        .prepare("SELECT COUNT(*) AS count FROM routines")
        .get(),
    ).toEqual({ count: 0 });
  });

  it("rejects an absent or foreign-owned routine without revealing ownership", () => {
    expect(() => service.createVersion(999, versionInput())).toThrow(
      RoutineNotFoundError,
    );
    const routine = service.create(createInput());
    insertUser(temporary.database, {
      id: 2,
      email: "other@example.com",
      displayName: "Other",
    });
    expect(() =>
      service.createVersion(routine.id, versionInput({ userId: 2 })),
    ).toThrow(RoutineNotFoundError);
    expect(() => service.get(routine.id, 2)).toThrow(RoutineNotFoundError);
  });

  it("returns a specific error for an absent version of an owned routine", () => {
    const routine = service.create(createInput());
    expect(() => service.get(routine.id, 1, 999)).toThrow(
      RoutineVersionNotFoundError,
    );
  });

  it("lists only the requested owner", () => {
    service.create(createInput());
    insertUser(temporary.database, {
      id: 2,
      email: "other@example.com",
      displayName: "Other",
    });
    service.create(createInput({ userId: 2, name: "Other routine" }));

    expect(service.list(1).map(({ name }) => name)).toEqual(["Strength A"]);
    expect(service.list(2).map(({ name }) => name)).toEqual(["Other routine"]);
  });

  it("validates ownership and active exercises in the same write transaction", () => {
    const routine = service.create(createInput());
    temporary.database.exec(`
      CREATE TRIGGER deactivate_on_version_insert
      AFTER INSERT ON routine_versions
      WHEN NEW.version_number = 2
      BEGIN
        UPDATE exercises SET is_active = 0 WHERE id = 1;
      END;
    `);

    expect(() => service.createVersion(routine.id, versionInput())).toThrow(
      "routine exercise must reference an active exercise",
    );
    expect(service.get(routine.id, 1).version.versionNumber).toBe(1);
    expect(
      temporary.database
        .prepare("SELECT is_active FROM exercises WHERE id = 1")
        .get(),
    ).toEqual({ is_active: 1 });
  });

  it("rolls back when an exercise becomes inactive after content insertion but before sealing", () => {
    temporary.database.exec(`
      CREATE TRIGGER deactivate_after_planned_set
      AFTER INSERT ON routine_sets
      BEGIN
        UPDATE exercises SET is_active = 0 WHERE id = 1;
      END;
    `);

    expect(() => service.create(createInput())).toThrow(
      "a sealed routine version requires active exercises",
    );
    expect(
      temporary.database
        .prepare("SELECT COUNT(*) AS count FROM routines")
        .get(),
    ).toEqual({ count: 0 });
    expect(
      temporary.database
        .prepare("SELECT is_active FROM exercises WHERE id = 1")
        .get(),
    ).toEqual({ is_active: 1 });
  });

  it("rolls back all rows on a failure midway through initial creation", () => {
    temporary.database.exec(`
      CREATE TRIGGER fail_set_insert
      BEFORE INSERT ON routine_sets
      BEGIN
        SELECT RAISE(ABORT, 'injected service failure');
      END;
    `);

    expect(() => service.create(createInput())).toThrow(
      "injected service failure",
    );
    for (const table of [
      "routines",
      "routine_versions",
      "routine_exercises",
      "routine_sets",
    ]) {
      expect(
        temporary.database
          .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
          .get(),
      ).toEqual({ count: 0 });
    }
  });
});
