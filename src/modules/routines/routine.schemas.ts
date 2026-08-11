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

const nameSchema = z.string().trim().min(1).max(200);
const nullableNameSchema = nameSchema.nullable().optional().default(null);
const nullableTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(5000)
  .nullable()
  .optional()
  .default(null);
const nullableRpeSchema = z
  .number()
  .finite()
  .min(1)
  .max(10)
  .nullable()
  .optional()
  .default(null);

function uniqueNumbers<T>(
  values: T[],
  select: (value: T) => number,
  field: string,
  context: z.RefinementCtx,
): void {
  const seen = new Set<number>();
  values.forEach((value, index) => {
    const selected = select(value);
    if (seen.has(selected)) {
      context.addIssue({
        code: "custom",
        path: [index, field],
        message: `${field} must be unique`,
      });
    }
    seen.add(selected);
  });
}

export const routineSetSchema = z
  .strictObject({
    setNumber: safePositiveInteger,
    setType: z
      .enum(["warmup", "work", "backoff"])
      .nullable()
      .optional()
      .default(null),
    targetWeightKg: z
      .number()
      .finite()
      .nonnegative()
      .nullable()
      .optional()
      .default(null),
    targetRepsMin: safePositiveInteger.nullable().optional().default(null),
    targetRepsMax: safePositiveInteger.nullable().optional().default(null),
    targetSeconds: safeNonnegativeInteger.nullable().optional().default(null),
    targetRpe: nullableRpeSchema,
    notes: nullableTextSchema,
  })
  .superRefine((set, context) => {
    const hasMinimum = set.targetRepsMin !== null;
    const hasMaximum = set.targetRepsMax !== null;
    if (hasMinimum !== hasMaximum) {
      context.addIssue({
        code: "custom",
        path: hasMinimum ? ["targetRepsMax"] : ["targetRepsMin"],
        message: "targetRepsMin and targetRepsMax must appear together",
      });
    } else if (
      set.targetRepsMin !== null &&
      set.targetRepsMax !== null &&
      set.targetRepsMin > set.targetRepsMax
    ) {
      context.addIssue({
        code: "custom",
        path: ["targetRepsMin"],
        message: "targetRepsMin must not exceed targetRepsMax",
      });
    }

    if (set.targetRepsMin === null && set.targetSeconds === null) {
      context.addIssue({
        code: "custom",
        path: [],
        message: "A repetition or duration target is required",
      });
    }
  });

export const routineExerciseSchema = z
  .strictObject({
    exerciseId: safePositiveInteger,
    position: safePositiveInteger,
    restSeconds: safeNonnegativeInteger.nullable().optional().default(null),
    targetRpe: nullableRpeSchema,
    notes: nullableTextSchema,
    sets: z.array(routineSetSchema).min(1),
  })
  .superRefine((exercise, context) => {
    uniqueNumbers(exercise.sets, (set) => set.setNumber, "setNumber", context);
  });

export const routineVersionDefinitionSchema = z
  .strictObject({
    name: nullableNameSchema,
    notes: nullableTextSchema,
    exercises: z.array(routineExerciseSchema).min(1),
  })
  .superRefine((version, context) => {
    uniqueNumbers(
      version.exercises,
      (exercise) => exercise.position,
      "position",
      context,
    );
  });

export const createRoutineSchema = z.strictObject({
  userId: safePositiveInteger,
  name: nameSchema,
  description: nullableTextSchema,
  version: routineVersionDefinitionSchema,
});

export const createRoutineVersionSchema = z
  .strictObject({
    userId: safePositiveInteger,
    name: nullableNameSchema,
    notes: nullableTextSchema,
    exercises: z.array(routineExerciseSchema).min(1),
  })
  .superRefine((version, context) => {
    uniqueNumbers(
      version.exercises,
      (exercise) => exercise.position,
      "position",
      context,
    );
  });

export const routineIdParamsSchema = z.strictObject({
  id: canonicalPositiveInteger,
});

export const routineListQuerySchema = z.strictObject({
  userId: canonicalPositiveInteger,
});

export const routineDetailQuerySchema = z.strictObject({
  userId: canonicalPositiveInteger,
  versionNumber: canonicalPositiveInteger.optional(),
});

export const routineEmptyQuerySchema = z.strictObject({});

export type RoutineSetInput = z.infer<typeof routineSetSchema>;
export type RoutineExerciseInput = z.infer<typeof routineExerciseSchema>;
export type RoutineVersionDefinitionInput = z.infer<
  typeof routineVersionDefinitionSchema
>;
export type CreateRoutineInput = z.infer<typeof createRoutineSchema>;
export type CreateRoutineVersionInput = z.infer<
  typeof createRoutineVersionSchema
>;
