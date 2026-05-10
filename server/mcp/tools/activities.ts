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

export function registerActivityTools(server: McpServer, ctx: McpContext) {
  server.registerTool(
    "get_activities",
    {
      title: "Get Activities",
      description: "Query synced Strava activities with filters and linked workout titles.",
      inputSchema: z.object({
        dateFrom: z.string().datetime().optional().or(z.string().date().optional()).describe("Filter start boundary (ISO datetime or YYYY-MM-DD)."),
        dateTo: z.string().datetime().optional().or(z.string().date().optional()).describe("Filter end boundary (ISO datetime or YYYY-MM-DD)."),
        sport: z.string().trim().min(1).optional().describe("Filter by Strava sport type (e.g. 'Run', 'Ride', 'Swim')."),
        limit: z.number().int().positive().max(100).default(20).optional().describe("Max results (default 20, max 100)."),
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
      inputSchema: z.object({ activityId: z.string().uuid().describe("Activity UUID.") }),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        const params = z.object({ activityId: z.string().uuid() }).parse(input);
        const { data: activity, error } = await ctx.supabase.from("activities").select("id, strava_id").eq("id", params.activityId).eq("user_id", ctx.userId).maybeSingle();

        if (error) throw new AppError("INTERNAL_ERROR", error.message);
        if (!activity) throw new AppError("NOT_FOUND", "Activity not found");

        const token = await generateStreamToken(ctx.supabase, ctx.userId, activity.strava_id);
        const baseUrl = (ctx.bindings.PUBLIC_APP_URL ?? "http://localhost:8787").replace(/\/$/, "");
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

        const [{ data: workouts, error: workoutError }, { data: activities, error: activityError }] = await Promise.all([
          ctx.supabase
            .from("workouts")
            .select("id, label_id, status, target_duration_min, target_distance_m, activity_id")
            .eq("user_id", ctx.userId)
            .eq("plan_id", plan.id)
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

        for (const workout of workouts ?? []) {
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
        }

        for (const activity of activities ?? []) {
          const current = byActivitySport.get(activity.sport) ?? { sport: activity.sport, actualDurationSec: 0, actualDistanceM: 0, activityCount: 0 };
          current.actualDurationSec += activity.duration_sec;
          current.actualDistanceM += activity.distance_m ?? 0;
          current.activityCount += 1;
          byActivitySport.set(activity.sport, current);
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
          .select("id, date, label_id, title, status, target_duration_min, target_distance_m, activity_id")
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
