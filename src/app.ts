import express, { type Express } from "express";
import type { Logger } from "pino";
import type { SqliteDatabase } from "./db/connection";
import { requireAuth } from "./modules/auth/auth.middleware";
import type { AuthProvider } from "./modules/auth/auth.provider";
import { AuthRepository } from "./modules/auth/auth.repository";
import { createAuthRouter, createMeRouter } from "./modules/auth/auth.routes";
import { createExerciseRouter } from "./modules/exercises/exercise.routes";
import {
  createBodyMetricTypeRouter,
  createMeasurementRouter,
} from "./modules/measurements/measurement.routes";
import { createRoutineRouter } from "./modules/routines/routine.routes";
import { createWorkoutRouter } from "./modules/workouts/workout.routes";
import { errorHandler, HttpError, notFoundHandler } from "./shared/http-errors";
import { requestLogger } from "./shared/request-logger";

export type AppDependencies = {
  database: SqliteDatabase;
  logger: Logger;
  authProvider?: AuthProvider;
};

export function createApp({
  database,
  logger,
  authProvider,
}: AppDependencies): Express {
  const app = express();
  const authRepository = authProvider
    ? new AuthRepository(database)
    : undefined;

  app.disable("x-powered-by");
  app.use(requestLogger(logger));
  app.use(express.json());

  app.get("/health", (_request, response, next) => {
    try {
      database.prepare("SELECT 1").get();
      response.status(200).json({ status: "ok" });
    } catch (error) {
      next(
        new HttpError(
          503,
          "DATABASE_UNAVAILABLE",
          "Database is unavailable",
          null,
          error,
        ),
      );
    }
  });

  if (authProvider && authRepository) {
    app.use("/api/v1/auth", createAuthRouter(database, authProvider));
    app.use("/api/v1", requireAuth(authProvider, authRepository));
    app.use("/api/v1/me", createMeRouter());
    app.use("/api/v1/me/measurements", createMeasurementRouter(database, true));
  }

  app.use("/api/v1/exercises", createExerciseRouter(database));
  app.use("/api/v1/body-metric-types", createBodyMetricTypeRouter(database));
  if (!authProvider) {
    app.use(
      "/api/v1/users/:userId/measurements",
      createMeasurementRouter(database),
    );
  }
  app.use(
    "/api/v1/routines",
    createRoutineRouter(database, Boolean(authProvider)),
  );
  app.use(
    "/api/v1/workouts",
    createWorkoutRouter(database, Boolean(authProvider)),
  );

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
}
