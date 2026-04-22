import { describe, expect, it } from "vitest";
import { distanceUnitFromPaceUnit, isPaceTimeUnit, paceTimeToSeconds } from "../../shared/workout-execution-pace";

describe("workout-execution-pace", () => {
  it.each([
    ["min/km", true],
    ["min/mi", true],
    ["km/h", false],
    ["mph", false],
  ] as const)("identifies whether %s is time-based pace", (unit, expected) => {
    expect(isPaceTimeUnit(unit)).toBe(expected);
  });

  it.each([
    ["4:50", 290],
    ["0:59", 59],
    ["12:00", 720],
  ])("converts %s to %d seconds", (value, expected) => {
    expect(paceTimeToSeconds(value)).toBe(expected);
  });

  it.each([
    ["min/km", "kilometers"],
    ["km/h", "kilometers"],
    ["min/mi", "miles"],
    ["mph", "miles"],
  ] as const)("maps %s to %s distance units", (unit, expected) => {
    expect(distanceUnitFromPaceUnit(unit)).toBe(expected);
  });
});
