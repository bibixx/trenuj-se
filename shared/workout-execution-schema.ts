import { z } from "zod";
import { ALERT_METRICS, APPLE_WATCH_ACTIVITY_TYPES, PACE_SPEED_UNITS, PACE_TIME_UNITS, type WorkoutExecution } from "./workout-execution";
import { paceTimeToSeconds } from "./workout-execution-pace";

const PACE_TIME_PATTERN = /^\d{1,2}:\d{2}$/;

const paceTimeString = z
  .string()
  .regex(PACE_TIME_PATTERN, "Pace must be in M:SS format (e.g. '4:50')")
  .refine((value) => {
    const parts = value.split(":");
    return Number(parts[1]) < 60;
  }, "Pace seconds must be < 60");

const alertMetricSchema = z.enum(ALERT_METRICS);

const blockTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("time"), seconds: z.number().int().positive() }),
  z.object({ type: z.literal("distance"), meters: z.number().int().positive() }),
  z.object({ type: z.literal("open") }),
] satisfies [z.ZodTypeAny, ...z.ZodTypeAny[]]);

const heartRateZoneAlertSchema = z.object({
  type: z.literal("heartRateZone"),
  zone: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
});

const heartRateRangeAlertSchema = z
  .object({
    type: z.literal("heartRateRange"),
    min: z.number().int().positive(),
    max: z.number().int().positive(),
  })
  .superRefine((value, issueContext) => {
    if (value.min > value.max) {
      issueContext.addIssue({ code: "custom", message: "alert.min must be <= alert.max" });
    }
  });

const paceRangeAlertSchema = z.union([
  z
    .object({
      type: z.literal("paceRange"),
      unit: z.enum(PACE_TIME_UNITS).describe("Time-per-distance pace. Use M:SS strings for min/max."),
      min: paceTimeString.describe("Faster bound as M:SS per unit, e.g. '4:50'."),
      max: paceTimeString.describe("Slower bound as M:SS per unit, e.g. '5:10'."),
      metric: alertMetricSchema.optional(),
    })
    .superRefine((value, issueContext) => {
      if (paceTimeToSeconds(value.min) > paceTimeToSeconds(value.max)) {
        issueContext.addIssue({ code: "custom", message: "alert.min must be <= alert.max (faster pace ≤ slower pace)" });
      }
    }),
  z
    .object({
      type: z.literal("paceRange"),
      unit: z.enum(PACE_SPEED_UNITS).describe("Speed unit. Use positive numbers for min/max."),
      min: z.number().positive().describe("Lower speed bound."),
      max: z.number().positive().describe("Upper speed bound."),
      metric: alertMetricSchema.optional(),
    })
    .superRefine((value, issueContext) => {
      if (value.min > value.max) {
        issueContext.addIssue({ code: "custom", message: "alert.min must be <= alert.max" });
      }
    }),
]);

const paceThresholdAlertSchema = z.union([
  z.object({
    type: z.literal("paceThreshold"),
    unit: z.enum(PACE_TIME_UNITS).describe("Time-per-distance pace. Use an M:SS string for threshold."),
    threshold: paceTimeString.describe("Pace threshold as M:SS per unit, e.g. '4:50'."),
    metric: alertMetricSchema.optional(),
  }),
  z.object({
    type: z.literal("paceThreshold"),
    unit: z.enum(PACE_SPEED_UNITS).describe("Speed unit. Use a positive number for threshold."),
    threshold: z.number().positive().describe("Speed threshold."),
    metric: alertMetricSchema.optional(),
  }),
]);

const powerRangeAlertSchema = z
  .object({
    type: z.literal("powerRange"),
    min: z.number().nonnegative(),
    max: z.number().nonnegative(),
    metric: alertMetricSchema.optional(),
  })
  .superRefine((value, issueContext) => {
    if (value.min > value.max) {
      issueContext.addIssue({ code: "custom", message: "alert.min must be <= alert.max" });
    }
  });

const powerThresholdAlertSchema = z.object({
  type: z.literal("powerThreshold"),
  threshold: z.number().nonnegative(),
  metric: alertMetricSchema.optional(),
});

const cadenceRangeAlertSchema = z
  .object({
    type: z.literal("cadenceRange"),
    min: z.number().nonnegative(),
    max: z.number().nonnegative(),
  })
  .superRefine((value, issueContext) => {
    if (value.min > value.max) {
      issueContext.addIssue({ code: "custom", message: "alert.min must be <= alert.max" });
    }
  });

const cadenceThresholdAlertSchema = z.object({
  type: z.literal("cadenceThreshold"),
  threshold: z.number().nonnegative(),
});

const alertSchema = z.union([
  heartRateZoneAlertSchema,
  heartRateRangeAlertSchema,
  paceRangeAlertSchema,
  paceThresholdAlertSchema,
  powerRangeAlertSchema,
  powerThresholdAlertSchema,
  cadenceRangeAlertSchema,
  cadenceThresholdAlertSchema,
]);

const stepFields = {
  displayName: z.string().trim().min(1).optional(),
  alert: alertSchema.describe("Single WorkoutKit-compatible alert for this step or phase. Use this field instead of the legacy `cue` object.").optional(),
} satisfies Record<string, z.ZodTypeAny>;

const intervalPhaseSchema = z.object({
  target: blockTargetSchema,
  ...stepFields,
});

const executionBlockSchema: z.ZodType<WorkoutExecution["structure"][number]> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("warmup"), target: blockTargetSchema, ...stepFields }),
    z.object({ type: z.literal("cooldown"), target: blockTargetSchema, ...stepFields }),
    z.object({ type: z.literal("steady"), target: blockTargetSchema, ...stepFields }),
    z.object({ type: z.literal("rest"), target: blockTargetSchema, ...stepFields }),
    z.object({ type: z.literal("free"), target: blockTargetSchema, ...stepFields }),
    z.object({
      type: z.literal("interval"),
      repetitions: z.number().int().positive(),
      work: intervalPhaseSchema,
      recovery: intervalPhaseSchema.optional(),
    }),
    z.object({
      type: z.literal("repeat"),
      repetitions: z.number().int().positive(),
      blocks: z.array(executionBlockSchema).min(1),
    }),
  ] satisfies [z.ZodTypeAny, ...z.ZodTypeAny[]]),
);

export const appleWatchExecutionSchema = z.object({
  activityType: z.enum(APPLE_WATCH_ACTIVITY_TYPES),
  location: z.enum(["indoor", "outdoor"]).optional(),
});

export const executionSchema: z.ZodType<WorkoutExecution> = z
  .object({
    version: z.literal(2).describe("Execution schema version. Must be 2."),
    structure: z.array(executionBlockSchema).min(1),
    appleWatch: appleWatchExecutionSchema.optional(),
  })
  .describe("Workout execution schema v2. Use `alert`, not `cue`. Supported block types: warmup, cooldown, steady, rest, free, interval, repeat.");

/**
 * Validates workout execution at the boundary. Returns null if input is null/undefined
 * or if parsing fails.
 */
export function safeParseWorkoutExecution(execution: unknown): WorkoutExecution | null {
  if (execution == null) return null;
  const result = executionSchema.safeParse(execution);
  return result.success ? result.data : null;
}
