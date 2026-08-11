import { Router } from "express";
import type { SqliteDatabase } from "../../db/connection";
import { HttpError } from "../../shared/http-errors";
import { parseInput } from "../../shared/validation";
import { WorkoutRepository } from "./workout.repository";
import {
  cancelWorkoutSchema,
  completeWorkoutSchema,
  putWorkoutExerciseSchema,
  startWorkoutSchema,
  workoutDetailQuerySchema,
  workoutEmptyQuerySchema,
  workoutExerciseParamsSchema,
  workoutIdParamsSchema,
  workoutListQuerySchema,
} from "./workout.schemas";
import {
  ExerciseInactiveError,
  ExerciseNotFoundError,
  RoutineExerciseNotFoundError,
  RoutineVersionNotFoundError,
  UserNotFoundError,
  WorkoutCompletionTimeInvalidError,
  WorkoutNotFoundError,
  WorkoutNotInProgressError,
  WorkoutPositionConflictError,
  WorkoutService,
} from "./workout.service";

function mapDomainError(error: unknown): never {
  if (error instanceof UserNotFoundError) {
    throw new HttpError(404, "USER_NOT_FOUND", "User not found", null, error);
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
  if (error instanceof WorkoutNotFoundError) {
    throw new HttpError(
      404,
      "WORKOUT_NOT_FOUND",
      "Workout not found",
      null,
      error,
    );
  }
  if (error instanceof RoutineExerciseNotFoundError) {
    throw new HttpError(
      404,
      "ROUTINE_EXERCISE_NOT_FOUND",
      "Routine exercise not found",
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
  if (error instanceof WorkoutNotInProgressError) {
    throw new HttpError(
      409,
      "WORKOUT_NOT_IN_PROGRESS",
      "Workout is not in progress",
      null,
      error,
    );
  }
  if (error instanceof WorkoutCompletionTimeInvalidError) {
    throw new HttpError(
      409,
      "WORKOUT_COMPLETION_TIME_INVALID",
      "Workout completion time is before its start time",
      null,
      error,
    );
  }
  if (error instanceof WorkoutPositionConflictError) {
    throw new HttpError(
      409,
      "WORKOUT_POSITION_CONFLICT",
      "Workout result position is already used",
      null,
      error,
    );
  }
  throw error;
}

export function createWorkoutRouter(database: SqliteDatabase): Router {
  const router = Router();
  const service = new WorkoutService(new WorkoutRepository(database));

  router.post("/", (request, response) => {
    parseInput(workoutEmptyQuerySchema, request.query, "query");
    const input = parseInput(startWorkoutSchema, request.body, "body");
    try {
      response.status(201).json(service.start(input));
    } catch (error) {
      mapDomainError(error);
    }
  });

  router.put("/:id/exercises/:routineExerciseId", (request, response) => {
    const { id, routineExerciseId } = parseInput(
      workoutExerciseParamsSchema,
      request.params,
      "params",
    );
    parseInput(workoutEmptyQuerySchema, request.query, "query");
    const input = parseInput(putWorkoutExerciseSchema, request.body, "body");
    try {
      response
        .status(200)
        .json(service.putResult(id, routineExerciseId, input));
    } catch (error) {
      mapDomainError(error);
    }
  });

  router.post("/:id/complete", (request, response) => {
    const { id } = parseInput(workoutIdParamsSchema, request.params, "params");
    parseInput(workoutEmptyQuerySchema, request.query, "query");
    const input = parseInput(completeWorkoutSchema, request.body, "body");
    try {
      response.status(200).json(service.complete(id, input));
    } catch (error) {
      mapDomainError(error);
    }
  });

  router.post("/:id/cancel", (request, response) => {
    const { id } = parseInput(workoutIdParamsSchema, request.params, "params");
    parseInput(workoutEmptyQuerySchema, request.query, "query");
    const { userId } = parseInput(cancelWorkoutSchema, request.body, "body");
    try {
      response.status(200).json(service.cancel(id, userId));
    } catch (error) {
      mapDomainError(error);
    }
  });

  router.get("/", (request, response) => {
    const { userId, status } = parseInput(
      workoutListQuerySchema,
      request.query,
      "query",
    );
    try {
      response.status(200).json(service.list(userId, status));
    } catch (error) {
      mapDomainError(error);
    }
  });

  router.get("/:id", (request, response) => {
    const { id } = parseInput(workoutIdParamsSchema, request.params, "params");
    const { userId } = parseInput(
      workoutDetailQuerySchema,
      request.query,
      "query",
    );
    try {
      response.status(200).json(service.get(id, userId));
    } catch (error) {
      mapDomainError(error);
    }
  });

  return router;
}
