import type { ErrorRequestHandler, RequestHandler } from "express";
import type { Logger } from "pino";

export type ErrorResponse = {
  code: string;
  message: string;
  details: unknown;
};

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details: unknown = null,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new HttpError(404, "NOT_FOUND", "Route not found"));
};

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, request, response, _next) => {
    logger.error(
      {
        err: error,
        method: request.method,
        path: request.path,
      },
      "HTTP request failed",
    );

    const body: ErrorResponse =
      error instanceof HttpError
        ? { code: error.code, message: error.message, details: error.details }
        : {
            code: "INTERNAL_ERROR",
            message: "An unexpected error occurred",
            details: null,
          };

    response.status(error instanceof HttpError ? error.status : 500).json(body);
  };
}
