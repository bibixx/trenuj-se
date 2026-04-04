import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AppError, toolError, toolSuccess, type McpContext } from "../context";

export function registerAthleteTools(server: McpServer, ctx: McpContext) {
  server.registerTool(
    "get_profile",
    {
      title: "Get Profile",
      description: "Get the athlete profile, Strava connection state, and active plan summary.",
      inputSchema: z.object({}).optional(),
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const [{ data: profile, error: profileError }, { data: activePlan, error: planError }] = await Promise.all([
          ctx.supabase.from("profiles").select("id, strava_athlete_id, created_at, updated_at").eq("id", ctx.userId).maybeSingle(),
          ctx.supabase.from("plans").select("id, name, status, start_date, end_date").eq("user_id", ctx.userId).eq("status", "active").maybeSingle(),
        ]);

        if (profileError) throw new AppError("INTERNAL_ERROR", profileError.message);
        if (planError) throw new AppError("INTERNAL_ERROR", planError.message);
        if (!profile) throw new AppError("NOT_FOUND", "Profile not found");

        let activePlanSummary: Record<string, unknown> | null = null;
        if (activePlan) {
          const { data: workouts, error: workoutsError } = await ctx.supabase.from("workouts").select("status").eq("plan_id", activePlan.id).eq("user_id", ctx.userId);

          if (workoutsError) throw new AppError("INTERNAL_ERROR", workoutsError.message);

          const total = workouts.length;
          const completed = workouts.filter((workout) => workout.status === "completed").length;
          activePlanSummary = {
            ...activePlan,
            progress: {
              totalWorkouts: total,
              completedWorkouts: completed,
              completionRate: total > 0 ? completed / total : 0,
            },
          };
        }

        return toolSuccess({
          profile,
          stravaConnected: Boolean(profile.strava_athlete_id),
          activePlan: activePlanSummary,
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
