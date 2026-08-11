import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase, type SqliteDatabase } from "../../src/db/connection";
import {
  bootstrapServer,
  type RunningServer,
  startServer,
} from "../../src/server";
import { createCapturedLogger } from "../helpers/logger";

describe("server lifecycle", () => {
  let directory: string;
  let migrationsDirectory: string;
  let running: RunningServer | undefined;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "work-ouch-server-"));
    migrationsDirectory = join(directory, "migrations");
    mkdirSync(migrationsDirectory);
  });

  afterEach(async () => {
    await running?.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("listens on all interfaces after opening and migrating SQLite", async () => {
    const { logger } = createCapturedLogger();
    running = await startServer(
      {
        databasePath: join(directory, "training.db"),
        port: 0,
        nodeEnv: "test",
      },
      { logger, migrationsDirectory },
    );

    const address = running.httpServer.address() as AddressInfo;
    expect(address.address).toBe("0.0.0.0");
    expect(
      running.database
        .prepare(
          "SELECT name FROM sqlite_master WHERE name = 'schema_migrations'",
        )
        .get(),
    ).toEqual({ name: "schema_migrations" });

    const response = await request(`http://127.0.0.1:${address.port}`).get(
      "/health",
    );
    expect(response.status).toBe(200);
  });

  it("validates configuration before opening SQLite", async () => {
    const databaseFactory = vi.fn<(path: string) => SqliteDatabase>();

    await expect(
      bootstrapServer(
        {
          DATABASE_PATH: join(directory, "training.db"),
          PORT: "0",
          NODE_ENV: "test",
        },
        { databaseFactory, migrationsDirectory },
      ),
    ).rejects.toThrow("PORT");
    expect(databaseFactory).not.toHaveBeenCalled();
  });

  it("applies real migrations at startup without running explicit seeds", async () => {
    const { logger } = createCapturedLogger();
    running = await startServer(
      {
        databasePath: join(directory, "training.db"),
        port: 0,
        nodeEnv: "test",
      },
      { logger },
    );

    expect(
      running.database
        .prepare("SELECT COUNT(*) AS count FROM body_metric_types")
        .get(),
    ).toEqual({ count: 0 });
  });

  it("does not listen and closes SQLite when a migration fails", async () => {
    writeFileSync(join(migrationsDirectory, "0001_broken.sql"), "INVALID SQL;");
    let database: SqliteDatabase | undefined;

    await expect(
      startServer(
        {
          databasePath: join(directory, "training.db"),
          port: 0,
          nodeEnv: "test",
        },
        {
          migrationsDirectory,
          databaseFactory: (path) => {
            database = openDatabase(path);
            return database;
          },
        },
      ),
    ).rejects.toThrow();
    expect(database?.open).toBe(false);
  });

  it("closes the HTTP server before SQLite and is idempotent", async () => {
    running = await startServer(
      {
        databasePath: join(directory, "training.db"),
        port: 0,
        nodeEnv: "test",
      },
      { migrationsDirectory },
    );
    const database = running.database;

    await running.close();
    await running.close();

    expect(running.httpServer.listening).toBe(false);
    expect(database.open).toBe(false);
  });
});
