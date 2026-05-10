import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SportType } from "../../../shared/activity.ts";
import { safeParseWorkoutExecution } from "../../../shared/workout-execution-schema.ts";
import { safeParseWorkoutMetadata } from "../../../shared/workout-metadata.ts";
import { apiFetch } from "../api.ts";
import { supabase } from "../supabase.ts";
import type { Workout, WorkoutActivity } from "../types.ts";

export const workoutKeys = {
  byPlan: (planId: string) => ["workouts", planId] as const,
};

function rowToActivity(row: Record<string, unknown> | null): WorkoutActivity | null {
  if (!row) return null;
  return {
    stravaId: row.strava_id as number,
    sport: row.sport as SportType,
    name: row.name as string,
    startDate: row.start_date as string,
    timezone: (row.timezone as string) ?? null,
    durationSec: row.duration_sec as number,
    distanceM: (row.distance_m as number) ?? null,
    elevationM: (row.elevation_m as number) ?? null,
    avgHr: (row.avg_hr as number) ?? null,
    maxHr: (row.max_hr as number) ?? null,
    avgPower: (row.avg_power as number) ?? null,
    calories: (row.calories as number) ?? null,
  };
}

function rowToWorkout(row: Record<string, unknown>): Workout {
  const rawActivity = row.workout_activities;
  const activityRow = Array.isArray(rawActivity) ? (rawActivity[0] ?? null) : (rawActivity as Record<string, unknown> | null);
  return {
    id: row.id as string,
    planId: row.plan_id as string,
    phaseId: (row.phase_id as string) ?? null,
    labelId: (row.label_id as string) ?? null,
    date: row.date as string,
    title: row.title as string,
    description: (row.description as string) ?? null,
    targetDurationMin: (row.target_duration_min as number) ?? null,
    targetDistanceM: (row.target_distance_m as number) ?? null,
    sortOrder: row.sort_order as number,
    status: row.status as Workout["status"],
    completionNotes: (row.completion_notes as string) ?? null,
    trainerNotes: (row.trainer_notes as string) ?? null,
    activity: rowToActivity(activityRow),
    execution: safeParseWorkoutExecution(row.execution),
    metadata: safeParseWorkoutMetadata(row.metadata),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

const WORKOUT_SELECT =
  "id, plan_id, phase_id, label_id, date, title, description, target_duration_min, target_distance_m, sort_order, status, completion_notes, trainer_notes, execution, metadata, created_at, updated_at, workout_activities(strava_id, sport, name, start_date, timezone, duration_sec, distance_m, elevation_m, avg_hr, max_hr, avg_power, calories)";

async function fetchWorkouts(planId: string): Promise<Workout[]> {
  const { data, error } = await supabase.from("workouts").select(WORKOUT_SELECT).eq("plan_id", planId).order("date", { ascending: true }).order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(rowToWorkout);
}

export function workoutsQueryOptions(planId: string) {
  return queryOptions({
    queryKey: workoutKeys.byPlan(planId),
    queryFn: () => fetchWorkouts(planId),
  });
}

export function useToggleCompletion(planId: string) {
  const queryClient = useQueryClient();
  const key = workoutKeys.byPlan(planId);

  return useMutation({
    mutationFn: async ({ workoutId, completed }: { workoutId: string; completed: boolean }) => {
      const status = completed ? "completed" : "planned";
      const { error } = await supabase.from("workouts").update({ status }).eq("id", workoutId);
      if (error) throw error;
    },
    onMutate: async ({ workoutId, completed }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Workout[]>(key);

      queryClient.setQueryData<Workout[]>(key, (old) => old?.map((w) => (w.id === workoutId ? { ...w, status: completed ? "completed" : "planned" } : w)));

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(key, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export interface RecentStravaActivity {
  stravaId: number;
  name: string;
  sport: SportType;
  startDate: string | null;
  timezone: string | null;
  durationSec: number | null;
  distanceM: number | null;
}

export const recentStravaActivitiesQueryOptions = queryOptions({
  queryKey: ["recent-strava-activities"] as const,
  queryFn: async (): Promise<RecentStravaActivity[]> => {
    const res = await apiFetch("/api/strava/recent-activities?limit=10");
    const body = (await res.json()) as { activities: RecentStravaActivity[] };
    return body.activities;
  },
  staleTime: 30_000,
});

export function useLinkStravaActivity(planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ workoutId, stravaActivityId }: { workoutId: string; stravaActivityId: number }) => {
      await apiFetch("/api/strava/link", {
        method: "POST",
        body: JSON.stringify({ workoutId, stravaActivityId }),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: workoutKeys.byPlan(planId) });
      queryClient.invalidateQueries({ queryKey: ["recent-strava-activities"] });
    },
  });
}

export function useUnlinkActivity(planId: string) {
  const queryClient = useQueryClient();
  const key = workoutKeys.byPlan(planId);

  return useMutation({
    mutationFn: async ({ workoutId }: { workoutId: string }) => {
      const { error: deleteError } = await supabase.from("workout_activities").delete().eq("workout_id", workoutId);
      if (deleteError) throw deleteError;
      const { error: updateError } = await supabase.from("workouts").update({ status: "planned" }).eq("id", workoutId);
      if (updateError) throw updateError;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ["recent-strava-activities"] });
    },
  });
}
