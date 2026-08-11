import { z } from "zod";

const safePositiveInteger = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

const canonicalPositiveInteger = z
  .string()
  .regex(/^[1-9]\d*$/, "Must be a canonical positive integer")
  .transform(Number)
  .pipe(safePositiveInteger);

export const bodyMetricCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, "Must be lowercase snake_case");

export const bodyMetricKeySchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, "Must be lowercase snake_case");

const nullableText = (maximumLength: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximumLength)
    .nullable()
    .optional()
    .default(null);

const utcTimestamp = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

export const createBodyMetricTypeSchema = z.strictObject({
  code: bodyMetricCodeSchema,
  name: z.string().trim().min(1).max(200),
  unit: nullableText(100),
  description: nullableText(5000),
});

export const createBodyMeasurementSchema = z.strictObject({
  measuredAt: utcTimestamp,
  source: nullableText(200),
  notes: nullableText(5000),
  metrics: z
    .record(bodyMetricKeySchema, z.number().finite())
    .refine((metrics) => Object.keys(metrics).length > 0, {
      message: "At least one metric is required",
    }),
});

export const measurementUserParamsSchema = z.strictObject({
  userId: canonicalPositiveInteger,
});

export const measurementDetailParamsSchema = z.strictObject({
  userId: canonicalPositiveInteger,
  id: canonicalPositiveInteger,
});

export const measurementEmptyQuerySchema = z.strictObject({});

export type CreateBodyMetricTypeInput = z.infer<
  typeof createBodyMetricTypeSchema
>;
export type CreateBodyMeasurementInput = z.infer<
  typeof createBodyMeasurementSchema
>;
