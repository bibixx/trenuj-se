import { AppError } from "../mcp/context";
import type { SupabaseClient } from "@supabase/supabase-js";

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

export function collapseStravaSportType(sportType: string | null | undefined) {
  if (!sportType) return "unknown";

  const mapped = new Map<string, string>([
    ["Run", "run"],
    ["TrailRun", "run"],
    ["VirtualRun", "run"],
    ["Treadmill", "run"],
    ["Ride", "bike"],
    ["GravelRide", "bike"],
    ["MountainBikeRide", "bike"],
    ["EBikeRide", "bike"],
    ["VirtualRide", "bike"],
    ["EMountainBikeRide", "bike"],
    ["Swim", "swim"],
    ["OpenWaterSwim", "swim"],
    ["WeightTraining", "strength"],
    ["Yoga", "yoga"],
    ["Hike", "hike"],
    ["Walk", "walk"],
    ["Rowing", "rowing"],
    ["VirtualRowing", "rowing"],
  ]);

  if (mapped.has(sportType)) {
    return mapped.get(sportType)!;
  }

  return sportType
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
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

  const sport = collapseStravaSportType(str("sport_type"));
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

export async function autoMatchActivityToWorkout(supabase: SupabaseClient, userId: string, activity: { id: string; sport: string; date: string; timezone: string | null }) {
  const localDate = activityLocalDate({ start_date: activity.date, timezone: activity.timezone });
  if (!localDate) {
    return null;
  }

  const { data, error } = await supabase
    .from("workouts")
    .select("id, sort_order")
    .eq("user_id", userId)
    .eq("date", localDate)
    .eq("sport", activity.sport)
    .eq("status", "planned")
    .is("activity_id", null)
    .order("sort_order", { ascending: true })
    .limit(1);

  if (error) {
    throw new AppError("INTERNAL_ERROR", error.message);
  }

  const match = data?.[0];
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
