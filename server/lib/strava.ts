import type { SupabaseClient } from "@supabase/supabase-js";
import { isSportType, type SportType } from "../../shared/activity";
import { AppError } from "../mcp/context";

const STRAVA_BASE_URL = "https://www.strava.com/api/v3";
const STRAVA_OAUTH_URL = "https://www.strava.com/oauth/token";

export type StravaBindings = {
  STRAVA_CLIENT_ID?: string;
  STRAVA_CLIENT_SECRET?: string;
  STRAVA_VERIFY_TOKEN?: string;
  STRAVA_WEBHOOK_SIGNING_SECRET?: string;
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

export function getStravaWebhookSigningSecret(bindings: StravaBindings): string | undefined {
  return getBinding(bindings, "STRAVA_WEBHOOK_SIGNING_SECRET");
}

export function getPublicAppUrl(bindings: StravaBindings) {
  return requireBinding(bindings, "PUBLIC_APP_URL");
}

const STRAVA_SIGNATURE_TOLERANCE_SEC = 300;

export type StravaSignatureCheck = { ok: true } | { ok: false; reason: string };

function parseStravaSignatureHeader(header: string): { t: string; v1: string } | null {
  let t: string | undefined;
  let v1: string | undefined;
  for (const part of header.split(",")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) return null;
    const key = part.slice(0, eqIdx).trim();
    const value = part.slice(eqIdx + 1).trim();
    if (key === "t") t = value;
    else if (key === "v1") v1 = value;
  }
  if (!t || !v1) return null;
  return { t, v1 };
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0) return null;
  if (!/^[0-9a-f]+$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export async function verifyStravaSignature(args: {
  secret: string;
  header: string | null | undefined;
  rawBody: string;
  nowMs?: number;
  toleranceSec?: number;
}): Promise<StravaSignatureCheck> {
  const tolerance = args.toleranceSec ?? STRAVA_SIGNATURE_TOLERANCE_SEC;
  const nowSec = Math.floor((args.nowMs ?? Date.now()) / 1000);

  if (!args.header) {
    return { ok: false, reason: "missing X-Strava-Signature header" };
  }

  const parsed = parseStravaSignatureHeader(args.header);
  if (!parsed) {
    return { ok: false, reason: "malformed X-Strava-Signature header" };
  }

  if (!/^\d+$/.test(parsed.t)) {
    return { ok: false, reason: "invalid timestamp" };
  }
  const t = Number(parsed.t);
  if (Math.abs(nowSec - t) > tolerance) {
    return { ok: false, reason: "timestamp outside tolerance window" };
  }

  const signatureBytes = hexToBytes(parsed.v1);
  if (!signatureBytes) {
    return { ok: false, reason: "v1 is not valid hex" };
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(args.secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const payload = encoder.encode(`${parsed.t}.${args.rawBody}`);
  const valid = await crypto.subtle.verify("HMAC", key, signatureBytes, payload);
  if (!valid) {
    return { ok: false, reason: "signature mismatch" };
  }
  return { ok: true };
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

function num(activity: Record<string, unknown>, key: string): number | null {
  return typeof activity[key] === "number" ? (activity[key] as number) : null;
}

function str(activity: Record<string, unknown>, key: string): string | null {
  return typeof activity[key] === "string" ? (activity[key] as string) : null;
}

function roundNum(activity: Record<string, unknown>, key: string): number | null {
  const v = num(activity, key);
  return v != null ? Math.round(v) : null;
}

function buildWorkoutActivityRow(userId: string, workoutId: string, activity: Record<string, unknown>) {
  const sport = collapseStravaSportType(str(activity, "sport_type") ?? str(activity, "type"));
  return {
    workout_id: workoutId,
    user_id: userId,
    strava_id: activity["id"],
    sport,
    name: str(activity, "name") ?? "Untitled activity",
    start_date: activity["start_date"],
    timezone: str(activity, "timezone"),
    duration_sec: num(activity, "elapsed_time") ?? num(activity, "moving_time") ?? 0,
    distance_m: roundNum(activity, "distance"),
    elevation_m: roundNum(activity, "total_elevation_gain"),
    avg_hr: roundNum(activity, "average_heartrate"),
    max_hr: roundNum(activity, "max_heartrate"),
    avg_power: roundNum(activity, "average_watts"),
    calories: roundNum(activity, "calories"),
    raw_data: activity,
  };
}

export async function matchAndStoreActivity(
  supabase: SupabaseClient,
  userId: string,
  activity: Record<string, unknown>,
): Promise<{ workoutId: string; workoutTitle: string } | null> {
  const sport = collapseStravaSportType(str(activity, "sport_type") ?? str(activity, "type"));
  const localDate = activityLocalDate({ start_date: str(activity, "start_date"), timezone: str(activity, "timezone") });
  if (!localDate) {
    return null;
  }

  const stravaId = activity["id"];
  if (typeof stravaId !== "number") {
    return null;
  }

  const { data: existing, error: existingError } = await supabase.from("workout_activities").select("workout_id").eq("user_id", userId).eq("strava_id", stravaId).maybeSingle();
  if (existingError) {
    throw new AppError("INTERNAL_ERROR", existingError.message);
  }
  if (existing) {
    return null;
  }

  const { data: activePlan, error: activePlanError } = await supabase.from("plans").select("id").eq("user_id", userId).eq("status", "active").maybeSingle();
  if (activePlanError) {
    throw new AppError("INTERNAL_ERROR", activePlanError.message);
  }
  if (!activePlan) {
    return null;
  }

  const { data: workouts, error: workoutsError } = await supabase
    .from("workouts")
    .select("id, title, label_id, sort_order")
    .eq("user_id", userId)
    .eq("plan_id", activePlan.id)
    .eq("date", localDate)
    .eq("status", "planned")
    .order("sort_order", { ascending: true })
    .limit(50);

  if (workoutsError) {
    throw new AppError("INTERNAL_ERROR", workoutsError.message);
  }

  const candidates = (workouts ?? []).filter((workout): workout is { id: string; title: string; label_id: string; sort_order: number } => Boolean(workout.label_id));
  if (candidates.length === 0) {
    return null;
  }

  const candidateIds = candidates.map((workout) => workout.id);
  const { data: alreadyMatched, error: alreadyMatchedError } = await supabase.from("workout_activities").select("workout_id").in("workout_id", candidateIds);
  if (alreadyMatchedError) {
    throw new AppError("INTERNAL_ERROR", alreadyMatchedError.message);
  }
  const matchedWorkoutIds = new Set((alreadyMatched ?? []).map((row) => row.workout_id));

  const labelIds = [...new Set(candidates.map((workout) => workout.label_id))];
  const { data: labelActivitySports, error: labelActivitySportsError } = await supabase
    .from("label_activity_sports")
    .select("label_id, activity_sport")
    .eq("user_id", userId)
    .in("label_id", labelIds)
    .eq("activity_sport", sport);

  if (labelActivitySportsError) {
    throw new AppError("INTERNAL_ERROR", labelActivitySportsError.message);
  }

  const matchingLabelIds = new Set((labelActivitySports ?? []).map((row) => row.label_id));
  const match = candidates.find((workout) => !matchedWorkoutIds.has(workout.id) && matchingLabelIds.has(workout.label_id));
  if (!match) {
    return null;
  }

  const row = buildWorkoutActivityRow(userId, match.id, activity);
  const { error: insertError } = await supabase.from("workout_activities").insert(row);
  if (insertError) {
    throw new AppError("INTERNAL_ERROR", insertError.message);
  }

  const { error: updateError } = await supabase.from("workouts").update({ status: "completed" }).eq("id", match.id).eq("user_id", userId);
  if (updateError) {
    throw new AppError("INTERNAL_ERROR", updateError.message);
  }

  return { workoutId: match.id, workoutTitle: match.title };
}

export async function refreshWorkoutActivityFromStrava(supabase: SupabaseClient, userId: string, workoutId: string, activity: Record<string, unknown>): Promise<void> {
  const row = buildWorkoutActivityRow(userId, workoutId, activity);
  const { error } = await supabase.from("workout_activities").update(row).eq("workout_id", workoutId).eq("user_id", userId);
  if (error) {
    throw new AppError("INTERNAL_ERROR", error.message);
  }
}

export async function linkActivityToWorkout(
  supabase: SupabaseClient,
  bindings: StravaBindings,
  userId: string,
  workoutId: string,
  stravaActivityId: number,
): Promise<{ workoutId: string }> {
  const { data: workout, error: workoutError } = await supabase.from("workouts").select("id").eq("id", workoutId).eq("user_id", userId).maybeSingle();
  if (workoutError) {
    throw new AppError("INTERNAL_ERROR", workoutError.message);
  }
  if (!workout) {
    throw new AppError("NOT_FOUND", "Workout not found");
  }

  const { data: existingForWorkout, error: existingForWorkoutError } = await supabase.from("workout_activities").select("workout_id").eq("workout_id", workoutId).maybeSingle();
  if (existingForWorkoutError) {
    throw new AppError("INTERNAL_ERROR", existingForWorkoutError.message);
  }
  if (existingForWorkout) {
    throw new AppError("CONFLICT", "Workout already has a linked activity");
  }

  const { data: existingForActivity, error: existingForActivityError } = await supabase
    .from("workout_activities")
    .select("workout_id")
    .eq("user_id", userId)
    .eq("strava_id", stravaActivityId)
    .maybeSingle();
  if (existingForActivityError) {
    throw new AppError("INTERNAL_ERROR", existingForActivityError.message);
  }
  if (existingForActivity) {
    throw new AppError("CONFLICT", "Activity is already linked to another workout");
  }

  const detailedActivity = await stravaFetch<Record<string, unknown>>(supabase, bindings, userId, `/activities/${stravaActivityId}`);
  const row = buildWorkoutActivityRow(userId, workoutId, detailedActivity);

  const { error: insertError } = await supabase.from("workout_activities").insert(row);
  if (insertError) {
    throw new AppError("INTERNAL_ERROR", insertError.message);
  }

  const { error: updateError } = await supabase.from("workouts").update({ status: "completed" }).eq("id", workoutId).eq("user_id", userId);
  if (updateError) {
    throw new AppError("INTERNAL_ERROR", updateError.message);
  }

  return { workoutId };
}

export async function unlinkActivityFromWorkout(supabase: SupabaseClient, userId: string, workoutId: string): Promise<{ workoutId: string }> {
  const { data: existing, error: existingError } = await supabase.from("workout_activities").select("workout_id").eq("workout_id", workoutId).eq("user_id", userId).maybeSingle();
  if (existingError) {
    throw new AppError("INTERNAL_ERROR", existingError.message);
  }
  if (!existing) {
    throw new AppError("NOT_FOUND", "Workout has no linked activity");
  }

  const { error: deleteError } = await supabase.from("workout_activities").delete().eq("workout_id", workoutId).eq("user_id", userId);
  if (deleteError) {
    throw new AppError("INTERNAL_ERROR", deleteError.message);
  }

  const { error: updateError } = await supabase.from("workouts").update({ status: "planned" }).eq("id", workoutId).eq("user_id", userId);
  if (updateError) {
    throw new AppError("INTERNAL_ERROR", updateError.message);
  }

  return { workoutId };
}
