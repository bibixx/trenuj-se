import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AppError, assertSingleTarget, resolvePlanId, toolError, toolSuccess, type McpContext, validateWorkoutMetadata } from "../context";

const workoutStatusSchema = z.enum(["planned", "completed", "skipped"]);

const workoutInputSchema = z.object({
  date: z.string().date(),
  sport: z.string().trim().min(1),
  category: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  targetDurationMin: z.number().int().positive().optional(),
  targetDistanceM: z.number().int().positive().optional(),
  phaseId: z.string().uuid().optional(),
  sortOrder: z.number().int(),
  metadata: z.unknown().optional(),
});

const addWorkoutsSchema = z.object({
  planId: z.string().uuid().optional(),
  workouts: z.array(workoutInputSchema).min(1),
});

const updateWorkoutSchema = z.object({
  workoutId: z.string().uuid(),
  date: z.string().date().optional(),
  sport: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).nullable().optional(),
  targetDurationMin: z.number().int().positive().nullable().optional(),
  targetDistanceM: z.number().int().positive().nullable().optional(),
  phaseId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().optional(),
  status: workoutStatusSchema.optional(),
  completionNotes: z.string().trim().min(1).nullable().optional(),
  trainerNotes: z.string().trim().min(1).nullable().optional(),
  metadata: z.unknown().nullable().optional(),
});

export function registerWorkoutTools(server: McpServer, ctx: McpContext) {
  server.registerTool(
    "add_workouts",
    {
      title: "Add Workouts",
      description: "Add workouts to a plan with partial-success validation.",
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
            const metadata = validateWorkoutMetadata(parsed.metadata);
            const { data, error } = await ctx.supabase
              .from("workouts")
              .insert({
                plan_id: plan.id,
                phase_id: parsed.phaseId ?? null,
                user_id: ctx.userId,
                date: parsed.date,
                sport: parsed.sport,
                category: parsed.category,
                title: parsed.title,
                description: parsed.description,
                target_duration_min: parsed.targetDurationMin ?? null,
                target_distance_m: parsed.targetDistanceM ?? null,
                sort_order: parsed.sortOrder,
                status: "planned",
                metadata,
              })
              .select(
                "id, plan_id, phase_id, date, sport, category, title, description, target_duration_min, target_distance_m, sort_order, status, completion_notes, trainer_notes, activity_id, metadata, created_at, updated_at",
              )
              .single();

            if (error || !data) {
              failed.push({ index, errors: error?.message ?? "Failed to insert workout" });
              continue;
            }

            inserted.push(data);
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

        return toolSuccess({ inserted, failed }, warnings);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "update_workout",
    {
      title: "Update Workout",
      description: "Update a workout by id.",
      inputSchema: updateWorkoutSchema,
      annotations: { idempotentHint: true },
    },
    async (input) => {
      try {
        const params = updateWorkoutSchema.parse(input);
        const patch = {
          date: params.date,
          sport: params.sport,
          category: params.category,
          title: params.title,
          description: params.description,
          target_duration_min: params.targetDurationMin,
          target_distance_m: params.targetDistanceM,
          phase_id: params.phaseId,
          sort_order: params.sortOrder,
          status: params.status,
          completion_notes: params.completionNotes,
          trainer_notes: params.trainerNotes,
          metadata: params.metadata === undefined ? undefined : validateWorkoutMetadata(params.metadata),
        };
        const cleanedPatch = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));

        const { data, error } = await ctx.supabase
          .from("workouts")
          .update(cleanedPatch)
          .eq("id", params.workoutId)
          .eq("user_id", ctx.userId)
          .select(
            "id, plan_id, phase_id, date, sport, category, title, description, target_duration_min, target_distance_m, sort_order, status, completion_notes, trainer_notes, activity_id, metadata, created_at, updated_at",
          )
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
    "remove_workouts",
    {
      title: "Remove Workouts",
      description: "Remove multiple workouts by id.",
      inputSchema: z.object({ workoutIds: z.array(z.string().uuid()).min(1) }),
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
      description: "Query workouts with flexible plan/date/sport/status filters.",
      inputSchema: z.object({
        planId: z.string().uuid().optional(),
        dateFrom: z.string().date().optional(),
        dateTo: z.string().date().optional(),
        sport: z.string().trim().min(1).optional(),
        status: workoutStatusSchema.optional(),
        limit: z.number().int().positive().max(200).default(50).optional(),
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
            sport: z.string().trim().min(1).optional(),
            status: workoutStatusSchema.optional(),
            limit: z.number().int().positive().max(200).default(50).optional(),
          })
          .parse(input ?? {});

        const plan = await resolvePlanId(ctx, params.planId);
        let query = ctx.supabase
          .from("workouts")
          .select(
            "id, plan_id, phase_id, date, sport, category, title, description, target_duration_min, target_distance_m, sort_order, status, completion_notes, trainer_notes, activity_id, metadata, created_at, updated_at",
          )
          .eq("plan_id", plan.id)
          .eq("user_id", ctx.userId)
          .order("date", { ascending: true })
          .order("sort_order", { ascending: true })
          .limit(params.limit ?? 50);

        if (params.dateFrom) query = query.gte("date", params.dateFrom);
        if (params.dateTo) query = query.lte("date", params.dateTo);
        if (params.sport) query = query.eq("sport", params.sport);
        if (params.status) query = query.eq("status", params.status);

        const { data, error } = await query;
        if (error) throw new AppError("INTERNAL_ERROR", error.message);
        return toolSuccess(data ?? []);
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
      inputSchema: z.object({ workoutId: z.string().uuid(), notes: z.string().trim().min(1).optional() }),
      annotations: { idempotentHint: true },
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
      inputSchema: z.object({ workoutId: z.string().uuid(), reason: z.string().trim().min(1).optional() }),
      annotations: { idempotentHint: true },
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
      description: "Manually link an activity to a workout and mark the workout completed.",
      inputSchema: z.object({ workoutId: z.string().uuid(), activityId: z.string().uuid() }),
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
      inputSchema: z.object({ workoutId: z.string().uuid() }),
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
      description: "Attach trainer notes to exactly one workout or activity.",
      inputSchema: z.object({
        workoutId: z.string().uuid().optional(),
        activityId: z.string().uuid().optional(),
        notes: z.string().trim().min(1),
      }),
      annotations: { idempotentHint: false },
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
