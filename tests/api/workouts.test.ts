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

function routineBody(userId = 1) {
  return {
    userId,
    name: `Strength ${userId}`,
    version: {
      name: "Initial",
      exercises: [
        {
          exerciseId: 1,
          position: 1,
          targetRpe: 7,
          sets: [
            {
              setNumber: 1,
              setType: "work",
              targetWeightKg: 80,
              targetRepsMin: 8,
              targetRepsMax: 10,
            },
          ],
        },
        {
          exerciseId: 2,
          position: 2,
          sets: [{ setNumber: 1, targetSeconds: 30 }],
        },
      ],
    },
  };
}

function resultBody(overrides: Record<string, unknown> = {}) {
  return {
    userId: 1,
    exerciseId: 1,
    position: 1,
    notes: "Actual result",
    sets: [
      {
        setNumber: 1,
        weightKg: 82.5,
        reps: 10,
        rpe: 8,
        completed: true,
      },
      {
        setNumber: 2,
        durationSeconds: 30,
        completed: true,
        painLevel: 0,
      },
      {
        setNumber: 3,
        completed: false,
        painLevel: 4,
        painArea: "knee",
        notes: "Skipped",
      },
    ],
    ...overrides,
  };
}

describe("workout API", () => {
  let temporary: TemporaryDatabase;
  let app: Express;
  let logRecords: Array<Record<string, unknown>>;
  let routineVersionId: number;
  let plannedIds: number[];

  beforeEach(async () => {
    temporary = createMigratedTemporaryDatabase();
    insertUser(temporary.database);
    insertUser(temporary.database, {
      id: 2,
      email: "other@example.com",
      displayName: "Other",
    });
    insertExercise(temporary.database);
    insertExercise(temporary.database, {
      id: 2,
      slug: "plank",
      name: "Plank",
    });
    insertExercise(temporary.database, {
      id: 3,
      slug: "front-squat",
      name: "Front Squat",
    });
    const captured = createCapturedLogger();
    logRecords = captured.records;
    app = createApp({ database: temporary.database, logger: captured.logger });
    const routine = await request(app)
      .post("/api/v1/routines")
      .send(routineBody());
    expect(routine.status).toBe(201);
    routineVersionId = routine.body.version.id;
    plannedIds = routine.body.version.exercises.map(
      ({ id }: { id: number }) => id,
    );
  });

  afterEach(() => temporary.cleanup());

  function startBody(overrides: Record<string, unknown> = {}) {
    return {
      userId: 1,
      routineVersionId,
      startedAt: "2026-08-11T12:00:00+02:00",
      ...overrides,
    };
  }

  async function start(overrides: Record<string, unknown> = {}) {
    return request(app).post("/api/v1/workouts").send(startBody(overrides));
  }

  function planningSnapshot(): string {
    return JSON.stringify(
      Object.fromEntries(
        [
          "routines",
          "routine_versions",
          "routine_exercises",
          "routine_sets",
        ].map((table) => [
          table,
          temporary.database
            .prepare(`SELECT * FROM ${table} ORDER BY id`)
            .all(),
        ]),
      ),
    );
  }

  it("starts an in-progress workout and returns exact complete planning", async () => {
    const response = await start();
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: 1,
      userId: 1,
      routineVersionId,
      startedAt: "2026-08-11T10:00:00.000Z",
      completedAt: null,
      durationSeconds: null,
      status: "in_progress",
      planning: {
        name: "Strength 1",
        version: {
          id: routineVersionId,
          versionNumber: 1,
          exercises: [
            {
              id: plannedIds[0],
              position: 1,
              sets: [{ setNumber: 1, targetRepsMin: 8 }],
            },
            {
              id: plannedIds[1],
              position: 2,
              sets: [{ setNumber: 1, targetSeconds: 30 }],
            },
          ],
        },
      },
      results: [],
    });
  });

  it("requires an owned routineVersionId and does not allow free workouts", async () => {
    const foreignRoutine = await request(app)
      .post("/api/v1/routines")
      .send(routineBody(2));
    for (const body of [
      startBody({ routineVersionId: 999 }),
      startBody({ routineVersionId: foreignRoutine.body.version.id }),
    ]) {
      const response = await request(app).post("/api/v1/workouts").send(body);
      expect(response.status).toBe(404);
      expect(response.body.code).toBe("ROUTINE_VERSION_NOT_FOUND");
    }
    const free = await request(app)
      .post("/api/v1/workouts")
      .send({ userId: 1, startedAt: "2026-08-11T10:00:00Z" });
    expect(free.status).toBe(400);
    expect(free.body.code).toBe("VALIDATION_ERROR");
    expect(
      temporary.database
        .prepare("SELECT COUNT(*) AS count FROM workout_sessions")
        .get(),
    ).toEqual({ count: 0 });
  });

  it("records three ordered sets and an explicit exercise substitution", async () => {
    const workout = await start();
    const response = await request(app)
      .put(`/api/v1/workouts/${workout.body.id}/exercises/${plannedIds[0]}`)
      .send(resultBody({ exerciseId: 3 }));
    expect(response.status).toBe(200);
    expect(response.body.results[0]).toMatchObject({
      routineExerciseId: plannedIds[0],
      exerciseId: 3,
      plannedExercise: {
        id: plannedIds[0],
        exerciseId: 1,
        exercise: { id: 1, name: "Back Squat" },
      },
      performedExercise: { id: 3, name: "Front Squat" },
      sets: [
        { setNumber: 1, weightKg: 82.5, reps: 10, completed: true },
        { setNumber: 2, durationSeconds: 30, completed: true },
        {
          setNumber: 3,
          completed: false,
          painLevel: 4,
          painArea: "knee",
        },
      ],
    });
  });

  it("retries PUT idempotently and completely replaces omitted sets with stable ids", async () => {
    const workout = await start();
    const url = `/api/v1/workouts/${workout.body.id}/exercises/${plannedIds[0]}`;
    const first = await request(app).put(url).send(resultBody());
    const repeated = await request(app).put(url).send(resultBody());
    expect(repeated.body.results[0]).toEqual(first.body.results[0]);

    const replacement = await request(app)
      .put(url)
      .send(
        resultBody({
          notes: null,
          sets: [
            { setNumber: 1, reps: 8, completed: true },
            { setNumber: 4, durationSeconds: 45, completed: true },
          ],
        }),
      );
    expect(replacement.body.results[0].id).toBe(first.body.results[0].id);
    expect(replacement.body.results[0].sets).toMatchObject([
      { id: first.body.results[0].sets[0].id, setNumber: 1, reps: 8 },
      { setNumber: 4, durationSeconds: 45 },
    ]);
    expect(
      replacement.body.results[0].sets.some(
        ({ setNumber }: { setNumber: number }) => setNumber === 2,
      ),
    ).toBe(false);
  });

  it("maps wrong planning, inactive actual exercise, and actual-position conflicts", async () => {
    const workout = await start();
    const wrong = await request(app)
      .put(`/api/v1/workouts/${workout.body.id}/exercises/999`)
      .send(resultBody());
    expect(wrong.status).toBe(404);
    expect(wrong.body.code).toBe("ROUTINE_EXERCISE_NOT_FOUND");

    temporary.database
      .prepare("UPDATE exercises SET is_active = 0 WHERE id = 3")
      .run();
    const inactive = await request(app)
      .put(`/api/v1/workouts/${workout.body.id}/exercises/${plannedIds[0]}`)
      .send(resultBody({ exerciseId: 3 }));
    expect(inactive.status).toBe(409);
    expect(inactive.body.code).toBe("EXERCISE_INACTIVE");

    await request(app)
      .put(`/api/v1/workouts/${workout.body.id}/exercises/${plannedIds[0]}`)
      .send(resultBody());
    const conflict = await request(app)
      .put(`/api/v1/workouts/${workout.body.id}/exercises/${plannedIds[1]}`)
      .send(resultBody({ exerciseId: 2 }));
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("WORKOUT_POSITION_CONFLICT");
  });

  it("completes with omitted planning and incomplete sets, derives duration, then blocks writes", async () => {
    const workout = await start();
    await request(app)
      .put(`/api/v1/workouts/${workout.body.id}/exercises/${plannedIds[0]}`)
      .send(resultBody({ sets: [{ setNumber: 1, completed: false }] }));
    const completed = await request(app)
      .post(`/api/v1/workouts/${workout.body.id}/complete`)
      .send({
        userId: 1,
        completedAt: "2026-08-11T11:30:00Z",
        overallRpe: 8.5,
        notes: "Done",
      });
    expect(completed.status).toBe(200);
    expect(completed.body).toMatchObject({
      status: "completed",
      completedAt: "2026-08-11T11:30:00.000Z",
      durationSeconds: 5400,
      overallRpe: 8.5,
      notes: "Done",
      results: [{ sets: [{ completed: false }] }],
    });
    const late = await request(app)
      .put(`/api/v1/workouts/${workout.body.id}/exercises/${plannedIds[1]}`)
      .send(resultBody({ exerciseId: 2, position: 2 }));
    expect(late.status).toBe(409);
    expect(late.body.code).toBe("WORKOUT_NOT_IN_PROGRESS");
    const cancel = await request(app)
      .post(`/api/v1/workouts/${workout.body.id}/cancel`)
      .send({ userId: 1 });
    expect(cancel.status).toBe(409);
    expect(cancel.body.code).toBe("WORKOUT_NOT_IN_PROGRESS");
  });

  it("rejects completion before start without changing state", async () => {
    const workout = await start();
    const response = await request(app)
      .post(`/api/v1/workouts/${workout.body.id}/complete`)
      .send({ userId: 1, completedAt: "2026-08-11T09:59:59.999Z" });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("WORKOUT_COMPLETION_TIME_INVALID");
    const detail = await request(app).get(
      `/api/v1/workouts/${workout.body.id}?userId=1`,
    );
    expect(detail.body.status).toBe("in_progress");
  });

  it("cancels without terminal completion data and cannot reopen", async () => {
    const workout = await start();
    const cancelled = await request(app)
      .post(`/api/v1/workouts/${workout.body.id}/cancel`)
      .send({ userId: 1 });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({
      status: "cancelled",
      completedAt: null,
      durationSeconds: null,
      overallRpe: null,
      notes: null,
    });
    const repeated = await request(app)
      .post(`/api/v1/workouts/${workout.body.id}/cancel`)
      .send({ userId: 1 });
    expect(repeated.status).toBe(409);
    expect(repeated.body.code).toBe("WORKOUT_NOT_IN_PROGRESS");
  });

  it("lists only the user newest first and filters status", async () => {
    const first = await start({ startedAt: "2026-08-11T10:00:00Z" });
    const second = await start({ startedAt: "2026-08-11T11:00:00Z" });
    await request(app)
      .post(`/api/v1/workouts/${first.body.id}/cancel`)
      .send({ userId: 1 });
    const list = await request(app).get("/api/v1/workouts?userId=1");
    expect(list.status).toBe(200);
    expect(list.body.map(({ id }: { id: number }) => id)).toEqual([
      second.body.id,
      first.body.id,
    ]);
    expect(list.body[0]).toMatchObject({
      routine: { name: "Strength 1" },
      routineVersion: { id: routineVersionId, versionNumber: 1 },
    });
    const filtered = await request(app).get(
      "/api/v1/workouts?userId=1&status=cancelled",
    );
    expect(filtered.body.map(({ id }: { id: number }) => id)).toEqual([
      first.body.id,
    ]);
    expect((await request(app).get("/api/v1/workouts?userId=2")).body).toEqual(
      [],
    );
  });

  it("hides foreign workout ownership for detail and every write", async () => {
    const workout = await start();
    const responses = [
      await request(app).get(`/api/v1/workouts/${workout.body.id}?userId=2`),
      await request(app)
        .put(`/api/v1/workouts/${workout.body.id}/exercises/${plannedIds[0]}`)
        .send(resultBody({ userId: 2 })),
      await request(app)
        .post(`/api/v1/workouts/${workout.body.id}/complete`)
        .send({ userId: 2, completedAt: "2026-08-11T11:00:00Z" }),
      await request(app)
        .post(`/api/v1/workouts/${workout.body.id}/cancel`)
        .send({ userId: 2 }),
    ];
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body.code).toBe("WORKOUT_NOT_FOUND");
    }
  });

  it("keeps plan and execution separately readable after catalog deactivation", async () => {
    const workout = await start();
    await request(app)
      .put(`/api/v1/workouts/${workout.body.id}/exercises/${plannedIds[0]}`)
      .send(resultBody({ exerciseId: 3 }));
    await request(app).patch("/api/v1/exercises/1").send({ isActive: false });
    await request(app).patch("/api/v1/exercises/3").send({ isActive: false });
    const detail = await request(app).get(
      `/api/v1/workouts/${workout.body.id}?userId=1`,
    );
    expect(detail.status).toBe(200);
    expect(detail.body.planning.version.exercises[0]).toMatchObject({
      id: plannedIds[0],
      exercise: { id: 1, isActive: false },
    });
    expect(detail.body.results[0]).toMatchObject({
      routineExerciseId: plannedIds[0],
      plannedExercise: { exercise: { id: 1, isActive: false } },
      performedExercise: { id: 3, isActive: false },
    });
  });

  it.each([
    ["missing start version", "post", "/api/v1/workouts", { userId: 1 }],
    ["noncanonical id", "get", "/api/v1/workouts/01?userId=1", undefined],
    ["missing list user", "get", "/api/v1/workouts", undefined],
    [
      "unknown list query",
      "get",
      "/api/v1/workouts?userId=1&page=1",
      undefined,
    ],
    [
      "repeated list query",
      "get",
      "/api/v1/workouts?userId=1&userId=2",
      undefined,
    ],
    [
      "unknown status",
      "get",
      "/api/v1/workouts?userId=1&status=done",
      undefined,
    ],
    [
      "managed result id",
      "put",
      "/api/v1/workouts/1/exercises/1",
      resultBody({ id: 1 }),
    ],
    [
      "duplicate sets",
      "put",
      "/api/v1/workouts/1/exercises/1",
      resultBody({
        sets: [
          { setNumber: 1, completed: true },
          { setNumber: 1, completed: false },
        ],
      }),
    ],
    [
      "cancel extra field",
      "post",
      "/api/v1/workouts/1/cancel",
      { userId: 1, notes: null },
    ],
  ])("returns validation details for %s", async (_label, method, url, body) => {
    const pending = request(app)[method as "get" | "post" | "put"](url);
    const response =
      body === undefined ? await pending : await pending.send(body);
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: { issues: expect.any(Array) },
    });
  });

  it("maps malformed JSON without logging body contents", async () => {
    const response = await request(app)
      .post("/api/v1/workouts")
      .set("Content-Type", "application/json")
      .send('{"userId":1,"secret":"workout-marker"');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(response.text).not.toContain("workout-marker");
    expect(JSON.stringify(logRecords)).not.toContain("workout-marker");
  });

  it("rolls back a failed result and leaves routine planning byte-for-byte unchanged", async () => {
    const workout = await start();
    const before = planningSnapshot();
    temporary.database.exec(`
      CREATE TRIGGER api_fail_workout_set
      BEFORE INSERT ON workout_sets
      WHEN NEW.set_number = 2
      BEGIN
        SELECT RAISE(ABORT, 'injected API workout failure');
      END;
    `);
    const response = await request(app)
      .put(`/api/v1/workouts/${workout.body.id}/exercises/${plannedIds[0]}`)
      .send(resultBody());
    expect(response.status).toBe(500);
    expect(
      temporary.database
        .prepare("SELECT COUNT(*) AS count FROM workout_exercises")
        .get(),
    ).toEqual({ count: 0 });
    expect(planningSnapshot()).toBe(before);
  });

  it("does not expose out-of-scope workout mutation routes", async () => {
    const workout = await start();
    for (const [method, url] of [
      ["patch", `/api/v1/workouts/${workout.body.id}`],
      ["delete", `/api/v1/workouts/${workout.body.id}`],
      ["post", `/api/v1/workouts/${workout.body.id}/sets`],
      ["patch", `/api/v1/workout-sets/1`],
    ] as const) {
      const response = await request(app)[method](url);
      expect(response.status).toBe(404);
      expect(response.body.code).toBe("NOT_FOUND");
    }
  });
});
