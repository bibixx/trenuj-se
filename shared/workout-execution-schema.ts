import { z } from "zod";
import { ALERT_METRICS, APPLE_WATCH_ACTIVITY_TYPES, TARGET_TYPES, type WorkoutExecution } from "./workout-execution";
import { paceTimeToSeconds } from "./workout-execution-pace";

const PACE_TIME_PATTERN = /^\d{1,2}:\d{2}$/;
const EXECUTION_BLOCK_TYPES = ["warmup", "cooldown", "steady", "rest", "free", "interval", "repeat"] as const;
const EXECUTION_ALERT_TYPES = ["heartRateZone", "heartRateRange", "paceRange", "paceThreshold", "powerRange", "powerThreshold", "cadenceRange", "cadenceThreshold"] as const;

type ExecutionPath = Array<string | number>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addHelpfulIssue(issueContext: z.core.$RefinementCtx<unknown>, path: ExecutionPath, message: string) {
  issueContext.addIssue({ code: "custom", path, message, input: undefined });
}

function isExecutionBlockPath(path: ExecutionPath) {
  return typeof path.at(-1) === "number" && (path.at(-2) === "structure" || path.at(-2) === "blocks");
}

function validateHelpfulExecutionIssues(value: unknown, issueContext: z.core.$RefinementCtx<unknown>, path: ExecutionPath = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateHelpfulExecutionIssues(item, issueContext, [...path, index]));
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (path.length === 0 && "summary" in value) {
    addHelpfulIssue(issueContext, ["summary"], "summary is not allowed");
  }

  if ("cue" in value) {
    addHelpfulIssue(issueContext, [...path, "cue"], "cue is not allowed; use alert");
  }

  if (path.length === 1 && path[0] === "appleWatch") {
    if ("alerts" in value) {
      addHelpfulIssue(issueContext, [...path, "alerts"], "alerts is not allowed");
    }

    if ("displayHints" in value) {
      addHelpfulIssue(issueContext, [...path, "displayHints"], "displayHints is not allowed");
    }
  }

  if (isExecutionBlockPath(path) && typeof value["type"] === "string" && !EXECUTION_BLOCK_TYPES.includes(value["type"] as (typeof EXECUTION_BLOCK_TYPES)[number])) {
    addHelpfulIssue(issueContext, [...path, "type"], `type must be one of ${EXECUTION_BLOCK_TYPES.join(", ")}`);
  }

  if (path.at(-1) === "target" && typeof value["type"] === "string" && !TARGET_TYPES.includes(value["type"] as (typeof TARGET_TYPES)[number])) {
    addHelpfulIssue(issueContext, [...path, "type"], `type must be one of ${TARGET_TYPES.join(", ")}`);
  }

  if (path.at(-1) === "alert" && typeof value["type"] === "string" && !EXECUTION_ALERT_TYPES.includes(value["type"] as (typeof EXECUTION_ALERT_TYPES)[number])) {
    addHelpfulIssue(issueContext, [...path, "type"], `type must be one of ${EXECUTION_ALERT_TYPES.join(", ")}`);
  }

  for (const [key, child] of Object.entries(value)) {
    validateHelpfulExecutionIssues(child, issueContext, [...path, key]);
  }
}

function withHelpfulExecutionIssues<T extends z.ZodType>(schema: T) {
  return z
    .unknown()
    .superRefine((value, issueContext) => validateHelpfulExecutionIssues(value, issueContext))
    .pipe(schema);
}

const paceTimeString = z
  .string()
  .regex(PACE_TIME_PATTERN, "Pace must be in M:SS format (e.g. '4:50')")
  .refine((value) => {
    const parts = value.split(":");
    return Number(parts[1]) < 60;
  }, "Pace seconds must be < 60");

const alertMetricSchema = z.enum(ALERT_METRICS);

const blockTargetSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("time"), seconds: z.number().int().positive() }),
  z.strictObject({ type: z.literal("distance"), meters: z.number().int().positive() }),
  z.strictObject({ type: z.literal("open") }),
] satisfies [z.ZodType, ...z.ZodType[]]);

const heartRateZoneAlertSchema = z.strictObject({
  type: z.literal("heartRateZone"),
  zone: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
});

const heartRateRangeAlertSchema = z
  .strictObject({
    type: z.literal("heartRateRange"),
    min: z.number().int().positive(),
    max: z.number().int().positive(),
  })
  .superRefine((value, issueContext) => {
    if (value.min > value.max) {
      issueContext.addIssue({ code: "custom", message: "alert.min must be <= alert.max", input: undefined });
    }
  });

