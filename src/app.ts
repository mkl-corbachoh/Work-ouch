import express, { type Express } from "express";
import type { Logger } from "pino";
import type { SqliteDatabase } from "./db/connection";
import { createExerciseRouter } from "./modules/exercises/exercise.routes";
import { createRoutineRouter } from "./modules/routines/routine.routes";
import { createWorkoutRouter } from "./modules/workouts/workout.routes";
import { errorHandler, HttpError, notFoundHandler } from "./shared/http-errors";
import { requestLogger } from "./shared/request-logger";

export type AppDependencies = {
  database: SqliteDatabase;
  logger: Logger;
};

export function createApp({ database, logger }: AppDependencies): Express {
  const app = express();

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

  app.use("/api/v1/exercises", createExerciseRouter(database));
  app.use("/api/v1/routines", createRoutineRouter(database));
  app.use("/api/v1/workouts", createWorkoutRouter(database));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
}
