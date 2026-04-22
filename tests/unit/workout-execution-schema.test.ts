import { describe, expect, it } from "vitest";
import { executionSchema } from "../../shared/workout-execution-schema.ts";

function executionWithAlert(alert: unknown) {
  return {
    version: 2 as const,
    structure: [
      {
        type: "steady" as const,
        target: { type: "time" as const, seconds: 600 },
        alert,
      },
    ],
  };
}

describe("executionSchema — heart-rate alerts", () => {
  it("accepts heartRateZone alerts", () => {
    const result = executionSchema.safeParse(executionWithAlert({ type: "heartRateZone", zone: 2 }));
    expect(result.success).toBe(true);
  });

  it("accepts heartRateRange alerts", () => {
    const result = executionSchema.safeParse(executionWithAlert({ type: "heartRateRange", min: 131, max: 162 }));
    expect(result.success).toBe(true);
  });

  it("rejects heartRateRange with min > max", () => {
    const result = executionSchema.safeParse(executionWithAlert({ type: "heartRateRange", min: 180, max: 140 }));
    expect(result.success).toBe(false);
  });
});

describe("executionSchema — pace alerts", () => {
  it("accepts paceRange for time-based pace units", () => {
    const result = executionSchema.safeParse(executionWithAlert({ type: "paceRange", unit: "min/km", min: "4:50", max: "5:10" }));
    expect(result.success).toBe(true);
  });

  it("accepts paceThreshold for speed-based pace units", () => {
    const result = executionSchema.safeParse(executionWithAlert({ type: "paceThreshold", unit: "km/h", threshold: 21, metric: "average" }));
    expect(result.success).toBe(true);
  });

  it("rejects a time-based pace string that does not match M:SS", () => {
    const result = executionSchema.safeParse(executionWithAlert({ type: "paceThreshold", unit: "min/km", threshold: "four fifty" }));
    expect(result.success).toBe(false);
  });

  it("rejects time-based pace seconds >= 60", () => {
    const result = executionSchema.safeParse(executionWithAlert({ type: "paceThreshold", unit: "min/km", threshold: "4:75" }));
    expect(result.success).toBe(false);
  });

  it("rejects min/km with a numeric threshold", () => {
    const result = executionSchema.safeParse(executionWithAlert({ type: "paceThreshold", unit: "min/km", threshold: 290 }));
    expect(result.success).toBe(false);
  });

  it("rejects km/h with a string threshold", () => {
    const result = executionSchema.safeParse(executionWithAlert({ type: "paceThreshold", unit: "km/h", threshold: "4:50" }));
    expect(result.success).toBe(false);
  });

  it("rejects min > max for time-based pace ranges", () => {
    const result = executionSchema.safeParse(executionWithAlert({ type: "paceRange", unit: "min/km", min: "5:30", max: "4:30" }));
    expect(result.success).toBe(false);
  });

  it("rejects min > max for speed-based pace ranges", () => {
    const result = executionSchema.safeParse(executionWithAlert({ type: "paceRange", unit: "km/h", min: 30, max: 20 }));
    expect(result.success).toBe(false);
  });
});

describe("executionSchema — power alerts", () => {
  it("accepts powerRange alerts", () => {
    const result = executionSchema.safeParse(executionWithAlert({ type: "powerRange", min: 220, max: 260, metric: "average" }));
    expect(result.success).toBe(true);
  });

  it("accepts powerThreshold alerts", () => {
    const result = executionSchema.safeParse(executionWithAlert({ type: "powerThreshold", threshold: 300 }));
    expect(result.success).toBe(true);
  });

  it("rejects powerRange with min > max", () => {
    const result = executionSchema.safeParse(executionWithAlert({ type: "powerRange", min: 300, max: 250 }));
    expect(result.success).toBe(false);
  });
});

describe("executionSchema — cadence alerts", () => {
  it("accepts cadenceRange alerts", () => {
    const result = executionSchema.safeParse(executionWithAlert({ type: "cadenceRange", min: 88, max: 92 }));
    expect(result.success).toBe(true);
  });

  it("accepts cadenceThreshold alerts", () => {
    const result = executionSchema.safeParse(executionWithAlert({ type: "cadenceThreshold", threshold: 178 }));
    expect(result.success).toBe(true);
  });

  it("rejects cadenceRange with min > max", () => {
    const result = executionSchema.safeParse(executionWithAlert({ type: "cadenceRange", min: 95, max: 85 }));
    expect(result.success).toBe(false);
  });
});

describe("executionSchema — overall shape", () => {
  it("accepts nested repeat blocks", () => {
    const result = executionSchema.safeParse({
      version: 2,
      structure: [
        {
          type: "repeat",
          repetitions: 2,
          blocks: [
            {
              type: "interval",
              repetitions: 3,
              work: { target: { type: "distance", meters: 1000 }, alert: { type: "heartRateZone", zone: 4 } },
              recovery: { target: { type: "time", seconds: 90 } },
            },
          ],
        },
      ],
      appleWatch: { activityType: "running", location: "outdoor" },
    });

    expect(result.success).toBe(true);
  });

  it("rejects lap-button targets", () => {
    const result = executionSchema.safeParse({
      version: 2,
      structure: [{ type: "steady", target: { type: "lap-button" } }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects legacy version 1 payloads", () => {
    const result = executionSchema.safeParse({
      version: 1,
      structure: [{ type: "steady", target: { type: "time", seconds: 600 } }],
    });

    expect(result.success).toBe(false);
  });
});
