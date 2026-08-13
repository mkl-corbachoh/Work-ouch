import type { Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import type { AuthProvider } from "../../src/modules/auth/auth.provider";
import type { ExternalIdentity } from "../../src/modules/auth/auth.types";
import {
  createMigratedTemporaryDatabase,
  type TemporaryDatabase,
} from "../helpers/database";
import { insertExercise } from "../helpers/fixtures";
import { createCapturedLogger } from "../helpers/logger";

class FakeProvider implements AuthProvider {
  constructor(private readonly identities: Record<string, ExternalIdentity>) {}

  async verify(token: string): Promise<ExternalIdentity> {
    const identity = this.identities[token];
    if (!identity) throw new Error("invalid token");
    return identity;
  }
}

describe("authentication API", () => {
  let temporary: TemporaryDatabase;
  let app: Express;

  beforeEach(() => {
    temporary = createMigratedTemporaryDatabase();
    const provider = new FakeProvider({
      alice: {
        provider: "supabase",
        subject: "alice-sub",
        email: "alice@example.com",
      },
      bob: {
        provider: "supabase",
        subject: "bob-sub",
        email: "bob@example.com",
      },
    });
    app = createApp({
      database: temporary.database,
      logger: createCapturedLogger().logger,
      authProvider: provider,
    });
  });

  afterEach(() => temporary.cleanup());

  it("rejects protected requests without authentication", async () => {
    const response = await request(app).get("/api/v1/me");
    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      code: "AUTHENTICATION_REQUIRED",
      message: "Authentication required",
      details: null,
    });
  });

  it("bootstraps idempotently and resolves the current user", async () => {
    const first = await request(app)
      .post("/api/v1/auth/bootstrap")
      .set("Authorization", "Bearer alice");
    const second = await request(app)
      .post("/api/v1/auth/bootstrap")
      .set("Authorization", "Bearer alice");
    const me = await request(app)
      .get("/api/v1/me")
      .set("Authorization", "Bearer alice");

    expect(first.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(me.body).toEqual(first.body);
    expect(
      temporary.database.prepare("SELECT COUNT(*) AS count FROM users").get(),
    ).toEqual({ count: 1 });
    expect(
      temporary.database
        .prepare("SELECT COUNT(*) AS count FROM user_identities")
        .get(),
    ).toEqual({ count: 1 });
  });

  it("rejects forged owners and hides another user's routines", async () => {
    insertExercise(temporary.database);
    await request(app)
      .post("/api/v1/auth/bootstrap")
      .set("Authorization", "Bearer alice");
    await request(app)
      .post("/api/v1/auth/bootstrap")
      .set("Authorization", "Bearer bob");

    const forged = await request(app)
      .post("/api/v1/routines")
      .set("Authorization", "Bearer alice")
      .send({
        userId: 2,
        name: "Forged owner",
        version: {
          exercises: [
            {
              exerciseId: 1,
              position: 1,
              sets: [{ setNumber: 1, targetRepsMin: 8, targetRepsMax: 8 }],
            },
          ],
        },
      });
    expect(forged.status).toBe(400);

    const created = await request(app)
      .post("/api/v1/routines")
      .set("Authorization", "Bearer alice")
      .send({
        name: "Alice routine",
        version: {
          exercises: [
            {
              exerciseId: 1,
              position: 1,
              sets: [{ setNumber: 1, targetRepsMin: 8, targetRepsMax: 8 }],
            },
          ],
        },
      });
    expect(created.status).toBe(201);
    expect(created.body.userId).toBe(1);

    const otherUser = await request(app)
      .get(`/api/v1/routines/${created.body.id}`)
      .set("Authorization", "Bearer bob");
    expect(otherUser.status).toBe(404);
  });
});
