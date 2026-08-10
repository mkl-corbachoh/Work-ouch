import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import type { Logger } from "pino";
import { createApp } from "./app";
import type { AppConfig } from "./config";
import { readConfig } from "./config";
import {
  closeDatabase,
  openDatabase,
  type SqliteDatabase,
} from "./db/connection";
import { runMigrations } from "./db/migrations";
import { createLogger } from "./shared/logger";

export type ServerOptions = {
  logger?: Logger;
  migrationsDirectory?: string;
  databaseFactory?: (databasePath: string) => SqliteDatabase;
};

export type RunningServer = {
  httpServer: Server;
  database: SqliteDatabase;
  close: () => Promise<void>;
};

function listen(httpServer: Server, port: number): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const onError = (error: Error) => reject(error);
    httpServer.once("error", onError);
    httpServer.listen(port, "0.0.0.0", () => {
      httpServer.off("error", onError);
      resolvePromise();
    });
  });
}

function closeHttpServer(httpServer: Server): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    httpServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolvePromise();
    });
  });
}

export async function startServer(
  config: AppConfig,
  options: ServerOptions = {},
): Promise<RunningServer> {
  const logger =
    options.logger ??
    createLogger({ level: config.nodeEnv === "test" ? "silent" : "info" });
  const databaseFactory = options.databaseFactory ?? openDatabase;
  const database = databaseFactory(config.databasePath);
  let httpServer: Server | undefined;

  try {
    runMigrations(
      database,
      options.migrationsDirectory ?? resolve("database/migrations"),
    );
    httpServer = createServer(createApp({ database, logger }));
    await listen(httpServer, config.port);
  } catch (error) {
    if (httpServer?.listening) {
      await closeHttpServer(httpServer);
    }
    closeDatabase(database);
    throw error;
  }

  let closed = false;
  return {
    httpServer,
    database,
    close: async () => {
      if (closed) {
        return;
      }
      closed = true;
      try {
        await closeHttpServer(httpServer);
      } finally {
        closeDatabase(database);
      }
    },
  };
}

export async function bootstrapServer(
  environment: NodeJS.ProcessEnv = process.env,
  options: ServerOptions = {},
): Promise<RunningServer> {
  const config = readConfig(environment);
  return startServer(config, options);
}

export async function main(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  let logger: Logger | undefined;

  try {
    const config = readConfig(environment);
    logger = createLogger({ level: "info" });
    const running = await startServer(config, { logger });
    logger.info({ host: "0.0.0.0", port: config.port }, "Application started");

    let shuttingDown = false;
    const shutdown = async (signal: NodeJS.Signals) => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;
      logger?.info({ signal }, "Application shutting down");
      try {
        await running.close();
      } catch (error) {
        logger?.error({ err: error }, "Graceful shutdown failed");
        process.exitCode = 1;
      }
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  } catch (error) {
    if (logger) {
      logger.error({ err: error }, "Application failed to start");
    } else {
      const message =
        error instanceof Error ? error.message : "Unknown startup error";
      process.stderr.write(`Application failed to start: ${message}\n`);
    }
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
