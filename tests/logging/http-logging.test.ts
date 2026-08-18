import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../../src/shared/http-errors";
import { requestLogger } from "../../src/shared/request-logger";
import { createCapturedLogger } from "../helpers/logger";

describe("HTTP logging", () => {
  it("records method, path, status and duration without query strings or bodies", async () => {
    const { logger, records } = createCapturedLogger();
    const app = express();
    app.use(requestLogger(logger));
    app.get("/logged", (_request, response) => response.status(204).send());

    await request(app)
      .get("/logged?secret=query-value")
      .set("Authorization", "Bearer authorization-value")
      .send({ secret: "body-value" });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      method: "GET",
      path: "/logged",
      status: 204,
      msg: "HTTP request completed",
    });
    expect(records[0]?.durationMs).toEqual(expect.any(Number));
    expect(JSON.stringify(records[0])).not.toContain("query-value");
    expect(JSON.stringify(records[0])).not.toContain("body-value");
    expect(JSON.stringify(records[0])).not.toContain("authorization-value");
  });

  it("records unexpected error diagnostics without exposing them in the response", async () => {
    const { logger, records } = createCapturedLogger();
    const app = express();
    app.use(requestLogger(logger));
    app.get("/failure", () => {
      throw new Error("diagnostic-only message");
    });
    app.use(errorHandler(logger));

    const response = await request(app).get("/failure");

    expect(response.text).not.toContain("diagnostic-only message");
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      method: "GET",
      path: "/failure",
      msg: "HTTP request failed",
    });
    expect(JSON.stringify(records[0])).toContain("diagnostic-only message");
    expect(records[1]).toMatchObject({ status: 500, path: "/failure" });
  });
});
