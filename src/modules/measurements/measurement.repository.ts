import type { SqliteDatabase } from "../../db/connection";
import type {
  CreateBodyMeasurementInput,
  CreateBodyMetricTypeInput,
} from "./measurement.schemas";

export type BodyMetricType = {
  id: number;
  code: string;
  name: string;
  unit: string | null;
  description: string | null;
};

export type BodyMeasurementMetric = {
  value: number;
  unit: string | null;
};

export type BodyMeasurement = {
  id: number;
  userId: number;
  measuredAt: string;
  source: string | null;
  notes: string | null;
  createdAt: string;
  metrics: Record<string, BodyMeasurementMetric>;
};

export type MeasurementIdReservation = {
  measurementId: number;
  valueIds: number[];
};

export type MeasurementValueWrite = {
  id: number;
  metricTypeId: number;
  value: number;
};

type MetricTypeRow = {
  id: number;
  code: string;
  name: string;
  unit: string | null;
  description: string | null;
};

type MeasurementRow = {
  measurement_id: number;
  user_id: number;
  measured_at: string;
  source: string | null;
  notes: string | null;
  created_at: string;
  code: string;
  unit: string | null;
  value: number;
};

export class BodyMetricTypeCodeConstraintError extends Error {
  constructor(options?: ErrorOptions) {
    super("Body metric type code already exists", options);
    this.name = "BodyMetricTypeCodeConstraintError";
  }
}

function isMetricTypeCodeConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    (("code" in error &&
      error.code === "SQLITE_CONSTRAINT_UNIQUE" &&
      error.message.includes("body_metric_types.code")) ||
      error.message.includes("body metric type already exists"))
  );
}

function mapMetricType(row: MetricTypeRow): BodyMetricType {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    unit: row.unit,
    description: row.description,
  };
}

function mapMeasurements(rows: MeasurementRow[]): BodyMeasurement[] {
  const measurements = new Map<number, BodyMeasurement>();
  for (const row of rows) {
    let measurement = measurements.get(row.measurement_id);
    if (!measurement) {
      measurement = {
        id: row.measurement_id,
        userId: row.user_id,
        measuredAt: row.measured_at,
        source: row.source,
        notes: row.notes,
        createdAt: row.created_at,
        metrics: {},
      };
      measurements.set(row.measurement_id, measurement);
    }
    measurement.metrics[row.code] = { value: row.value, unit: row.unit };
  }
  return [...measurements.values()];
}

export class MeasurementRepository {
  constructor(private readonly database: SqliteDatabase) {}

  withImmediateTransaction<T>(operation: () => T): T {
    return this.database.transaction(operation).immediate();
  }

  withReadTransaction<T>(operation: () => T): T {
    return this.database.transaction(operation).deferred();
  }

  userExists(userId: number): boolean {
    return (
      this.database.prepare("SELECT 1 FROM users WHERE id = ?").get(userId) !==
      undefined
    );
  }

  listMetricTypes(): BodyMetricType[] {
    const rows = this.database
      .prepare(
        `
          SELECT id, code, name, unit, description
          FROM body_metric_types
          ORDER BY code, id
        `,
      )
      .all() as MetricTypeRow[];
    return rows.map(mapMetricType);
  }

  findMetricTypesByCodes(codes: string[]): BodyMetricType[] {
    const uniqueCodes = [...new Set(codes)];
    if (uniqueCodes.length === 0) return [];
    const placeholders = uniqueCodes.map(() => "?").join(", ");
    const rows = this.database
      .prepare(
        `
          SELECT id, code, name, unit, description
          FROM body_metric_types
          WHERE code IN (${placeholders})
          ORDER BY code, id
        `,
      )
      .all(...uniqueCodes) as MetricTypeRow[];
    return rows.map(mapMetricType);
  }

  insertMetricType(input: CreateBodyMetricTypeInput): BodyMetricType {
    try {
      const row = this.database
        .prepare(
          `
            INSERT INTO body_metric_types (id, code, name, unit, description)
            VALUES (
              (
                SELECT CASE
                  WHEN COALESCE(MAX(id), 0) < 9007199254740991
                  THEN COALESCE(MAX(id), 0) + 1
                END
                FROM body_metric_types
              ),
              @code, @name, @unit, @description
            )
            RETURNING id, code, name, unit, description
          `,
        )
        .get(input) as MetricTypeRow;
      return mapMetricType(row);
    } catch (error) {
      if (isMetricTypeCodeConflict(error)) {
        throw new BodyMetricTypeCodeConstraintError({ cause: error });
      }
      throw error;
    }
  }

