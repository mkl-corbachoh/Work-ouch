import {
  type WorkoutDetail,
  WorkoutPositionConstraintError,
  type WorkoutRepository,
  type WorkoutSummary,
} from "./workout.repository";
import type {
  CompleteWorkoutInput,
  PutWorkoutExerciseInput,
  StartWorkoutInput,
  WorkoutStatus,
} from "./workout.schemas";

export class UserNotFoundError extends Error {
  constructor() {
    super("User not found");
    this.name = "UserNotFoundError";
  }
}

export class RoutineVersionNotFoundError extends Error {
  constructor() {
    super("Routine version not found");
    this.name = "RoutineVersionNotFoundError";
  }
}

export class WorkoutNotFoundError extends Error {
  constructor() {
    super("Workout not found");
    this.name = "WorkoutNotFoundError";
  }
}

export class RoutineExerciseNotFoundError extends Error {
  constructor() {
    super("Routine exercise not found");
    this.name = "RoutineExerciseNotFoundError";
  }
}

export class ExerciseNotFoundError extends Error {
  constructor() {
    super("Exercise not found");
    this.name = "ExerciseNotFoundError";
  }
}

export class ExerciseInactiveError extends Error {
  constructor() {
    super("Exercise is inactive");
    this.name = "ExerciseInactiveError";
  }
}

export class WorkoutNotInProgressError extends Error {
  constructor() {
    super("Workout is not in progress");
    this.name = "WorkoutNotInProgressError";
  }
}

export class WorkoutCompletionTimeInvalidError extends Error {
  constructor() {
    super("Workout completion time is before its start time");
    this.name = "WorkoutCompletionTimeInvalidError";
  }
}

export class WorkoutPositionConflictError extends Error {
  constructor(options?: ErrorOptions) {
    super("Workout result position is already used", options);
    this.name = "WorkoutPositionConflictError";
  }
}

export class WorkoutService {
  constructor(
    private readonly repository: WorkoutRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private assertUserExists(userId: number): void {
    if (!this.repository.userExists(userId)) throw new UserNotFoundError();
  }

  private requireOwnedInProgressWorkout(workoutId: number, userId: number) {
    const workout = this.repository.findWorkoutState(workoutId);
    if (!workout || workout.userId !== userId) throw new WorkoutNotFoundError();
    if (workout.status !== "in_progress") {
      throw new WorkoutNotInProgressError();
    }
    return workout;
  }

  private requireActiveExercise(exerciseId: number): void {
    const exercise = this.repository.findExerciseState(exerciseId);
    if (!exercise) throw new ExerciseNotFoundError();
    if (!exercise.isActive) throw new ExerciseInactiveError();
  }

  private requireDetail(workoutId: number): WorkoutDetail {
    const detail = this.repository.findDetail(workoutId);
    if (!detail) throw new Error("Workout detail could not be read");
    return detail;
  }

  start(input: StartWorkoutInput): WorkoutDetail {
    return this.repository.withImmediateTransaction(() => {
      this.assertUserExists(input.userId);
      const version = this.repository.findRoutineVersionState(
        input.routineVersionId,
      );
      if (!version || version.userId !== input.userId || !version.isSealed) {
        throw new RoutineVersionNotFoundError();
      }
      const workoutId = this.repository.insertSession(
        input.userId,
        version.routineId,
        version.id,
        input.startedAt,
        this.now().toISOString(),
      );
      return this.requireDetail(workoutId);
    });
  }

  putResult(
    workoutId: number,
    routineExerciseId: number,
    input: PutWorkoutExerciseInput,
  ): WorkoutDetail {
    return this.repository.withImmediateTransaction(() => {
      this.assertUserExists(input.userId);
      const workout = this.requireOwnedInProgressWorkout(
        workoutId,
        input.userId,
      );
      if (
        !this.repository.plannedExerciseBelongsToVersion(
          routineExerciseId,
          workout.routineVersionId,
        )
      ) {
        throw new RoutineExerciseNotFoundError();
      }
      this.requireActiveExercise(input.exerciseId);

      try {
        const resultId = this.repository.upsertResult(
          workoutId,
          workout.routineVersionId,
          routineExerciseId,
          input,
        );
        this.repository.synchronizeSets(resultId, input.sets);
      } catch (error) {
        if (error instanceof WorkoutPositionConstraintError) {
          throw new WorkoutPositionConflictError({ cause: error });
        }
        throw error;
      }

      this.requireActiveExercise(input.exerciseId);
      return this.requireDetail(workoutId);
    });
  }

  complete(workoutId: number, input: CompleteWorkoutInput): WorkoutDetail {
    return this.repository.withImmediateTransaction(() => {
      this.assertUserExists(input.userId);
      const workout = this.requireOwnedInProgressWorkout(
        workoutId,
        input.userId,
      );
      if (input.completedAt < workout.startedAt) {
        throw new WorkoutCompletionTimeInvalidError();
      }
      if (
        !this.repository.complete(
          workoutId,
          input.completedAt,
          input.overallRpe,
          input.notes,
        )
      ) {
        throw new WorkoutNotInProgressError();
      }
      return this.requireDetail(workoutId);
    });
  }

  cancel(workoutId: number, userId: number): WorkoutDetail {
    return this.repository.withImmediateTransaction(() => {
      this.assertUserExists(userId);
      this.requireOwnedInProgressWorkout(workoutId, userId);
      if (!this.repository.cancel(workoutId)) {
        throw new WorkoutNotInProgressError();
      }
      return this.requireDetail(workoutId);
    });
  }

  list(userId: number, status?: WorkoutStatus): WorkoutSummary[] {
    this.assertUserExists(userId);
    return this.repository.list(userId, status);
  }

  get(workoutId: number, userId: number): WorkoutDetail {
    return this.repository.withReadTransaction(() => {
      const workout = this.repository.findWorkoutState(workoutId);
      if (!workout || workout.userId !== userId) {
        throw new WorkoutNotFoundError();
      }
      return this.requireDetail(workoutId);
    });
  }
}
