import { describe, expect, it } from "vitest";
import { definition, routineSetInput } from "../src/routineBuilder";

describe("routine builder", () => {
  it("validates repetition or duration targets", () => {
    expect(
      routineSetInput.safeParse({
        setNumber: 1,
        setType: "work",
        targetWeightKg: null,
        targetRepsMin: null,
        targetRepsMax: null,
        targetSeconds: null,
        targetRpe: null,
        notes: null,
      }).success,
    ).toBe(false);
  });
  it("serializes a detail-shaped fixture without server fields", () => {
    const result = definition(" A ", null, [
      {
        exercise: { id: 1, name: "Squat", slug: "squat", isActive: true },
        exerciseId: 1,
        position: 1,
        id: 22,
        sets: [
          {
            id: 33,
            setNumber: 1,
            effectiveTargetRpe: 8,
            targetRepsMin: 5,
            targetRepsMax: 5,
            targetWeightKg: 50,
            targetSeconds: null,
            targetRpe: null,
            setType: "work",
            notes: null,
          } as never,
        ],
      },
    ]);
    expect(result.name).toBe("A");
    expect(result.exercises[0]).not.toHaveProperty("id");
    expect(result.exercises[0]).not.toHaveProperty("exercise");
    expect(result.exercises[0].sets[0]).not.toHaveProperty("id");
    expect(result.exercises[0].sets[0]).not.toHaveProperty(
      "effectiveTargetRpe",
    );
  });
});