  reserveMeasurementIds(valueCount: number): MeasurementIdReservation {
    if (!Number.isSafeInteger(valueCount) || valueCount < 1) {
      throw new Error("At least one body measurement value ID is required");
    }
    const measurementMaximum = this.database
      .prepare("SELECT COALESCE(MAX(id), 0) AS maximum FROM body_measurements")
      .get() as { maximum: number };
    if (measurementMaximum.maximum >= Number.MAX_SAFE_INTEGER) {
      throw new Error("Body measurement ID space is exhausted");
    }

    const valueMaximum = this.database
      .prepare(
        "SELECT COALESCE(MAX(id), 0) AS maximum FROM body_measurement_values",
      )
      .get() as { maximum: number };
    if (valueMaximum.maximum > Number.MAX_SAFE_INTEGER - valueCount) {
      throw new Error("Body measurement value ID space is exhausted");
    }

    return {
      measurementId: measurementMaximum.maximum + 1,
      valueIds: Array.from(
        { length: valueCount },
        (_, index) => valueMaximum.maximum + index + 1,
      ),
    };
  }

  insertMeasurement(
    reservation: MeasurementIdReservation,
    userId: number,
    input: CreateBodyMeasurementInput,
    values: MeasurementValueWrite[],
    createdAt: string,
  ): void {
    if (
      values.length !== reservation.valueIds.length ||
      values.some(({ id }, index) => id !== reservation.valueIds[index])
    ) {
      throw new Error("Body measurement value ID reservation is inconsistent");
    }
    const insertValue = this.database.prepare(
      `
        INSERT INTO body_measurement_values (
          id, measurement_id, metric_type_id, value
        ) VALUES (@id, @measurementId, @metricTypeId, @value)
      `,
    );
    for (const value of values) {
      insertValue.run({
        id: value.id,
        measurementId: reservation.measurementId,
        metricTypeId: value.metricTypeId,
        value: value.value,
      });
    }
    this.database
      .prepare(
        `
          INSERT INTO body_measurements (
            id, user_id, measured_at, source, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        reservation.measurementId,
        userId,
        input.measuredAt,
        input.source,
        input.notes,
        createdAt,
      );
  }

  listMeasurements(userId: number): BodyMeasurement[] {
    const rows = this.database
      .prepare(
        `
          SELECT
            body_measurements.id AS measurement_id,
            body_measurements.user_id,
            body_measurements.measured_at,
            body_measurements.source,
            body_measurements.notes,
            body_measurements.created_at,
            body_metric_types.code,
            body_metric_types.unit,
            body_measurement_values.value
          FROM body_measurements
          JOIN body_measurement_values
            ON body_measurement_values.measurement_id = body_measurements.id
          JOIN body_metric_types
            ON body_metric_types.id = body_measurement_values.metric_type_id
          WHERE body_measurements.user_id = ?
          ORDER BY
            body_measurements.measured_at DESC,
            body_measurements.id DESC,
            body_metric_types.code,
            body_metric_types.id
        `,
      )
      .all(userId) as MeasurementRow[];
    return mapMeasurements(rows);
  }

  findOwnedMeasurement(
    measurementId: number,
    userId: number,
  ): BodyMeasurement | null {
    const rows = this.database
      .prepare(
        `
          SELECT
            body_measurements.id AS measurement_id,
            body_measurements.user_id,
            body_measurements.measured_at,
            body_measurements.source,
            body_measurements.notes,
            body_measurements.created_at,
            body_metric_types.code,
            body_metric_types.unit,
            body_measurement_values.value
          FROM body_measurements
          JOIN body_measurement_values
            ON body_measurement_values.measurement_id = body_measurements.id
          JOIN body_metric_types
            ON body_metric_types.id = body_measurement_values.metric_type_id
          WHERE body_measurements.id = ? AND body_measurements.user_id = ?
          ORDER BY body_metric_types.code, body_metric_types.id
        `,
      )
      .all(measurementId, userId) as MeasurementRow[];
    return mapMeasurements(rows)[0] ?? null;
  }
}
