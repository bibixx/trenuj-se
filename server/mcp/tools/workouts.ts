import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AppError, resolvePlanId, toolError, toolSuccess, type McpContext, validateWorkoutMetadata } from "../context";
import { linkActivityToWorkout, unlinkActivityFromWorkout } from "../../lib/strava";
import { executionSchema } from "../../../shared/workout-execution-schema";

const workoutStatusSchema = z.enum(["planned", "completed", "skipped"]);
const labelKeySchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Label key must use lowercase letters, numbers, and hyphens only (e.g. 'easy-run')");

const workoutLabelRefSchema = z
  .object({
    labelId: z.string().uuid().optional().describe("Label UUID. Provide exactly one of labelId or labelKey."),
    labelKey: labelKeySchema.optional().describe("Label key string. Provide exactly one of labelId or labelKey."),
  })
  .superRefine((value, issueContext) => {
    if (!value.labelId && !value.labelKey) {
      issueContext.addIssue({ code: "custom", message: "Exactly one of labelId or labelKey is required" });
    }

    if (value.labelId && value.labelKey) {
      issueContext.addIssue({ code: "custom", message: "Exactly one of labelId or labelKey is required" });
    }
  });

const workoutInputSchema = workoutLabelRefSchema.extend({
  date: z.string().date().describe("Workout date (YYYY-MM-DD)."),
  title: z.string().trim().min(1).describe("Workout title."),
  description: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Human-readable workout instructions in markdown. Must be self-contained — a user should be able to execute the workout from this field alone. See the training-plan-guide resource for suggested formatting.",
    ),
  targetDurationMin: z.number().int().positive().optional().describe("Planned duration in minutes."),
  targetDistanceM: z.number().int().positive().optional().describe("Planned distance in meters."),
  phaseId: z.string().uuid().optional().describe("Phase UUID to assign the workout to."),
  sortOrder: z.number().int().describe("Display order within a day (lower values appear first)."),
  execution: executionSchema
    .optional()
    .describe(
      "OPTIONAL in the schema but EXPECTED in practice — fill this in whenever the workout can be represented as warmup/steady/interval/cooldown blocks (most runs, rides, and swims). ALWAYS set `appleWatch.activityType` and `appleWatch.location` when the sport is known. Powers Apple Watch export (.workout files), structured views, and analytics. Schema: v2. Use `alert`, not `cue`. Supported blocks: `warmup`, `cooldown`, `steady`, `rest`, `free`, `interval`, `repeat`. Each step/phase may have `displayName` and at most one alert (`heartRateZone`, `heartRateRange`, `paceRange`, `paceThreshold`, `powerRange`, `powerThreshold`, `cadenceRange`, `cadenceThreshold`). Unsupported here: `strength`, `note`, `lap-button`, `poolLengthMeters`, `displayHints`, and `appleWatch.alerts`.",
    ),
  metadata: z.unknown().optional().describe("Arbitrary key-value data."),
});

const addWorkoutsSchema = z.object({
  planId: z.string().uuid().optional().describe("Plan UUID. Defaults to the active plan if omitted."),
  workouts: z.array(workoutInputSchema).min(1).describe("Array of workouts to add (min 1). Supports partial success — valid workouts are inserted even if others fail."),
});

