import { queryOptions } from "@tanstack/react-query";
import type { SportType } from "../../../shared/activity.ts";
import { supabase } from "../supabase.ts";
import type { Activity } from "../types.ts";

export const activityKeys = {
  all: ["activities"] as const,
};

async function fetchActivities(): Promise<Activity[]> {
  const { data, error } = await supabase
    .from("activities")
    .select("id, strava_id, sport, name, date, timezone, duration_sec, distance_m, elevation_m, avg_hr, max_hr, avg_power, calories, trainer_notes, created_at")
    .order("date", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    stravaId: row.strava_id as number,
    sport: row.sport as SportType,
    name: row.name as string,
    date: row.date as string,
    timezone: (row.timezone as string) ?? null,
    durationSec: row.duration_sec as number,
    distanceM: (row.distance_m as number) ?? null,
    elevationM: (row.elevation_m as number) ?? null,
    avgHr: (row.avg_hr as number) ?? null,
    maxHr: (row.max_hr as number) ?? null,
    avgPower: (row.avg_power as number) ?? null,
    calories: (row.calories as number) ?? null,
    trainerNotes: (row.trainer_notes as string) ?? null,
    createdAt: row.created_at as string,
  }));
}

export const activitiesQueryOptions = queryOptions({
  queryKey: activityKeys.all,
  queryFn: fetchActivities,
});
