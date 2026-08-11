import type { Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import {
  createMigratedTemporaryDatabase,
  type TemporaryDatabase,
} from "../helpers/database";
import { insertUser } from "../helpers/fixtures";
import { createCapturedLogger } from "../helpers/logger";

describe("body tracking API", () => {
  let temporary: TemporaryDatabase;
  let app: Express;
  let logRecords: Array<Record<string, unknown>>;

  beforeEach(async () => {
    temporary = createMigratedTemporaryDatabase();
    insertUser(temporary.database);
    insertUser(temporary.database, {
      id: 2,
      email: "other@example.com",
      displayName: "Other",
    });
    const captured = createCapturedLogger();
    logRecords = captured.records;
    app = createApp({ database: temporary.database, logger: captured.logger });
    for (const body of [
      { code: "weight_kg", name: "Weight", unit: "kg" },
      { code: "bmi", name: "Body mass index" },
      { code: "body_fat_pct", name: "Body fat", unit: "%" },
    ]) {
      const response = await request(app)
        .post("/api/v1/body-metric-types")
        .send(body);
      expect(response.status).toBe(201);
    }
  });

  afterEach(() => temporary.cleanup());

  function measurementBody(
    metrics: Record<string, unknown> = { weight_kg: 72.4 },
    overrides: Record<string, unknown> = {},
  ) {
    return {
      measuredAt: "2026-08-11T12:00:00+02:00",
      source: "Scale",
      notes: "Morning",
      metrics,
      ...overrides,
    };
  }

  async function createMeasurement(
    userId = 1,
    body: Record<string, unknown> = measurementBody(),
  ) {
    return request(app).post(`/api/v1/users/${userId}/measurements`).send(body);
  }

  function counts() {
    return {
      measurements: temporary.database
        .prepare("SELECT COUNT(*) AS count FROM body_measurements")
        .get(),
      values: temporary.database
        .prepare("SELECT COUNT(*) AS count FROM body_measurement_values")
        .get(),
    };
  }

  it("lists and creates global metric types with the exact public contract", async () => {
    const created = await request(app).post("/api/v1/body-metric-types").send({
      code: "custom_score",
      name: " Custom score ",
      unit: " points ",
      description: " Operator metric ",
    });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      id: 4,
      code: "custom_score",
      name: "Custom score",
      unit: "points",
      description: "Operator metric",
    });
    const list = await request(app).get("/api/v1/body-metric-types");
    expect(list.status).toBe(200);
    expect(list.body.map(({ code }: { code: string }) => code)).toEqual([
      "bmi",
      "body_fat_pct",
      "custom_score",
      "weight_kg",
    ]);

    const conflict = await request(app)
      .post("/api/v1/body-metric-types")
      .send({ code: "custom_score", name: "Other" });
    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual({
      code: "BODY_METRIC_TYPE_CODE_CONFLICT",
      message: "A body metric type with this code already exists",
      details: null,
    });
  });

  it("creates one or many metrics atomically with UTC and units", async () => {
    const one = await createMeasurement();
    expect(one.status).toBe(201);
    expect(one.body).toMatchObject({
      id: 1,
      userId: 1,
      measuredAt: "2026-08-11T10:00:00.000Z",
      source: "Scale",
      notes: "Morning",
      metrics: { weight_kg: { value: 72.4, unit: "kg" } },
    });
    expect(one.body.createdAt).toMatch(/\.\d{3}Z$/);

    const many = await createMeasurement(
      1,
      measurementBody({ weight_kg: 73, bmi: 22.7, body_fat_pct: 15.2 }),
    );
    expect(many.status).toBe(201);
    expect(many.body.metrics).toEqual({
      bmi: { value: 22.7, unit: null },
      body_fat_pct: { value: 15.2, unit: "%" },
      weight_kg: { value: 73, unit: "kg" },
    });
    expect(JSON.stringify(many.body)).not.toMatch(/metricTypeId|valueId/);
  });

  it("rejects an unknown code without a header or partial values", async () => {
    const response = await createMeasurement(
      1,
      measurementBody({ weight_kg: 72, unknown_metric: 1 }),
    );
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      code: "BODY_METRIC_TYPE_NOT_FOUND",
      message: "Body metric type not found",
      details: null,
    });
    expect(counts()).toEqual({
      measurements: { count: 0 },
      values: { count: 0 },
    });
  });

  it("rejects noncanonical metric keys without trimming collisions or writes", async () => {
    const response = await createMeasurement(
      1,
      measurementBody({ weight_kg: 72, " weight_kg ": 99 }),
    );
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(counts()).toEqual({
      measurements: { count: 0 },
      values: { count: 0 },
    });
  });

  it("rejects a nonexistent user and preserves atomicity", async () => {
    const response = await createMeasurement(999);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      code: "USER_NOT_FOUND",
      message: "User not found",
      details: null,
    });
    expect(counts().measurements).toEqual({ count: 0 });
    const list = await request(app).get("/api/v1/users/999/measurements");
    expect(list.status).toBe(404);
    expect(list.body.code).toBe("USER_NOT_FOUND");
  });

  it("uses a newly created metric immediately without a migration", async () => {
    const type = await request(app)
      .post("/api/v1/body-metric-types")
      .send({ code: "balance_score", name: "Balance", unit: "points" });
    expect(type.status).toBe(201);
    const measurement = await createMeasurement(
      1,
      measurementBody({ balance_score: -2.5 }),
    );
    expect(measurement.status).toBe(201);
    expect(measurement.body.metrics).toEqual({
      balance_score: { value: -2.5, unit: "points" },
    });
  });

  it("lists only the path owner newest first and breaks equal times by ID", async () => {
    const oldest = await createMeasurement(
      1,
      measurementBody(
        { weight_kg: 70 },
        {
          measuredAt: "2026-08-10T10:00:00Z",
        },
      ),
    );
    const newestFirst = await createMeasurement(1);
    const newestSecond = await createMeasurement(1);
    await createMeasurement(
      2,
      measurementBody(
        { weight_kg: 99 },
        {
          measuredAt: "2026-08-12T10:00:00Z",
        },
      ),
    );

    const list = await request(app).get("/api/v1/users/1/measurements");
    expect(list.status).toBe(200);
    expect(list.body.map(({ id }: { id: number }) => id)).toEqual([
      newestSecond.body.id,
      newestFirst.body.id,
      oldest.body.id,
    ]);
    const other = await request(app).get("/api/v1/users/2/measurements");
    expect(other.body).toHaveLength(1);
  });

  it("returns owned detail and hides foreign ownership with the same 404", async () => {
    const measurement = await createMeasurement(1);
    const detail = await request(app).get(
      `/api/v1/users/1/measurements/${measurement.body.id}`,
    );
    expect(detail.status).toBe(200);
    expect(detail.body).toEqual(measurement.body);

    for (const url of [
      `/api/v1/users/2/measurements/${measurement.body.id}`,
      "/api/v1/users/1/measurements/999",
      `/api/v1/users/999/measurements/${measurement.body.id}`,
    ]) {
      const hidden = await request(app).get(url);
      expect(hidden.status).toBe(404);
      expect(hidden.body).toEqual({
        code: "BODY_MEASUREMENT_NOT_FOUND",
        message: "Body measurement not found",
        details: null,
      });
    }
  });

  it.each([
    ["empty metrics", "/api/v1/users/1/measurements", measurementBody({})],
    [
      "nonfinite serialized as null",
      "/api/v1/users/1/measurements",
      measurementBody({ weight_kg: Number.NaN }),
    ],
    [
      "timestamp without zone",
      "/api/v1/users/1/measurements",
      measurementBody({ weight_kg: 72 }, { measuredAt: "2026-08-11T10:00:00" }),
    ],
    [
      "unknown body field",
      "/api/v1/users/1/measurements",
      { ...measurementBody(), valueId: 1 },
    ],
    ["noncanonical user", "/api/v1/users/01/measurements", measurementBody()],
    ["unsafe ID", "/api/v1/users/1/measurements/9007199254740992", undefined],
  ])("returns validation details for %s", async (_label, url, body) => {
    const response = body
      ? await request(app).post(url).send(body)
      : await request(app).get(url);
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: { issues: expect.any(Array) },
    });
  });

  it("rejects unknown and repeated queries", async () => {
    for (const url of [
      "/api/v1/body-metric-types?page=1",
      "/api/v1/users/1/measurements?page=1",
      "/api/v1/users/1/measurements?page=1&page=2",
    ]) {
      const response = await request(app).get(url);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
    }
  });

  it("rolls back a failure after the first value", async () => {
    temporary.database.exec(`
      CREATE TRIGGER api_fail_second_body_value
      BEFORE INSERT ON body_measurement_values
      WHEN NEW.metric_type_id = 3
      BEGIN
        SELECT RAISE(ABORT, 'injected API body value failure');
      END;
    `);
    const response = await createMeasurement(
      1,
      measurementBody({ weight_kg: 72, body_fat_pct: 15 }),
    );
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
      details: null,
    });
    expect(counts()).toEqual({
      measurements: { count: 0 },
      values: { count: 0 },
    });
  });

  it("maps malformed JSON without logging body contents", async () => {
    const response = await request(app)
      .post("/api/v1/users/1/measurements")
      .set("Content-Type", "application/json")
      .send('{"secret":"body-marker"');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(response.text).not.toContain("body-marker");
    expect(JSON.stringify(logRecords)).not.toContain("body-marker");
  });

  it("does not expose mutation, user, import, analytics, or internal routes", async () => {
    const measurement = await createMeasurement();
    for (const [method, url, status, code] of [
      ["patch", "/api/v1/body-metric-types/1", 404, "NOT_FOUND"],
      ["delete", "/api/v1/body-metric-types/1", 404, "NOT_FOUND"],
      [
        "patch",
        `/api/v1/users/1/measurements/${measurement.body.id}`,
        404,
        "NOT_FOUND",
      ],
      [
        "delete",
        `/api/v1/users/1/measurements/${measurement.body.id}`,
        404,
        "NOT_FOUND",
      ],
      ["post", "/api/v1/users", 404, "NOT_FOUND"],
      ["post", "/api/v1/users/1/measurements/import", 404, "NOT_FOUND"],
      [
        "get",
        "/api/v1/users/1/measurements/analytics",
        400,
        "VALIDATION_ERROR",
      ],
      ["get", "/api/v1/body-measurement-values/1", 404, "NOT_FOUND"],
    ] as const) {
      const response = await request(app)[method](url);
      expect(response.status).toBe(status);
      expect(response.body.code).toBe(code);
    }
  });
});
