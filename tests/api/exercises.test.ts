import type { Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import {
  createMigratedTemporaryDatabase,
  type TemporaryDatabase,
} from "../helpers/database";
import { createCapturedLogger } from "../helpers/logger";

describe("exercise API", () => {
  let temporary: TemporaryDatabase;
  let app: Express;
  let logRecords: Array<Record<string, unknown>>;

  beforeEach(() => {
    temporary = createMigratedTemporaryDatabase();
    const { logger, records } = createCapturedLogger();
    logRecords = records;
    app = createApp({ database: temporary.database, logger });
  });

  afterEach(() => temporary.cleanup());

  async function createExercise(
    overrides: Record<string, unknown> = {},
  ): Promise<request.Response> {
    return request(app)
      .post("/api/v1/exercises")
      .send({ slug: "back-squat", name: "Back Squat", ...overrides });
  }

  it("creates an active exercise from only required fields", async () => {
    const response = await createExercise();

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: 1,
      slug: "back-squat",
      name: "Back Squat",
      movementPattern: null,
      equipment: null,
      description: null,
      techniqueNotes: null,
      safetyNotes: null,
      videoUrl: null,
      isActive: true,
      createdAt: expect.stringMatching(/Z$/),
      updatedAt: expect.stringMatching(/Z$/),
    });
    expect(response.body.updatedAt).toBe(response.body.createdAt);
  });

  it("creates and returns every supported field", async () => {
    const response = await createExercise({
      movementPattern: "Squat",
      equipment: "Barbell",
      description: "Lower-body compound exercise.",
      techniqueNotes: "Brace before descending.",
      safetyNotes: "Set the safety pins.",
      videoUrl: "https://example.com/squat",
      isActive: false,
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      movementPattern: "Squat",
      equipment: "Barbell",
      description: "Lower-body compound exercise.",
      techniqueNotes: "Brace before descending.",
      safetyNotes: "Set the safety pins.",
      videoUrl: "https://example.com/squat",
      isActive: false,
    });
  });

  it("returns a specific conflict for a duplicate inactive slug", async () => {
    await createExercise({ isActive: false });

    const response = await createExercise({ name: "Another Squat" });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      code: "EXERCISE_SLUG_CONFLICT",
      message: "An exercise with this slug already exists",
      details: null,
    });
    expect(
      temporary.database
        .prepare("SELECT COUNT(*) AS count FROM exercises")
        .get(),
    ).toEqual({ count: 1 });
  });

  it("lists active exercises by deterministic order by default", async () => {
    await createExercise({ slug: "beta", name: "beta" });
    await createExercise({ slug: "alpha-lower", name: "alpha" });
    await createExercise({ slug: "alpha-upper", name: "Alpha" });
    await createExercise({
      slug: "inactive",
      name: "Aardvark",
      isActive: false,
    });

    const response = await request(app).get("/api/v1/exercises");

    expect(response.status).toBe(200);
    expect(response.body.map(({ slug }: { slug: string }) => slug)).toEqual([
      "alpha-upper",
      "alpha-lower",
      "beta",
    ]);
  });

  it("includes inactive exercises only when explicitly requested", async () => {
    await createExercise();
    await createExercise({
      slug: "front-squat",
      name: "Front Squat",
      isActive: false,
    });

    const active = await request(app).get(
      "/api/v1/exercises?includeInactive=false",
    );
    const all = await request(app).get(
      "/api/v1/exercises?includeInactive=true",
    );

    expect(active.body).toHaveLength(1);
    expect(all.body).toHaveLength(2);
  });

  it("returns an inactive exercise directly", async () => {
    const created = await createExercise({ isActive: false });

    const response = await request(app).get(
      `/api/v1/exercises/${created.body.id}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.isActive).toBe(false);
  });

  it("patches only sent fields and allows metadata to be cleared", async () => {
    const created = await createExercise({
      equipment: "Barbell",
      description: "Original",
    });

    const response = await request(app)
      .patch(`/api/v1/exercises/${created.body.id}`)
      .send({ name: "Barbell Back Squat", description: null });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      slug: "back-squat",
      name: "Barbell Back Squat",
      equipment: "Barbell",
      description: null,
    });
    expect(response.body.createdAt).toBe(created.body.createdAt);
  });

  it("deactivates and reactivates without deleting", async () => {
    const created = await createExercise();
    const url = `/api/v1/exercises/${created.body.id}`;

    expect(
      (await request(app).patch(url).send({ isActive: false })).body,
    ).toMatchObject({ isActive: false });
    expect((await request(app).get("/api/v1/exercises")).body).toEqual([]);
    expect((await request(app).get(url)).status).toBe(200);
    expect(
      (await request(app).patch(url).send({ isActive: true })).body,
    ).toMatchObject({ isActive: true });
  });

  it.each([
    [
      "create body",
      "post",
      "/api/v1/exercises",
      { slug: "bad slug", name: "Squat" },
      "body",
    ],
    ["patch body", "patch", "/api/v1/exercises/1", {}, "body"],
    ["id params", "get", "/api/v1/exercises/01", undefined, "params"],
    [
      "list query",
      "get",
      "/api/v1/exercises?includeInactive=1",
      undefined,
      "query",
    ],
    [
      "unknown query",
      "get",
      "/api/v1/exercises/1?extra=true",
      undefined,
      "query",
    ],
  ])(
    "returns validation details for invalid %s",
    async (_label, method, url, body, source) => {
      const pending = request(app)[method as "get" | "patch" | "post"](url);
      const response =
        body === undefined ? await pending : await pending.send(body);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: { source, issues: expect.any(Array) },
      });
      expect(response.body.details.issues[0]).toEqual({
        path: expect.any(Array),
        message: expect.any(String),
      });
    },
  );

  it("rejects repeated includeInactive query parameters", async () => {
    const response = await request(app).get(
      "/api/v1/exercises?includeInactive=true&includeInactive=false",
    );

    expect(response.status).toBe(400);
    expect(response.body.details.source).toBe("query");
  });

  it("rejects planning fields without persisting them", async () => {
    const response = await createExercise({ sets: 3, reps: 10 });

    expect(response.status).toBe(400);
    expect(
      temporary.database
        .prepare("SELECT COUNT(*) AS count FROM exercises")
        .get(),
    ).toEqual({ count: 0 });
  });

  it("does not allow slug changes or mutate the existing exercise", async () => {
    const created = await createExercise();

    const response = await request(app)
      .patch(`/api/v1/exercises/${created.body.id}`)
      .send({ slug: "new-slug" });

    expect(response.status).toBe(400);
    expect(
      (await request(app).get(`/api/v1/exercises/${created.body.id}`)).body
        .slug,
    ).toBe("back-squat");
  });

  it("returns the resource-specific not-found error", async () => {
    const getResponse = await request(app).get("/api/v1/exercises/999");
    const patchResponse = await request(app)
      .patch("/api/v1/exercises/999")
      .send({ name: "Missing" });

    for (const response of [getResponse, patchResponse]) {
      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        code: "EXERCISE_NOT_FOUND",
        message: "Exercise not found",
        details: null,
      });
    }
  });

  it("maps malformed JSON to body validation without exposing internals", async () => {
    const response = await request(app)
      .post("/api/v1/exercises")
      .set("Content-Type", "application/json")
      .send('{"slug":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: {
        source: "body",
        issues: [{ path: [], message: "Malformed JSON body" }],
      },
    });
    expect(response.text).not.toContain("SyntaxError");
    expect(response.text).not.toContain('{"slug":');
    expect(JSON.stringify(logRecords)).not.toContain('{"slug":');
  });

  it("maps an oversized JSON body to validation without exposing it", async () => {
    const sensitiveMarker = "private-large-body-marker";
    const response = await request(app)
      .post("/api/v1/exercises")
      .send({
        slug: "back-squat",
        name: "Back Squat",
        description: sensitiveMarker.repeat(5000),
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: {
        source: "body",
        issues: [{ path: [], message: "JSON body exceeds the size limit" }],
      },
    });
    expect(response.text).not.toContain(sensitiveMarker);
    expect(response.text).not.toContain("entity.too.large");
    expect(JSON.stringify(logRecords)).not.toContain(sensitiveMarker);
    expect(JSON.stringify(logRecords)).not.toContain("entity.too.large");
  });

  it("does not expose DELETE and preserves the exercise", async () => {
    const created = await createExercise();

    const response = await request(app).delete(
      `/api/v1/exercises/${created.body.id}`,
    );

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("NOT_FOUND");
    expect(
      (await request(app).get(`/api/v1/exercises/${created.body.id}`)).status,
    ).toBe(200);
  });
});
