import type { Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import {
  createMigratedTemporaryDatabase,
  type TemporaryDatabase,
} from "../helpers/database";
import { insertExercise, insertUser } from "../helpers/fixtures";
import { createCapturedLogger } from "../helpers/logger";

function plannedSet(overrides: Record<string, unknown> = {}) {
  return {
    setNumber: 1,
    setType: "work",
    targetWeightKg: 80,
    targetRepsMin: 8,
    targetRepsMax: 10,
    ...overrides,
  };
}

function plannedExercise(overrides: Record<string, unknown> = {}) {
  return {
    exerciseId: 1,
    position: 1,
    restSeconds: 90,
    targetRpe: 7,
    sets: [plannedSet()],
    ...overrides,
  };
}

function routineBody(overrides: Record<string, unknown> = {}) {
  return {
    userId: 1,
    name: "Strength A",
    description: "Primary session",
    version: {
      name: "Initial",
      notes: "Starting plan",
      exercises: [plannedExercise()],
    },
    ...overrides,
  };
}

function versionBody(overrides: Record<string, unknown> = {}) {
  return {
    userId: 1,
    name: "Next phase",
    notes: null,
    exercises: [plannedExercise()],
    ...overrides,
  };
}

describe("routine API", () => {
  let temporary: TemporaryDatabase;
  let app: Express;
  let logRecords: Array<Record<string, unknown>>;

  beforeEach(() => {
    temporary = createMigratedTemporaryDatabase();
    insertUser(temporary.database);
    insertExercise(temporary.database);
    const captured = createCapturedLogger();
    logRecords = captured.records;
    app = createApp({ database: temporary.database, logger: captured.logger });
  });

  afterEach(() => temporary.cleanup());

  async function createRoutine(body = routineBody()) {
    return request(app).post("/api/v1/routines").send(body);
  }

  it("creates a routine and sealed version 1 as one complete aggregate", async () => {
    const response = await createRoutine();

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: 1,
      userId: 1,
      name: "Strength A",
      description: "Primary session",
      isActive: true,
      createdAt: expect.stringMatching(/Z$/),
      updatedAt: expect.stringMatching(/Z$/),
      version: {
        id: 1,
        versionNumber: 1,
        name: "Initial",
        notes: "Starting plan",
        isCurrent: true,
        exercises: [
          {
            id: 1,
            exerciseId: 1,
            position: 1,
            restSeconds: 90,
            targetRpe: 7,
            notes: null,
            exercise: {
              id: 1,
              slug: "back-squat",
              name: "Back Squat",
              isActive: true,
            },
            sets: [
              {
                id: 1,
                setNumber: 1,
                setType: "work",
                targetWeightKg: 80,
                targetRepsMin: 8,
                targetRepsMax: 10,
                targetSeconds: null,
                targetRpe: null,
                effectiveTargetRpe: 7,
                notes: null,
              },
            ],
          },
        ],
      },
    });
    expect(response.body.createdAt).toBe(response.body.updatedAt);
    expect(
      temporary.database
        .prepare("SELECT is_sealed FROM routine_versions")
        .get(),
    ).toEqual({ is_sealed: 1 });
  });

  it("supports repetition, duration, combined targets, zero values, and RPE inheritance", async () => {
    const response = await createRoutine(
      routineBody({
        version: {
          exercises: [
            plannedExercise({
              sets: [
                plannedSet({ targetRpe: 8 }),
                {
                  setNumber: 2,
                  targetSeconds: 0,
                  targetWeightKg: 0,
                },
                plannedSet({ setNumber: 3, targetSeconds: 30 }),
              ],
            }),
          ],
        },
      }),
    );

    expect(response.status).toBe(201);
    expect(
      response.body.version.exercises[0].sets.map(
        (set: { effectiveTargetRpe: number | null }) => set.effectiveTargetRpe,
      ),
    ).toEqual([8, 7, 7]);
  });

  it("creates successive versions and reads current or historical planning", async () => {
    const created = await createRoutine();
    const versionResponse = await request(app)
      .post(`/api/v1/routines/${created.body.id}/versions`)
      .send(
        versionBody({
          exercises: [
            plannedExercise({
              restSeconds: 120,
              sets: [plannedSet({ targetRepsMin: 5, targetRepsMax: 5 })],
            }),
          ],
        }),
      );

    expect(versionResponse.status).toBe(201);
    expect(versionResponse.body.version).toMatchObject({
      versionNumber: 2,
      isCurrent: true,
      exercises: [{ restSeconds: 120, sets: [{ targetRepsMin: 5 }] }],
    });

    const current = await request(app).get(
      `/api/v1/routines/${created.body.id}?userId=1`,
    );
    const historical = await request(app).get(
      `/api/v1/routines/${created.body.id}?userId=1&versionNumber=1`,
    );
    expect(current.body.version.versionNumber).toBe(2);
    expect(historical.body.version).toMatchObject({
      versionNumber: 1,
      isCurrent: false,
      exercises: [{ restSeconds: 90, sets: [{ targetRepsMin: 8 }] }],
    });
  });

  it("lists only the owner without pagination in stable order and with current summaries", async () => {
    await createRoutine(routineBody({ name: "beta" }));
    await createRoutine(routineBody({ name: "Alpha" }));
    await createRoutine(routineBody({ name: "alpha" }));
    insertUser(temporary.database, {
      id: 2,
      email: "other@example.com",
      displayName: "Other",
    });
    await createRoutine(routineBody({ userId: 2, name: "Aardvark" }));

    const response = await request(app).get("/api/v1/routines?userId=1");

    expect(response.status).toBe(200);
    expect(response.body.map(({ name }: { name: string }) => name)).toEqual([
      "Alpha",
      "alpha",
      "beta",
    ]);
    expect(response.body[0]).toHaveProperty("currentVersion.versionNumber", 1);
    expect(response.body[0]).not.toHaveProperty("currentVersion.exercises");
  });

  it("keeps historical reads available after catalog deactivation", async () => {
    const created = await createRoutine();
    await request(app).patch("/api/v1/exercises/1").send({
      name: "Edited Squat",
      isActive: false,
    });

    const response = await request(app).get(
      `/api/v1/routines/${created.body.id}?userId=1&versionNumber=1`,
    );
    expect(response.status).toBe(200);
    expect(response.body.version.exercises[0]).toMatchObject({
      position: 1,
      exercise: { name: "Edited Squat", isActive: false },
    });
  });

  it.each([
    ["create", "post", "/api/v1/routines", routineBody({ userId: 999 })],
    ["list", "get", "/api/v1/routines?userId=999", undefined],
  ])("returns USER_NOT_FOUND for %s", async (_label, method, url, body) => {
    const pending = request(app)[method as "get" | "post"](url);
    const response = body ? await pending.send(body) : await pending;
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      code: "USER_NOT_FOUND",
      message: "User not found",
      details: null,
    });
  });

  it("returns exercise-specific absent and inactive errors without partial writes", async () => {
    const missing = await createRoutine(
      routineBody({
        version: { exercises: [plannedExercise({ exerciseId: 999 })] },
      }),
    );
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("EXERCISE_NOT_FOUND");

    temporary.database
      .prepare("UPDATE exercises SET is_active = 0 WHERE id = 1")
      .run();
    const inactive = await createRoutine();
    expect(inactive.status).toBe(409);
    expect(inactive.body).toEqual({
      code: "EXERCISE_INACTIVE",
      message: "Exercise is inactive",
      details: null,
    });
    expect(
      temporary.database
        .prepare("SELECT COUNT(*) AS count FROM routines")
        .get(),
    ).toEqual({ count: 0 });
  });

  it("hides foreign ownership as ROUTINE_NOT_FOUND", async () => {
    const created = await createRoutine();
    insertUser(temporary.database, {
      id: 2,
      email: "other@example.com",
      displayName: "Other",
    });

    const detail = await request(app).get(
      `/api/v1/routines/${created.body.id}?userId=2`,
    );
    const version = await request(app)
      .post(`/api/v1/routines/${created.body.id}/versions`)
      .send(versionBody({ userId: 2 }));
    for (const response of [detail, version]) {
      expect(response.status).toBe(404);
      expect(response.body.code).toBe("ROUTINE_NOT_FOUND");
    }
  });

  it("distinguishes an absent routine version", async () => {
    const created = await createRoutine();
    const response = await request(app).get(
      `/api/v1/routines/${created.body.id}?userId=1&versionNumber=999`,
    );
    expect(response.status).toBe(404);
    expect(response.body.code).toBe("ROUTINE_VERSION_NOT_FOUND");
  });

  it.each([
    ["body", "post", "/api/v1/routines", routineBody({ versionNumber: 1 })],
    [
      "nested body",
      "post",
      "/api/v1/routines",
      routineBody({ version: { exercises: [] } }),
    ],
    ["params", "get", "/api/v1/routines/01?userId=1", undefined],
    ["missing query", "get", "/api/v1/routines", undefined],
    ["unknown query", "get", "/api/v1/routines?userId=1&page=1", undefined],
    ["repeated query", "get", "/api/v1/routines?userId=1&userId=2", undefined],
    [
      "version body",
      "post",
      "/api/v1/routines/1/versions",
      { userId: 1, version: { exercises: [plannedExercise()] } },
    ],
  ])(
    "returns validation details for invalid %s",
    async (_label, method, url, body) => {
      const pending = request(app)[method as "get" | "post"](url);
      const response =
        body === undefined ? await pending : await pending.send(body);
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: { issues: expect.any(Array) },
      });
    },
  );

  it("maps malformed JSON without exposing the request body", async () => {
    const sensitiveBody = '{"userId":1,"private":"marker"';
    const response = await request(app)
      .post("/api/v1/routines")
      .set("Content-Type", "application/json")
      .send(sensitiveBody);
    expect(response.status).toBe(400);
    expect(response.body.details).toEqual({
      source: "body",
      issues: [{ path: [], message: "Malformed JSON body" }],
    });
    expect(response.text).not.toContain("private");
    expect(JSON.stringify(logRecords)).not.toContain("marker");
  });

  it("rolls back an API aggregate after a midway database failure", async () => {
    temporary.database.exec(`
      CREATE TRIGGER api_fail_set
      BEFORE INSERT ON routine_sets
      BEGIN
        SELECT RAISE(ABORT, 'injected API failure');
      END;
    `);
    const response = await createRoutine();
    expect(response.status).toBe(500);
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

  it("rolls back through the API when seal-time active validation fails", async () => {
    temporary.database.exec(`
      CREATE TRIGGER api_deactivate_before_seal
      AFTER INSERT ON routine_sets
      BEGIN
        UPDATE exercises SET is_active = 0 WHERE id = 1;
      END;
    `);

    const response = await createRoutine();
    expect(response.status).toBe(500);
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

  it.each([
    ["patch routine", "patch", "/api/v1/routines/1"],
    ["delete routine", "delete", "/api/v1/routines/1"],
    ["get versions", "get", "/api/v1/routines/1/versions"],
    ["planned exercises", "post", "/api/v1/routine-exercises"],
    ["planned sets", "post", "/api/v1/routine-sets"],
    ["users", "get", "/api/v1/users"],
    ["workouts", "get", "/api/v1/workouts"],
  ])("does not expose %s", async (_label, method, url) => {
    const response =
      await request(app)[method as "delete" | "get" | "patch" | "post"](url);
    expect(response.status).toBe(404);
    expect(response.body.code).toBe("NOT_FOUND");
  });
});
