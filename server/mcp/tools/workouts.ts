import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AppError, assertSingleTarget, resolvePlanId, toolError, toolSuccess, type McpContext, validateWorkoutExecution, validateWorkoutMetadata } from "../context";

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
  execution: z.unknown().optional().describe("Structured machine-readable workout definition. See the training-plan-guide resource for the schema."),
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
    execution: z.unknown().nullable().optional().describe("Structured machine-readable workout definition. Set to null to clear. See the training-plan-guide resource."),
    metadata: z.unknown().nullable().optional().describe("Arbitrary key-value data. Set to null to clear."),
  })
  .superRefine((value, issueContext) => {
    if (value.labelId && value.labelKey) {
      issueContext.addIssue({ code: "custom", message: "Provide only one of labelId or labelKey when changing the workout label" });
    }
  });

async function getPlanLabels(ctx: McpContext, planId: string) {
  const [{ data: labels, error: labelsError }, { data: activitySports, error: activitySportsError }] = await Promise.all([
    ctx.supabase
      .from("labels")
      .select("id, key, label, hue, icon, metadata, created_at, updated_at")
      .eq("plan_id", planId)
      .eq("user_id", ctx.userId)
      .order("label", { ascending: true }),
    ctx.supabase.from("label_activity_sports").select("label_id, activity_sport").eq("user_id", ctx.userId),
  ]);

  if (labelsError) throw new AppError("INTERNAL_ERROR", labelsError.message);
  if (activitySportsError) throw new AppError("INTERNAL_ERROR", activitySportsError.message);

  const labelIds = new Set((labels ?? []).map((label) => label.id));
  const sportsByLabelId = new Map<string, string[]>();
  for (const row of activitySports ?? []) {
    if (!labelIds.has(row.label_id)) continue;
    const current = sportsByLabelId.get(row.label_id) ?? [];
    current.push(row.activity_sport);
    sportsByLabelId.set(row.label_id, current);
  }

  return (labels ?? []).map((label) => ({
    id: label.id,
    key: label.key,
    label: label.label,
    hue: label.hue,
    icon: label.icon,
    metadata: label.metadata,
    activitySports: sportsByLabelId.get(label.id) ?? [],
  }));
}

async function resolveWorkoutLabel(ctx: McpContext, planId: string, input: { labelId?: string; labelKey?: string }) {
  const labels = await getPlanLabels(ctx, planId);
  const label = input.labelId ? labels.find((candidate) => candidate.id === input.labelId) : labels.find((candidate) => candidate.key === input.labelKey);

  if (!label) {
    throw new AppError("NOT_FOUND", input.labelId ? "Label not found" : `Label '${input.labelKey}' not found`);
  }

  return label;
}

function buildMissingActivitySportWarnings(label: { key: string; activitySports: string[] }) {
  return label.activitySports.length === 0 ? [`Workout label '${label.key}' has no activitySports; linking imported activities may require manual matching.`] : [];
}

async function attachLabels(ctx: McpContext, planId: string, workouts: Array<Record<string, unknown>>) {
  const labels = await getPlanLabels(ctx, planId);
  const labelsById = new Map(labels.map((label) => [label.id, label]));

  return workouts.map((workout) => ({
    ...workout,
    label: typeof workout["label_id"] === "string" ? (labelsById.get(workout["label_id"]) ?? null) : null,
  }));
}

const workoutSelect =
  "id, plan_id, phase_id, label_id, date, title, description, target_duration_min, target_distance_m, sort_order, status, completion_notes, trainer_notes, activity_id, execution, metadata, created_at, updated_at";

