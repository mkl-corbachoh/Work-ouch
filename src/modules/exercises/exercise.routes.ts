import { Router } from "express";
import type { SqliteDatabase } from "../../db/connection";
import { HttpError } from "../../shared/http-errors";
import { parseInput } from "../../shared/validation";
import {
  ExerciseRepository,
  ExerciseSlugConflictError,
} from "./exercise.repository";
import {
  createExerciseSchema,
  emptyQuerySchema,
  exerciseIdParamsSchema,
  exerciseListQuerySchema,
  patchExerciseSchema,
} from "./exercise.schemas";

function exerciseNotFound(): HttpError {
  return new HttpError(404, "EXERCISE_NOT_FOUND", "Exercise not found");
}

export function createExerciseRouter(database: SqliteDatabase): Router {
  const router = Router();
  const repository = new ExerciseRepository(database);

  router.post("/", (request, response) => {
    parseInput(emptyQuerySchema, request.query, "query");
    const input = parseInput(createExerciseSchema, request.body, "body");

    try {
      response.status(201).json(repository.create(input));
    } catch (error) {
      if (error instanceof ExerciseSlugConflictError) {
        throw new HttpError(
          409,
          "EXERCISE_SLUG_CONFLICT",
          "An exercise with this slug already exists",
          null,
          error,
        );
      }
      throw error;
    }
  });

  router.get("/", (request, response) => {
    const { includeInactive } = parseInput(
      exerciseListQuerySchema,
      request.query,
      "query",
    );

    response.status(200).json(repository.list(includeInactive));
  });

  router.get("/:id", (request, response) => {
    const { id } = parseInput(exerciseIdParamsSchema, request.params, "params");
    parseInput(emptyQuerySchema, request.query, "query");
    const exercise = repository.findById(id);

    if (!exercise) {
      throw exerciseNotFound();
    }

    response.status(200).json(exercise);
  });

  router.patch("/:id", (request, response) => {
    const { id } = parseInput(exerciseIdParamsSchema, request.params, "params");
    parseInput(emptyQuerySchema, request.query, "query");
    const input = parseInput(patchExerciseSchema, request.body, "body");
    const exercise = repository.patch(id, input);

    if (!exercise) {
      throw exerciseNotFound();
    }

    response.status(200).json(exercise);
  });

  return router;
}
