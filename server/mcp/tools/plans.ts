import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AppError, activitySportSchema, collectMissingActivitySportWarnings, resolvePlanId, toolError, toolSuccess, type McpContext, validateLabelMetadata } from "../context";
import { validateLabelIcon } from "../icon-validation";

const planStatusSchema = z.enum(["active", "inactive"]);
const labelKeySchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Label key must use lowercase letters, numbers, and hyphens only (e.g. 'easy-run')");

const iconValueSchema = z
  .string()
  .trim()
  .min(1)
  .superRefine((value, ctx) => {
    const result = validateLabelIcon(value);
    if (!result.valid) ctx.addIssue({ code: "custom", message: result.message });
  });

const createPlanSchema = z
  .object({
    name: z.string().trim().min(1).describe("Plan name."),
    goal: z.string().trim().min(1).optional().describe("High-level training goal."),
    startDate: z.string().date().describe("Plan start date (YYYY-MM-DD)."),
    endDate: z.string().date().optional().describe("Plan end date (YYYY-MM-DD)."),
    status: planStatusSchema
      .default("active")
      .describe(
        "Status for the new plan. 'active' (default) deactivates the current active plan; 'inactive' creates it without touching the current active plan. Only one plan can be active at a time.",
      ),
    agentMemory: z
      .string()
      .max(50_000)
      .optional()
      .describe(
        "Optional seed for the plan's freeform markdown notepad scoped to THIS plan (pace/HR zones, plan-specific constraints, reminders for future changes to this plan). It is a plan notepad, NOT general agent memory: keep user-specific or cross-plan info in your own memory, not here. After creation, change it with edit_plan_memory (not update_plan).",
      ),
    metadata: z.record(z.string(), z.unknown()).optional().describe("Arbitrary key-value data."),
  })
  .strict();

const updatePlanSchema = z
  .object({
    planId: z.string().uuid().optional().describe("Plan UUID. Defaults to the active plan if omitted."),
    name: z.string().trim().min(1).optional().describe("Plan name."),
    goal: z.string().trim().min(1).nullable().optional().describe("High-level training goal. Set to null to clear."),
    startDate: z.string().date().optional().describe("Plan start date (YYYY-MM-DD)."),
    endDate: z.string().date().nullable().optional().describe("Plan end date (YYYY-MM-DD). Set to null to clear."),
    status: planStatusSchema.optional().describe("Plan status: 'active' or 'inactive'."),
    metadata: z.record(z.string(), z.unknown()).nullable().optional().describe("Arbitrary key-value data. Set to null to clear."),
  })
  .strict();

const editPlanMemorySchema = z
  .object({
    planId: z.string().uuid().optional().describe("Plan UUID. Defaults to the active plan if omitted."),
    op: z
      .enum(["replace", "append"])
      .describe(
        "'replace' swaps an exact oldText for newText — use it to edit a section, delete one (newText: ''), or rewrite the whole document (oldText = the entire current content). 'append' adds text to the end and is also how you set the initial memory on an empty plan.",
      ),
    oldText: z
      .string()
      .min(1)
      .optional()
      .describe(
        "op='replace' only (required). Exact substring of the current memory to replace, matched verbatim including whitespace. Read the current content with get_plan first — if it no longer matches, the edit is refused so you can't clobber unseen changes.",
      ),
    newText: z.string().max(50_000).optional().describe("op='replace' only (required). Replacement text; pass an empty string to delete the matched text."),
    replaceAll: z
      .boolean()
      .default(false)
      .describe("op='replace' only. When oldText occurs more than once, replace every occurrence. Default false requires oldText to match exactly once."),
    text: z
      .string()
      .min(1)
      .max(50_000)
      .optional()
      .describe("op='append' only (required). Markdown added at the end of the memory; a blank line is inserted before it when the memory is non-empty."),
  })
  .strict();

const listPlansSchema = z.object({
  status: planStatusSchema.optional().describe("Filter by plan status: 'active' or 'inactive'."),
});

const labelSchema = z.object({
  key: labelKeySchema.describe("Unique label identifier using lowercase letters, numbers, and hyphens only (e.g. 'easy-run')."),
  label: z.string().trim().min(1).describe("Human-readable display name."),
  hue: z.number().int().min(0).max(359).describe("HSL hue (0–359) for the label color."),
  icon: iconValueSchema
    .optional()
    .describe(
      "Icon identifier. Prefer a Tabler icon name (e.g. 'run') — use search_icons to discover names. Alternatively an emoji (e.g. '🏃') or a raw SVG string (starting with '<svg').",
    ),
  metadata: z.unknown().optional().describe("Arbitrary label metadata."),
  activitySports: z.array(activitySportSchema).default([]).describe("Strava sport types for auto-matching imported activities (e.g. ['Run', 'TrailRun'])."),
});

