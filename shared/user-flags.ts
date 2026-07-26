import { z } from "zod";

export interface UserFlags {
  is_premium?: boolean;
  companion_app?: boolean;
}

export const userFlagsSchema = z.object({
  is_premium: z.boolean().optional(),
  companion_app: z.boolean().optional(),
}) satisfies z.ZodType<UserFlags>;

/** Parse an untrusted JSONB value into typed flags; malformed input → {}. */
export function parseUserFlags(raw: unknown): UserFlags {
  const parsed = userFlagsSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}
