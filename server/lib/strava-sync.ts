import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../mcp/context";
import { getValidStravaAccessToken, type StravaBindings } from "./strava";

// Lazy hydration of the activity warehouse (activities / activity_laps / activity_streams /
// activity_best_efforts / athlete_zones) for the run_sql MCP tool.
//
// The Worker never parses Strava payloads: responses are passed as raw text to the
// strava_ingest_* Postgres RPCs (migration 0013), which do all JSON parsing and inserts.
// Keeping JSON.parse/stringify of multi-hundred-KB stream payloads out of the Worker is what
// fits hydration inside the 10ms CPU budget; the per-call batch cap below is the budget.
//
// There is deliberately no date-range summary sync: the webhook ingests every new activity,
// migration 0013 backfilled everything ever matched to a workout, and referencing any other
// activity by strava_id hydrates it on demand (the detail fetch creates the row).

const STRAVA_BASE_URL = "https://www.strava.com/api/v3";
const STREAM_KEYS = "time,distance,altitude,velocity_smooth,heartrate,cadence,watts,temp,grade_smooth,moving";
export const MAX_HYDRATE_ACTIVITIES_PER_CALL = 3;
// Beyond ~6h of 1Hz samples the raw streams payload gets big enough that serializing it into
// the RPC body threatens the CPU budget; fall back to Strava's downsampled medium resolution.
const FULL_RESOLUTION_MAX_ELAPSED_SEC = 6 * 60 * 60;

export type StravaRawResponse = { status: number; ok: boolean; text: string; headers: Headers };

