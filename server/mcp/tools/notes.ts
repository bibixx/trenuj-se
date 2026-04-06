import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { planNoteMetadataSchema } from "../../../shared/plan-note-metadata";
import { AppError, resolvePlanId, toolError, toolSuccess, type McpContext } from "../context";

const noteTypeSchema = z.enum(["summary", "adjustment", "note", "recommendation"]);
const noteMetadataSchema = planNoteMetadataSchema;

export function registerNoteTools(server: McpServer, ctx: McpContext) {
  server.registerTool(
    "add_plan_note",
    {
      title: "Add Plan Note",
      description: "Add a markdown note to a plan. ⚠️ NOT idempotent — each call creates a new note even with identical content.",
      inputSchema: z.object({
        planId: z.string().uuid().optional().describe("Plan UUID. Defaults to the active plan if omitted."),
        type: noteTypeSchema.describe("Note type: 'summary' (weekly/phase recap), 'adjustment' (plan change rationale), 'note' (general), 'recommendation' (coaching suggestion)."),
        content: z.string().trim().min(1).describe("Note body in markdown."),
        metadata: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Arbitrary key-value data. `metadata.week` must be a positive integer plan week or a legacy ISO week string."),
      }),
      annotations: { idempotentHint: false },
    },
    async (input) => {
      try {
        const params = z
          .object({
            planId: z.string().uuid().optional(),
            type: noteTypeSchema,
            content: z.string().trim().min(1),
            metadata: noteMetadataSchema.optional(),
          })
          .parse(input);
        const plan = await resolvePlanId(ctx, params.planId);
        const { data, error } = await ctx.supabase
          .from("plan_notes")
          .insert({
            plan_id: plan.id,
            user_id: ctx.userId,
            type: params.type,
            content: params.content,
            metadata: params.metadata ?? null,
          })
          .select("id, plan_id, type, content, metadata, created_at, updated_at")
          .single();

        if (error || !data) throw new AppError("INTERNAL_ERROR", error?.message ?? "Failed to add plan note");
        return toolSuccess(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "update_plan_note",
    {
      title: "Update Plan Note",
      description: "Update a plan note's type, content, or metadata.",
      inputSchema: z.object({
        noteId: z.string().uuid().describe("Note UUID."),
        type: noteTypeSchema.optional().describe("Note type: 'summary', 'adjustment', 'note', or 'recommendation'."),
        content: z.string().trim().min(1).optional().describe("Note body in markdown."),
        metadata: z
          .record(z.string(), z.unknown())
          .nullable()
          .optional()
          .describe("Arbitrary key-value data. `metadata.week` must be a positive integer plan week or a legacy ISO week string. Set to null to clear."),
      }),
      annotations: { idempotentHint: true },
    },
    async (input) => {
      try {
        const params = z
          .object({
            noteId: z.string().uuid(),
            type: noteTypeSchema.optional(),
            content: z.string().trim().min(1).optional(),
            metadata: noteMetadataSchema.nullable().optional(),
          })
          .parse(input);

        const patch = Object.fromEntries(Object.entries({ type: params.type, content: params.content, metadata: params.metadata }).filter(([, value]) => value !== undefined));

        const { data, error } = await ctx.supabase
          .from("plan_notes")
          .update(patch)
          .eq("id", params.noteId)
          .eq("user_id", ctx.userId)
          .select("id, plan_id, type, content, metadata, created_at, updated_at")
          .maybeSingle();

        if (error) throw new AppError("INTERNAL_ERROR", error.message);
        if (!data) throw new AppError("NOT_FOUND", "Plan note not found");
        return toolSuccess(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "delete_plan_note",
    {
      title: "Delete Plan Note",
      description: "Permanently delete a plan note.",
      inputSchema: z.object({ noteId: z.string().uuid().describe("Note UUID.") }),
      annotations: { destructiveHint: true },
    },
    async (input) => {
      try {
        const params = z.object({ noteId: z.string().uuid() }).parse(input);
        const { error } = await ctx.supabase.from("plan_notes").delete().eq("id", params.noteId).eq("user_id", ctx.userId);
        if (error) throw new AppError("INTERNAL_ERROR", error.message);
        return toolSuccess({ deleted: true, noteId: params.noteId });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_plan_notes",
    {
      title: "Get Plan Notes",
      description: "Get notes for the active plan, or for a specific plan when planId is provided.",
      inputSchema: z.object({
        planId: z.string().uuid().optional().describe("Plan UUID. Defaults to the active plan if omitted."),
        type: noteTypeSchema.optional().describe("Filter by note type: 'summary', 'adjustment', 'note', or 'recommendation'."),
        limit: z.number().int().positive().max(100).default(20).optional().describe("Max results (default 20, max 100)."),
      }),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        const params = z
          .object({
            planId: z.string().uuid().optional(),
            type: noteTypeSchema.optional(),
            limit: z.number().int().positive().max(100).default(20).optional(),
          })
          .parse(input ?? {});
        const plan = await resolvePlanId(ctx, params.planId);
        let query = ctx.supabase
          .from("plan_notes")
          .select("id, plan_id, type, content, metadata, created_at, updated_at")
          .eq("plan_id", plan.id)
          .eq("user_id", ctx.userId)
          .order("created_at", { ascending: false })
          .limit(params.limit ?? 20);

        if (params.type) query = query.eq("type", params.type);

        const { data, error } = await query;
        if (error) throw new AppError("INTERNAL_ERROR", error.message);
        return toolSuccess(data ?? []);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
