import {
  type BodyMeasurement,
  type BodyMetricType,
  BodyMetricTypeCodeConstraintError,
  type MeasurementRepository,
} from "./measurement.repository";
import type {
  CreateBodyMeasurementInput,
  CreateBodyMetricTypeInput,
} from "./measurement.schemas";

export class UserNotFoundError extends Error {
  constructor() {
    super("User not found");
    this.name = "UserNotFoundError";
  }
}

export class BodyMetricTypeNotFoundError extends Error {
  readonly code: string;

  constructor(code: string) {
    super("Body metric type not found");
    this.name = "BodyMetricTypeNotFoundError";
    this.code = code;
  }
}

export class BodyMetricTypeConflictError extends Error {
  constructor(options?: ErrorOptions) {
    super("Body metric type code already exists", options);
    this.name = "BodyMetricTypeConflictError";
  }
}

export class BodyMeasurementNotFoundError extends Error {
  constructor() {
    super("Body measurement not found");
    this.name = "BodyMeasurementNotFoundError";
  }
}

export class MeasurementService {
  constructor(
    private readonly repository: MeasurementRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private assertUserExists(userId: number): void {
    if (!this.repository.userExists(userId)) throw new UserNotFoundError();
  }

  listMetricTypes(): BodyMetricType[] {
    return this.repository.listMetricTypes();
  }

  createMetricType(input: CreateBodyMetricTypeInput): BodyMetricType {
    return this.repository.withImmediateTransaction(() => {
      try {
        return this.repository.insertMetricType(input);
      } catch (error) {
        if (error instanceof BodyMetricTypeCodeConstraintError) {
          throw new BodyMetricTypeConflictError({ cause: error });
        }
        throw error;
      }
    });
  }

  createMeasurement(
    userId: number,
    input: CreateBodyMeasurementInput,
  ): BodyMeasurement {
    return this.repository.withImmediateTransaction(() => {
      this.assertUserExists(userId);
      const metricEntries = Object.entries(input.metrics).sort(
        ([left], [right]) => (left < right ? -1 : left > right ? 1 : 0),
      );
      const types = this.repository.findMetricTypesByCodes(
        metricEntries.map(([code]) => code),
      );
      const typesByCode = new Map(types.map((type) => [type.code, type]));
      for (const [code] of metricEntries) {
        if (!typesByCode.has(code)) throw new BodyMetricTypeNotFoundError(code);
      }

      const reservation = this.repository.reserveMeasurementIds(
        metricEntries.length,
      );
      this.repository.insertMeasurement(
        reservation,
        userId,
        input,
        metricEntries.map(([code, value], index) => ({
          id: reservation.valueIds[index] as number,
          metricTypeId: (typesByCode.get(code) as BodyMetricType).id,
          value,
        })),
        this.now().toISOString(),
      );
      const measurement = this.repository.findOwnedMeasurement(
        reservation.measurementId,
        userId,
      );
      if (!measurement) {
        throw new Error("Created body measurement could not be read");
      }
      return measurement;
    });
  }

  listMeasurements(userId: number): BodyMeasurement[] {
    this.assertUserExists(userId);
    return this.repository.listMeasurements(userId);
  }

  getMeasurement(measurementId: number, userId: number): BodyMeasurement {
    return this.repository.withReadTransaction(() => {
      const measurement = this.repository.findOwnedMeasurement(
        measurementId,
        userId,
      );
      if (!measurement) throw new BodyMeasurementNotFoundError();
      return measurement;
    });
  }
}