const updateWorkoutSchema = z
  .object({
    workoutId: z.string().uuid().describe("Workout UUID."),
    labelId: z.string().uuid().optional().describe("Label UUID. Provide this or labelKey if you want to change the workout label, but not both."),
    labelKey: labelKeySchema.optional().describe("Label key string. Provide this or labelId if you want to change the workout label, but not both."),
    date: z.string().date().optional().describe("Workout date (YYYY-MM-DD)."),
    title: z.string().trim().min(1).optional().describe("Workout title."),
    description: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .optional()
      .describe(
        "Human-readable workout instructions in markdown. Must be self-contained — a user should be able to execute the workout from this field alone. See the training-plan-guide resource for suggested formatting. Set to null to clear.",
      ),
    targetDurationMin: z.number().int().positive().nullable().optional().describe("Planned duration in minutes. Set to null to clear."),
    targetDistanceM: z.number().int().positive().nullable().optional().describe("Planned distance in meters. Set to null to clear."),
    phaseId: z.string().uuid().nullable().optional().describe("Phase UUID. Set to null to unlink from phase."),
    sortOrder: z.number().int().optional().describe("Display order within a day (lower values appear first)."),
    status: workoutStatusSchema.optional().describe("Workout status: 'planned', 'completed', or 'skipped'."),
    completionNotes: z.string().trim().min(1).nullable().optional().describe("Athlete notes on how the workout went. Set to null to clear."),
    trainerNotes: z.string().trim().min(1).nullable().optional().describe("Coach/AI notes about the workout. Set to null to clear."),
    execution: executionSchema
      .nullable()
      .optional()
      .describe(
        "OPTIONAL in the schema but EXPECTED in practice — add or update this whenever the workout can be represented as warmup/steady/interval/cooldown blocks (most runs, rides, and swims). ALWAYS set `appleWatch.activityType` and `appleWatch.location` when the sport is known. Powers Apple Watch export (.workout files), structured views, and analytics. Schema: v2. Use `alert`, not `cue`. Supported blocks: `warmup`, `cooldown`, `steady`, `rest`, `free`, `interval`, `repeat`. Each step/phase may have `displayName` and at most one alert (`heartRateZone`, `heartRateRange`, `paceRange`, `paceThreshold`, `powerRange`, `powerThreshold`, `cadenceRange`, `cadenceThreshold`). Unsupported here: `strength`, `note`, `lap-button`, `poolLengthMeters`, `displayHints`, and `appleWatch.alerts`. Set to null to clear.",
      ),
    metadata: z.unknown().nullable().optional().describe("Arbitrary key-value data. Set to null to clear."),
  })
  .superRefine((value, issueContext) => {
    if (value.labelId && value.labelKey) {
      issueContext.addIssue({ code: "custom", message: "Provide only one of labelId or labelKey when changing the workout label" });
    }
  });

type UpdateWorkoutParams = z.infer<typeof updateWorkoutSchema>;

const updateWorkoutsSchema = z
  .object({
    updates: z.array(updateWorkoutSchema).min(1).max(100).describe("Workout updates to apply. Each item uses the same fields as a single workout update and requires workoutId."),
  })
  .superRefine((value, issueContext) => {
    const seen = new Set<string>();
    const duplicateIds = new Set<string>();

    for (const update of value.updates) {
      if (seen.has(update.workoutId)) {
        duplicateIds.add(update.workoutId);
      } else {
        seen.add(update.workoutId);
      }
    }

    if (duplicateIds.size > 0) {
      issueContext.addIssue({ code: "custom", path: ["updates"], message: `Duplicate workoutId(s): ${[...duplicateIds].join(", ")}` });
    }
  });

type PlanLabel = {
  id: string;
  key: string;
  label: string;
  hue: number;
  icon: string | null;
  metadata: Record<string, unknown> | null;
  planId: string;
  activitySports: string[];
};

async function getPlanLabels(ctx: McpContext, planIds: string[]): Promise<PlanLabel[]> {
  if (planIds.length === 0) return [];

  const { data, error } = await ctx.supabase
    .from("labels")
    .select("id, key, label, hue, icon, metadata, plan_id, label_activity_sports(activity_sport)")
    .in("plan_id", planIds)
    .eq("user_id", ctx.userId)
    .order("label", { ascending: true });

  if (error) throw new AppError("INTERNAL_ERROR", error.message);

  return (data ?? []).map((label: Record<string, unknown>) => ({
    id: label["id"] as string,
    key: label["key"] as string,
    label: label["label"] as string,
    hue: label["hue"] as number,
    icon: (label["icon"] as string | null) ?? null,
    metadata: (label["metadata"] as Record<string, unknown> | null) ?? null,
    planId: label["plan_id"] as string,
    activitySports: ((label["label_activity_sports"] as Array<{ activity_sport: string }> | null) ?? []).map((row) => row.activity_sport),
  }));
}

async function resolveWorkoutLabel(ctx: McpContext, planId: string, input: { labelId?: string; labelKey?: string }) {
  const labels = await getPlanLabels(ctx, [planId]);
  const label = input.labelId ? labels.find((candidate) => candidate.id === input.labelId) : labels.find((candidate) => candidate.key === input.labelKey);

  if (!label) {
    throw new AppError("NOT_FOUND", input.labelId ? "Label not found" : `Label '${input.labelKey}' not found`);
  }

  return label;
}

function buildMissingActivitySportWarnings(label: { key: string; activitySports: string[] }) {
  return label.activitySports.length === 0 ? [`Workout label '${label.key}' has no activitySports; linking imported activities may require manual matching.`] : [];
}

