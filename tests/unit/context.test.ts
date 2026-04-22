import { describe, test, expect } from "vitest";
import { ZodError, z } from "zod";
import { errorPayload, validateWorkoutMetadata, assertSingleTarget, AppError, hashToken } from "../../server/mcp/context.ts";

// ─── errorPayload ────────────────────────────────────────────────────────────

describe("errorPayload", () => {
  test("AppError → returns { code, message }", () => {
    const err = new AppError("NOT_FOUND", "Resource not found");
    const result = errorPayload(err);
    expect(result).toEqual({ code: "NOT_FOUND", message: "Resource not found" });
  });

  test("AppError with AUTH_ERROR code", () => {
    const err = new AppError("AUTH_ERROR", "Unauthorized");
    const result = errorPayload(err);
    expect(result.code).toBe("AUTH_ERROR");
    expect(result.message).toBe("Unauthorized");
  });

  test("ZodError → returns { code: VALIDATION_ERROR, message, details }", () => {
    let zodError: ZodError;
    try {
      z.string().parse(42);
    } catch (e) {
      zodError = e as ZodError;
    }

    const result = errorPayload(zodError!);
    expect(result.code).toBe("VALIDATION_ERROR");
    expect(result.message).toBe("Request validation failed: Invalid input: expected string, received number");
    expect(Array.isArray((result as Record<string, unknown>).details)).toBe(true);
    expect(((result as Record<string, unknown>).details as unknown[]).length).toBeGreaterThan(0);
  });

  test("ZodError summary includes a readable path when available", () => {
    let zodError: ZodError;
    try {
      z.object({ execution: z.object({ structure: z.array(z.object({ alert: z.object({ zone: z.number() }) })) }) }).parse({
        execution: { structure: [{ alert: { zone: "two" } }] },
      });
    } catch (e) {
      zodError = e as ZodError;
    }

    const result = errorPayload(zodError!);
    expect(result.code).toBe("VALIDATION_ERROR");
    expect(result.message).toBe("Request validation failed: execution.structure[0].alert.zone Invalid input: expected number, received string");
  });

  test("Regular Error → returns { code: INTERNAL_ERROR, message: error.message }", () => {
    const err = new Error("Something went wrong");
    const result = errorPayload(err);
    expect(result).toEqual({ code: "INTERNAL_ERROR", message: "Something went wrong" });
  });

  test("Non-error string → returns { code: INTERNAL_ERROR, message: Unknown error }", () => {
    const result = errorPayload("just a string");
    expect(result).toEqual({ code: "INTERNAL_ERROR", message: "Unknown error" });
  });

  test("Non-error null → returns { code: INTERNAL_ERROR, message: Unknown error }", () => {
    const result = errorPayload(null);
    expect(result).toEqual({ code: "INTERNAL_ERROR", message: "Unknown error" });
  });

  test("Non-error number → returns { code: INTERNAL_ERROR, message: Unknown error }", () => {
    const result = errorPayload(404);
    expect(result).toEqual({ code: "INTERNAL_ERROR", message: "Unknown error" });
  });
});

// ─── validateWorkoutMetadata ──────────────────────────────────────────────────

