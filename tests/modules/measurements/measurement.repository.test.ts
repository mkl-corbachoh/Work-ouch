import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, openDatabase } from "../../../src/db/connection";
import {
  BodyMetricTypeCodeConstraintError,
  MeasurementRepository,
} from "../../../src/modules/measurements/measurement.repository";
import {
  createBodyMeasurementSchema,
  createBodyMetricTypeSchema,
} from "../../../src/modules/measurements/measurement.schemas";
import {
  createMigratedTemporaryDatabase,
  type TemporaryDatabase,
} from "../../helpers/database";
import { FIXTURE_TIMESTAMP, insertUser } from "../../helpers/fixtures";

describe("MeasurementRepository", () => {
  let temporary: TemporaryDatabase;
  let repository: MeasurementRepository;

  beforeEach(() => {
    temporary = createMigratedTemporaryDatabase();
    insertUser(temporary.database);
    insertUser(temporary.database, {
      id: 2,
      email: "other@example.com",
      displayName: "Other",
    });
    repository = new MeasurementRepository(temporary.database);
  });

  afterEach(() => temporary.cleanup());

  function typeInput(code: string, overrides: Record<string, unknown> = {}) {
    return createBodyMetricTypeSchema.parse({
      code,
      name: code,
      unit: null,
      ...overrides,
    });
  }

  function measurementInput(
    metrics: Record<string, number>,
    overrides: Record<string, unknown> = {},
  ) {
    return createBodyMeasurementSchema.parse({
      measuredAt: "2026-08-11T10:00:00Z",
      source: "Scale",
      notes: "Morning",
      metrics,
      ...overrides,
    });
  }

  function insertMeasurement(
    userId: number,
    metrics: Record<string, number>,
    overrides: Record<string, unknown> = {},
  ): number {
    const input = measurementInput(metrics, overrides);
    return repository.withImmediateTransaction(() => {
      const types = repository.findMetricTypesByCodes(Object.keys(metrics));
      const byCode = new Map(types.map((type) => [type.code, type]));
      const reservation = repository.reserveMeasurementIds(types.length);
      repository.insertMeasurement(
        reservation,
        userId,
        input,
        Object.entries(input.metrics)
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([code, value], index) => ({
            id: reservation.valueIds[index] as number,
            metricTypeId: (byCode.get(code) as { id: number }).id,
            value,
          })),
        FIXTURE_TIMESTAMP,
      );
      return reservation.measurementId;
    });
  }

  it("creates and lists metric types in binary code order", () => {
    const weight = repository.withImmediateTransaction(() =>
      repository.insertMetricType(
        typeInput("weight_kg", { name: "Weight", unit: "kg" }),
      ),
    );
    const bmi = repository.withImmediateTransaction(() =>
      repository.insertMetricType(
        typeInput("bmi", { name: "Body mass index" }),
      ),
    );
    expect(weight).toEqual({
      id: 1,
      code: "weight_kg",
      name: "Weight",
      unit: "kg",
      description: null,
    });
    expect(repository.listMetricTypes()).toEqual([bmi, weight]);
  });

  it("looks up all requested codes in one batch and removes repeated lookup keys", () => {
    repository.withImmediateTransaction(() => {
      repository.insertMetricType(typeInput("weight_kg"));
      repository.insertMetricType(typeInput("bmi"));
    });
    expect(
      repository
        .findMetricTypesByCodes(["weight_kg", "missing", "bmi", "bmi"])
        .map(({ code }) => code),
    ).toEqual(["bmi", "weight_kg"]);
    expect(repository.findMetricTypesByCodes([])).toEqual([]);
  });

  it("serializes ID reservation across real connections and retries coherently", () => {
    repository.withImmediateTransaction(() => {
      repository.insertMetricType(typeInput("weight_kg", { unit: "kg" }));
    });
    const competingDatabase = openDatabase(temporary.databasePath);
    competingDatabase.pragma("busy_timeout = 1");
    const competing = new MeasurementRepository(competingDatabase);
    const body = measurementInput({ weight_kg: 72 });

    try {
      temporary.database.exec("BEGIN IMMEDIATE");
      const firstReservation = repository.reserveMeasurementIds(1);
      repository.insertMeasurement(
        firstReservation,
        1,
        body,
        [{ id: 1, metricTypeId: 1, value: 72 }],
        FIXTURE_TIMESTAMP,
      );

      expect(() =>
        competing.withImmediateTransaction(() =>
          competing.reserveMeasurementIds(1),
        ),
      ).toThrow(/database is locked/);
      temporary.database.exec("COMMIT");

      const retried = competing.withImmediateTransaction(() => {
        const reservation = competing.reserveMeasurementIds(1);
        competing.insertMeasurement(
          reservation,
          1,
          measurementInput({ weight_kg: 73 }),
          [
            {
              id: reservation.valueIds[0] as number,
              metricTypeId: 1,
              value: 73,
            },
          ],
          FIXTURE_TIMESTAMP,
        );
        return competing.findOwnedMeasurement(reservation.measurementId, 1);
      });
      expect(retried).toMatchObject({
        id: 2,
        metrics: { weight_kg: { value: 73, unit: "kg" } },
      });
      expect(competing.listMeasurements(1).map(({ id }) => id)).toEqual([2, 1]);
    } finally {
      if (temporary.database.inTransaction) {
        temporary.database.exec("ROLLBACK");
      }
      closeDatabase(competingDatabase);
    }
  });

  it("translates only the metric code conflict", () => {
    repository.withImmediateTransaction(() => {
      repository.insertMetricType(typeInput("weight_kg"));
    });
    expect(() =>
      repository.withImmediateTransaction(() =>
        repository.insertMetricType(typeInput("weight_kg")),
      ),
    ).toThrow(BodyMetricTypeCodeConstraintError);
    expect(() =>
      repository.withImmediateTransaction(() =>
        repository.insertMetricType({
          code: "valid_code",
          name: "",
          unit: null,
          description: null,
        }),
      ),
    ).not.toThrow(BodyMetricTypeCodeConstraintError);
  });

  it("inserts values first and maps deterministic metrics without internal IDs", () => {
    repository.withImmediateTransaction(() => {
      repository.insertMetricType(
        typeInput("weight_kg", { name: "Weight", unit: "kg" }),
      );
      repository.insertMetricType(typeInput("bmi", { name: "BMI" }));
    });
    const id = insertMeasurement(1, { weight_kg: 72.4, bmi: 22.7 });

    expect(repository.findOwnedMeasurement(id, 1)).toEqual({
      id,
      userId: 1,
      measuredAt: "2026-08-11T10:00:00.000Z",
      source: "Scale",
      notes: "Morning",
      createdAt: FIXTURE_TIMESTAMP,
      metrics: {
        bmi: { value: 22.7, unit: null },
        weight_kg: { value: 72.4, unit: "kg" },
      },
    });
    expect(JSON.stringify(repository.findOwnedMeasurement(id, 1))).not.toMatch(
      /metricTypeId|metric_type_id|valueId/,
    );
  });

  it("lists only one owner by descending measured time and ID", () => {
    repository.withImmediateTransaction(() => {
      repository.insertMetricType(typeInput("weight_kg", { unit: "kg" }));
    });
    const oldest = insertMeasurement(
      1,
      { weight_kg: 70 },
      {
        measuredAt: "2026-08-10T10:00:00Z",
      },
    );
    const sameTimeFirst = insertMeasurement(1, { weight_kg: 71 });
    const sameTimeSecond = insertMeasurement(1, { weight_kg: 72 });
    insertMeasurement(
      2,
      { weight_kg: 99 },
      {
        measuredAt: "2026-08-12T10:00:00Z",
      },
    );

    expect(repository.listMeasurements(1).map(({ id }) => id)).toEqual([
      sameTimeSecond,
      sameTimeFirst,
      oldest,
    ]);
    expect(repository.listMeasurements(2)).toHaveLength(1);
    expect(repository.findOwnedMeasurement(sameTimeFirst, 2)).toBeNull();
    expect(repository.findOwnedMeasurement(999, 1)).toBeNull();
  });

  it("reserves consecutive safe IDs and rejects exhausted spaces", () => {
    repository.withImmediateTransaction(() => {
      repository.insertMetricType(typeInput("weight_kg"));
    });
    expect(repository.reserveMeasurementIds(2)).toEqual({
      measurementId: 1,
      valueIds: [1, 2],
    });
    expect(() => repository.reserveMeasurementIds(0)).toThrow(
      "At least one body measurement value ID is required",
    );

    temporary.database.exec("BEGIN");
    temporary.database
      .prepare(
        `
          INSERT INTO body_measurement_values (
            id, measurement_id, metric_type_id, value
          ) VALUES (?, 1, 1, 1)
        `,
      )
      .run(Number.MAX_SAFE_INTEGER);
    expect(() => repository.reserveMeasurementIds(1)).toThrow(
      "Body measurement value ID space is exhausted",
    );
    temporary.database.exec("ROLLBACK");
  });

  it("refuses to reserve a measurement beyond Number.MAX_SAFE_INTEGER", () => {
    repository.withImmediateTransaction(() => {
      repository.insertMetricType(typeInput("weight_kg"));
    });
    temporary.database.exec("BEGIN");
    temporary.database
      .prepare(
        `
          INSERT INTO body_measurement_values (
            id, measurement_id, metric_type_id, value
          ) VALUES (1, ?, 1, 72)
        `,
      )
      .run(Number.MAX_SAFE_INTEGER);
    temporary.database
      .prepare(
        `
          INSERT INTO body_measurements (
            id, user_id, measured_at, created_at
          ) VALUES (?, 1, ?, ?)
        `,
      )
      .run(
        Number.MAX_SAFE_INTEGER,
        "2026-08-11T10:00:00.000Z",
        FIXTURE_TIMESTAMP,
      );
    temporary.database.exec("COMMIT");

    expect(() => repository.reserveMeasurementIds(1)).toThrow(
      "Body measurement ID space is exhausted",
    );
  });

  it("rejects an inconsistent reservation before writing", () => {
    repository.withImmediateTransaction(() => {
      repository.insertMetricType(typeInput("weight_kg"));
    });
    const input = measurementInput({ weight_kg: 72 });
    expect(() =>
      repository.withImmediateTransaction(() =>
        repository.insertMeasurement(
          { measurementId: 1, valueIds: [1] },
          1,
          input,
          [{ id: 2, metricTypeId: 1, value: 72 }],
          FIXTURE_TIMESTAMP,
        ),
      ),
    ).toThrow("Body measurement value ID reservation is inconsistent");
    expect(
      temporary.database
        .prepare("SELECT COUNT(*) AS count FROM body_measurement_values")
        .get(),
    ).toEqual({ count: 0 });
  });

  it("reports user existence without introducing user writes", () => {
    expect(repository.userExists(1)).toBe(true);
    expect(repository.userExists(999)).toBe(false);
  });
});
