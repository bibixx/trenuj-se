import { describe, test, expect } from "vitest";
import { safeParsePlanNoteMetadata } from "../../shared/plan-note-metadata.ts";
import { getDatesInRange, getWorkoutDateGroups, matchesPlanWeek, type PlanWeek } from "../../src/lib/week-utils.ts";
import type { Workout } from "../../src/lib/types.ts";

describe("plan note week metadata", () => {
  test("parses numeric plan week metadata", () => {
    expect(safeParsePlanNoteMetadata({ week: 5, source: "coach" })).toEqual({ week: 5, source: "coach" });
  });

  test("parses legacy ISO week metadata", () => {
    expect(safeParsePlanNoteMetadata({ week: "2026-W15" })).toEqual({ week: "2026-W15" });
  });

  test("rejects invalid week metadata", () => {
    expect(safeParsePlanNoteMetadata({ week: false })).toBeNull();
  });
});

function workout(id: string, date: string): Workout {
  return {
    id,
    planId: "plan-1",
    phaseId: null,
    labelId: null,
    date,
    title: id,
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
  };
}

describe("matchesPlanWeek", () => {
  const week: PlanWeek = {
    week: 8,
    startDate: "2026-04-13",
    endDate: "2026-04-19",
  };

  test("matches canonical numeric plan week metadata", () => {
    expect(matchesPlanWeek({ week: 8 }, week)).toBe(true);
    expect(matchesPlanWeek({ week: 7 }, week)).toBe(false);
  });

  test("matches legacy ISO week metadata", () => {
    expect(matchesPlanWeek({ week: "2026-W16" }, week)).toBe(true);
    expect(matchesPlanWeek({ week: "2026-W15" }, week)).toBe(false);
  });

  test("does not match when metadata is missing", () => {
    expect(matchesPlanWeek(null, week)).toBe(false);
    expect(matchesPlanWeek({}, week)).toBe(false);
  });
});

describe("date range workout groups", () => {
  test("returns inclusive dates in a range", () => {
    expect(getDatesInRange("2026-04-13", "2026-04-16")).toEqual(["2026-04-13", "2026-04-14", "2026-04-15", "2026-04-16"]);
  });

  test("includes empty groups for dates without workouts", () => {
    const groups = getWorkoutDateGroups([workout("w1", "2026-04-13"), workout("w2", "2026-04-15"), workout("w3", "2026-04-15")], {
      startDate: "2026-04-13",
      endDate: "2026-04-16",
    });

    expect(groups.map((group) => ({ date: group.date, workoutIds: group.workouts.map((w) => w.id) }))).toEqual([
      { date: "2026-04-13", workoutIds: ["w1"] },
      { date: "2026-04-14", workoutIds: [] },
      { date: "2026-04-15", workoutIds: ["w2", "w3"] },
      { date: "2026-04-16", workoutIds: [] },
    ]);
  });

  test("keeps only workout dates when no range is provided", () => {
    const groups = getWorkoutDateGroups([workout("w1", "2026-04-13"), workout("w2", "2026-04-15")]);

    expect(groups.map((group) => group.date)).toEqual(["2026-04-13", "2026-04-15"]);
  });
});
