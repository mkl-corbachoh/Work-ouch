import { z } from "zod";
import type { Exercise, RoutineExercise } from "./types";
export const routineSetInput = z
  .object({
    setNumber: z.coerce.number().int().positive(),
    setType: z.enum(["warmup", "work", "backoff"]).nullable(),
    targetWeightKg: z.coerce.number().finite().nonnegative().nullable(),
    targetRepsMin: z.coerce.number().int().positive().nullable(),
    targetRepsMax: z.coerce.number().int().positive().nullable(),
    targetSeconds: z.coerce.number().int().nonnegative().nullable(),
    targetRpe: z.coerce.number().finite().min(1).max(10).nullable(),
    notes: z.string().trim().max(5000).nullable(),
  })
  .superRefine((value, ctx) => {
    if ((value.targetRepsMin === null) !== (value.targetRepsMax === null))
      ctx.addIssue({
        code: "custom",
        message: "Minimum and maximum repetitions must be provided together",
        path: [
          value.targetRepsMin === null ? "targetRepsMin" : "targetRepsMax",
        ],
      });
    if (value.targetRepsMin === null && value.targetSeconds === null)
      ctx.addIssue({
        code: "custom",
        message: "Reps or duration is required",
        path: ["targetRepsMin"],
      });
    if (
      value.targetRepsMin !== null &&
      value.targetRepsMax !== null &&
      value.targetRepsMin > value.targetRepsMax
    )
      ctx.addIssue({
        code: "custom",
        message: "Minimum cannot exceed maximum",
        path: ["targetRepsMin"],
      });
  });
export type BuilderExercise = RoutineExercise & { exercise: Exercise };
export function definition(
  name: string,
  notes: string | null,
  exercises: BuilderExercise[],
) {
  return {
    name: name.trim() || null,
    notes,
    exercises: exercises.map((item) => ({
      exerciseId: item.exerciseId,
      position: item.position,
      restSeconds: item.restSeconds ?? null,
      targetRpe: item.targetRpe ?? null,
      notes: item.notes ?? null,
      sets: item.sets.map((set) => ({
        setNumber: set.setNumber,
        setType: set.setType ?? null,
        targetWeightKg: set.targetWeightKg ?? null,
        targetRepsMin: set.targetRepsMin ?? null,
        targetRepsMax: set.targetRepsMax ?? null,
        targetSeconds: set.targetSeconds ?? null,
        targetRpe: set.targetRpe ?? null,
        notes: set.notes ?? null,
      })),
    })),
  };
}
