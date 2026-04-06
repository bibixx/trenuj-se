import { z } from "zod";
import { APPLE_WATCH_ACTIVITY_TYPES, APPLE_WATCH_METRICS, EXECUTION_GOALS, PACE_UNITS, type WorkoutExecution } from "./workout-execution";

const intensitySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("easy") }),
  z.object({ kind: z.literal("steady") }),
  z.object({ kind: z.literal("moderate") }),
  z.object({ kind: z.literal("hard") }),
  z.object({ kind: z.literal("max") }),
  z.object({ kind: z.literal("recovery") }),
  z.object({ kind: z.literal("custom"), label: z.string().trim().min(1) }),
] satisfies [z.ZodTypeAny, ...z.ZodTypeAny[]]);

const blockTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("time"), seconds: z.number().int().positive() }),
  z.object({ type: z.literal("distance"), meters: z.number().int().positive() }),
  z.object({ type: z.literal("open") }),
  z.object({ type: z.literal("lap-button") }),
] satisfies [z.ZodTypeAny, ...z.ZodTypeAny[]]);

const cueSchema = z
  .object({
    intensity: intensitySchema.optional(),
    pace: z
      .object({
        unit: z.enum(PACE_UNITS),
        min: z.number().positive().optional(),
        max: z.number().positive().optional(),
        label: z.string().trim().min(1).optional(),
      })
      .superRefine((value, issueContext) => {
        if (value.min != null && value.max != null && value.min > value.max) {
          issueContext.addIssue({ code: "custom", message: "pace.min must be <= pace.max" });
        }
      })
      .optional(),
    heartRate: z
      .object({
        zone: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
        min: z.number().int().positive().optional(),
        max: z.number().int().positive().optional(),
      })
      .superRefine((value, issueContext) => {
        if (value.min != null && value.max != null && value.min > value.max) {
          issueContext.addIssue({ code: "custom", message: "heartRate.min must be <= heartRate.max" });
        }
      })
      .optional(),
    power: z
      .object({
        min: z.number().nonnegative().optional(),
        max: z.number().nonnegative().optional(),
        ftpPercentMin: z.number().positive().optional(),
        ftpPercentMax: z.number().positive().optional(),
      })
      .superRefine((value, issueContext) => {
        if (value.min != null && value.max != null && value.min > value.max) {
          issueContext.addIssue({ code: "custom", message: "power.min must be <= power.max" });
        }
        if (value.ftpPercentMin != null && value.ftpPercentMax != null && value.ftpPercentMin > value.ftpPercentMax) {
          issueContext.addIssue({ code: "custom", message: "power.ftpPercentMin must be <= power.ftpPercentMax" });
        }
      })
      .optional(),
    cadence: z
      .object({
        min: z.number().nonnegative().optional(),
        max: z.number().nonnegative().optional(),
      })
      .superRefine((value, issueContext) => {
        if (value.min != null && value.max != null && value.min > value.max) {
          issueContext.addIssue({ code: "custom", message: "cadence.min must be <= cadence.max" });
        }
      })
      .optional(),
    notes: z.string().trim().min(1).optional(),
  })
  .superRefine((value, issueContext) => {
    if (!value.intensity && !value.pace && !value.heartRate && !value.power && !value.cadence && !value.notes) {
      issueContext.addIssue({ code: "custom", message: "Cue must include at least one field" });
    }
  });

const baseBlockFields = {
  title: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
  cue: cueSchema.optional(),
} satisfies Record<string, z.ZodTypeAny>;

const noteBlockSchema = z.object({
  type: z.literal("note"),
  text: z.string().trim().min(1),
});

const intervalPhaseSchema = z.object({
  target: blockTargetSchema,
  cue: cueSchema.optional(),
});

const strengthExerciseSchema = z
  .object({
    name: z.string().trim().min(1),
    reps: z.number().int().positive().optional(),
    durationSec: z.number().int().positive().optional(),
    weightKg: z.number().nonnegative().optional(),
    notes: z.string().trim().min(1).optional(),
  })
  .superRefine((value, issueContext) => {
    if (value.reps == null && value.durationSec == null) {
      issueContext.addIssue({ code: "custom", message: "Each strength exercise needs reps or durationSec" });
    }
  });

const executionBlockSchema: z.ZodType<WorkoutExecution["structure"][number]> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("warmup"), target: blockTargetSchema, ...baseBlockFields }),
    z.object({ type: z.literal("cooldown"), target: blockTargetSchema, ...baseBlockFields }),
    z.object({ type: z.literal("steady"), target: blockTargetSchema, ...baseBlockFields }),
    z.object({ type: z.literal("rest"), target: blockTargetSchema, ...baseBlockFields }),
    z.object({ type: z.literal("free"), target: blockTargetSchema, ...baseBlockFields }),
    noteBlockSchema,
    z.object({
      type: z.literal("interval"),
      repetitions: z.number().int().positive(),
      work: intervalPhaseSchema,
      recovery: intervalPhaseSchema.optional(),
      ...baseBlockFields,
    }),
    z.object({
      type: z.literal("repeat"),
      repetitions: z.number().int().positive(),
      blocks: z.array(executionBlockSchema).min(1),
      ...baseBlockFields,
    }),
    z.object({
      type: z.literal("strength"),
      exercises: z.array(strengthExerciseSchema).min(1),
      sets: z.number().int().positive().optional(),
      restSeconds: z.number().int().nonnegative().optional(),
      ...baseBlockFields,
    }),
  ] satisfies [z.ZodTypeAny, ...z.ZodTypeAny[]]),
);

export const appleWatchExecutionSchema = z.object({
  activityType: z.enum(APPLE_WATCH_ACTIVITY_TYPES),
  location: z.enum(["indoor", "outdoor"]).optional(),
  poolLengthMeters: z.number().positive().optional(),
  alerts: z
    .object({
      audio: z.boolean().optional(),
      haptics: z.boolean().optional(),
    })
    .optional(),
  displayHints: z
    .object({
      primaryMetric: z.enum(APPLE_WATCH_METRICS).optional(),
      secondaryMetric: z.enum(APPLE_WATCH_METRICS).optional(),
    })
    .optional(),
});

export const executionSchema: z.ZodType<WorkoutExecution> = z.object({
  version: z.literal(1),
  summary: z
    .object({
      goal: z.enum(EXECUTION_GOALS).optional(),
      notes: z.string().trim().min(1).optional(),
    })
    .optional(),
  structure: z.array(executionBlockSchema).min(1),
  appleWatch: appleWatchExecutionSchema.optional(),
});

/**
 * Validates workout execution at the boundary. Returns null if input is null/undefined
 * or if parsing fails.
 */
export function safeParseWorkoutExecution(execution: unknown): WorkoutExecution | null {
  if (execution == null) return null;
  const result = executionSchema.safeParse(execution);
  return result.success ? result.data : null;
}
