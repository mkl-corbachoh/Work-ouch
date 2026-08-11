import { describe, expect, it } from "vitest";
import {
  createExerciseSchema,
  emptyQuerySchema,
  exerciseIdParamsSchema,
  exerciseListQuerySchema,
  patchExerciseSchema,
} from "../../../src/modules/exercises/exercise.schemas";

describe("exercise schemas", () => {
  describe("create", () => {
    it("trims required and optional text and applies defaults", () => {
      expect(
        createExerciseSchema.parse({
          slug: "  back-squat  ",
          name: "  Back Squat  ",
          equipment: "  Barbell  ",
        }),
      ).toEqual({
        slug: "back-squat",
        name: "Back Squat",
        movementPattern: null,
        equipment: "Barbell",
        description: null,
        techniqueNotes: null,
        safetyNotes: null,
        videoUrl: null,
        isActive: true,
      });
    });

    it.each([
      { slug: "Back-Squat", name: "Back Squat" },
      { slug: "back--squat", name: "Back Squat" },
      { slug: "back_squat", name: "Back Squat" },
      { slug: "", name: "Back Squat" },
      { slug: `a${"b".repeat(100)}`, name: "Back Squat" },
    ])("rejects invalid slug $slug", (input) => {
      expect(createExerciseSchema.safeParse(input).success).toBe(false);
    });

    it.each([
      ["empty name", { slug: "squat", name: "  " }],
      ["long name", { slug: "squat", name: "x".repeat(201) }],
      ["empty metadata", { slug: "squat", name: "Squat", equipment: " " }],
      [
        "long metadata",
        { slug: "squat", name: "Squat", description: "x".repeat(5001) },
      ],
      [
        "long short metadata",
        { slug: "squat", name: "Squat", movementPattern: "x".repeat(101) },
      ],
      ["coerced boolean", { slug: "squat", name: "Squat", isActive: 1 }],
      ["unknown field", { slug: "squat", name: "Squat", sets: 3 }],
    ])("rejects %s", (_label, input) => {
      expect(createExerciseSchema.safeParse(input).success).toBe(false);
    });

    it("accepts explicit null metadata", () => {
      expect(
        createExerciseSchema.parse({
          slug: "squat",
          name: "Squat",
          equipment: null,
          videoUrl: null,
        }),
      ).toMatchObject({ equipment: null, videoUrl: null });
    });

    it.each(["https://example.com/video?id=1", "http://example.com/video"])(
      "accepts HTTP video URL %s",
      (videoUrl) => {
        expect(
          createExerciseSchema.safeParse({
            slug: "squat",
            name: "Squat",
            videoUrl,
          }).success,
        ).toBe(true);
      },
    );

    it.each([
      "ftp://example.com/video",
      "//example.com/video",
      "not-a-url",
      `https://example.com/${"x".repeat(2030)}`,
    ])("rejects invalid video URL %s", (videoUrl) => {
      expect(
        createExerciseSchema.safeParse({
          slug: "squat",
          name: "Squat",
          videoUrl,
        }).success,
      ).toBe(false);
    });
  });

  describe("patch", () => {
    it("keeps only sent fields and allows null to clear metadata", () => {
      expect(
        patchExerciseSchema.parse({ name: "  Squat  ", description: null }),
      ).toEqual({ name: "Squat", description: null });
    });

    it.each([{}, { slug: "new-slug" }, { createdAt: "now" }, { reps: 10 }])(
      "rejects empty or non-editable input %#",
      (input) => {
        expect(patchExerciseSchema.safeParse(input).success).toBe(false);
      },
    );
  });

  describe("params and queries", () => {
    it.each([
      ["1", 1],
      ["42", 42],
    ])("parses canonical id %s", (id, expected) => {
      expect(exerciseIdParamsSchema.parse({ id })).toEqual({ id: expected });
    });

    it.each(["0", "01", "+1", "1.0", "-1", "abc", "9007199254740992"])(
      "rejects invalid id %s",
      (id) => {
        expect(exerciseIdParamsSchema.safeParse({ id }).success).toBe(false);
      },
    );

    it("defaults list filtering and parses exact booleans", () => {
      expect(exerciseListQuerySchema.parse({})).toEqual({
        includeInactive: false,
      });
      expect(
        exerciseListQuerySchema.parse({ includeInactive: "true" }),
      ).toEqual({ includeInactive: true });
      expect(
        exerciseListQuerySchema.parse({ includeInactive: "false" }),
      ).toEqual({ includeInactive: false });
    });

    it.each([
      { includeInactive: "1" },
      { includeInactive: "TRUE" },
      { includeInactive: ["true", "false"] },
      { search: "squat" },
    ])("rejects invalid list query %#", (query) => {
      expect(exerciseListQuerySchema.safeParse(query).success).toBe(false);
    });

    it("rejects unknown query parameters where no query is supported", () => {
      expect(emptyQuerySchema.parse({})).toEqual({});
      expect(emptyQuerySchema.safeParse({ extra: "value" }).success).toBe(
        false,
      );
    });
  });
});
