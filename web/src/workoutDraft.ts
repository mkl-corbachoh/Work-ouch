import type { RoutineExercise, Workout } from "./types";

export type DraftSet = {
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  rpe: number | null;
  completed: boolean;
  painLevel: number | null;
  painArea: string | null;
  notes: string | null;
};
export type ExerciseDraft = {
  routineExerciseId: number;
  exerciseId: number;
  position: number;
  notes: string | null;
  sets: DraftSet[];
};
const blank = (number: number): DraftSet => ({
  setNumber: number,
  weightKg: null,
  reps: null,
  durationSeconds: null,
  rpe: null,
  completed: false,
  painLevel: null,
  painArea: null,
  notes: null,
});
export function initializeDraft(
  workout: Workout,
  planned: RoutineExercise,
): ExerciseDraft {
  const existing = workout.results?.find(
    (result) => result.routineExerciseId === planned.id,
  );
  if (existing)
    return {
      routineExerciseId: planned.id as number,
      exerciseId: existing.exerciseId,
      position: planned.position,
      notes: existing.notes ?? null,
      sets: existing.sets.map((set) => ({ ...set })),
    };
  return {
    routineExerciseId: planned.id as number,
    exerciseId: planned.exerciseId,
    position: planned.position,
    notes: null,
    sets: planned.sets.map((set) => ({
      ...blank(set.setNumber),
      weightKg: set.targetWeightKg ?? null,
      reps: set.targetRepsMin ?? null,
    })),
  };
}
export function serializeDraft(draft: ExerciseDraft) {
  return {
    exerciseId: draft.exerciseId,
    position: draft.position,
    notes: draft.notes,
    sets: draft.sets.map((set) => ({ ...set })),
  };
}
export function addSet(draft: ExerciseDraft): ExerciseDraft {
  const number = Math.max(0, ...draft.sets.map((set) => set.setNumber)) + 1;
  return { ...draft, sets: [...draft.sets, blank(number)] };
}
export function removeSet(
  draft: ExerciseDraft,
  setNumber: number,
): ExerciseDraft {
  return {
    ...draft,
    sets: draft.sets.filter((set) => set.setNumber !== setNumber),
  };
}