export async function stravaFetchRaw(supabase: SupabaseClient, bindings: StravaBindings, userId: string, path: string): Promise<StravaRawResponse> {
  const accessToken = await getValidStravaAccessToken(supabase, bindings, userId);
  const response = await fetch(`${STRAVA_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await response.text();
  return { status: response.status, ok: response.ok, text, headers: response.headers };
}

// On 429, Strava's 15-minute window resets at :00/:15/:30/:45; the daily limit resets at
// midnight UTC. Usage/limit headers are "<15min>,<daily>".
export function stravaRateLimitedUntil(headers: Headers, nowMs = Date.now()): string {
  const usage = headers.get("X-ReadRateLimit-Usage") ?? headers.get("X-RateLimit-Usage");
  const limit = headers.get("X-ReadRateLimit-Limit") ?? headers.get("X-RateLimit-Limit");
  const parsePair = (value: string | null) => (value ?? "").split(",").map((part) => Number(part.trim()));
  const dailyUsage = parsePair(usage)[1] ?? Number.NaN;
  const dailyLimit = parsePair(limit)[1] ?? Number.NaN;

  if (Number.isFinite(dailyUsage) && Number.isFinite(dailyLimit) && dailyLimit > 0 && dailyUsage >= dailyLimit) {
    const now = new Date(nowMs);
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
  }

  const windowMs = 15 * 60 * 1000;
  return new Date((Math.floor(nowMs / windowMs) + 1) * windowMs).toISOString();
}

type SyncStateRow = {
  rate_limited_until: string | null;
};

async function getSyncState(supabase: SupabaseClient, userId: string): Promise<SyncStateRow | null> {
  const { data, error } = await supabase.from("strava_sync_state").select("rate_limited_until").eq("user_id", userId).maybeSingle();
  if (error) {
    throw new AppError("INTERNAL_ERROR", error.message);
  }
  return data;
}

async function patchSyncState(supabase: SupabaseClient, userId: string, patch: Partial<SyncStateRow> & { last_error?: string | null }) {
  const { error } = await supabase.from("strava_sync_state").upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() });
  if (error) {
    throw new AppError("INTERNAL_ERROR", error.message);
  }
}

export function rateLimitActive(state: SyncStateRow | null, nowMs = Date.now()): string | null {
  if (state?.rate_limited_until && new Date(state.rate_limited_until).getTime() > nowMs) {
    return state.rate_limited_until;
  }
  return null;
}

export type HydrateItemStatus = "synced" | "already" | "unavailable" | "not_found" | "rate_limited" | "error";
export type HydrateResult = { stravaId: number; status: HydrateItemStatus; samples?: number; message?: string };

// Hydrate detail (laps + best efforts) and streams for specific activities. Sequential on
// purpose: a 429 stops the batch cleanly, and the ≤3-activity cap bounds Worker CPU per call.
// A detail 404 reports status "not_found" so callers can distinguish a false-positive inferred
// id (silently ignorable) from a genuine failure.
export async function hydrateActivities(supabase: SupabaseClient, bindings: StravaBindings, userId: string, stravaIds: number[]): Promise<HydrateResult[]> {
  const results: HydrateResult[] = [];
  const state = await getSyncState(supabase, userId);
  const activeLimit = rateLimitActive(state);
  const ids = stravaIds.slice(0, MAX_HYDRATE_ACTIVITIES_PER_CALL);

  if (activeLimit) {
    return ids.map((stravaId) => ({ stravaId, status: "rate_limited" as const, message: `Strava rate limit active until ${activeLimit}` }));
  }

  let rateLimitedUntil: string | null = null;

  for (const stravaId of ids) {
    if (rateLimitedUntil) {
      results.push({ stravaId, status: "rate_limited", message: `Strava rate limit active until ${rateLimitedUntil}` });
      continue;
    }

    try {
      const { data: existing, error: existingError } = await supabase
        .from("activities")
        .select("id, elapsed_sec, detail_synced_at, streams_synced_at, streams_status")
        .eq("user_id", userId)
        .eq("strava_id", stravaId)
        .maybeSingle();
      if (existingError) {
        throw new AppError("INTERNAL_ERROR", existingError.message);
      }

      const needsDetail = !existing?.detail_synced_at;
      const needsStreams = !existing?.streams_synced_at && existing?.streams_status !== "unavailable";
      if (!needsDetail && !needsStreams) {
        results.push({ stravaId, status: "already" });
        continue;
      }

      let elapsedSec = existing?.elapsed_sec ?? null;

      if (needsDetail) {
        const detail = await stravaFetchRaw(supabase, bindings, userId, `/activities/${stravaId}`);
        if (detail.status === 429) {
          rateLimitedUntil = stravaRateLimitedUntil(detail.headers);
          await patchSyncState(supabase, userId, { rate_limited_until: rateLimitedUntil });
          results.push({ stravaId, status: "rate_limited", message: `Strava rate limit active until ${rateLimitedUntil}` });
          continue;
        }
        if (detail.status === 404) {
          results.push({ stravaId, status: "not_found", message: "Activity not found on Strava" });
          continue;
        }
        if (!detail.ok) {
          results.push({ stravaId, status: "error", message: `Strava detail fetch failed with HTTP ${detail.status}` });
          continue;
        }
        const { error: rpcError } = await supabase.rpc("strava_ingest_activity_detail", { p_user_id: userId, p_payload: detail.text });
        if (rpcError) {
          throw new AppError("INTERNAL_ERROR", rpcError.message);
        }
        if (elapsedSec == null) {
          const { data: refreshed } = await supabase.from("activities").select("elapsed_sec").eq("user_id", userId).eq("strava_id", stravaId).maybeSingle();
          elapsedSec = refreshed?.elapsed_sec ?? null;
        }
      }

      if (needsStreams) {
        const resolution = elapsedSec != null && elapsedSec > FULL_RESOLUTION_MAX_ELAPSED_SEC ? "&resolution=medium" : "";
        const streams = await stravaFetchRaw(supabase, bindings, userId, `/activities/${stravaId}/streams?keys=${STREAM_KEYS}&key_type=time${resolution}`);
        if (streams.status === 429) {
          rateLimitedUntil = stravaRateLimitedUntil(streams.headers);
          await patchSyncState(supabase, userId, { rate_limited_until: rateLimitedUntil });
          results.push({ stravaId, status: "rate_limited", message: `Strava rate limit active until ${rateLimitedUntil}` });
          continue;
        }
        if (streams.status === 404) {
          const { error: markError } = await supabase.from("activities").update({ streams_status: "unavailable" }).eq("user_id", userId).eq("strava_id", stravaId);
          if (markError) {
            throw new AppError("INTERNAL_ERROR", markError.message);
          }
          results.push({ stravaId, status: "unavailable", message: "Strava has no streams for this activity (manual entry?)" });
          continue;
        }
        if (!streams.ok) {
          results.push({ stravaId, status: "error", message: `Strava streams fetch failed with HTTP ${streams.status}` });
          continue;
        }
        const { data: samples, error: streamsError } = await supabase.rpc("strava_ingest_activity_streams", {
          p_user_id: userId,
          p_strava_id: stravaId,
          p_payload: streams.text,
        });
        if (streamsError) {
          throw new AppError("INTERNAL_ERROR", streamsError.message);
        }
        const sampleCount = typeof samples === "number" ? samples : 0;
        results.push(
          sampleCount > 0 ? { stravaId, status: "synced", samples: sampleCount } : { stravaId, status: "unavailable", message: "Streams response contained no usable time series" },
        );
        continue;
      }

      results.push({ stravaId, status: "synced" });
    } catch (error) {
      results.push({ stravaId, status: "error", message: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  return results;
}

export async function syncAthleteZones(
  supabase: SupabaseClient,
  bindings: StravaBindings,
  userId: string,
): Promise<{ status: "synced" | "rate_limited"; inserted: number; rateLimitedUntil?: string }> {
  const state = await getSyncState(supabase, userId);
  const activeLimit = rateLimitActive(state);
  if (activeLimit) {
    return { status: "rate_limited", inserted: 0, rateLimitedUntil: activeLimit };
  }

  const response = await stravaFetchRaw(supabase, bindings, userId, "/athlete/zones");
  if (response.status === 429) {
    const until = stravaRateLimitedUntil(response.headers);
    await patchSyncState(supabase, userId, { rate_limited_until: until });
    return { status: "rate_limited", inserted: 0, rateLimitedUntil: until };
  }
  if (!response.ok) {
    throw new AppError("INTERNAL_ERROR", `Strava zones fetch failed with HTTP ${response.status}`);
  }

  const { data, error } = await supabase.rpc("strava_ingest_athlete_zones", { p_user_id: userId, p_payload: response.text });
  if (error) {
    throw new AppError("INTERNAL_ERROR", error.message);
  }
  return { status: "synced", inserted: typeof data === "number" ? data : 0 };
}
