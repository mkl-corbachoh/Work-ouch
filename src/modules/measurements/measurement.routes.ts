import { Router } from "express";
import type { SqliteDatabase } from "../../db/connection";
import { HttpError } from "../../shared/http-errors";
import { parseInput } from "../../shared/validation";
import { MeasurementRepository } from "./measurement.repository";
import {
  createBodyMeasurementSchema,
  createBodyMetricTypeSchema,
  measurementDetailParamsSchema,
  measurementEmptyQuerySchema,
  measurementUserParamsSchema,
} from "./measurement.schemas";
import {
  BodyMeasurementNotFoundError,
  BodyMetricTypeConflictError,
  BodyMetricTypeNotFoundError,
  MeasurementService,
  UserNotFoundError,
} from "./measurement.service";

function mapDomainError(error: unknown): never {
  if (error instanceof UserNotFoundError) {
    throw new HttpError(404, "USER_NOT_FOUND", "User not found", null, error);
  }
  if (error instanceof BodyMetricTypeNotFoundError) {
    throw new HttpError(
      404,
      "BODY_METRIC_TYPE_NOT_FOUND",
      "Body metric type not found",
      null,
      error,
    );
  }
  if (error instanceof BodyMeasurementNotFoundError) {
    throw new HttpError(
      404,
      "BODY_MEASUREMENT_NOT_FOUND",
      "Body measurement not found",
      null,
      error,
    );
  }
  if (error instanceof BodyMetricTypeConflictError) {
    throw new HttpError(
      409,
      "BODY_METRIC_TYPE_CODE_CONFLICT",
      "A body metric type with this code already exists",
      null,
      error,
    );
  }
  throw error;
}

function createService(database: SqliteDatabase): MeasurementService {
  return new MeasurementService(new MeasurementRepository(database));
}

export function createBodyMetricTypeRouter(database: SqliteDatabase): Router {
  const router = Router();
  const service = createService(database);

  router.get("/", (request, response) => {
    parseInput(measurementEmptyQuerySchema, request.query, "query");
    response.status(200).json(service.listMetricTypes());
  });

  router.post("/", (request, response) => {
    parseInput(measurementEmptyQuerySchema, request.query, "query");
    const input = parseInput(createBodyMetricTypeSchema, request.body, "body");
    try {
      response.status(201).json(service.createMetricType(input));
    } catch (error) {
      mapDomainError(error);
    }
  });

  return router;
}

export function createMeasurementRouter(database: SqliteDatabase): Router {
  const router = Router({ mergeParams: true });
  const service = createService(database);

  router.post("/", (request, response) => {
    const { userId } = parseInput(
      measurementUserParamsSchema,
      request.params,
      "params",
    );
    parseInput(measurementEmptyQuerySchema, request.query, "query");
    const input = parseInput(createBodyMeasurementSchema, request.body, "body");
    try {
      response.status(201).json(service.createMeasurement(userId, input));
    } catch (error) {
      mapDomainError(error);
    }
  });

  router.get("/", (request, response) => {
    const { userId } = parseInput(
      measurementUserParamsSchema,
      request.params,
      "params",
    );
    parseInput(measurementEmptyQuerySchema, request.query, "query");
    try {
      response.status(200).json(service.listMeasurements(userId));
    } catch (error) {
      mapDomainError(error);
    }
  });

  router.get("/:id", (request, response) => {
    const { userId, id } = parseInput(
      measurementDetailParamsSchema,
      request.params,
      "params",
    );
    parseInput(measurementEmptyQuerySchema, request.query, "query");
    try {
      response.status(200).json(service.getMeasurement(id, userId));
    } catch (error) {
      mapDomainError(error);
    }
  });

  return router;
}
