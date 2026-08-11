import { z } from "zod";

const safePositiveInteger = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

const safeNonnegativeInteger = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

const canonicalPositiveInteger = z
  .string()
  .regex(/^[1-9]\d*$/, "Must be a canonical positive integer")
  .transform(Number)
  .pipe(safePositiveInteger);

const utcTimestamp = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

const nullableText = (maximumLength: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximumLength)
    .nullable()
    .optional()
    .default(null);

const nullableRpe = z
  .number()
  .finite()
  .min(1)
  .max(10)
  .nullable()
  .optional()
  .default(null);

export const workoutSetSchema = z.strictObject({
  setNumber: safePositiveInteger,
  weightKg: z
    .number()
    .finite()
    .nonnegative()
    .nullable()
    .optional()
    .default(null),
  reps: safeNonnegativeInteger.nullable().optional().default(null),
  durationSeconds: safeNonnegativeInteger.nullable().optional().default(null),
  rpe: nullableRpe,
  completed: z.boolean(),
  painLevel: z
    .number()
    .int()
    .min(0)
    .max(10)
    .nullable()
    .optional()
    .default(null),
  painArea: nullableText(200),
  notes: nullableText(5000),
});

export const startWorkoutSchema = z.strictObject({
  userId: safePositiveInteger,
  routineVersionId: safePositiveInteger,
  startedAt: utcTimestamp,
});

export const putWorkoutExerciseSchema = z
  .strictObject({
    userId: safePositiveInteger,
    exerciseId: safePositiveInteger,
    position: safePositiveInteger,
    notes: nullableText(5000),
    sets: z.array(workoutSetSchema),
  })
  .superRefine((result, context) => {
    const seen = new Set<number>();
    result.sets.forEach((set, index) => {
      if (seen.has(set.setNumber)) {
        context.addIssue({
          code: "custom",
          path: ["sets", index, "setNumber"],
          message: "setNumber must be unique",
        });
      }
      seen.add(set.setNumber);
    });
  });

export const completeWorkoutSchema = z.strictObject({
  userId: safePositiveInteger,
  completedAt: utcTimestamp,
  overallRpe: nullableRpe,
  notes: nullableText(5000),
});

export const cancelWorkoutSchema = z.strictObject({
  userId: safePositiveInteger,
});

export const workoutIdParamsSchema = z.strictObject({
  id: canonicalPositiveInteger,
});

export const workoutExerciseParamsSchema = z.strictObject({
  id: canonicalPositiveInteger,
  routineExerciseId: canonicalPositiveInteger,
});

export const workoutListQuerySchema = z.strictObject({
  userId: canonicalPositiveInteger,
  status: z.enum(["in_progress", "completed", "cancelled"]).optional(),
});

export const workoutDetailQuerySchema = z.strictObject({
  userId: canonicalPositiveInteger,
});

export const workoutEmptyQuerySchema = z.strictObject({});

export type WorkoutStatus = "in_progress" | "completed" | "cancelled";
export type WorkoutSetInput = z.infer<typeof workoutSetSchema>;
export type StartWorkoutInput = z.infer<typeof startWorkoutSchema>;
export type PutWorkoutExerciseInput = z.infer<typeof putWorkoutExerciseSchema>;
export type CompleteWorkoutInput = z.infer<typeof completeWorkoutSchema>;
export type CancelWorkoutInput = z.infer<typeof cancelWorkoutSchema>;
