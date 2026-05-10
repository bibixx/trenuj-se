import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AppError, resolvePlanId, toolError, toolSuccess, type McpContext } from "../context";
import { generateStreamToken } from "../../lib/stream-tokens";

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() - day + 1);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

async function getPlanLabels(ctx: McpContext, planId: string) {
  const [{ data: labels, error: labelsError }, { data: activitySports, error: activitySportsError }] = await Promise.all([
    ctx.supabase.from("labels").select("id, key, label, hue, icon, metadata, created_at, updated_at").eq("plan_id", planId).eq("user_id", ctx.userId),
    ctx.supabase.from("label_activity_sports").select("label_id, activity_sport").eq("user_id", ctx.userId),
  ]);

  if (labelsError) throw new AppError("INTERNAL_ERROR", labelsError.message);
  if (activitySportsError) throw new AppError("INTERNAL_ERROR", activitySportsError.message);

  const labelIds = new Set((labels ?? []).map((label) => label.id));
  const sportsByLabelId = new Map<string, string[]>();
  for (const row of activitySports ?? []) {
    if (!labelIds.has(row.label_id)) continue;
    const current = sportsByLabelId.get(row.label_id) ?? [];
    current.push(row.activity_sport);
    sportsByLabelId.set(row.label_id, current);
  }

  return (labels ?? []).map((label) => ({
    id: label.id,
    key: label.key,
    label: label.label,
    hue: label.hue,
    icon: label.icon,
    metadata: label.metadata,
    activitySports: sportsByLabelId.get(label.id) ?? [],
  }));
}

const workoutActivitySelect = "workout_id, strava_id, sport, name, start_date, timezone, duration_sec, distance_m, elevation_m, avg_hr, max_hr, avg_power, calories";

type WorkoutActivityRow = {
  workout_id: string;
  strava_id: number;
  sport: string;
  name: string;
  start_date: string;
  timezone: string | null;
  duration_sec: number;
  distance_m: number | null;
  elevation_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_power: number | null;
  calories: number | null;
};

