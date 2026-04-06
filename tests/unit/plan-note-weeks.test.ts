import { describe, test, expect } from "vitest";
import { safeParsePlanNoteMetadata } from "../../shared/plan-note-metadata.ts";
import { matchesPlanWeek, type PlanWeek } from "../../src/lib/week-utils.ts";

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
