import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { closeDatabase } from "../../src/db/connection";
import { errorHandler, HttpError } from "../../src/shared/http-errors";
import {
  createTemporaryDatabase,
  type TemporaryDatabase,
} from "../helpers/database";
import { createCapturedLogger } from "../helpers/logger";

describe("base API", () => {
  let temporary: TemporaryDatabase | undefined;

  afterEach(() => temporary?.cleanup());

  it("reports a healthy SQLite connection", async () => {
    temporary = createTemporaryDatabase();
    const { logger } = createCapturedLogger();

    const response = await request(
      createApp({ database: temporary.database, logger }),
    ).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("returns 503 when SQLite is unavailable", async () => {
    temporary = createTemporaryDatabase();
    closeDatabase(temporary.database);
    const { logger } = createCapturedLogger();

    const response = await request(
      createApp({ database: temporary.database, logger }),
    ).get("/health");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      code: "DATABASE_UNAVAILABLE",
      message: "Database is unavailable",
      details: null,
    });
  });

  it("returns the common error shape for unknown routes", async () => {
    temporary = createTemporaryDatabase();
    const { logger } = createCapturedLogger();

    const response = await request(
      createApp({ database: temporary.database, logger }),
    ).get("/api/v1/unknown");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      code: "NOT_FOUND",
      message: "Route not found",
      details: null,
    });
  });

  it("uses status, code, message and details from controlled errors", async () => {
    const { logger } = createCapturedLogger();
    const app = express();
    app.get("/controlled", () => {
      throw new HttpError(409, "CONFLICT", "Controlled conflict", {
        field: "name",
      });
    });
    app.use(errorHandler(logger));

    const response = await request(app).get("/controlled");

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      code: "CONFLICT",
      message: "Controlled conflict",
      details: { field: "name" },
    });
  });

  it("does not expose unexpected error internals", async () => {
    const { logger } = createCapturedLogger();
    const app = express();
    app.get("/unexpected", () => {
      throw new Error("SQL failed at /private/training.db");
    });
    app.use(errorHandler(logger));

    const response = await request(app).get("/unexpected");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
      details: null,
    });
    expect(response.text).not.toContain("SQL failed");
    expect(response.text).not.toContain("/private");
    expect(response.text).not.toContain("stack");
  });
});