const createLabelSchema = labelSchema.extend({
  planId: z.string().uuid().optional().describe("Plan UUID. Defaults to the active plan if omitted."),
});

const setLabelsSchema = z.object({
  planId: z.string().uuid().optional().describe("Plan UUID. Defaults to the active plan if omitted."),
  labels: z
    .array(labelSchema)
    .describe("Full desired label set. Existing labels with matching keys are updated in place so their IDs are preserved; labels omitted here are deleted."),
});

const updateLabelSchema = z.object({
  planId: z.string().uuid().optional().describe("Plan UUID. Defaults to the active plan if omitted."),
  key: labelKeySchema.describe("Label key to update, using lowercase letters, numbers, and hyphens only (e.g. 'easy-run')."),
  label: z.string().trim().min(1).optional().describe("Human-readable display name."),
  hue: z.number().int().min(0).max(359).optional().describe("HSL hue (0–359) for the label color."),
  icon: iconValueSchema
    .nullable()
    .optional()
    .describe(
      "Icon identifier. Prefer a Tabler icon name (e.g. 'run') — use search_icons to discover names. Alternatively an emoji (e.g. '🏃') or a raw SVG string (starting with '<svg'). Set to null to clear.",
    ),
  metadata: z.unknown().nullable().optional().describe("Arbitrary label metadata. Set to null to clear."),
  activitySports: z.array(activitySportSchema).optional().describe("Strava sport types for auto-matching imported activities."),
});

const phaseSchema = z.object({
  planId: z.string().uuid().optional().describe("Plan UUID. Defaults to the active plan if omitted."),
  name: z.string().trim().min(1).describe("Phase name (e.g. 'Base', 'Build', 'Peak', 'Taper')."),
  description: z.string().trim().min(1).optional().describe("Phase description."),
  startDate: z.string().date().describe("Phase start date (YYYY-MM-DD). Must be within the plan date range."),
  endDate: z.string().date().describe("Phase end date (YYYY-MM-DD). Must be within the plan date range."),
  sortOrder: z.number().int().default(0).describe("Display order (lower values appear first)."),
  metadata: z.record(z.string(), z.unknown()).optional().describe("Arbitrary key-value data."),
});

const updatePhaseSchema = z.object({
  phaseId: z.string().uuid().describe("Phase UUID."),
  name: z.string().trim().min(1).optional().describe("Phase name (e.g. 'Base', 'Build', 'Peak', 'Taper')."),
  description: z.string().trim().min(1).nullable().optional().describe("Phase description. Set to null to clear."),
  startDate: z.string().date().optional().describe("Phase start date (YYYY-MM-DD)."),
  endDate: z.string().date().optional().describe("Phase end date (YYYY-MM-DD)."),
  sortOrder: z.number().int().optional().describe("Display order (lower values appear first)."),
  metadata: z.record(z.string(), z.unknown()).nullable().optional().describe("Arbitrary key-value data. Set to null to clear."),
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

async function getLabelsForPlan(ctx: McpContext, planId: string) {
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

  const allowedLabelIds = new Set((labels ?? []).map((label) => label.id));
  const sportsByLabelId = new Map<string, string[]>();
  for (const row of activitySports ?? []) {
    if (!allowedLabelIds.has(row.label_id)) {
      continue;
    }
    const current = sportsByLabelId.get(row.label_id) ?? [];
    current.push(row.activity_sport);
    sportsByLabelId.set(row.label_id, current);
  }

  return (labels ?? []).map((label) => ({
    ...label,
    activitySports: sportsByLabelId.get(label.id) ?? [],
  }));
}

function findDuplicateStrings(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    } else {
      seen.add(value);
    }
  }

  return [...duplicates];
}

async function findOptionalLabelByKey(ctx: McpContext, planId: string, key: string) {
  const { data, error } = await ctx.supabase
    .from("labels")
    .select("id, key, label, hue, icon, metadata, created_at, updated_at")
    .eq("plan_id", planId)
    .eq("user_id", ctx.userId)
    .eq("key", key)
    .maybeSingle();

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
  return data;
}

