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

function expectSchemaIssue(result: ReturnType<typeof executionSchema.safeParse>, path: Array<string | number>, message: string) {
  expect(result.success).toBe(false);
  if (result.success) {
    throw new Error("Expected executionSchema.safeParse to fail");
  }

  expect(result.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path, message })]));
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

  it("reports invalid unit at the alert.unit path", () => {
    const result = executionSchema.safeParse(executionWithAlert({ type: "paceRange", unit: "min/k", min: "4:50", max: "5:10" }));
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected executionSchema.safeParse to fail");
    const paths = result.error.issues.map((issue) => issue.path.join("."));
    expect(paths).toContain("structure.0.alert.unit");
  });

  it("reports value-type mismatch at alert.min/max for time-based pace ranges", () => {
    const result = executionSchema.safeParse(executionWithAlert({ type: "paceRange", unit: "min/km", min: 290, max: 310 }));
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected executionSchema.safeParse to fail");
    const paths = result.error.issues.map((issue) => issue.path.join("."));
    expect(paths).toContain("structure.0.alert.min");
    expect(paths).toContain("structure.0.alert.max");
  });

  it("reports value-type mismatch at alert.min/max for speed-based pace ranges", () => {
    const result = executionSchema.safeParse(executionWithAlert({ type: "paceRange", unit: "km/h", min: "4:50", max: "5:10" }));
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected executionSchema.safeParse to fail");
    const paths = result.error.issues.map((issue) => issue.path.join("."));
    expect(paths).toContain("structure.0.alert.min");
    expect(paths).toContain("structure.0.alert.max");
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

  it("rejects lap-button targets with a helpful target-type message", () => {
    const result = executionSchema.safeParse({
      version: 2,
      structure: [{ type: "steady", target: { type: "lap-button" } }],
    });

    expectSchemaIssue(result, ["structure", 0, "target", "type"], "type must be one of time, distance, open");
  });

  it("rejects cue fields with a helpful message", () => {
    const result = executionSchema.safeParse({
      version: 2,
      structure: [
        {
          type: "steady",
          target: { type: "time", seconds: 600 },
          cue: { notes: "Keep it relaxed" },
        },
      ],
    });

    expectSchemaIssue(result, ["structure", 0, "cue"], "cue is not allowed; use alert");
  });

  it("rejects appleWatch.alerts with a helpful message", () => {
    const result = executionSchema.safeParse({
      version: 2,
      structure: [{ type: "steady", target: { type: "time", seconds: 600 } }],
      appleWatch: {
        activityType: "running",
        location: "outdoor",
        alerts: { haptics: true },
      },
    });

    expectSchemaIssue(result, ["appleWatch", "alerts"], "alerts is not allowed");
  });

  it("rejects unsupported block types with a helpful message", () => {
    const result = executionSchema.safeParse({
      version: 2,
      structure: [{ type: "note", text: "Hydrate" }],
    });

    expectSchemaIssue(result, ["structure", 0, "type"], "type must be one of warmup, cooldown, steady, rest, free, interval, repeat");
  });

  it("rejects unsupported root keys instead of silently accepting them", () => {
    const result = executionSchema.safeParse({
      version: 2,
      structure: [{ type: "steady", target: { type: "time", seconds: 600 } }],
      summary: { goal: "easy" },
    });

    expectSchemaIssue(result, ["summary"], "summary is not allowed");
  });

  it("rejects unknown step keys instead of stripping them", () => {
    const result = executionSchema.safeParse({
      version: 2,
      structure: [{ type: "steady", target: { type: "time", seconds: 600 }, notes: "do not allow" }],
    });

    expect(result.success).toBe(false);
  });
});
