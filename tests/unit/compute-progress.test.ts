import { describe, test, expect } from "vitest";
import { computeProgress } from "../../src/lib/week-utils.ts";
import type { Workout } from "../../src/lib/types.ts";

function workout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: "w",
    planId: "plan-1",
    phaseId: null,
    labelId: null,
    date: "2026-04-13",
    title: "w",
    description: null,
    targetDurationMin: null,
    targetDistanceM: null,
    sortOrder: 0,
    status: "planned",
    completionNotes: null,
    trainerNotes: null,
    activity: null,
    execution: null,
    metadata: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("computeProgress", () => {
  test("excludes skipped workouts from the denominator", () => {
    // 1 completed + 1 skipped → the skip is ignored, so 1/1 = 100%
    expect(computeProgress([workout({ status: "completed" }), workout({ status: "skipped" })])).toBe(100);
  });

  test("counts completed over the non-skipped checkable workouts", () => {
    // 2 completed, 1 skipped, 1 planned → 2/3 (skipped not in denominator)
    const result = computeProgress([workout({ status: "completed" }), workout({ status: "completed" }), workout({ status: "skipped" }), workout({ status: "planned" })]);
    expect(result).toBeCloseTo((2 / 3) * 100);
  });

  test("returns 0 when every checkable workout is skipped", () => {
    expect(computeProgress([workout({ status: "skipped" }), workout({ status: "skipped" })])).toBe(0);
  });

  test("returns 0 for an empty week", () => {
    expect(computeProgress([])).toBe(0);
  });

  test("ignores non-checkable rest and note variants", () => {
    // rest + note are not checkable; only the completed standard workout counts → 1/1 = 100%
    const result = computeProgress([
      workout({ status: "completed" }),
      workout({ status: "planned", metadata: { ui: { variant: "rest" } } }),
      workout({ status: "planned", metadata: { ui: { variant: "note" } } }),
    ]);
    expect(result).toBe(100);
  });

  test("treats optional workouts as checkable", () => {
    // completed standard + planned optional → 1/2 = 50%
    const result = computeProgress([workout({ status: "completed" }), workout({ status: "planned", metadata: { optional: true } })]);
    expect(result).toBe(50);
  });
});
