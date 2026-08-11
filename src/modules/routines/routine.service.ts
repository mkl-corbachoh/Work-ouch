import type {
  RoutineDetail,
  RoutineRepository,
  RoutineSummary,
} from "./routine.repository";
import type {
  CreateRoutineInput,
  CreateRoutineVersionInput,
  RoutineVersionDefinitionInput,
} from "./routine.schemas";

export class UserNotFoundError extends Error {
  constructor() {
    super("User not found");
    this.name = "UserNotFoundError";
  }
}

export class RoutineNotFoundError extends Error {
  constructor() {
    super("Routine not found");
    this.name = "RoutineNotFoundError";
  }
}

export class RoutineVersionNotFoundError extends Error {
  constructor() {
    super("Routine version not found");
    this.name = "RoutineVersionNotFoundError";
  }
}

export class ExerciseNotFoundError extends Error {
  readonly exerciseId: number;

  constructor(exerciseId: number) {
    super("Exercise not found");
    this.name = "ExerciseNotFoundError";
    this.exerciseId = exerciseId;
  }
}

export class ExerciseInactiveError extends Error {
  readonly exerciseId: number;

  constructor(exerciseId: number) {
    super("Exercise is inactive");
    this.name = "ExerciseInactiveError";
    this.exerciseId = exerciseId;
  }
}

function versionDefinition(
  input: CreateRoutineVersionInput,
): RoutineVersionDefinitionInput {
  return {
    name: input.name,
    notes: input.notes,
    exercises: input.exercises,
  };
}

export class RoutineService {
  constructor(
    private readonly repository: RoutineRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private assertUserExists(userId: number): void {
    if (!this.repository.userExists(userId)) throw new UserNotFoundError();
  }

  private assertExercisesAvailable(
    definition: RoutineVersionDefinitionInput,
  ): void {
    const exerciseIds = definition.exercises.map(
      ({ exerciseId }) => exerciseId,
    );
    const states = new Map(
      this.repository
        .findExerciseStates(exerciseIds)
        .map((state) => [state.id, state]),
    );

    for (const exerciseId of new Set(exerciseIds)) {
      const state = states.get(exerciseId);
      if (!state) throw new ExerciseNotFoundError(exerciseId);
      if (!state.isActive) throw new ExerciseInactiveError(exerciseId);
    }
  }

  create(input: CreateRoutineInput): RoutineDetail {
    return this.repository.withImmediateTransaction(() => {
      this.assertUserExists(input.userId);
      this.assertExercisesAvailable(input.version);
      const timestamp = this.now().toISOString();
      const routineId = this.repository.insertRoutine(
        input.userId,
        input.name,
        input.description,
        timestamp,
      );
      const versionId = this.repository.insertVersion(
        routineId,
        1,
        input.version,
        timestamp,
      );
      this.repository.sealVersion(versionId);
      if (!this.repository.finalizeInitialVersion(routineId)) {
        throw new Error("Initial routine version could not be finalized");
      }
      const detail = this.repository.findDetail(routineId, 1);
      if (!detail) throw new Error("Created routine version could not be read");
      return detail;
    });
  }

  createVersion(
    routineId: number,
    input: CreateRoutineVersionInput,
  ): RoutineDetail {
    return this.repository.withImmediateTransaction(() => {
      this.assertUserExists(input.userId);
      const routine = this.repository.findRoutineState(routineId);
      if (!routine || routine.userId !== input.userId) {
        throw new RoutineNotFoundError();
      }
      if (routine.maxVersionNumber !== routine.currentVersionNumber) {
        throw new Error("Routine version state is inconsistent");
      }
      if (routine.maxVersionNumber >= Number.MAX_SAFE_INTEGER) {
        throw new Error("Routine version number space is exhausted");
      }

      const definition = versionDefinition(input);
      this.assertExercisesAvailable(definition);
      const nextVersionNumber = routine.maxVersionNumber + 1;
      const timestamp = this.now().toISOString();
      const versionId = this.repository.insertVersion(
        routineId,
        nextVersionNumber,
        definition,
        timestamp,
      );
      this.repository.sealVersion(versionId);
      if (
        !this.repository.advanceCurrentVersion(
          routineId,
          routine.currentVersionNumber,
          nextVersionNumber,
          timestamp,
        )
      ) {
        throw new Error("Current routine version could not be advanced");
      }
      const detail = this.repository.findDetail(routineId, nextVersionNumber);
      if (!detail) throw new Error("Created routine version could not be read");
      return detail;
    });
  }

  list(userId: number): RoutineSummary[] {
    this.assertUserExists(userId);
    return this.repository.list(userId);
  }

  get(
    routineId: number,
    userId: number,
    requestedVersionNumber?: number,
  ): RoutineDetail {
    const routine = this.repository.findRoutineState(routineId);
    if (!routine || routine.userId !== userId) throw new RoutineNotFoundError();
    const detail = this.repository.findDetail(
      routineId,
      requestedVersionNumber,
    );
    if (!detail) {
      if (requestedVersionNumber !== undefined) {
        throw new RoutineVersionNotFoundError();
      }
      throw new Error("Current routine version could not be read");
    }
    return detail;
  }
}