export function registerWorkoutTools(server: McpServer, ctx: McpContext) {
  server.registerTool(
    "add_workouts",
    {
      title: "Add Workouts",
      description:
        "Add one or more workouts to the active plan, or to a specific plan when planId is provided. Returns partial results if some fail validation. ⚠️ NOT idempotent — calling twice with the same data creates duplicates. If a previous call failed or you are retrying, use get_workouts first to check what already exists.",
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
            const execution = validateWorkoutExecution(parsed.execution);
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
    "update_workout",
    {
      title: "Update Workout",
      description: "Update a workout's fields. Omitted fields stay unchanged; fields set to null are cleared.",
      inputSchema: updateWorkoutSchema,
      annotations: { idempotentHint: true },
    },
    async (input) => {
      try {
        const params = updateWorkoutSchema.parse(input);
        const { data: existingWorkout, error: existingError } = await ctx.supabase
          .from("workouts")
          .select("id, plan_id, label_id")
          .eq("id", params.workoutId)
          .eq("user_id", ctx.userId)
          .maybeSingle();
        if (existingError) throw new AppError("INTERNAL_ERROR", existingError.message);
        if (!existingWorkout) throw new AppError("NOT_FOUND", "Workout not found");

        const nextLabel = params.labelId || params.labelKey ? await resolveWorkoutLabel(ctx, existingWorkout.plan_id, params) : null;
        const patch = {
          date: params.date,
          label_id: nextLabel?.id,
          title: params.title,
          description: params.description,
          target_duration_min: params.targetDurationMin,
          target_distance_m: params.targetDistanceM,
          phase_id: params.phaseId,
          sort_order: params.sortOrder,
          status: params.status,
          completion_notes: params.completionNotes,
          trainer_notes: params.trainerNotes,
          execution: params.execution === undefined ? undefined : validateWorkoutExecution(params.execution),
          metadata: params.metadata === undefined ? undefined : validateWorkoutMetadata(params.metadata),
        };
        const cleanedPatch = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));

        const { data, error } = await ctx.supabase.from("workouts").update(cleanedPatch).eq("id", params.workoutId).eq("user_id", ctx.userId).select(workoutSelect).maybeSingle();

        if (error) throw new AppError("INTERNAL_ERROR", error.message);
        if (!data) throw new AppError("NOT_FOUND", "Workout not found");
        const [withLabel] = await attachLabels(ctx, existingWorkout.plan_id, [data]);
        const warnings = withLabel?.label ? buildMissingActivitySportWarnings(withLabel.label) : [];
        return toolSuccess(withLabel, warnings);
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
      description: "Link a Strava activity to a workout and mark it completed. Returns a conflict if the workout already has an activity or the activity is linked elsewhere.",
      inputSchema: z.object({ workoutId: z.string().uuid().describe("Workout UUID."), activityId: z.string().uuid().describe("Strava activity UUID to link.") }),
      annotations: { idempotentHint: true },
    },
    async (input) => {
      try {
        const params = z.object({ workoutId: z.string().uuid(), activityId: z.string().uuid() }).parse(input);
        const { data: workout, error: workoutError } = await ctx.supabase
          .from("workouts")
          .select("id, activity_id")
          .eq("id", params.workoutId)
          .eq("user_id", ctx.userId)
          .maybeSingle();

        if (workoutError) throw new AppError("INTERNAL_ERROR", workoutError.message);
        if (!workout) throw new AppError("NOT_FOUND", "Workout not found");
        if (workout.activity_id) throw new AppError("CONFLICT", "Workout already has a linked activity");

        const { data: activity, error: activityError } = await ctx.supabase.from("activities").select("id").eq("id", params.activityId).eq("user_id", ctx.userId).maybeSingle();

        if (activityError) throw new AppError("INTERNAL_ERROR", activityError.message);
        if (!activity) throw new AppError("NOT_FOUND", "Activity not found");

        const { data: conflictingWorkout, error: conflictError } = await ctx.supabase
          .from("workouts")
          .select("id")
          .eq("activity_id", params.activityId)
          .eq("user_id", ctx.userId)
          .neq("id", params.workoutId)
          .maybeSingle();

        if (conflictError) throw new AppError("INTERNAL_ERROR", conflictError.message);
        if (conflictingWorkout) throw new AppError("CONFLICT", "Activity is already linked to another workout");

        const { data, error } = await ctx.supabase
          .from("workouts")
          .update({ activity_id: params.activityId, status: "completed" })
          .eq("id", params.workoutId)
          .eq("user_id", ctx.userId)
          .select("id, status, activity_id")
          .single();

        if (error) throw new AppError("INTERNAL_ERROR", error.message);
        return toolSuccess(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "unlink_activity",
    {
      title: "Unlink Activity",
      description: "Remove an activity link from a workout and reset it to planned.",
      inputSchema: z.object({ workoutId: z.string().uuid().describe("Workout UUID.") }),
      annotations: { idempotentHint: true },
    },
    async (input) => {
      try {
        const params = z.object({ workoutId: z.string().uuid() }).parse(input);
        const { data, error } = await ctx.supabase
          .from("workouts")
          .update({ activity_id: null, status: "planned" })
          .eq("id", params.workoutId)
          .eq("user_id", ctx.userId)
          .select("id, status, activity_id")
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
    "add_trainer_notes",
    {
      title: "Add Trainer Notes",
      description: "Set trainer/coach notes on a workout or activity. Overwrites existing notes.",
      inputSchema: z.object({
        workoutId: z.string().uuid().optional().describe("Workout UUID. Provide exactly one of workoutId or activityId."),
        activityId: z.string().uuid().optional().describe("Activity UUID. Provide exactly one of workoutId or activityId."),
        notes: z.string().trim().min(1).describe("Trainer/coach notes in markdown."),
      }),
      annotations: { idempotentHint: true },
    },
    async (input) => {
      try {
        const params = z
          .object({
            workoutId: z.string().uuid().optional(),
            activityId: z.string().uuid().optional(),
            notes: z.string().trim().min(1),
          })
          .parse(input);

        assertSingleTarget(params.workoutId, params.activityId);

        if (params.workoutId) {
          const { data, error } = await ctx.supabase
            .from("workouts")
            .update({ trainer_notes: params.notes })
            .eq("id", params.workoutId)
            .eq("user_id", ctx.userId)
            .select("id, trainer_notes")
            .maybeSingle();

          if (error) throw new AppError("INTERNAL_ERROR", error.message);
          if (!data) throw new AppError("NOT_FOUND", "Workout not found");
          return toolSuccess({ target: "workout", ...data });
        }

        const { data, error } = await ctx.supabase
          .from("activities")
          .update({ trainer_notes: params.notes })
          .eq("id", params.activityId!)
          .eq("user_id", ctx.userId)
          .select("id, trainer_notes")
          .maybeSingle();

        if (error) throw new AppError("INTERNAL_ERROR", error.message);
        if (!data) throw new AppError("NOT_FOUND", "Activity not found");
        return toolSuccess({ target: "activity", ...data });
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
