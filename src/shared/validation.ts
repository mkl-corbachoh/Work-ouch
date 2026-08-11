import type { ZodType, z } from "zod";
import { HttpError } from "./http-errors";

export type ValidationSource = "body" | "params" | "query";

export function parseInput<T>(
  schema: ZodType<T>,
  input: unknown,
  source: ValidationSource,
): T {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw new HttpError(400, "VALIDATION_ERROR", "Request validation failed", {
      source,
      issues: result.error.issues.map(
        ({ path, message }: z.core.$ZodIssue) => ({ path, message }),
      ),
    });
  }

  return result.data;
}
