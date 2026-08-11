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

function jsonBodyValidationMessage(error: unknown): string | null {
  if (!(error instanceof Error) || !("type" in error)) {
    return null;
  }

  switch (error.type) {
    case "entity.parse.failed":
      return "Malformed JSON body";
    case "entity.too.large":
      return "JSON body exceeds the size limit";
    case "encoding.unsupported":
      return "Unsupported request body encoding";
    case "charset.unsupported":
      return "Unsupported JSON character set";
    case "request.aborted":
      return "Request body was aborted";
    case "request.size.invalid":
      return "Request body size does not match Content-Length";
    default:
      return null;
  }
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, request, response, _next) => {
    const bodyValidationMessage = jsonBodyValidationMessage(error);
    logger.error(
      {
        err: bodyValidationMessage ? new Error(bodyValidationMessage) : error,
        method: request.method,
        path: request.path,
      },
      "HTTP request failed",
    );

    const responseError = bodyValidationMessage
      ? new HttpError(400, "VALIDATION_ERROR", "Request validation failed", {
          source: "body",
          issues: [{ path: [], message: bodyValidationMessage }],
        })
      : error;

    const body: ErrorResponse =
      responseError instanceof HttpError
        ? {
            code: responseError.code,
            message: responseError.message,
            details: responseError.details,
          }
        : {
            code: "INTERNAL_ERROR",
            message: "An unexpected error occurred",
            details: null,
          };

    response
      .status(responseError instanceof HttpError ? responseError.status : 500)
      .json(body);
  };
}