function buildMissingExecutionWarning(workout: { title: string }) {
  return `Workout '${workout.title}' was created without execution data. Most workouts should include structured blocks (warmup/steady/interval/cooldown) plus appleWatch.activityType+location for Apple Watch export. Omit only for genuinely unstructured workouts (e.g. pure strength).`;
}

async function attachLabels(ctx: McpContext, planId: string, workouts: Array<Record<string, unknown>>) {
  const labels = await getPlanLabels(ctx, [planId]);
  const labelsById = new Map(labels.map((label) => [label.id, label]));

  return workouts.map((workout) => ({
    ...workout,
    label: typeof workout["label_id"] === "string" ? (labelsById.get(workout["label_id"]) ?? null) : null,
  }));
}

const workoutSelect =
  "id, plan_id, phase_id, label_id, date, title, description, target_duration_min, target_distance_m, sort_order, status, completion_notes, trainer_notes, execution, metadata, created_at, updated_at";

function serializeWorkoutUpdateError(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues;
  }

  if (error instanceof AppError) {
    return { code: error.code, message: error.message };
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

type UpdateWorkoutsParams = z.infer<typeof updateWorkoutsSchema>;

type BatchFailure = { index: number; workoutId: string; errors: unknown };

async function applyBatchWorkoutUpdates(ctx: McpContext, params: UpdateWorkoutsParams) {
  const parsedRows: Array<{ index: number; update: UpdateWorkoutParams }> = [];
  const failed: BatchFailure[] = [];

  for (const [index, raw] of params.updates.entries()) {
    try {
      parsedRows.push({ index, update: updateWorkoutSchema.parse(raw) });
    } catch (error) {
      const workoutId = (raw && typeof raw === "object" && "workoutId" in raw && typeof raw.workoutId === "string" ? raw.workoutId : "") || "(missing)";
      failed.push({ index, workoutId, errors: serializeWorkoutUpdateError(error) });
    }
  }

  if (parsedRows.length === 0) {
    return { updated: [] as unknown[], failed, warnings: [] as string[] };
  }

  const ids = parsedRows.map((row) => row.update.workoutId);
  const { data: existingRowsRaw, error: existingError } = await ctx.supabase.from("workouts").select(workoutSelect).in("id", ids).eq("user_id", ctx.userId);
  if (existingError) throw new AppError("INTERNAL_ERROR", existingError.message);
  const existingRows = (existingRowsRaw ?? []) as Array<Record<string, unknown>>;

  const existingById = new Map(existingRows.map((row) => [row["id"] as string, row]));

  const distinctPlanIds = [...new Set(existingRows.map((row) => row["plan_id"] as string))];
  const labels = await getPlanLabels(ctx, distinctPlanIds);
  const labelsById = new Map(labels.map((label) => [label.id, label]));
  const labelsByPlanAndKey = new Map<string, Map<string, PlanLabel>>();
  for (const label of labels) {
    let bucket = labelsByPlanAndKey.get(label.planId);
    if (!bucket) {
      bucket = new Map();
      labelsByPlanAndKey.set(label.planId, bucket);
    }
    bucket.set(label.key, label);
  }

  const mergedRows: Array<Record<string, unknown>> = [];
  const validRows: Array<{ index: number; update: UpdateWorkoutParams; labelForResponse: PlanLabel | null }> = [];

  for (const { index, update } of parsedRows) {
    const existing = existingById.get(update.workoutId);
    if (!existing) {
      failed.push({ index, workoutId: update.workoutId, errors: { code: "NOT_FOUND", message: "Workout not found" } });
      continue;
    }

    let nextLabelId: string | null = (existing["label_id"] as string | null) ?? null;
    if (update.labelId || update.labelKey) {
      const planId = existing["plan_id"] as string;
      const planLabels = labelsByPlanAndKey.get(planId);
      const resolved = update.labelId ? labelsById.get(update.labelId) : planLabels?.get(update.labelKey!);
      if (!resolved || resolved.planId !== planId) {
        failed.push({
          index,
          workoutId: update.workoutId,
          errors: { code: "NOT_FOUND", message: update.labelId ? "Label not found" : `Label '${update.labelKey}' not found` },
        });
        continue;
      }
      nextLabelId = resolved.id;
    }

    let metadata: unknown = existing["metadata"];
    if (update.metadata !== undefined) {
      try {
        metadata = update.metadata === null ? null : validateWorkoutMetadata(update.metadata);
      } catch (error) {
        failed.push({ index, workoutId: update.workoutId, errors: serializeWorkoutUpdateError(error) });
        continue;
      }
    }

    const merged: Record<string, unknown> = {
      id: existing["id"],
      plan_id: existing["plan_id"],
      user_id: ctx.userId,
      phase_id: update.phaseId === undefined ? existing["phase_id"] : update.phaseId,
      label_id: nextLabelId,
      date: update.date ?? existing["date"],
      title: update.title ?? existing["title"],
      description: update.description === undefined ? existing["description"] : update.description,
      target_duration_min: update.targetDurationMin === undefined ? existing["target_duration_min"] : update.targetDurationMin,
      target_distance_m: update.targetDistanceM === undefined ? existing["target_distance_m"] : update.targetDistanceM,
      sort_order: update.sortOrder ?? existing["sort_order"],
      status: update.status ?? existing["status"],
      completion_notes: update.completionNotes === undefined ? existing["completion_notes"] : update.completionNotes,
      trainer_notes: update.trainerNotes === undefined ? existing["trainer_notes"] : update.trainerNotes,
      execution: update.execution === undefined ? existing["execution"] : (update.execution ?? null),
      metadata,
      created_at: existing["created_at"],
      updated_at: existing["updated_at"],
    };

    mergedRows.push(merged);
    const labelForResponse = nextLabelId ? (labelsById.get(nextLabelId) ?? null) : null;
    validRows.push({ index, update, labelForResponse });
  }

  if (mergedRows.length === 0) {
    return { updated: [] as unknown[], failed, warnings: [] as string[] };
  }

  const { data: upsertedRaw, error: upsertError } = await ctx.supabase.from("workouts").upsert(mergedRows, { onConflict: "id" }).select(workoutSelect);
  if (upsertError) throw new AppError("INTERNAL_ERROR", upsertError.message);

  const upserted = (upsertedRaw ?? []) as Array<Record<string, unknown>>;
  const upsertedById = new Map(upserted.map((row) => [row["id"] as string, row]));
  const updated: unknown[] = [];
  const warnings: string[] = [];

  for (const { update, labelForResponse } of validRows) {
    const row = upsertedById.get(update.workoutId);
    if (!row) continue;
    updated.push({ ...row, label: labelForResponse });
    if (labelForResponse) warnings.push(...buildMissingActivitySportWarnings(labelForResponse));
  }

  return { updated, failed, warnings: [...new Set(warnings)] };
}

export function registerWorkoutTools(server: McpServer, ctx: McpContext) {
  server.registerTool(
    "add_workouts",
    {
      title: "Add Workouts",
      description:
        "Add one or more workouts to the active plan, or to a specific plan when planId is provided. Each workout SHOULD include `execution` with structured blocks plus `appleWatch.activityType`/`location` whenever the sport is known — the response will warn when omitted. Skip only for genuinely unstructured workouts (e.g. pure strength). Returns partial results if some fail validation. ⚠️ NOT idempotent — calling twice with the same data creates duplicates. If a previous call failed or you are retrying, use get_workouts first to check what already exists.",
      inputSchema: addWorkoutsSchema,
      annotations: { idempotentHint: false },
    },
    async (input) => {
      try {
        const params = addWorkoutsSchema.parse(input);
        const plan = await resolvePlanId(ctx, params.planId);
        const inserted: unknown[] = [];
        const failed: Array<{ index: number; errors: unknown }> = [];
        const warnings: string[] = [];

        for (const [index, workout] of params.workouts.entries()) {
          try {
            const parsed = workoutInputSchema.parse(workout);
            const label = await resolveWorkoutLabel(ctx, plan.id, parsed);
            const metadata = validateWorkoutMetadata(parsed.metadata);
            const execution = parsed.execution ?? null;
            const { data, error } = await ctx.supabase
              .from("workouts")
              .insert({
                plan_id: plan.id,
                phase_id: parsed.phaseId ?? null,
                label_id: label.id,
                user_id: ctx.userId,
                date: parsed.date,
                title: parsed.title,
                description: parsed.description,
                target_duration_min: parsed.targetDurationMin ?? null,
                target_distance_m: parsed.targetDistanceM ?? null,
                sort_order: parsed.sortOrder,
                status: "planned",
                execution,
                metadata,
              })
              .select(workoutSelect)
              .single();

            if (error || !data) {
              failed.push({ index, errors: error?.message ?? "Failed to insert workout" });
              continue;
            }

            inserted.push({ ...data, label });
            warnings.push(...buildMissingActivitySportWarnings(label));
            if (execution === null) {
              warnings.push(buildMissingExecutionWarning(parsed));
            }
          } catch (error) {
            failed.push({ index, errors: error instanceof z.ZodError ? error.issues : String(error) });
          }
        }

        if (inserted.length === 0) {
          throw new AppError("VALIDATION_ERROR", "No workouts were inserted", failed);
        }

        if (failed.length > 0) {
          warnings.push(`${failed.length} workout(s) failed validation or insertion`);
        }

        return toolSuccess({ inserted, failed }, [...new Set(warnings)]);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "update_workouts",
    {
      title: "Update Workouts",
      description:
        "Update one or more workouts in a single call. Each update requires `workoutId`. Omitted fields stay unchanged; fields set to null are cleared. Supports partial success — valid updates apply even if others fail. Use this for both single edits (one item in `updates`) and bulk operations like rescheduling a week.",
      inputSchema: updateWorkoutsSchema,
      annotations: { idempotentHint: true },
    },
    async (input) => {
      try {
        const params = updateWorkoutsSchema.parse(input);
        const { updated, failed, warnings } = await applyBatchWorkoutUpdates(ctx, params);

        if (updated.length === 0) {
          throw new AppError("VALIDATION_ERROR", "No workouts were updated", failed);
        }
        if (failed.length > 0) {
          warnings.push(`${failed.length} workout(s) failed validation or update`);
        }
        return toolSuccess({ updated, failed }, [...new Set(warnings)]);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "remove_workouts",
    {
      title: "Remove Workouts",
      description: "Remove multiple workouts by id.",
      inputSchema: z.object({ workoutIds: z.array(z.string().uuid()).min(1).describe("Array of workout UUIDs to delete.") }),
      annotations: { destructiveHint: true },
    },
    async (input) => {
      try {
        const params = z.object({ workoutIds: z.array(z.string().uuid()).min(1) }).parse(input);
        const { error } = await ctx.supabase.from("workouts").delete().in("id", params.workoutIds).eq("user_id", ctx.userId);
        if (error) throw new AppError("INTERNAL_ERROR", error.message);
        return toolSuccess({ removed: params.workoutIds.length, workoutIds: params.workoutIds });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_workouts",
    {
      title: "Get Workouts",
      description: "Query workouts on the active plan, or on a specific plan when planId is provided, with flexible date, label, and status filters.",
      inputSchema: z.object({
        planId: z.string().uuid().optional().describe("Plan UUID. Defaults to the active plan if omitted."),
        dateFrom: z.string().date().optional().describe("Filter start date (YYYY-MM-DD, inclusive)."),
        dateTo: z.string().date().optional().describe("Filter end date (YYYY-MM-DD, inclusive)."),
        labelId: z.string().uuid().optional().describe("Filter by label UUID."),
        labelKey: labelKeySchema.optional().describe("Filter by label key string using lowercase letters, numbers, and hyphens only."),
        status: workoutStatusSchema.optional().describe("Filter by workout status: 'planned', 'completed', or 'skipped'."),
        limit: z.number().int().positive().max(200).default(50).optional().describe("Max results (default 50, max 200)."),
      }),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        const params = z
          .object({
            planId: z.string().uuid().optional(),
            dateFrom: z.string().date().optional(),
            dateTo: z.string().date().optional(),
            labelId: z.string().uuid().optional(),
            labelKey: labelKeySchema.optional(),
            status: workoutStatusSchema.optional(),
            limit: z.number().int().positive().max(200).default(50).optional(),
          })
          .parse(input ?? {});

        const plan = await resolvePlanId(ctx, params.planId);
        let query = ctx.supabase
          .from("workouts")
          .select(workoutSelect)
          .eq("plan_id", plan.id)
          .eq("user_id", ctx.userId)
          .order("date", { ascending: true })
          .order("sort_order", { ascending: true })
          .limit(params.limit ?? 50);

        if (params.dateFrom) query = query.gte("date", params.dateFrom);
        if (params.dateTo) query = query.lte("date", params.dateTo);
        if (params.labelId) query = query.eq("label_id", params.labelId);
        if (params.status) query = query.eq("status", params.status);

        const { data, error } = await query;
        if (error) throw new AppError("INTERNAL_ERROR", error.message);

        let workouts = await attachLabels(ctx, plan.id, (data ?? []) as Array<Record<string, unknown>>);
        if (params.labelKey) {
          workouts = workouts.filter((workout) => workout.label?.key === params.labelKey);
        }
        return toolSuccess(workouts);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "complete_workout",
    {
      title: "Complete Workout",
      description: "Mark a workout as completed and optionally attach completion notes.",
      inputSchema: z.object({
        workoutId: z.string().uuid().describe("Workout UUID."),
        notes: z.string().trim().min(1).optional().describe("Optional completion notes from the athlete."),
      }),
      annotations: { idempotentHint: false },
    },
    async (input) => {
      try {
        const params = z.object({ workoutId: z.string().uuid(), notes: z.string().trim().min(1).optional() }).parse(input);
        const { data, error } = await ctx.supabase
          .from("workouts")
          .update({ status: "completed", completion_notes: params.notes ?? null })
          .eq("id", params.workoutId)
          .eq("user_id", ctx.userId)
          .select("id, status, completion_notes")
          .maybeSingle();

        if (error) throw new AppError("INTERNAL_ERROR", error.message);
        if (!data) throw new AppError("NOT_FOUND", "Workout not found");
        return toolSuccess(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "skip_workout",
    {
      title: "Skip Workout",
      description: "Mark a workout as skipped with an optional reason.",
      inputSchema: z.object({ workoutId: z.string().uuid().describe("Workout UUID."), reason: z.string().trim().min(1).optional().describe("Optional reason for skipping.") }),
      annotations: { idempotentHint: false },
    },
    async (input) => {
      try {
        const params = z.object({ workoutId: z.string().uuid(), reason: z.string().trim().min(1).optional() }).parse(input);
        const { data, error } = await ctx.supabase
          .from("workouts")
          .update({ status: "skipped", completion_notes: params.reason ?? null })
          .eq("id", params.workoutId)
          .eq("user_id", ctx.userId)
          .select("id, status, completion_notes")
          .maybeSingle();

        if (error) throw new AppError("INTERNAL_ERROR", error.message);
        if (!data) throw new AppError("NOT_FOUND", "Workout not found");
        return toolSuccess(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "link_activity",
    {
      title: "Link Activity",
      description:
        "Link a Strava activity to a workout and mark it completed. Fetches the activity from Strava and stores it. Returns a conflict if the workout already has an activity or the Strava activity is linked elsewhere.",
      inputSchema: z.object({
        workoutId: z.string().uuid().describe("Workout UUID."),
        stravaActivityId: z.number().int().positive().describe("Strava activity numeric ID (the one in the Strava URL)."),
      }),
      annotations: { idempotentHint: true },
    },
    async (input) => {
      try {
        const params = z.object({ workoutId: z.string().uuid(), stravaActivityId: z.number().int().positive() }).parse(input);
        const result = await linkActivityToWorkout(ctx.supabase, ctx.bindings, ctx.userId, params.workoutId, params.stravaActivityId);
        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "unlink_activity",
    {
      title: "Unlink Activity",
      description: "Remove an activity link from a workout, delete the stored activity row, and reset the workout to planned.",
      inputSchema: z.object({ workoutId: z.string().uuid().describe("Workout UUID.") }),
      annotations: { idempotentHint: true },
    },
    async (input) => {
      try {
        const params = z.object({ workoutId: z.string().uuid() }).parse(input);
        const result = await unlinkActivityFromWorkout(ctx.supabase, ctx.userId, params.workoutId);
        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "add_trainer_notes",
    {
      title: "Add Trainer Notes",
      description: "Set trainer/coach notes on a workout. Overwrites existing notes.",
      inputSchema: z.object({
        workoutId: z.string().uuid().describe("Workout UUID."),
        notes: z.string().trim().min(1).describe("Trainer/coach notes in markdown."),
      }),
      annotations: { idempotentHint: true },
    },
    async (input) => {
      try {
        const params = z
          .object({
            workoutId: z.string().uuid(),
            notes: z.string().trim().min(1),
          })
          .parse(input);

        const { data, error } = await ctx.supabase
          .from("workouts")
          .update({ trainer_notes: params.notes })
          .eq("id", params.workoutId)
          .eq("user_id", ctx.userId)
          .select("id, trainer_notes")
          .maybeSingle();

        if (error) throw new AppError("INTERNAL_ERROR", error.message);
        if (!data) throw new AppError("NOT_FOUND", "Workout not found");
        return toolSuccess(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