function pickActivity(value: WorkoutActivityRow | WorkoutActivityRow[] | null | undefined): WorkoutActivityRow | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function registerActivityTools(server: McpServer, ctx: McpContext) {
  server.registerTool(
    "get_workout_streams",
    {
      title: "Get Workout Streams",
      description: "Return a short-lived URL for fetching detailed Strava activity streams for a linked workout (use this to build GPX, analyze pacing, etc.).",
      inputSchema: z.object({ workoutId: z.string().uuid().describe("Workout UUID. The workout must have a linked Strava activity.") }),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        const params = z.object({ workoutId: z.string().uuid() }).parse(input);
        const { data: activity, error } = await ctx.supabase
          .from("workout_activities")
          .select("workout_id, strava_id")
          .eq("workout_id", params.workoutId)
          .eq("user_id", ctx.userId)
          .maybeSingle();

        if (error) throw new AppError("INTERNAL_ERROR", error.message);
        if (!activity) throw new AppError("NOT_FOUND", "Workout has no linked Strava activity");

        const token = await generateStreamToken(ctx.supabase, ctx.userId, activity.strava_id);
        const baseUrl = (ctx.bindings.PUBLIC_APP_URL ?? "http://localhost:8788").replace(/\/$/, "");
        return toolSuccess({
          url: `${baseUrl}/api/strava/streams/${activity.strava_id}?token=${token}`,
          expiresInSec: 900,
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_week_summary",
    {
      title: "Get Week Summary",
      description: "Aggregate planned workouts and actual activity workload for a Monday–Sunday week on the active plan, or on a specific plan when planId is provided.",
      inputSchema: z.object({
        weekDate: z.string().date().optional().describe("Any date within the target week (YYYY-MM-DD). Defaults to the current week."),
        planId: z.string().uuid().optional().describe("Plan UUID. Defaults to the active plan if omitted."),
      }),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        const params = z.object({ weekDate: z.string().date().optional(), planId: z.string().uuid().optional() }).parse(input ?? {});
        const anchor = params.weekDate ? new Date(`${params.weekDate}T00:00:00Z`) : new Date();
        const weekStart = startOfWeek(anchor);
        const weekEnd = addDays(weekStart, 6);
        const from = weekStart.toISOString().slice(0, 10);
        const to = weekEnd.toISOString().slice(0, 10);
        const plan = await resolvePlanId(ctx, params.planId);

        const labels = await getPlanLabels(ctx, plan.id);
        const labelsById = new Map(labels.map((label) => [label.id, label]));

        const { data: workouts, error: workoutError } = await ctx.supabase
          .from("workouts")
          .select(`id, label_id, status, target_duration_min, target_distance_m, workout_activities(${workoutActivitySelect})`)
          .eq("user_id", ctx.userId)
          .eq("plan_id", plan.id)
          .gte("date", from)
          .lte("date", to);

        if (workoutError) throw new AppError("INTERNAL_ERROR", workoutError.message);

        const byLabel = new Map<
          string,
          {
            key: string;
            label: string;
            plannedDurationMin: number;
            plannedDistanceM: number;
            plannedCount: number;
            completedCount: number;
            skippedCount: number;
          }
        >();
        const byActivitySport = new Map<string, { sport: string; actualDurationSec: number; actualDistanceM: number; activityCount: number }>();

        type WorkoutRow = {
          id: string;
          label_id: string | null;
          status: string;
          target_duration_min: number | null;
          target_distance_m: number | null;
          workout_activities: WorkoutActivityRow | WorkoutActivityRow[] | null;
        };

        for (const workout of (workouts ?? []) as WorkoutRow[]) {
          const label = workout.label_id ? labelsById.get(workout.label_id) : null;
          const key = label?.key ?? "unlabeled";
          const current = byLabel.get(key) ?? {
            key,
            label: label?.label ?? "Unlabeled",
            plannedDurationMin: 0,
            plannedDistanceM: 0,
            plannedCount: 0,
            completedCount: 0,
            skippedCount: 0,
          };
          current.plannedCount += 1;
          current.plannedDurationMin += workout.target_duration_min ?? 0;
          current.plannedDistanceM += workout.target_distance_m ?? 0;
          if (workout.status === "completed") current.completedCount += 1;
          if (workout.status === "skipped") current.skippedCount += 1;
          byLabel.set(key, current);

          const activity = pickActivity(workout.workout_activities);
          if (activity) {
            const sportCurrent = byActivitySport.get(activity.sport) ?? { sport: activity.sport, actualDurationSec: 0, actualDistanceM: 0, activityCount: 0 };
            sportCurrent.actualDurationSec += activity.duration_sec;
            sportCurrent.actualDistanceM += activity.distance_m ?? 0;
            sportCurrent.activityCount += 1;
            byActivitySport.set(activity.sport, sportCurrent);
          }
        }

        const totalPlanned = (workouts ?? []).length;
        const completed = (workouts ?? []).filter((workout) => workout.status === "completed").length;
        const skipped = (workouts ?? []).filter((workout) => workout.status === "skipped").length;

        return toolSuccess({
          weekStart: from,
          weekEnd: to,
          plannedCount: totalPlanned,
          completedCount: completed,
          skippedCount: skipped,
          completionRate: totalPlanned > 0 ? completed / totalPlanned : 0,
          byLabel: Array.from(byLabel.values()),
          byActivitySport: Array.from(byActivitySport.values()),
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_plan_progress",
    {
      title: "Get Plan Progress",
      description: "Return aggregate numeric progress metrics for the active plan, or for a specific plan when planId is provided.",
      inputSchema: z.object({ planId: z.string().uuid().optional().describe("Plan UUID. Defaults to the active plan if omitted.") }),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        const params = z.object({ planId: z.string().uuid().optional() }).parse(input ?? {});
        const plan = await resolvePlanId(ctx, params.planId);
        const [{ data: workouts, error: workoutError }, { data: currentPhase, error: phaseError }] = await Promise.all([
          ctx.supabase.from("workouts").select("id, status").eq("plan_id", plan.id).eq("user_id", ctx.userId),
          ctx.supabase
            .from("phases")
            .select("id, name, start_date, end_date, sort_order")
            .eq("plan_id", plan.id)
            .eq("user_id", ctx.userId)
            .lte("start_date", new Date().toISOString().slice(0, 10))
            .gte("end_date", new Date().toISOString().slice(0, 10))
            .order("sort_order", { ascending: true })
            .limit(1)
            .maybeSingle(),
        ]);

        if (workoutError) throw new AppError("INTERNAL_ERROR", workoutError.message);
        if (phaseError) throw new AppError("INTERNAL_ERROR", phaseError.message);

        const total = workouts.length;
        const completed = workouts.filter((workout) => workout.status === "completed").length;
        const skipped = workouts.filter((workout) => workout.status === "skipped").length;
        const remaining = workouts.filter((workout) => workout.status === "planned").length;

        const start = new Date(`${plan.start_date}T00:00:00Z`);
        const end = new Date(`${plan.end_date ?? plan.start_date}T00:00:00Z`);
        const now = new Date();
        const msPerWeek = 7 * 24 * 60 * 60 * 1000;
        const totalWeeks = Math.max(1, Math.ceil((end.getTime() - start.getTime() + msPerWeek) / msPerWeek));
        const weeksElapsed = Math.max(0, Math.min(totalWeeks, Math.ceil((now.getTime() - start.getTime()) / msPerWeek)));

        return toolSuccess({
          planId: plan.id,
          totalWorkouts: total,
          completedWorkouts: completed,
          skippedWorkouts: skipped,
          remainingWorkouts: remaining,
          completionRate: total > 0 ? completed / total : 0,
          currentPhase,
          weeksElapsed,
          totalWeeks,
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "compare_planned_vs_actual",
    {
      title: "Compare Planned Vs Actual",
      description: "Compare planned workouts on the active plan, or on a specific plan when planId is provided, against linked activity execution across a date range.",
      inputSchema: z.object({
        planId: z.string().uuid().optional().describe("Plan UUID. Defaults to the active plan if omitted."),
        dateFrom: z.string().date().optional().describe("Filter start date (YYYY-MM-DD, inclusive)."),
        dateTo: z.string().date().optional().describe("Filter end date (YYYY-MM-DD, inclusive)."),
      }),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        const params = z.object({ planId: z.string().uuid().optional(), dateFrom: z.string().date().optional(), dateTo: z.string().date().optional() }).parse(input ?? {});
        const plan = await resolvePlanId(ctx, params.planId);
        const labels = await getPlanLabels(ctx, plan.id);
        const labelsById = new Map(labels.map((label) => [label.id, label]));

        let query = ctx.supabase
          .from("workouts")
          .select(`id, date, label_id, title, status, target_duration_min, target_distance_m, workout_activities(${workoutActivitySelect})`)
          .eq("plan_id", plan.id)
          .eq("user_id", ctx.userId)
          .order("date", { ascending: true })
          .order("sort_order", { ascending: true });

        if (params.dateFrom) query = query.gte("date", params.dateFrom);
        if (params.dateTo) query = query.lte("date", params.dateTo);

        const { data: workouts, error } = await query;
        if (error) throw new AppError("INTERNAL_ERROR", error.message);

        type WorkoutRow = {
          id: string;
          date: string;
          label_id: string | null;
          title: string;
          status: string;
          target_duration_min: number | null;
          target_distance_m: number | null;
          workout_activities: WorkoutActivityRow | WorkoutActivityRow[] | null;
        };

        const perWorkout = ((workouts ?? []) as WorkoutRow[]).map((workout) => {
          const activity = pickActivity(workout.workout_activities);
          const label = workout.label_id ? labelsById.get(workout.label_id) : null;
          return {
            workoutId: workout.id,
            date: workout.date,
            title: workout.title,
            label,
            status: workout.status,
            plannedDurationMin: workout.target_duration_min,
            plannedDistanceM: workout.target_distance_m,
            actualDurationSec: activity?.duration_sec ?? null,
            actualDistanceM: activity?.distance_m ?? null,
            activityName: activity?.name ?? null,
            activitySport: activity?.sport ?? null,
            sportMatch: activity ? (label?.activitySports ?? []).includes(activity.sport) : null,
            missed: !activity && workout.status !== "skipped",
            extra: false,
          };
        });

        const aggregated = {
          plannedDurationMin: perWorkout.reduce((sum, row) => sum + (row.plannedDurationMin ?? 0), 0),
          actualDurationSec: perWorkout.reduce((sum, row) => sum + (row.actualDurationSec ?? 0), 0),
          plannedDistanceM: perWorkout.reduce((sum, row) => sum + (row.plannedDistanceM ?? 0), 0),
          actualDistanceM: perWorkout.reduce((sum, row) => sum + (row.actualDistanceM ?? 0), 0),
          missedWorkouts: perWorkout.filter((row) => row.missed).length,
          skippedWorkouts: perWorkout.filter((row) => row.status === "skipped").length,
        };

        return toolSuccess({ perWorkout, aggregated });
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
