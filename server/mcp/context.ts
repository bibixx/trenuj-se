import type { SupabaseClient } from "@supabase/supabase-js";
import type { Context } from "hono";
import { z, ZodError } from "zod";
import { STRAVA_SPORT_TYPES } from "../../shared/activity";
import { knownMetadataSchemas } from "../../shared/workout-metadata";
import { createServerSupabase, type AppBindings } from "../lib/supabase";

export type McpContext = {
  supabase: SupabaseClient;
  userId: string;
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

function formatIssuePath(path: PropertyKey[]) {
  return path
    .map((segment, index) => {
      if (typeof segment === "number") {
        return `[${segment}]`;
      }

      const key = String(segment);
      const prefix = index === 0 ? "" : ".";
      return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? `${prefix}${key}` : `${prefix}[${JSON.stringify(key)}]`;
    })
    .join("");
}

function summarizeZodError(error: ZodError) {
  const [firstIssue] = error.issues;
  if (!firstIssue) {
    return "Request validation failed";
  }

  const path = formatIssuePath(firstIssue.path);
  return path ? `Request validation failed: ${path} ${firstIssue.message}` : `Request validation failed: ${firstIssue.message}`;
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
      message: summarizeZodError(error),
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

export function createMcpContext(c: Context<{ Bindings: AppBindings }>, userId: string, supabase: SupabaseClient = createServerSupabase(c)): McpContext {
  return {
    supabase,
    userId,
    bindings: c.env,
  };
}

export async function authenticateMcpRequest(c: Context<{ Bindings: AppBindings }>): Promise<McpContext> {
  const authorization = c.req.header("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new AppError("AUTH_ERROR", "Invalid or missing access token");
  }

  const accessToken = authorization.slice("Bearer ".length).trim();
  const supabase = createServerSupabase(c);

  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) {
    throw new AppError("AUTH_ERROR", "Invalid or expired access token");
  }

  return createMcpContext(c, data.user.id, supabase);
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

export function validateLabelMetadata(metadata: unknown) {
  if (metadata == null) {
    return null;
  }

  return labelMetadataSchema.parse(metadata);
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
