import type { RequestHandler } from "express";
import type { Logger } from "pino";

export function requestLogger(logger: Logger): RequestHandler {
  return (request, response, next) => {
    const startedAt = process.hrtime.bigint();

    response.once("finish", () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      logger.info(
        {
          method: request.method,
          path: request.path,
          status: response.statusCode,
          durationMs,
        },
        "HTTP request completed",
      );
    });

    next();
  };
}
