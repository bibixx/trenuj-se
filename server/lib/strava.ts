import type { SupabaseClient } from "@supabase/supabase-js";
import { isSportType, type SportType } from "../../shared/activity";
import { AppError } from "../mcp/context";

const STRAVA_BASE_URL = "https://www.strava.com/api/v3";
const STRAVA_OAUTH_URL = "https://www.strava.com/oauth/token";

export type StravaBindings = {
  STRAVA_CLIENT_ID?: string;
  STRAVA_CLIENT_SECRET?: string;
  STRAVA_VERIFY_TOKEN?: string;
  PUBLIC_APP_URL?: string;
};

type StravaTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: {
    id: number;
  };
};

function getBinding(bindings: StravaBindings, key: keyof StravaBindings) {
  return bindings[key];
}

function requireBinding(bindings: StravaBindings, key: keyof StravaBindings) {
  const value = getBinding(bindings, key);
  if (!value) {
    throw new AppError("INTERNAL_ERROR", `Missing required binding: ${key}`);
  }
  return value;
}

export function getStravaOauthConfig(bindings: StravaBindings) {
  return {
    clientId: requireBinding(bindings, "STRAVA_CLIENT_ID"),
    clientSecret: requireBinding(bindings, "STRAVA_CLIENT_SECRET"),
    publicAppUrl: requireBinding(bindings, "PUBLIC_APP_URL"),
  };
}

export function getStravaVerifyToken(bindings: StravaBindings) {
  return requireBinding(bindings, "STRAVA_VERIFY_TOKEN");
}

export function getPublicAppUrl(bindings: StravaBindings) {
  return requireBinding(bindings, "PUBLIC_APP_URL");
}

export async function getValidStravaAccessToken(supabase: SupabaseClient, bindings: StravaBindings, userId: string) {
  const { data, error } = await supabase.from("strava_credentials").select("user_id, access_token, refresh_token, token_expires_at").eq("user_id", userId).maybeSingle();

  if (error) {
    throw new AppError("INTERNAL_ERROR", error.message);
  }

  if (!data) {
    throw new AppError("NOT_FOUND", "Strava is not connected for this user");
  }

  const expiresAt = new Date(data.token_expires_at).getTime();
  const needsRefresh = expiresAt - Date.now() <= 5 * 60 * 1000;
  if (!needsRefresh) {
    return data.access_token;
  }

  const config = getStravaOauthConfig(bindings);
  const response = await fetch(STRAVA_OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: data.refresh_token,
    }),
  });

  const payload = (await response.json().catch(() => null)) as Partial<StravaTokenResponse> | null;
  if (!response.ok || !payload?.access_token || !payload.refresh_token || !payload.expires_at) {
    throw new AppError("INTERNAL_ERROR", "Failed to refresh Strava token", payload);
  }

  const updated = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    token_expires_at: new Date(payload.expires_at * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error: updateError } = await supabase.from("strava_credentials").update(updated).eq("user_id", userId);
  if (updateError) {
    throw new AppError("INTERNAL_ERROR", updateError.message);
  }

  return payload.access_token;
}

const sportTypeAliases = new Map<string, SportType>([
  ["CrossFit", "Crossfit"],
  ["OpenWaterSwim", "Swim"],
  ["Treadmill", "Run"],
  ["VirtualRowing", "VirtualRow"],
]);

export function collapseStravaSportType(sportType: string | null | undefined): SportType {
  if (!sportType) {
    return "Workout";
  }

  if (isSportType(sportType)) {
    return sportType;
  }

  const alias = sportTypeAliases.get(sportType);
  if (alias) {
    return alias;
  }

  const canonical = sportType.replace(/[^A-Za-z]/g, "");
  if (isSportType(canonical)) {
    return canonical;
  }

  return "Workout";
}

export function parseStravaTimezoneToIana(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/\)\s*(.+)$/);
  return match?.[1] ?? value;
}

