import { z } from "zod";

export interface UserFlags {
  is_premium?: boolean;
  /** Shows the MCP connector-token management UI in settings (Claude OAuth fallback URLs). */
  mcp_connector_tokens?: boolean;
  // future: companion_app?: boolean;
}

export const userFlagsSchema = z.object({
  is_premium: z.boolean().optional(),
  mcp_connector_tokens: z.boolean().optional(),
}) satisfies z.ZodType<UserFlags>;

/** Parse an untrusted JSONB value into typed flags; malformed input → {}. */
export function parseUserFlags(raw: unknown): UserFlags {
  const parsed = userFlagsSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}
