import type { SupabaseClient } from "@supabase/supabase-js";
import type { Context } from "hono";
import { z, ZodError } from "zod";
import { STRAVA_SPORT_TYPES } from "../../shared/activity";
import { knownMetadataSchemas } from "../../shared/workout-metadata";
import { executionSchema } from "../../shared/workout-execution-schema";
import { createServerSupabase, type AppBindings } from "../lib/supabase";

export type McpContext = {
  supabase: SupabaseClient;
  userId: string;
  tokenId: string;
  bindings: AppBindings;
};

export class AppError extends Error {
  code: "AUTH_ERROR" | "VALIDATION_ERROR" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED" | "INTERNAL_ERROR";
  details?: unknown;

  constructor(code: AppError["code"], message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

export function errorPayload(error: unknown) {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  if (error instanceof ZodError) {
    return {
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: error.issues,
    };
  }

  if (error instanceof Error) {
    return {
      code: "INTERNAL_ERROR",
      message: error.message,
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "Unknown error",
  };
}

export function toolSuccess(result: unknown, warnings?: string[]) {
  const payload = warnings && warnings.length > 0 ? { result, warnings } : { result };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

export function toolError(error: unknown) {
  const payload = errorPayload(error);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError: true,
  };
}

export async function hashToken(token: string) {
  const encoded = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", encoded);

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function authenticateMcpRequest(c: Context<{ Bindings: AppBindings }>): Promise<McpContext> {
  const authorization = c.req.header("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new AppError("AUTH_ERROR", "Invalid or missing API token");
  }

  const rawToken = authorization.slice("Bearer ".length).trim();
  if (!rawToken.startsWith("tp_")) {
    throw new AppError("AUTH_ERROR", "Invalid or missing API token");
  }

  const tokenHash = await hashToken(rawToken);
  const supabase = createServerSupabase(c);

  const { data, error } = await supabase.from("api_tokens").select("id, user_id").eq("token_hash", tokenHash).maybeSingle();

  if (error || !data) {
    throw new AppError("AUTH_ERROR", "Invalid or missing API token");
  }

  await supabase.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);

  return {
    supabase,
    userId: data.user_id,
    tokenId: data.id,
    bindings: c.env,
  };
}

export async function resolvePlanId(ctx: McpContext, planId?: string) {
  if (planId) {
    const { data, error } = await ctx.supabase
      .from("plans")
      .select("id, user_id, status, start_date, end_date, name, goal, metadata, created_at, updated_at")
      .eq("id", planId)
      .eq("user_id", ctx.userId)
      .maybeSingle();

    if (error) {
      throw new AppError("INTERNAL_ERROR", error.message);
    }

    if (!data) {
      throw new AppError("NOT_FOUND", "Plan not found");
    }

    return data;
  }

  const { data, error } = await ctx.supabase
    .from("plans")
    .select("id, user_id, status, start_date, end_date, name, goal, metadata, created_at, updated_at")
    .eq("user_id", ctx.userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new AppError("INTERNAL_ERROR", error.message);
  }

  if (!data) {
    throw new AppError("NOT_FOUND", "No active plan found");
  }

  return data;
}

export const activitySportSchema = z.enum(STRAVA_SPORT_TYPES);
export const labelMetadataSchema = z.record(z.string(), z.unknown());

// Re-export shared schemas for existing server consumers
export { knownMetadataSchemas } from "../../shared/workout-metadata";
export { executionSchema } from "../../shared/workout-execution-schema";

export function validateLabelMetadata(metadata: unknown) {
  if (metadata == null) {
    return null;
  }

  return labelMetadataSchema.parse(metadata);
}

export function validateWorkoutExecution(execution: unknown) {
  if (execution == null) {
    return null;
  }

  return executionSchema.parse(execution);
}

export function validateWorkoutMetadata(metadata: unknown) {
  if (metadata == null) {
    return null;
  }

  const parsedBase = labelMetadataSchema.parse(metadata);

  for (const [key, schema] of Object.entries(knownMetadataSchemas)) {
    if (key in parsedBase) {
      schema.parse(parsedBase[key]);
    }
  }

  return parsedBase;
}

export function assertSingleTarget(workoutId?: string, activityId?: string) {
  const count = Number(Boolean(workoutId)) + Number(Boolean(activityId));
  if (count !== 1) {
    throw new AppError("VALIDATION_ERROR", "Exactly one of workoutId or activityId is required");
  }
}

export function collectMissingActivitySportWarnings(labels: Array<{ key: string; activitySports: string[] }>) {
  return labels
    .filter((label) => label.activitySports.length === 0)
    .map((label) => `Label '${label.key}' has no activitySports; automatic activity matching may require manual linking.`);
}