async function findLabelByKey(ctx: McpContext, planId: string, key: string) {
  const data = await findOptionalLabelByKey(ctx, planId, key);
  if (!data) throw new AppError("NOT_FOUND", "Label not found");
  return data;
}

async function replaceLabelActivitySports(ctx: McpContext, labelId: string, activitySports: string[]) {
  const { error: deleteError } = await ctx.supabase.from("label_activity_sports").delete().eq("label_id", labelId).eq("user_id", ctx.userId);
  if (deleteError) throw new AppError("INTERNAL_ERROR", deleteError.message);

  if (activitySports.length === 0) {
    return;
  }

  const { error: insertError } = await ctx.supabase
    .from("label_activity_sports")
    .insert(activitySports.map((activitySport) => ({ label_id: labelId, user_id: ctx.userId, activity_sport: activitySport })));
  if (insertError) throw new AppError("INTERNAL_ERROR", insertError.message);
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
          .select("id, name, goal, status, start_date, end_date, metadata, created_at, updated_at")
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
      description: "Get plan metadata, phases, labels, and summary stats for a specific or active plan.",
      inputSchema: z.object({ planId: z.string().uuid().optional().describe("Plan UUID. Defaults to the active plan if omitted.") }),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        const params = z.object({ planId: z.string().uuid().optional() }).parse(input ?? {});
        const plan = await resolvePlanId(ctx, params.planId);

        const [{ data: phases, error: phasesError }, labels] = await Promise.all([
          ctx.supabase
            .from("phases")
            .select("id, name, description, start_date, end_date, sort_order, metadata, created_at")
            .eq("plan_id", plan.id)
            .eq("user_id", ctx.userId)
            .order("sort_order", { ascending: true }),
          getLabelsForPlan(ctx, plan.id),
        ]);

        if (phasesError) throw new AppError("INTERNAL_ERROR", phasesError.message);

        const summary = await getPlanSummary(ctx, plan.id);
        const currentPhase = await getCurrentPhase(ctx, plan.id);

        return toolSuccess({
          ...plan,
          phases: phases ?? [],
          labels,
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
      description:
        "Create a new training plan. By default it becomes the active plan and the current active plan is deactivated (only one plan can be active at a time). Pass status: 'inactive' to create it without touching the current active plan. ⚠️ NOT idempotent — use list_plans first to check if the plan already exists before creating.",
      inputSchema: createPlanSchema,
      annotations: { idempotentHint: false },
    },
    async (input) => {
      try {
        const params = createPlanSchema.parse(input);
        if (params.endDate && params.endDate < params.startDate) {
          throw new AppError("VALIDATION_ERROR", "endDate must be on or after startDate");
        }

        if (params.status === "active") {
          const { error: deactivateError } = await ctx.supabase.from("plans").update({ status: "inactive" }).eq("user_id", ctx.userId).eq("status", "active");
          if (deactivateError) throw new AppError("INTERNAL_ERROR", deactivateError.message);
        }

        const { data, error } = await ctx.supabase
          .from("plans")
          .insert({
            user_id: ctx.userId,
            name: params.name,
            goal: params.goal ?? null,
            start_date: params.startDate,
            end_date: params.endDate ?? null,
            status: params.status,
            agent_memory: params.agentMemory ?? null,
            metadata: params.metadata ?? null,
          })
          .select("id, name, goal, status, agent_memory, start_date, end_date, metadata, created_at, updated_at")
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
          metadata: params.metadata,
        };

        const cleanedPatch = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
        const { data, error } = await ctx.supabase
          .from("plans")
          .update(cleanedPatch)
          .eq("id", plan.id)
          .eq("user_id", ctx.userId)
          .select("id, name, goal, status, start_date, end_date, metadata, created_at, updated_at")
          .single();

        if (error || !data) throw new AppError("INTERNAL_ERROR", error?.message ?? "Failed to update plan");
        return toolSuccess(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "edit_plan_memory",
    {
      title: "Edit Plan Memory",
      description:
        "Edit a plan's agent memory notepad (`agent_memory`) in place instead of overwriting the whole document. op='replace' swaps an exact oldText for newText (edit or delete a section, or rewrite the whole doc); op='append' adds text at the end (and seeds the initial memory on an empty plan). Staleness-safe: oldText must match the current content verbatim and the write is a compare-and-swap, so if the memory changed since you read it the edit is refused with CONFLICT — re-read with get_plan and retry. Defaults to the active plan when planId is omitted.",
      inputSchema: editPlanMemorySchema,
      annotations: { idempotentHint: false },
    },
    async (input) => {
      try {
        const params = editPlanMemorySchema.parse(input);
        const plan = await resolvePlanId(ctx, params.planId);
        const current = plan.agent_memory ?? "";

        let next: string;
        if (params.op === "append") {
          if (params.text === undefined) {
            throw new AppError("VALIDATION_ERROR", "append requires 'text'");
          }
          const base = current.trimEnd();
          next = base === "" ? params.text : `${base}\n\n${params.text}`;
        } else {
          if (params.oldText === undefined || params.newText === undefined) {
            throw new AppError("VALIDATION_ERROR", "replace requires 'oldText' and 'newText'");
          }
          const occurrences = current.split(params.oldText).length - 1;
          if (occurrences === 0) {
            throw new AppError("CONFLICT", "oldText not found in the current memory; call get_plan to re-read the latest content and retry.");
          }
          if (occurrences > 1 && !params.replaceAll) {
            throw new AppError("VALIDATION_ERROR", `oldText matches ${occurrences} times; add surrounding context to make it unique, or set replaceAll: true.`);
          }
          if (params.replaceAll) {
            next = current.split(params.oldText).join(params.newText);
          } else {
            const index = current.indexOf(params.oldText);
            next = current.slice(0, index) + params.newText + current.slice(index + params.oldText.length);
          }
        }

        // Compare-and-swap on the content itself: supabase-js has no transactions, so this is how we
        // guard against a concurrent write clobbering memory the agent never saw. 0 rows updated = stale.
        let query = ctx.supabase.from("plans").update({ agent_memory: next }).eq("id", plan.id).eq("user_id", ctx.userId);
        query = plan.agent_memory === null ? query.is("agent_memory", null) : query.eq("agent_memory", plan.agent_memory);
        const { data, error } = await query.select("id, agent_memory, updated_at").maybeSingle();

        if (error) throw new AppError("INTERNAL_ERROR", error.message);
        if (!data) {
          throw new AppError("CONFLICT", "The plan memory changed since you read it; call get_plan to re-read the latest content and retry.");
        }
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
      inputSchema: z.object({ planId: z.string().uuid().optional().describe("Plan UUID. Defaults to the active plan if omitted.") }),
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
    "set_labels",
    {
      title: "Set Labels",
      description:
        "Synchronize the full label set for the active plan, or for a specific plan when planId is provided. Existing labels with the same key keep their IDs; labels omitted from this full set are deleted and workouts using them become unlabeled.",
      inputSchema: setLabelsSchema,
      annotations: { idempotentHint: false, destructiveHint: true },
    },
    async (input) => {
      try {
        const params = setLabelsSchema.parse(input);
        const duplicateKeys = findDuplicateStrings(params.labels.map((label) => label.key));
        if (duplicateKeys.length > 0) {
          throw new AppError("VALIDATION_ERROR", `Duplicate label key(s): ${duplicateKeys.join(", ")}`);
        }

        const plan = await resolvePlanId(ctx, params.planId);
        const parsedLabels = params.labels.map((label) => ({ ...label, metadata: validateLabelMetadata(label.metadata) }));
        const warnings = collectMissingActivitySportWarnings(parsedLabels.map((label) => ({ key: label.key, activitySports: label.activitySports })));
        const currentLabels = await getLabelsForPlan(ctx, plan.id);
        const existingByKey = new Map(currentLabels.map((label) => [label.key, label]));
        const desiredKeys = new Set(parsedLabels.map((label) => label.key));
        const savedLabels = [];

        for (const label of parsedLabels) {
          const existingLabel = existingByKey.get(label.key);

          if (existingLabel) {
            const { data, error } = await ctx.supabase
              .from("labels")
              .update({ label: label.label, hue: label.hue, icon: label.icon ?? null, metadata: label.metadata })
              .eq("id", existingLabel.id)
              .eq("user_id", ctx.userId)
              .select("id, key, label, hue, icon, metadata, created_at, updated_at")
              .maybeSingle();

            if (error) throw new AppError("INTERNAL_ERROR", error.message);
            if (!data) throw new AppError("NOT_FOUND", `Label '${label.key}' not found`);

            await replaceLabelActivitySports(ctx, data.id, label.activitySports);
            savedLabels.push({ ...data, activitySports: label.activitySports });
          } else {
            const { data, error } = await ctx.supabase
              .from("labels")
              .insert({
                plan_id: plan.id,
                user_id: ctx.userId,
                key: label.key,
                label: label.label,
                hue: label.hue,
                icon: label.icon ?? null,
                metadata: label.metadata,
              })
              .select("id, key, label, hue, icon, metadata, created_at, updated_at")
              .single();

            if (error || !data) throw new AppError("INTERNAL_ERROR", error?.message ?? `Failed to create label '${label.key}'`);

            await replaceLabelActivitySports(ctx, data.id, label.activitySports);
            savedLabels.push({ ...data, activitySports: label.activitySports });
          }
        }

        const labelIdsToDelete = currentLabels.filter((label) => !desiredKeys.has(label.key)).map((label) => label.id);
        if (labelIdsToDelete.length > 0) {
          const { error: deleteError } = await ctx.supabase.from("labels").delete().in("id", labelIdsToDelete).eq("user_id", ctx.userId);
          if (deleteError) throw new AppError("INTERNAL_ERROR", deleteError.message);
        }

        return toolSuccess(
          savedLabels.sort((left, right) => left.label.localeCompare(right.label)),
          warnings,
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "add_label",
    {
      title: "Add Label",
      description: "Add one label to the active plan, or to a specific plan when planId is provided. Existing labels and workout label assignments are left unchanged.",
      inputSchema: createLabelSchema,
      annotations: { idempotentHint: false },
    },
    async (input) => {
      try {
        const params = createLabelSchema.parse(input);
        const plan = await resolvePlanId(ctx, params.planId);
        const existingLabel = await findOptionalLabelByKey(ctx, plan.id, params.key);
        if (existingLabel) {
          throw new AppError("CONFLICT", `Label '${params.key}' already exists`);
        }

        const metadata = validateLabelMetadata(params.metadata);
        const { data, error } = await ctx.supabase
          .from("labels")
          .insert({
            plan_id: plan.id,
            user_id: ctx.userId,
            key: params.key,
            label: params.label,
            hue: params.hue,
            icon: params.icon ?? null,
            metadata,
          })
          .select("id, key, label, hue, icon, metadata, created_at, updated_at")
          .single();

        if (error || !data) throw new AppError("INTERNAL_ERROR", error?.message ?? "Failed to add label");

        await replaceLabelActivitySports(ctx, data.id, params.activitySports);
        const warnings = collectMissingActivitySportWarnings([{ key: params.key, activitySports: params.activitySports }]);

        return toolSuccess({ ...data, activitySports: params.activitySports }, warnings);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "update_label",
    {
      title: "Update Label",
      description: "Update one label by key on the active plan, or on a specific plan when planId is provided.",
      inputSchema: updateLabelSchema,
      annotations: { idempotentHint: true },
    },
    async (input) => {
      try {
        const params = updateLabelSchema.parse(input);
        const plan = await resolvePlanId(ctx, params.planId);
        const existingLabel = await findLabelByKey(ctx, plan.id, params.key);
        const patch = {
          label: params.label,
          hue: params.hue,
          icon: params.icon,
          metadata: params.metadata === undefined ? undefined : validateLabelMetadata(params.metadata),
        };
        const cleanedPatch = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));

        const { data, error } = await ctx.supabase
          .from("labels")
          .update(cleanedPatch)
          .eq("id", existingLabel.id)
          .eq("user_id", ctx.userId)
          .select("id, key, label, hue, icon, metadata, created_at, updated_at")
          .maybeSingle();

        if (error) throw new AppError("INTERNAL_ERROR", error.message);
        if (!data) throw new AppError("NOT_FOUND", "Label not found");

        if (params.activitySports) {
          await replaceLabelActivitySports(ctx, data.id, params.activitySports);
        }

        const activitySports = params.activitySports ?? (await getLabelsForPlan(ctx, plan.id)).find((label) => label.id === data.id)?.activitySports ?? [];
        const warnings = activitySports.length === 0 ? [`Label '${data.key}' has no activitySports; automatic activity matching may require manual linking.`] : [];

        return toolSuccess({ ...data, activitySports }, warnings);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "add_phase",
    {
      title: "Add Phase",
      description: "Add a training phase to a plan. ⚠️ NOT idempotent — use get_plan to check existing phases before retrying.",
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
          .select("id, name, description, start_date, end_date, metadata, created_at")
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
      description: "Update a phase's name, dates, or sort order.",
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
          .select("id, name, description, start_date, end_date, metadata, created_at")
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
      inputSchema: z.object({ phaseId: z.string().uuid().describe("Phase UUID. Workouts in this phase will be unlinked, not deleted.") }),
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
