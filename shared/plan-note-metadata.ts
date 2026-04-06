import { z } from "zod";

export const planNoteMetadataSchema = z
  .object({
    week: z.union([z.int().positive(), z.string()]).optional(),
  })
  .passthrough();

export type PlanNoteMetadata = z.infer<typeof planNoteMetadataSchema>;

/**
 * Validates plan note metadata at the boundary. Returns null if input is null/undefined
 * or if parsing fails.
 */
export function safeParsePlanNoteMetadata(metadata: unknown): PlanNoteMetadata | null {
  if (metadata == null) return null;
  const result = planNoteMetadataSchema.safeParse(metadata);
  return result.success ? result.data : null;
}