const paceRangeAlertSchema = z
  .discriminatedUnion("unit", [
    z.strictObject({
      type: z.literal("paceRange"),
      unit: z.literal("min/km").describe("Time-per-distance pace (min/km). Use M:SS strings for min/max."),
      min: paceTimeString.describe("Faster bound as M:SS, e.g. '4:50'."),
      max: paceTimeString.describe("Slower bound as M:SS, e.g. '5:10'."),
      metric: alertMetricSchema.optional(),
    }),
    z.strictObject({
      type: z.literal("paceRange"),
      unit: z.literal("min/mi").describe("Time-per-distance pace (min/mi). Use M:SS strings for min/max."),
      min: paceTimeString.describe("Faster bound as M:SS, e.g. '4:50'."),
      max: paceTimeString.describe("Slower bound as M:SS, e.g. '5:10'."),
      metric: alertMetricSchema.optional(),
    }),
    z.strictObject({
      type: z.literal("paceRange"),
      unit: z.literal("km/h").describe("Speed (km/h). Use positive numbers for min/max."),
      min: z.number().positive().describe("Lower speed bound."),
      max: z.number().positive().describe("Upper speed bound."),
      metric: alertMetricSchema.optional(),
    }),
    z.strictObject({
      type: z.literal("paceRange"),
      unit: z.literal("mph").describe("Speed (mph). Use positive numbers for min/max."),
      min: z.number().positive().describe("Lower speed bound."),
      max: z.number().positive().describe("Upper speed bound."),
      metric: alertMetricSchema.optional(),
    }),
  ])
  .superRefine((value, issueContext) => {
    if (value.unit === "min/km" || value.unit === "min/mi") {
      if (paceTimeToSeconds(value.min) > paceTimeToSeconds(value.max)) {
        issueContext.addIssue({ code: "custom", message: "alert.min must be <= alert.max (faster pace ≤ slower pace)", input: undefined });
      }
    } else if (value.min > value.max) {
      issueContext.addIssue({ code: "custom", message: "alert.min must be <= alert.max", input: undefined });
    }
  });

const paceThresholdAlertSchema = z.discriminatedUnion("unit", [
  z.strictObject({
    type: z.literal("paceThreshold"),
    unit: z.literal("min/km").describe("Time-per-distance pace (min/km). Use an M:SS string for threshold."),
    threshold: paceTimeString.describe("Pace threshold as M:SS, e.g. '4:50'."),
    metric: alertMetricSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("paceThreshold"),
    unit: z.literal("min/mi").describe("Time-per-distance pace (min/mi). Use an M:SS string for threshold."),
    threshold: paceTimeString.describe("Pace threshold as M:SS, e.g. '4:50'."),
    metric: alertMetricSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("paceThreshold"),
    unit: z.literal("km/h").describe("Speed (km/h). Use a positive number for threshold."),
    threshold: z.number().positive().describe("Speed threshold."),
    metric: alertMetricSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("paceThreshold"),
    unit: z.literal("mph").describe("Speed (mph). Use a positive number for threshold."),
    threshold: z.number().positive().describe("Speed threshold."),
    metric: alertMetricSchema.optional(),
  }),
]);

const powerRangeAlertSchema = z
  .strictObject({
    type: z.literal("powerRange"),
    min: z.number().nonnegative(),
    max: z.number().nonnegative(),
    metric: alertMetricSchema.optional(),
  })
  .superRefine((value, issueContext) => {
    if (value.min > value.max) {
      issueContext.addIssue({ code: "custom", message: "alert.min must be <= alert.max", input: undefined });
    }
  });

const powerThresholdAlertSchema = z.strictObject({
  type: z.literal("powerThreshold"),
  threshold: z.number().nonnegative(),
  metric: alertMetricSchema.optional(),
});

const cadenceRangeAlertSchema = z
  .strictObject({
    type: z.literal("cadenceRange"),
    min: z.number().nonnegative(),
    max: z.number().nonnegative(),
  })
  .superRefine((value, issueContext) => {
    if (value.min > value.max) {
      issueContext.addIssue({ code: "custom", message: "alert.min must be <= alert.max", input: undefined });
    }
  });

const cadenceThresholdAlertSchema = z.strictObject({
  type: z.literal("cadenceThreshold"),
  threshold: z.number().nonnegative(),
});

const alertSchema = z.discriminatedUnion("type", [
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
} satisfies Record<string, z.ZodType>;

const intervalPhaseSchema = z.strictObject({
  target: blockTargetSchema,
  ...stepFields,
});

const executionBlockSchema: z.ZodType<WorkoutExecution["structure"][number]> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("warmup"), target: blockTargetSchema, ...stepFields }),
    z.strictObject({ type: z.literal("cooldown"), target: blockTargetSchema, ...stepFields }),
    z.strictObject({ type: z.literal("steady"), target: blockTargetSchema, ...stepFields }),
    z.strictObject({ type: z.literal("rest"), target: blockTargetSchema, ...stepFields }),
    z.strictObject({ type: z.literal("free"), target: blockTargetSchema, ...stepFields }),
    z.strictObject({
      type: z.literal("interval"),
      repetitions: z.number().int().positive(),
      work: intervalPhaseSchema,
      recovery: intervalPhaseSchema.optional(),
    }),
    z.strictObject({
      type: z.literal("repeat"),
      repetitions: z.number().int().positive(),
      blocks: z.array(executionBlockSchema).min(1),
    }),
  ] satisfies [z.ZodType, ...z.ZodType[]]),
);

export const appleWatchExecutionSchema = z.strictObject({
  activityType: z.enum(APPLE_WATCH_ACTIVITY_TYPES),
  location: z.enum(["indoor", "outdoor"]).optional(),
});

const baseExecutionSchema: z.ZodType<WorkoutExecution> = z.strictObject({
  version: z.literal(2).describe("Execution schema version. Must be 2."),
  structure: z.array(executionBlockSchema).min(1),
  appleWatch: appleWatchExecutionSchema.optional(),
});

export const executionSchema: z.ZodType<WorkoutExecution> = withHelpfulExecutionIssues(baseExecutionSchema).describe(
  "Workout execution schema v2. Use `alert`, not `cue`. Supported block types: warmup, cooldown, steady, rest, free, interval, repeat.",
);

/**
 * Validates workout execution at the boundary. Returns null if input is null/undefined
 * or if parsing fails.
 */
export function safeParseWorkoutExecution(execution: unknown): WorkoutExecution | null {
  if (execution == null) return null;
  const result = executionSchema.safeParse(execution);
  return result.success ? result.data : null;
}
