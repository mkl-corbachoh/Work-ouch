import { describe, expect, it } from "vitest";
import {
  bodyMetricCodeSchema,
  createBodyMeasurementSchema,
  createBodyMetricTypeSchema,
  measurementDetailParamsSchema,
  measurementEmptyQuerySchema,
  measurementUserParamsSchema,
} from "../../../src/modules/measurements/measurement.schemas";

describe("measurement schemas", () => {
  it("trims type metadata and normalizes omitted optional fields", () => {
    expect(
      createBodyMetricTypeSchema.parse({
        code: " custom_score ",
        name: " Custom score ",
      }),
    ).toEqual({
      code: "custom_score",
      name: "Custom score",
      unit: null,
      description: null,
    });
  });

  it.each(["weight_kg", "bmi", "metric2", "2d_metric", "a1_b2_c3"])(
    "accepts body metric code %s",
    (code) => {
      expect(bodyMetricCodeSchema.parse(code)).toBe(code);
    },
  );

  it.each([
    "",
    " ",
    "Weight",
    "weight-kg",
    "_weight",
    "weight_",
    "weight__kg",
    "peso_ñ",
  ])("rejects invalid body metric code %#", (code) => {
    expect(bodyMetricCodeSchema.safeParse(code).success).toBe(false);
  });

  it("normalizes measurement timestamps and nullable text", () => {
    expect(
      createBodyMeasurementSchema.parse({
        measuredAt: "2026-08-11T12:00:00.12+02:00",
        source: " Scale ",
        metrics: { weight_kg: 72.5 },
      }),
    ).toEqual({
      measuredAt: "2026-08-11T10:00:00.120Z",
      source: "Scale",
      notes: null,
      metrics: { weight_kg: 72.5 },
    });
  });

  it("accepts finite fractions, integers, zero, and negative metric values", () => {
    expect(
      createBodyMeasurementSchema.parse({
        measuredAt: "2026-08-11T10:00:00Z",
        metrics: { negative_score: -1.5, zero_score: 0, integer_score: 2 },
      }).metrics,
    ).toEqual({ negative_score: -1.5, zero_score: 0, integer_score: 2 });
  });

  it.each([
    ["empty metrics", { metrics: {} }],
    ["non-numeric value", { metrics: { weight_kg: "72" } }],
    ["NaN", { metrics: { weight_kg: Number.NaN } }],
    ["positive infinity", { metrics: { weight_kg: Number.POSITIVE_INFINITY } }],
    ["invalid code", { metrics: { "weight-kg": 72 } }],
    ["noncanonical key", { metrics: { " weight_kg ": 72 } }],
    [
      "keys that would collide if trimmed",
      { metrics: { weight_kg: 72, " weight_kg ": 73 } },
    ],
    ["missing timestamp", { measuredAt: undefined }],
    ["timestamp without zone", { measuredAt: "2026-08-11T10:00:00" }],
    ["invalid date", { measuredAt: "2026-02-30T10:00:00Z" }],
    ["empty source", { source: " " }],
    ["long notes", { notes: "x".repeat(5001) }],
    ["unknown field", { createdAt: "2026-08-11T10:00:00.000Z" }],
  ])("rejects invalid measurement: %s", (_label, overrides) => {
    expect(
      createBodyMeasurementSchema.safeParse({
        measuredAt: "2026-08-11T10:00:00Z",
        metrics: { weight_kg: 72 },
        ...overrides,
      }).success,
    ).toBe(false);
  });

  it.each([
    ["empty name", { code: "custom", name: " " }],
    ["long unit", { code: "custom", name: "Custom", unit: "x".repeat(101) }],
    ["empty description", { code: "custom", name: "Custom", description: "" }],
    ["unknown field", { code: "custom", name: "Custom", id: 1 }],
  ])("rejects invalid type body: %s", (_label, body) => {
    expect(createBodyMetricTypeSchema.safeParse(body).success).toBe(false);
  });

  it("parses canonical safe IDs from nested route params", () => {
    expect(measurementUserParamsSchema.parse({ userId: "2" })).toEqual({
      userId: 2,
    });
    expect(
      measurementDetailParamsSchema.parse({ userId: "2", id: "3" }),
    ).toEqual({ userId: 2, id: 3 });
  });

  it.each([
    [measurementUserParamsSchema, { userId: "01" }],
    [measurementUserParamsSchema, { userId: "0" }],
    [measurementUserParamsSchema, { userId: "9007199254740992" }],
    [measurementUserParamsSchema, { userId: ["1", "2"] }],
    [measurementDetailParamsSchema, { userId: "1" }],
    [measurementDetailParamsSchema, { userId: "1", id: "1.0" }],
    [measurementEmptyQuerySchema, { page: "1" }],
    [measurementEmptyQuerySchema, { page: ["1", "2"] }],
  ])("rejects invalid params or query %#", (schema, input) => {
    expect(schema.safeParse(input).success).toBe(false);
  });
});