export function activityLocalDate(activity: { start_date?: string | null; timezone?: string | null }) {
  if (!activity.start_date) return null;
  const timezone = parseStravaTimezoneToIana(activity.timezone);
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone ?? "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(activity.start_date));
  } catch {
    return new Date(activity.start_date).toISOString().slice(0, 10);
  }
}

export async function stravaFetch<T>(supabase: SupabaseClient, bindings: StravaBindings, userId: string, path: string, init?: RequestInit): Promise<T> {
  const accessToken = await getValidStravaAccessToken(supabase, bindings, userId);
  const response = await fetch(`${STRAVA_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AppError("INTERNAL_ERROR", `Strava API request failed for ${path}`, payload);
  }
  return payload as T;
}

export async function upsertStravaActivity(supabase: SupabaseClient, userId: string, activity: Record<string, unknown>) {
  const num = (key: string) => (typeof activity[key] === "number" ? activity[key] : null);
  const str = (key: string) => (typeof activity[key] === "string" ? activity[key] : null);
  const roundNum = (key: string) => {
    const v = num(key);
    return v != null ? Math.round(v) : null;
  };

  const sport = collapseStravaSportType(str("sport_type") ?? str("type"));
  const row = {
    user_id: userId,
    strava_id: activity["id"],
    sport,
    name: str("name") ?? "Untitled activity",
    date: activity["start_date"],
    timezone: str("timezone") ?? null,
    duration_sec: num("elapsed_time") ?? num("moving_time") ?? 0,
    distance_m: roundNum("distance"),
    elevation_m: roundNum("total_elevation_gain"),
    avg_hr: roundNum("average_heartrate"),
    max_hr: roundNum("max_heartrate"),
    avg_power: roundNum("average_watts"),
    calories: roundNum("calories"),
    raw_data: activity,
  };

  const { data, error } = await supabase.from("activities").upsert(row, { onConflict: "strava_id" }).select("*").single();

  if (error || !data) {
    throw new AppError("INTERNAL_ERROR", error?.message ?? "Failed to upsert activity");
  }

  return data;
}

export async function autoMatchActivityToWorkout(supabase: SupabaseClient, userId: string, activity: { id: string; sport: SportType; date: string; timezone: string | null }) {
  const localDate = activityLocalDate({ start_date: activity.date, timezone: activity.timezone });
  if (!localDate) {
    return null;
  }

  const { data: workouts, error: workoutsError } = await supabase
    .from("workouts")
    .select("id, label_id, sort_order")
    .eq("user_id", userId)
    .eq("date", localDate)
    .eq("status", "planned")
    .is("activity_id", null)
    .order("sort_order", { ascending: true })
    .limit(50);

  if (workoutsError) {
    throw new AppError("INTERNAL_ERROR", workoutsError.message);
  }

  const workoutCandidates = (workouts ?? []).filter((workout) => workout.label_id != null);
  if (workoutCandidates.length === 0) {
    return null;
  }

  const labelIds = [...new Set(workoutCandidates.map((workout) => workout.label_id).filter((labelId): labelId is string => Boolean(labelId)))];
  const { data: labelActivitySports, error: labelActivitySportsError } = await supabase
    .from("label_activity_sports")
    .select("label_id, activity_sport")
    .eq("user_id", userId)
    .in("label_id", labelIds)
    .eq("activity_sport", activity.sport);

  if (labelActivitySportsError) {
    throw new AppError("INTERNAL_ERROR", labelActivitySportsError.message);
  }

  const matchingLabelIds = new Set((labelActivitySports ?? []).map((row) => row.label_id));
  const match = workoutCandidates.find((workout) => workout.label_id && matchingLabelIds.has(workout.label_id));
  if (!match) {
    return null;
  }

  const { data: updated, error: updateError } = await supabase
    .from("workouts")
    .update({
      activity_id: activity.id,
      status: "completed",
    })
    .eq("id", match.id)
    .eq("user_id", userId)
    .select("id, title, status, activity_id")
    .single();

  if (updateError) {
    throw new AppError("INTERNAL_ERROR", updateError.message);
  }

  return updated;
}
