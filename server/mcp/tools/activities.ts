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

export function registerActivityTools(server: McpServer, ctx: McpContext) {
  server.registerTool(
    "get_activities",
    {
      title: "Get Activities",
      description: "Query synced Strava activities with filters and linked workout titles.",
      inputSchema: z.object({
        dateFrom: z.string().datetime().optional().or(z.string().date().optional()),
        dateTo: z.string().datetime().optional().or(z.string().date().optional()),
        sport: z.string().trim().min(1).optional(),
        limit: z.number().int().positive().max(100).default(20).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        const params = z
          .object({
            dateFrom: z.string().optional(),
            dateTo: z.string().optional(),
            sport: z.string().trim().min(1).optional(),
            limit: z.number().int().positive().max(100).default(20).optional(),
          })
          .parse(input ?? {});

        let query = ctx.supabase
          .from("activities")
          .select("id, strava_id, sport, name, date, timezone, duration_sec, distance_m, elevation_m, avg_hr, max_hr, avg_power, calories, trainer_notes, created_at")
          .eq("user_id", ctx.userId)
          .order("date", { ascending: false })
          .limit(params.limit ?? 20);

        if (params.dateFrom) query = query.gte("date", params.dateFrom);
        if (params.dateTo) query = query.lte("date", params.dateTo);
        if (params.sport) query = query.eq("sport", params.sport);

        const { data, error } = await query;
        if (error) throw new AppError("INTERNAL_ERROR", error.message);

        const activityIds = (data ?? []).map((activity) => activity.id);
        let workoutsByActivity = new Map<string, { id: string; title: string }>();
        if (activityIds.length > 0) {
          const { data: workouts, error: workoutError } = await ctx.supabase
            .from("workouts")
            .select("id, title, activity_id")
            .eq("user_id", ctx.userId)
            .in("activity_id", activityIds);

          if (workoutError) throw new AppError("INTERNAL_ERROR", workoutError.message);
          workoutsByActivity = new Map(
            (workouts ?? []).filter((workout) => workout.activity_id != null).map((workout) => [workout.activity_id, { id: workout.id, title: workout.title }]),
          );
        }

        return toolSuccess(
          (data ?? []).map((activity) => ({
            ...activity,
            linkedWorkout: workoutsByActivity.get(activity.id) ?? null,
          })),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_activity_streams",
    {
      title: "Get Activity Streams",
      description: "Return a short-lived URL for fetching detailed Strava activity streams.",
      inputSchema: z.object({ activityId: z.string().uuid() }),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        const params = z.object({ activityId: z.string().uuid() }).parse(input);
        const { data: activity, error } = await ctx.supabase.from("activities").select("id, strava_id").eq("id", params.activityId).eq("user_id", ctx.userId).maybeSingle();

        if (error) throw new AppError("INTERNAL_ERROR", error.message);
        if (!activity) throw new AppError("NOT_FOUND", "Activity not found");

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
      description: "Aggregate planned versus actual workload for a week.",
      inputSchema: z.object({ weekDate: z.string().date().optional() }),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        const params = z.object({ weekDate: z.string().date().optional() }).parse(input ?? {});
        const anchor = params.weekDate ? new Date(`${params.weekDate}T00:00:00Z`) : new Date();
        const weekStart = startOfWeek(anchor);
        const weekEnd = addDays(weekStart, 6);
        const from = weekStart.toISOString().slice(0, 10);
        const to = weekEnd.toISOString().slice(0, 10);

        const [{ data: workouts, error: workoutError }, { data: activities, error: activityError }] = await Promise.all([
          ctx.supabase
            .from("workouts")
            .select("id, sport, status, target_duration_min, target_distance_m, activity_id")
            .eq("user_id", ctx.userId)
            .gte("date", from)
            .lte("date", to),
          ctx.supabase
            .from("activities")
            .select("id, sport, duration_sec, distance_m")
            .eq("user_id", ctx.userId)
            .gte("date", `${from}T00:00:00.000Z`)
            .lte("date", `${to}T23:59:59.999Z`),
        ]);

        if (workoutError) throw new AppError("INTERNAL_ERROR", workoutError.message);
        if (activityError) throw new AppError("INTERNAL_ERROR", activityError.message);

        const bySport = new Map<
          string,
          {
            plannedDurationMin: number;
            plannedDistanceM: number;
            actualDurationSec: number;
            actualDistanceM: number;
            plannedCount: number;
            completedCount: number;
            skippedCount: number;
          }
        >();
        const ensure = (sport: string) => {
          if (!bySport.has(sport)) {
            bySport.set(sport, { plannedDurationMin: 0, plannedDistanceM: 0, actualDurationSec: 0, actualDistanceM: 0, plannedCount: 0, completedCount: 0, skippedCount: 0 });
          }
          return bySport.get(sport)!;
        };

        for (const workout of workouts ?? []) {
          const bucket = ensure(workout.sport);
          bucket.plannedCount += 1;
          bucket.plannedDurationMin += workout.target_duration_min ?? 0;
          bucket.plannedDistanceM += workout.target_distance_m ?? 0;
          if (workout.status === "completed") bucket.completedCount += 1;
          if (workout.status === "skipped") bucket.skippedCount += 1;
        }
        for (const activity of activities ?? []) {
          const bucket = ensure(activity.sport);
          bucket.actualDurationSec += activity.duration_sec;
          bucket.actualDistanceM += activity.distance_m ?? 0;
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
          bySport: Array.from(bySport.entries()).map(([sport, value]) => ({ sport, ...value })),
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
      description: "Return overall progress metrics for a plan.",
      inputSchema: z.object({ planId: z.string().uuid().optional() }),
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
      description: "Compare planned workouts against actual activity-linked execution across a date range.",
      inputSchema: z.object({
        planId: z.string().uuid().optional(),
        dateFrom: z.string().date().optional(),
        dateTo: z.string().date().optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        const params = z
          .object({
            planId: z.string().uuid().optional(),
            dateFrom: z.string().date().optional(),
            dateTo: z.string().date().optional(),
          })
          .parse(input ?? {});
        const plan = await resolvePlanId(ctx, params.planId);
        let query = ctx.supabase
          .from("workouts")
          .select("id, date, sport, category, title, status, target_duration_min, target_distance_m, activity_id")
          .eq("plan_id", plan.id)
          .eq("user_id", ctx.userId)
          .order("date", { ascending: true })
          .order("sort_order", { ascending: true });

        if (params.dateFrom) query = query.gte("date", params.dateFrom);
        if (params.dateTo) query = query.lte("date", params.dateTo);

        const { data: workouts, error } = await query;
        if (error) throw new AppError("INTERNAL_ERROR", error.message);

        const activityIds = (workouts ?? []).map((workout) => workout.activity_id).filter(Boolean);
        const { data: activities, error: activityError } = activityIds.length
          ? await ctx.supabase.from("activities").select("id, sport, duration_sec, distance_m, name, date").in("id", activityIds)
          : { data: [], error: null };

        if (activityError) throw new AppError("INTERNAL_ERROR", activityError.message);
        const activityMap = new Map((activities ?? []).map((activity) => [activity.id, activity]));

        const perWorkout = (workouts ?? []).map((workout) => {
          const activity = workout.activity_id ? activityMap.get(workout.activity_id) : null;
          return {
            workoutId: workout.id,
            date: workout.date,
            title: workout.title,
            sport: workout.sport,
            status: workout.status,
            plannedDurationMin: workout.target_duration_min,
            plannedDistanceM: workout.target_distance_m,
            actualDurationSec: activity?.duration_sec ?? null,
            actualDistanceM: activity?.distance_m ?? null,
            activityName: activity?.name ?? null,
            sportMatch: activity ? activity.sport === workout.sport : null,
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
