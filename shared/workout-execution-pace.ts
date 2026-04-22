import type { PaceUnit, PaceTimeUnit } from "./workout-execution";

export type PaceDistanceUnit = "kilometers" | "miles";

export function isPaceTimeUnit(unit: PaceUnit): unit is PaceTimeUnit {
  return unit === "min/km" || unit === "min/mi";
}

export function paceTimeToSeconds(value: string): number {
  const [minutes = 0, seconds = 0] = value.split(":").map(Number);
  return minutes * 60 + seconds;
}

export function distanceUnitFromPaceUnit(unit: PaceUnit): PaceDistanceUnit {
  return unit === "min/km" || unit === "km/h" ? "kilometers" : "miles";
}
