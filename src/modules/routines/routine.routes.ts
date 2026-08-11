import { Router } from "express";
import type { SqliteDatabase } from "../../db/connection";
import { HttpError } from "../../shared/http-errors";
import { parseInput } from "../../shared/validation";
import { RoutineRepository } from "./routine.repository";
import {
  createRoutineSchema,
  createRoutineVersionSchema,
  routineDetailQuerySchema,
  routineEmptyQuerySchema,
  routineIdParamsSchema,
  routineListQuerySchema,
} from "./routine.schemas";
import {
  ExerciseInactiveError,
  ExerciseNotFoundError,
  RoutineNotFoundError,
  RoutineService,
  RoutineVersionNotFoundError,
  UserNotFoundError,
} from "./routine.service";

function mapDomainError(error: unknown): never {
  if (error instanceof UserNotFoundError) {
    throw new HttpError(404, "USER_NOT_FOUND", "User not found", null, error);
  }
  if (error instanceof RoutineNotFoundError) {
    throw new HttpError(
      404,
      "ROUTINE_NOT_FOUND",
      "Routine not found",
      null,
      error,
    );
  }
  if (error instanceof RoutineVersionNotFoundError) {
    throw new HttpError(
      404,
      "ROUTINE_VERSION_NOT_FOUND",
      "Routine version not found",
      null,
      error,
    );
  }
  if (error instanceof ExerciseNotFoundError) {
    throw new HttpError(
      404,
      "EXERCISE_NOT_FOUND",
      "Exercise not found",
      null,
      error,
    );
  }
  if (error instanceof ExerciseInactiveError) {
    throw new HttpError(
      409,
      "EXERCISE_INACTIVE",
      "Exercise is inactive",
      null,
      error,
    );
  }
  throw error;
}

export function createRoutineRouter(database: SqliteDatabase): Router {
  const router = Router();
  const service = new RoutineService(new RoutineRepository(database));

  router.post("/", (request, response) => {
    parseInput(routineEmptyQuerySchema, request.query, "query");
    const input = parseInput(createRoutineSchema, request.body, "body");
    try {
      response.status(201).json(service.create(input));
    } catch (error) {
      mapDomainError(error);
    }
  });

  router.post("/:id/versions", (request, response) => {
    const { id } = parseInput(routineIdParamsSchema, request.params, "params");
    parseInput(routineEmptyQuerySchema, request.query, "query");
    const input = parseInput(createRoutineVersionSchema, request.body, "body");
    try {
      response.status(201).json(service.createVersion(id, input));
    } catch (error) {
      mapDomainError(error);
    }
  });

  router.get("/", (request, response) => {
    const { userId } = parseInput(
      routineListQuerySchema,
      request.query,
      "query",
    );
    try {
      response.status(200).json(service.list(userId));
    } catch (error) {
      mapDomainError(error);
    }
  });

  router.get("/:id", (request, response) => {
    const { id } = parseInput(routineIdParamsSchema, request.params, "params");
    const { userId, versionNumber } = parseInput(
      routineDetailQuerySchema,
      request.query,
      "query",
    );
    try {
      response.status(200).json(service.get(id, userId, versionNumber));
    } catch (error) {
      mapDomainError(error);
    }
  });

  return router;
}
