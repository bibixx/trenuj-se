import { z } from "zod";

export interface UserFlags {
  is_premium?: boolean;
  /** Enables the run_sql / sync_activity_data MCP tools (SQL over the activity warehouse). */
  sql_queries?: boolean;
  // future: companion_app?: boolean;
}

export const userFlagsSchema = z.object({
  is_premium: z.boolean().optional(),
  sql_queries: z.boolean().optional(),
}) satisfies z.ZodType<UserFlags>;

/** Parse an untrusted JSONB value into typed flags; malformed input → {}. */
export function parseUserFlags(raw: unknown): UserFlags {
  const parsed = userFlagsSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}
