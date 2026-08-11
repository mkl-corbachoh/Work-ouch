import { z } from "zod";

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format");

const nameSchema = z.string().trim().min(1).max(200);

function nullableText(maximumLength: number) {
  return z.string().trim().min(1).max(maximumLength).nullable();
}

const videoUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .regex(/^https?:\/\//i, "Video URL must use HTTP or HTTPS")
  .url()
  .nullable();

export const createExerciseSchema = z.strictObject({
  slug: slugSchema,
  name: nameSchema,
  movementPattern: nullableText(100).optional().default(null),
  equipment: nullableText(100).optional().default(null),
  description: nullableText(5000).optional().default(null),
  techniqueNotes: nullableText(5000).optional().default(null),
  safetyNotes: nullableText(5000).optional().default(null),
  videoUrl: videoUrlSchema.optional().default(null),
  isActive: z.boolean().optional().default(true),
});

export const patchExerciseSchema = z
  .strictObject({
    name: nameSchema.optional(),
    movementPattern: nullableText(100).optional(),
    equipment: nullableText(100).optional(),
    description: nullableText(5000).optional(),
    techniqueNotes: nullableText(5000).optional(),
    safetyNotes: nullableText(5000).optional(),
    videoUrl: videoUrlSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

const canonicalPositiveInteger = z
  .string()
  .regex(/^[1-9]\d*$/, "Must be a canonical positive integer")
  .transform(Number)
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));

export const exerciseIdParamsSchema = z.strictObject({
  id: canonicalPositiveInteger,
});

export const exerciseListQuerySchema = z.strictObject({
  includeInactive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional()
    .default(false),
});

export const emptyQuerySchema = z.strictObject({});

export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;
export type PatchExerciseInput = z.infer<typeof patchExerciseSchema>;