describe("validateWorkoutMetadata", () => {
  test("null → returns null", () => {
    expect(validateWorkoutMetadata(null)).toBeNull();
  });

  test("undefined → returns null", () => {
    expect(validateWorkoutMetadata(undefined)).toBeNull();
  });

  test("empty object → returns empty object", () => {
    expect(validateWorkoutMetadata({})).toEqual({});
  });

  test("valid intervals metadata → returns parsed", () => {
    const metadata = {
      intervals: [{ distance_m: 400, rest_sec: 60, count: 8 }],
    };
    expect(validateWorkoutMetadata(metadata)).toEqual(metadata);
  });

  test("valid intervals metadata with duration_min → returns parsed", () => {
    const metadata = {
      intervals: [{ duration_min: 2, pace_target: "4:00/km", rest_sec: 90, count: 5, description: "Tempo" }],
    };
    expect(validateWorkoutMetadata(metadata)).toEqual(metadata);
  });

  test("valid zones metadata → returns parsed", () => {
    const metadata = {
      zones: [
        { zone: 2, duration_min: 20 },
        { zone: "Z3", duration_min: 10 },
      ],
    };
    expect(validateWorkoutMetadata(metadata)).toEqual(metadata);
  });

  test("valid sets metadata → returns parsed", () => {
    const metadata = {
      sets: [{ exercise: "Squat", reps: 10, sets: 3, weight_kg: 80 }],
    };
    expect(validateWorkoutMetadata(metadata)).toEqual(metadata);
  });

  test("valid segments metadata → returns parsed", () => {
    const metadata = {
      segments: [
        { sport: "swim", duration_min: 30, description: "Easy swim" },
        { sport: "bike", duration_min: 60 },
      ],
    };
    expect(validateWorkoutMetadata(metadata)).toEqual(metadata);
  });

  test("invalid intervals (missing both distance_m and duration_min) → throws ZodError", () => {
    const metadata = {
      intervals: [
        { rest_sec: 60, count: 5 }, // missing distance_m and duration_min
      ],
    };
    expect(() => validateWorkoutMetadata(metadata)).toThrow(ZodError);
  });

  test("invalid zones (missing duration_min) → throws ZodError", () => {
    const metadata = {
      zones: [
        { zone: 2 }, // missing duration_min
      ],
    };
    expect(() => validateWorkoutMetadata(metadata)).toThrow(ZodError);
  });

  test("object with unknown keys → passes through (no validation)", () => {
    const metadata = { customField: "anything", anotherField: 42 };
    expect(validateWorkoutMetadata(metadata)).toEqual(metadata);
  });

  test("combined known and unknown keys → passes through when known key is valid", () => {
    const metadata = {
      customKey: "value",
      zones: [{ zone: 1, duration_min: 15 }],
    };
    expect(validateWorkoutMetadata(metadata)).toEqual(metadata);
  });
});

// ─── assertSingleTarget ───────────────────────────────────────────────────────

describe("assertSingleTarget", () => {
  test("workoutId only → no throw", () => {
    expect(() => assertSingleTarget("workout-123", undefined)).not.toThrow();
  });

  test("activityId only → no throw", () => {
    expect(() => assertSingleTarget(undefined, "activity-456")).not.toThrow();
  });

  test("both provided → throws AppError VALIDATION_ERROR", () => {
    expect(() => assertSingleTarget("workout-123", "activity-456")).toThrow(AppError);
    try {
      assertSingleTarget("workout-123", "activity-456");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe("VALIDATION_ERROR");
    }
  });

  test("neither provided → throws AppError VALIDATION_ERROR", () => {
    expect(() => assertSingleTarget(undefined, undefined)).toThrow(AppError);
    try {
      assertSingleTarget(undefined, undefined);
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe("VALIDATION_ERROR");
    }
  });

  test("empty strings count as falsy (neither) → throws AppError VALIDATION_ERROR", () => {
    expect(() => assertSingleTarget("", "")).toThrow(AppError);
  });
});

// ─── hashToken ────────────────────────────────────────────────────────────────

describe("hashToken", () => {
  test("returns consistent hex string for same input", async () => {
    const hash1 = await hashToken("test-token-123");
    const hash2 = await hashToken("test-token-123");
    expect(hash1).toBe(hash2);
    expect(typeof hash1).toBe("string");
    // SHA-256 produces 64 hex chars
    expect(hash1).toHaveLength(64);
    expect(hash1).toMatch(/^[0-9a-f]+$/);
  });

  test("different inputs produce different hashes", async () => {
    const hash1 = await hashToken("token-abc");
    const hash2 = await hashToken("token-xyz");
    expect(hash1).not.toBe(hash2);
  });

  test("empty string produces a valid hash", async () => {
    const hash = await hashToken("");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });
});
