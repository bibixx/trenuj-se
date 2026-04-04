import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AppError, resolvePlanId, toolError, toolSuccess, type McpContext } from "../context";

const planStatusSchema = z.enum(["active", "inactive"]);
const colorBySchema = z.enum(["sport", "category"]);

const createPlanSchema = z.object({
  name: z.string().trim().min(1),
  goal: z.string().trim().min(1).optional(),
  startDate: z.string().date(),
  endDate: z.string().date().optional(),
  colorBy: colorBySchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updatePlanSchema = z.object({
  planId: z.string().uuid().optional(),
  name: z.string().trim().min(1).optional(),
  goal: z.string().trim().min(1).nullable().optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().nullable().optional(),
  status: planStatusSchema.optional(),
  colorBy: colorBySchema.optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const listPlansSchema = z.object({
  status: planStatusSchema.optional(),
});

const workoutTypeSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  hue: z.number().int().min(0).max(359),
  icon: z.string().trim().min(1).optional(),
  sortOrder: z.number().int().default(0),
});

const setWorkoutTypesSchema = z.object({
  planId: z.string().uuid().optional(),
  types: z.array(workoutTypeSchema),
});

const updateWorkoutTypeSchema = z.object({
  planId: z.string().uuid().optional(),
  key: z.string().trim().min(1),
  label: z.string().trim().min(1).optional(),
  hue: z.number().int().min(0).max(359).optional(),
  icon: z.string().trim().min(1).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

const phaseSchema = z.object({
  planId: z.string().uuid().optional(),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  startDate: z.string().date(),
  endDate: z.string().date(),
  sortOrder: z.number().int().default(0),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updatePhaseSchema = z.object({
  phaseId: z.string().uuid(),
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).nullable().optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  sortOrder: z.number().int().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

async function getPlanSummary(ctx: McpContext, planId: string) {
  const [{ data: workouts, error: workoutError }, { count: planNotesCount, error: notesError }] = await Promise.all([
    ctx.supabase.from("workouts").select("id, status, phase_id").eq("plan_id", planId).eq("user_id", ctx.userId),
    ctx.supabase.from("plan_notes").select("id", { count: "exact", head: true }).eq("plan_id", planId).eq("user_id", ctx.userId),
  ]);

  if (workoutError) {
    throw new AppError("INTERNAL_ERROR", workoutError.message);
  }

  if (notesError) {
    throw new AppError("INTERNAL_ERROR", notesError.message);
  }

  const total = workouts.length;
  const completed = workouts.filter((workout) => workout.status === "completed").length;
  const skipped = workouts.filter((workout) => workout.status === "skipped").length;

  return {
    totalWorkouts: total,
    completedWorkouts: completed,
    skippedWorkouts: skipped,
    completionRate: total > 0 ? completed / total : 0,
    planNotesCount: planNotesCount ?? 0,
  };
}

async function getCurrentPhase(ctx: McpContext, planId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await ctx.supabase
    .from("phases")
    .select("id, name, start_date, end_date, sort_order")
    .eq("plan_id", planId)
    .eq("user_id", ctx.userId)
    .lte("start_date", today)
    .gte("end_date", today)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError("INTERNAL_ERROR", error.message);
  }

  return data;
}

async function collectWorkoutTypeWarnings(ctx: McpContext, plan: Awaited<ReturnType<typeof resolvePlanId>>, types: Array<z.infer<typeof workoutTypeSchema>>) {
  const field = plan.color_by === "sport" ? "sport" : "category";
  const { data, error } = await ctx.supabase.from("workouts").select(field).eq("plan_id", plan.id).eq("user_id", ctx.userId);

  if (error) {
    throw new AppError("INTERNAL_ERROR", error.message);
  }

  const values = new Set((data ?? []).map((row) => String(row[field as keyof typeof row] ?? "")).filter(Boolean));

  return types
    .filter((type) => !values.has(type.key))
    .map((type) => `Workout type key '${type.key}' does not match any workout's ${field} field (plan uses colorBy=${plan.color_by})`);
}

export function registerPlanTools(server: McpServer, ctx: McpContext) {
  server.registerTool(
    "list_plans",
    {
      title: "List Plans",
      description: "List the user's plans, optionally filtered by status.",
      inputSchema: listPlansSchema,
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        const params = listPlansSchema.parse(input ?? {});
        let query = ctx.supabase
          .from("plans")
          .select("id, name, goal, status, start_date, end_date, color_by, created_at, updated_at")
          .eq("user_id", ctx.userId)
          .order("start_date", { ascending: false });

        if (params.status) {
          query = query.eq("status", params.status);
        }

        const { data, error } = await query;
        if (error) throw new AppError("INTERNAL_ERROR", error.message);
        return toolSuccess(data ?? []);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_plan",
    {
      title: "Get Plan",
      description: "Get plan metadata, phases, workout types, and summary stats for a specific or active plan.",
      inputSchema: z.object({ planId: z.string().uuid().optional() }),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        const params = z.object({ planId: z.string().uuid().optional() }).parse(input ?? {});
        const plan = await resolvePlanId(ctx, params.planId);

        const [{ data: phases, error: phasesError }, { data: workoutTypes, error: workoutTypesError }] = await Promise.all([
          ctx.supabase
            .from("phases")
            .select("id, name, description, start_date, end_date, sort_order, metadata, created_at")
            .eq("plan_id", plan.id)
            .eq("user_id", ctx.userId)
            .order("sort_order", { ascending: true }),
          ctx.supabase
            .from("workout_types")
            .select("id, key, label, hue, icon, sort_order")
            .eq("plan_id", plan.id)
            .eq("user_id", ctx.userId)
            .order("sort_order", { ascending: true }),
        ]);

        if (phasesError) throw new AppError("INTERNAL_ERROR", phasesError.message);
        if (workoutTypesError) throw new AppError("INTERNAL_ERROR", workoutTypesError.message);

        const summary = await getPlanSummary(ctx, plan.id);
        const currentPhase = await getCurrentPhase(ctx, plan.id);

        return toolSuccess({
          ...plan,
          phases: phases ?? [],
          workoutTypes: workoutTypes ?? [],
          summary: {
            ...summary,
            currentPhase,
          },
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "create_plan",
    {
      title: "Create Plan",
      description: "Create a new training plan and deactivate the current active plan first.",
      inputSchema: createPlanSchema,
      annotations: { idempotentHint: false },
    },
    async (input) => {
      try {
        const params = createPlanSchema.parse(input);
        if (params.endDate && params.endDate < params.startDate) {
          throw new AppError("VALIDATION_ERROR", "endDate must be on or after startDate");
        }

        const { error: deactivateError } = await ctx.supabase.from("plans").update({ status: "inactive" }).eq("user_id", ctx.userId).eq("status", "active");

        if (deactivateError) throw new AppError("INTERNAL_ERROR", deactivateError.message);

        const { data, error } = await ctx.supabase
          .from("plans")
          .insert({
            user_id: ctx.userId,
            name: params.name,
            goal: params.goal ?? null,
            start_date: params.startDate,
            end_date: params.endDate ?? null,
            status: "active",
            color_by: params.colorBy,
            metadata: params.metadata ?? null,
          })
          .select("id, name, goal, status, start_date, end_date, color_by, metadata, created_at, updated_at")
          .single();

        if (error || !data) throw new AppError("INTERNAL_ERROR", error?.message ?? "Failed to create plan");
        return toolSuccess(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "update_plan",
    {
      title: "Update Plan",
      description: "Update a plan by id or the active plan when planId is omitted.",
      inputSchema: updatePlanSchema,
      annotations: { idempotentHint: true },
    },
    async (input) => {
      try {
        const params = updatePlanSchema.parse(input);
        const plan = await resolvePlanId(ctx, params.planId);
        const nextStart = params.startDate ?? plan.start_date;
        const nextEnd = params.endDate === null ? null : (params.endDate ?? plan.end_date);
        if (nextEnd && nextEnd < nextStart) {
          throw new AppError("VALIDATION_ERROR", "endDate must be on or after startDate");
        }

        const patch = {
          name: params.name,
          goal: params.goal,
          start_date: params.startDate,
          end_date: params.endDate,
          status: params.status,
          color_by: params.colorBy,
          metadata: params.metadata,
        };

        const cleanedPatch = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
        const { data, error } = await ctx.supabase
          .from("plans")
          .update(cleanedPatch)
          .eq("id", plan.id)
          .eq("user_id", ctx.userId)
          .select("id, name, goal, status, start_date, end_date, color_by, metadata, created_at, updated_at")
          .single();

        if (error || !data) throw new AppError("INTERNAL_ERROR", error?.message ?? "Failed to update plan");
        return toolSuccess(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "deactivate_plan",
    {
      title: "Deactivate Plan",
      description: "Deactivate a plan by id or the active plan when omitted.",
      inputSchema: z.object({ planId: z.string().uuid().optional() }),
      annotations: { destructiveHint: true },
    },
    async (input) => {
      try {
        const params = z.object({ planId: z.string().uuid().optional() }).parse(input ?? {});
        const plan = await resolvePlanId(ctx, params.planId);
        const { data, error } = await ctx.supabase.from("plans").update({ status: "inactive" }).eq("id", plan.id).eq("user_id", ctx.userId).select("id, name, status").single();

        if (error || !data) throw new AppError("INTERNAL_ERROR", error?.message ?? "Failed to deactivate plan");
        return toolSuccess(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "set_workout_types",
    {
      title: "Set Workout Types",
      description: "Replace all workout types for a plan.",
      inputSchema: setWorkoutTypesSchema,
      annotations: { idempotentHint: false },
    },
    async (input) => {
      try {
        const params = setWorkoutTypesSchema.parse(input);
        const plan = await resolvePlanId(ctx, params.planId);
        const warnings = await collectWorkoutTypeWarnings(ctx, plan, params.types);

        const { error: deleteError } = await ctx.supabase.from("workout_types").delete().eq("plan_id", plan.id).eq("user_id", ctx.userId);

        if (deleteError) throw new AppError("INTERNAL_ERROR", deleteError.message);

        const { data, error } = await ctx.supabase
          .from("workout_types")
          .insert(
            params.types.map((type) => ({
              plan_id: plan.id,
              user_id: ctx.userId,
              key: type.key,
              label: type.label,
              hue: type.hue,
              icon: type.icon ?? null,
              sort_order: type.sortOrder,
            })),
          )
          .select("id, key, label, hue, icon, sort_order")
          .order("sort_order", { ascending: true });

        if (error) throw new AppError("INTERNAL_ERROR", error.message);
        return toolSuccess(data ?? [], warnings);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "update_workout_type",
    {
      title: "Update Workout Type",
      description: "Update one workout type by key.",
      inputSchema: updateWorkoutTypeSchema,
      annotations: { idempotentHint: true },
    },
    async (input) => {
      try {
        const params = updateWorkoutTypeSchema.parse(input);
        const plan = await resolvePlanId(ctx, params.planId);
        const patch = {
          label: params.label,
          hue: params.hue,
          icon: params.icon,
          sort_order: params.sortOrder,
        };
        const cleanedPatch = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));

        const { data, error } = await ctx.supabase
          .from("workout_types")
          .update(cleanedPatch)
          .eq("plan_id", plan.id)
          .eq("user_id", ctx.userId)
          .eq("key", params.key)
          .select("id, key, label, hue, icon, sort_order")
          .maybeSingle();

        if (error) throw new AppError("INTERNAL_ERROR", error.message);
        if (!data) throw new AppError("NOT_FOUND", "Workout type not found");
        return toolSuccess(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "add_phase",
    {
      title: "Add Phase",
      description: "Add a training phase to a plan.",
      inputSchema: phaseSchema,
      annotations: { idempotentHint: false },
    },
    async (input) => {
      try {
        const params = phaseSchema.parse(input);
        const plan = await resolvePlanId(ctx, params.planId);
        if (params.endDate < params.startDate) {
          throw new AppError("VALIDATION_ERROR", "endDate must be on or after startDate");
        }
        if (params.startDate < plan.start_date || (plan.end_date && params.endDate > plan.end_date)) {
          throw new AppError("VALIDATION_ERROR", "Phase dates must stay within the plan range");
        }

        const { data, error } = await ctx.supabase
          .from("phases")
          .insert({
            plan_id: plan.id,
            user_id: ctx.userId,
            name: params.name,
            description: params.description ?? null,
            start_date: params.startDate,
            end_date: params.endDate,
            sort_order: params.sortOrder,
            metadata: params.metadata ?? null,
          })
          .select("id, name, description, start_date, end_date, sort_order, metadata, created_at")
          .single();

        if (error || !data) throw new AppError("INTERNAL_ERROR", error?.message ?? "Failed to add phase");
        return toolSuccess(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "update_phase",
    {
      title: "Update Phase",
      description: "Update a phase.",
      inputSchema: updatePhaseSchema,
      annotations: { idempotentHint: true },
    },
    async (input) => {
      try {
        const params = updatePhaseSchema.parse(input);
        const { data: phase, error: phaseError } = await ctx.supabase
          .from("phases")
          .select("id, plan_id, user_id, start_date, end_date")
          .eq("id", params.phaseId)
          .eq("user_id", ctx.userId)
          .maybeSingle();

        if (phaseError) throw new AppError("INTERNAL_ERROR", phaseError.message);
        if (!phase) throw new AppError("NOT_FOUND", "Phase not found");

        const plan = await resolvePlanId(ctx, phase.plan_id);
        const nextStart = params.startDate ?? phase.start_date;
        const nextEnd = params.endDate ?? phase.end_date;
        if (nextEnd < nextStart) {
          throw new AppError("VALIDATION_ERROR", "endDate must be on or after startDate");
        }
        if (nextStart < plan.start_date || (plan.end_date && nextEnd > plan.end_date)) {
          throw new AppError("VALIDATION_ERROR", "Phase dates must stay within the plan range");
        }

        const patch = {
          name: params.name,
          description: params.description,
          start_date: params.startDate,
          end_date: params.endDate,
          sort_order: params.sortOrder,
          metadata: params.metadata,
        };
        const cleanedPatch = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));

        const { data, error } = await ctx.supabase
          .from("phases")
          .update(cleanedPatch)
          .eq("id", params.phaseId)
          .eq("user_id", ctx.userId)
          .select("id, name, description, start_date, end_date, sort_order, metadata, created_at")
          .single();

        if (error || !data) throw new AppError("INTERNAL_ERROR", error?.message ?? "Failed to update phase");
        return toolSuccess(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "remove_phase",
    {
      title: "Remove Phase",
      description: "Remove a phase and leave workouts unlinked.",
      inputSchema: z.object({ phaseId: z.string().uuid() }),
      annotations: { destructiveHint: true },
    },
    async (input) => {
      try {
        const params = z.object({ phaseId: z.string().uuid() }).parse(input);
        const { error } = await ctx.supabase.from("phases").delete().eq("id", params.phaseId).eq("user_id", ctx.userId);
        if (error) throw new AppError("INTERNAL_ERROR", error.message);
        return toolSuccess({ removed: true, phaseId: params.phaseId });
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
