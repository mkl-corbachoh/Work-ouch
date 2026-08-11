import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MeasurementRepository } from "../../../src/modules/measurements/measurement.repository";
import {
  createBodyMeasurementSchema,
  createBodyMetricTypeSchema,
} from "../../../src/modules/measurements/measurement.schemas";
import {
  BodyMeasurementNotFoundError,
  BodyMetricTypeConflictError,
  BodyMetricTypeNotFoundError,
  MeasurementService,
  UserNotFoundError,
} from "../../../src/modules/measurements/measurement.service";
import {
  createMigratedTemporaryDatabase,
  type TemporaryDatabase,
} from "../../helpers/database";
import { insertUser } from "../../helpers/fixtures";

const NOW = new Date("2026-08-11T09:00:00.000Z");

describe("MeasurementService", () => {
  let temporary: TemporaryDatabase;
  let service: MeasurementService;

  beforeEach(() => {
    temporary = createMigratedTemporaryDatabase();
    insertUser(temporary.database);
    insertUser(temporary.database, {
      id: 2,
      email: "other@example.com",
      displayName: "Other",
    });
    service = new MeasurementService(
      new MeasurementRepository(temporary.database),
      () => NOW,
    );
    createType("weight_kg", "kg");
    createType("bmi", null);
    createType("body_fat_pct", "%");
  });

  afterEach(() => temporary.cleanup());

  function createType(code: string, unit: string | null) {
    return service.createMetricType(
      createBodyMetricTypeSchema.parse({ code, name: code, unit }),
    );
  }

  function input(
    metrics: Record<string, number>,
    overrides: Record<string, unknown> = {},
  ) {
    return createBodyMeasurementSchema.parse({
      measuredAt: "2026-08-11T12:00:00+02:00",
      source: "Scale",
      notes: "Morning",
      metrics,
      ...overrides,
    });
  }

  function counts() {
    return {
      measurements: temporary.database
        .prepare("SELECT COUNT(*) AS count FROM body_measurements")
        .get(),
      values: temporary.database
        .prepare("SELECT COUNT(*) AS count FROM body_measurement_values")
        .get(),
    };
  }

  it("creates and lists global metric types and reports code conflicts", () => {
    expect(service.listMetricTypes().map(({ code }) => code)).toEqual([
      "bmi",
      "body_fat_pct",
      "weight_kg",
    ]);
    expect(createType("custom_score", "points")).toMatchObject({
      code: "custom_score",
      unit: "points",
    });
    expect(() => createType("custom_score", "other")).toThrow(
      BodyMetricTypeConflictError,
    );
    expect(service.listMetricTypes()).toHaveLength(4);
  });

  it("creates one atomic measurement with sorted code metrics and no internal IDs", () => {
    const result = service.createMeasurement(
      1,
      input({ weight_kg: 72.4, bmi: 22.7, body_fat_pct: 15.2 }),
    );
    expect(result).toEqual({
      id: 1,
      userId: 1,
      measuredAt: "2026-08-11T10:00:00.000Z",
      source: "Scale",
      notes: "Morning",
      createdAt: NOW.toISOString(),
      metrics: {
        bmi: { value: 22.7, unit: null },
        body_fat_pct: { value: 15.2, unit: "%" },
        weight_kg: { value: 72.4, unit: "kg" },
      },
    });
    expect(Object.keys(result.metrics)).toEqual([
      "bmi",
      "body_fat_pct",
      "weight_kg",
    ]);
    expect(JSON.stringify(result)).not.toMatch(/metricTypeId|valueId/);
  });

  it("resolves every code before writing and rolls back an unknown set", () => {
    expect(() =>
      service.createMeasurement(1, input({ weight_kg: 72, unknown_metric: 5 })),
    ).toThrow(BodyMetricTypeNotFoundError);
    expect(counts()).toEqual({
      measurements: { count: 0 },
      values: { count: 0 },
    });
  });

  it("rejects nonexistent users without writes", () => {
    expect(() =>
      service.createMeasurement(999, input({ weight_kg: 72 })),
    ).toThrow(UserNotFoundError);
    expect(() => service.listMeasurements(999)).toThrow(UserNotFoundError);
    expect(counts().measurements).toEqual({ count: 0 });
  });

  it("supports negative values and repeated timestamps as distinct measurements", () => {
    const first = service.createMeasurement(1, input({ weight_kg: -1.5 }));
    const second = service.createMeasurement(1, input({ weight_kg: 0 }));
    expect(second.id).not.toBe(first.id);
    expect(service.listMeasurements(1).map(({ id }) => id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(service.getMeasurement(first.id, 1).metrics.weight_kg).toEqual({
      value: -1.5,
      unit: "kg",
    });
  });

  it("isolates histories and hides foreign detail as not found", () => {
    const owned = service.createMeasurement(1, input({ weight_kg: 72 }));
    const foreign = service.createMeasurement(2, input({ weight_kg: 99 }));
    expect(service.listMeasurements(1).map(({ id }) => id)).toEqual([owned.id]);
    expect(service.listMeasurements(2).map(({ id }) => id)).toEqual([
      foreign.id,
    ]);
    expect(() => service.getMeasurement(foreign.id, 1)).toThrow(
      BodyMeasurementNotFoundError,
    );
    expect(() => service.getMeasurement(999, 1)).toThrow(
      BodyMeasurementNotFoundError,
    );
    expect(() => service.getMeasurement(owned.id, 999)).toThrow(
      BodyMeasurementNotFoundError,
    );
  });

  it("orders history by measuredAt descending then ID descending", () => {
    const oldest = service.createMeasurement(
      1,
      input({ weight_kg: 70 }, { measuredAt: "2026-08-10T10:00:00Z" }),
    );
    const newestFirst = service.createMeasurement(
      1,
      input({ weight_kg: 71 }, { measuredAt: "2026-08-12T10:00:00Z" }),
    );
    const newestSecond = service.createMeasurement(
      1,
      input({ weight_kg: 72 }, { measuredAt: "2026-08-12T10:00:00Z" }),
    );
    expect(service.listMeasurements(1).map(({ id }) => id)).toEqual([
      newestSecond.id,
      newestFirst.id,
      oldest.id,
    ]);
  });

  it("rolls back all values when a later insert fails", () => {
    temporary.database.exec(`
      CREATE TRIGGER fail_second_body_value
      BEFORE INSERT ON body_measurement_values
      WHEN NEW.metric_type_id = 3
      BEGIN
        SELECT RAISE(ABORT, 'injected body value failure');
      END;
    `);
    expect(() =>
      service.createMeasurement(1, input({ weight_kg: 72, body_fat_pct: 15 })),
    ).toThrow("injected body value failure");
    expect(counts()).toEqual({
      measurements: { count: 0 },
      values: { count: 0 },
    });
  });

  it("lets one writer create a code and maps a competing create to conflict", () => {
    const competing = new MeasurementService(
      new MeasurementRepository(temporary.database),
      () => NOW,
    );
    const body = createBodyMetricTypeSchema.parse({
      code: "dynamic_metric",
      name: "Dynamic",
    });
    expect(service.createMetricType(body)).toMatchObject({
      code: "dynamic_metric",
    });
    expect(() => competing.createMetricType(body)).toThrow(
      BodyMetricTypeConflictError,
    );
    expect(
      service.createMeasurement(1, input({ dynamic_metric: 4 })).metrics,
    ).toEqual({ dynamic_metric: { value: 4, unit: null } });
  });
});
