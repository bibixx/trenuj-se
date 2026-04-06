import { z } from "zod";

export const uiVariantSchema = z.enum(["standard", "rest", "note"]);
export type UiVariant = z.infer<typeof uiVariantSchema>;

export const knownMetadataSchemas = {
  intervals: z.array(
    z
      .object({
        distance_m: z.number().int().positive().optional(),
        duration_min: z.number().positive().optional(),
        pace_target: z.string().min(1).optional(),
        rest_sec: z.number().int().nonnegative(),
        count: z.number().int().positive(),
        description: z.string().min(1).optional(),
      })
      .superRefine((value, issueContext) => {
        if (!value.distance_m && !value.duration_min) {
          issueContext.addIssue({
            code: "custom",
            message: "Each interval needs distance_m or duration_min",
          });
        }
      }),
  ),
  zones: z.array(
    z.object({
      zone: z.union([z.number(), z.string().min(1)]),
      duration_min: z.number().positive(),
    }),
  ),
  sets: z.array(
    z.object({
      exercise: z.string().min(1),
      reps: z.number().int().positive(),
      sets: z.number().int().positive(),
      weight_kg: z.number().nonnegative().optional(),
      notes: z.string().min(1).optional(),
    }),
  ),
  segments: z.array(
    z.object({
      sport: z.string().min(1),
      duration_min: z.number().positive(),
      description: z.string().min(1).optional(),
    }),
  ),
};

export const workoutMetadataSchema = z
  .object({
    optional: z.boolean().optional(),
    ui: z
      .object({
        variant: uiVariantSchema.optional(),
      })
      .optional(),
    intervals: knownMetadataSchemas.intervals.optional(),
    zones: knownMetadataSchemas.zones.optional(),
    sets: knownMetadataSchemas.sets.optional(),
    segments: knownMetadataSchemas.segments.optional(),
  })
  .passthrough();

export type WorkoutMetadata = z.infer<typeof workoutMetadataSchema>;

/**
 * Validates workout metadata at the boundary. Returns null if input is null/undefined
 * or if parsing fails (best-effort — data comes from AI).
 */
export function safeParseWorkoutMetadata(metadata: unknown): WorkoutMetadata | null {
  if (metadata == null) return null;
  const result = workoutMetadataSchema.safeParse(metadata);
  return result.success ? result.data : null;
}
