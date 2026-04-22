import { describe, expect, it } from "vitest";
import { executionSchema } from "../../shared/workout-execution-schema.ts";

function executionWithCue(cue: unknown) {
  return {
    version: 1 as const,
    structure: [
      {
        type: "steady" as const,
        target: { type: "time" as const, seconds: 600 },
        cue,
      },
    ],
  };
}

describe("executionSchema — heartRate cue", () => {
  it("accepts { zone: 2 }", () => {
    const result = executionSchema.safeParse(executionWithCue({ heartRate: { zone: 2 } }));
    expect(result.success).toBe(true);
  });

  it("accepts { min, max } without a zone", () => {
    const result = executionSchema.safeParse(executionWithCue({ heartRate: { min: 131, max: 162 } }));
    expect(result.success).toBe(true);
  });

  it("accepts { zone, min, max } together", () => {
    const result = executionSchema.safeParse(executionWithCue({ heartRate: { zone: 2, min: 131, max: 162 } }));
    expect(result.success).toBe(true);
  });

  it("rejects an empty heartRate object", () => {
    const result = executionSchema.safeParse(executionWithCue({ heartRate: {} }));
    expect(result.success).toBe(false);
  });

  it("rejects heartRate with min > max", () => {
    const result = executionSchema.safeParse(executionWithCue({ heartRate: { min: 180, max: 140 } }));
    expect(result.success).toBe(false);
  });
});

describe("executionSchema — pace cue", () => {
  it("accepts min/km with M:SS strings", () => {
    const result = executionSchema.safeParse(executionWithCue({ pace: { unit: "min/km", min: "4:50", max: "5:10" } }));
    expect(result.success).toBe(true);
  });

  it("accepts km/h with numeric bounds", () => {
    const result = executionSchema.safeParse(executionWithCue({ pace: { unit: "km/h", min: 20, max: 24 } }));
    expect(result.success).toBe(true);
  });

  it("rejects a pace string that does not match M:SS", () => {
    const result = executionSchema.safeParse(executionWithCue({ pace: { unit: "min/km", min: "four fifty" } }));
    expect(result.success).toBe(false);
  });

  it("rejects pace seconds >= 60", () => {
    const result = executionSchema.safeParse(executionWithCue({ pace: { unit: "min/km", min: "4:75" } }));
    expect(result.success).toBe(false);
  });

  it("rejects min/km with a numeric bound (wrong variant)", () => {
    const result = executionSchema.safeParse(executionWithCue({ pace: { unit: "min/km", min: 290 } }));
    expect(result.success).toBe(false);
  });

  it("rejects km/h with string bounds (wrong variant)", () => {
    const result = executionSchema.safeParse(executionWithCue({ pace: { unit: "km/h", min: "4:50" } }));
    expect(result.success).toBe(false);
  });

  it("rejects min > max for time-based pace (faster bound must be ≤ slower)", () => {
    const result = executionSchema.safeParse(executionWithCue({ pace: { unit: "min/km", min: "5:30", max: "4:30" } }));
    expect(result.success).toBe(false);
  });

  it("rejects min > max for speed-based pace", () => {
    const result = executionSchema.safeParse(executionWithCue({ pace: { unit: "km/h", min: 30, max: 20 } }));
    expect(result.success).toBe(false);
  });
});
