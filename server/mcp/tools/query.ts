import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AppError, toolError, type McpContext } from "../context";
import { hydrateActivities, syncAthleteZones, MAX_HYDRATE_ACTIVITIES_PER_CALL, type HydrateResult } from "../../lib/strava-sync";

const RUN_SQL_BYTE_BACKSTOP = 100_000;
// Strava activity ids are 10-11 digit integers; anything smaller in a query (LIMIT, zone
// bounds, epoch-ish arithmetic) stays below this.
const STRAVA_ID_MIN = 1_000_000_000;

type RunUserQueryPayload = {
  ok: boolean;
  error_code?: string;
  message?: string;
  sqlstate?: string;
  rows?: unknown[];
  row_count?: number;
  warnings?: string[];
  hydrated?: Array<Pick<HydrateResult, "stravaId" | "status" | "samples">>;
  [key: string]: unknown;
};

// Hydration is inferred from the SQL itself: any integer literal large enough to be a Strava
// activity id, plus ids listed in an in-band `-- hydrate: id1, id2` comment (the escape hatch
// for date/name-scoped stream queries, where the ids never appear in the SQL). Explicit
// comment ids report failures loudly; inferred literals that 404 on Strava are treated as
// false positives and dropped silently.
export function extractHydrationCandidates(sql: string): { ids: number[]; explicit: Set<number> } {
  const explicit = new Set<number>();
  const commentMatch = sql.match(/--\s*hydrate:\s*([0-9,\s]+)/i);
  if (commentMatch?.[1]) {
    for (const part of commentMatch[1].split(",")) {
      const id = Number(part.trim());
      if (Number.isSafeInteger(id) && id > 0) {
        explicit.add(id);
      }
    }
  }

  const ids = [...explicit];
  for (const match of sql.matchAll(/(?<![\w.])(\d{10,})(?![\w.])/g)) {
    const id = Number(match[1]);
    if (Number.isSafeInteger(id) && id >= STRAVA_ID_MIN && !explicit.has(id)) {
      ids.push(id);
    }
  }

  return { ids: [...new Set(ids)].slice(0, MAX_HYDRATE_ACTIVITIES_PER_CALL), explicit };
}

// run_sql payloads bypass toolSuccess on purpose: it pretty-prints AND duplicates the payload
// into structuredContent, doubling the wire size — irrelevant for small tool results, wasteful
// for query results near the 64 KB cap.
function compactResult(payload: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    ...(isError ? { isError: true } : {}),
  };
}

// Runs the Strava side-effects a query implies, before the query itself: hydrate referenced
// activities that lack detail/streams, and pull zone boundaries the first time athlete_zones
// is queried. Degrades to a warning instead of failing the query — SQL over already-synced
// data must keep working when Strava is down or disconnected.
async function hydrateForQuery(ctx: McpContext, sql: string): Promise<{ hydrated: RunUserQueryPayload["hydrated"]; warnings: string[] }> {
  const warnings: string[] = [];
  let hydrated: RunUserQueryPayload["hydrated"];

  try {
    const { ids, explicit } = extractHydrationCandidates(sql);

    if (ids.length > 0) {
      // Cheap prefilter: one batched read so fully-hydrated ids cost no further round-trips.
      const { data: existing, error } = await ctx.supabase
        .from("activities")
        .select("strava_id, detail_synced_at, streams_synced_at, streams_status")
        .eq("user_id", ctx.userId)
        .in("strava_id", ids);
      if (error) throw new AppError("INTERNAL_ERROR", error.message);

      const byId = new Map((existing ?? []).map((row) => [row.strava_id as number, row]));
      const needy = ids.filter((id) => {
        const row = byId.get(id);
        return !row || !row.detail_synced_at || (!row.streams_synced_at && row.streams_status !== "unavailable");
      });

      if (needy.length > 0) {
        const results = await hydrateActivities(ctx.supabase, ctx.bindings, ctx.userId, needy);
        hydrated = results
          .filter((r) => r.status !== "not_found" || explicit.has(r.stravaId))
          .map(({ stravaId, status, samples }) => ({ stravaId, status, ...(samples != null ? { samples } : {}) }));
        for (const result of results) {
          const loud = explicit.has(result.stravaId) || result.status === "rate_limited";
          if (loud && result.status !== "synced" && result.status !== "already" && result.message) {
            warnings.push(`Hydration of activity ${result.stravaId}: ${result.message}`);
          }
        }
      }
    }

    if (/athlete_zones/i.test(sql)) {
      const { data: zoneRows, error: zonesError } = await ctx.supabase.from("athlete_zones").select("id").eq("user_id", ctx.userId).limit(1);
      if (zonesError) throw new AppError("INTERNAL_ERROR", zonesError.message);
      if ((zoneRows ?? []).length === 0) {
        const zones = await syncAthleteZones(ctx.supabase, ctx.bindings, ctx.userId);
        if (zones.status === "rate_limited") {
          warnings.push(`athlete_zones is empty and Strava is rate limited until ${zones.rateLimitedUntil}; zone joins will return no rows.`);
        }
      }
    }
  } catch (error) {
    warnings.push(`Hydration skipped: ${error instanceof Error ? error.message : "unknown error"}. Query ran against already-synced data only.`);
  }

  return { hydrated, warnings };
}

export function registerQueryTools(server: McpServer, ctx: McpContext) {
  server.registerTool(
    "run_sql",
    {
      title: "Run SQL",
      description:
        "Run one read-only SELECT over YOUR workout data in Postgres. Tables (all pre-scoped to you — never filter by user_id): " +
        "activities (all Strava activities, hydrated on demand), activity_laps, activity_streams (one row per ~1s sample: time_s, dt_s, distance_m, velocity_mps, hr, watts, cadence, altitude_m, grade_pct), " +
        "activity_best_efforts, athlete_zones, strava_sync_state, plans, phases, workouts, labels, label_activity_sports, plan_notes, workout_activities. " +
        "Hydration is automatic: any Strava activity id appearing in the SQL gets its detail/laps/streams pulled from Strava first (max " +
        `${MAX_HYDRATE_ACTIVITIES_PER_CALL} per call), so reference activities by strava_id when you need per-second data — or add a ` +
        '"-- hydrate: id1, id2" comment when the query itself is date- or name-scoped. Zone boundaries sync automatically on first athlete_zones use. ' +
        "Full column reference, join keys, and worked examples: read the guide://sql-schema resource (or query information_schema.columns). " +
        "CTEs, window functions, FILTER, width_bucket, ntile, generate_series, lateral joins, regr_*/corr all work. " +
        "Aggregate server-side; results are capped at maxRows rows and 64 KB. One statement only, no semicolons.",
      inputSchema: z.object({
        sql: z.string().min(1).max(20_000).describe("A single SELECT (or WITH ... SELECT) statement. No semicolons."),
        maxRows: z.number().int().min(1).max(500).optional().describe("Row cap for this query (default 200, max 500). Prefer aggregating over raising this."),
      }),
      // Read-only from the agent's perspective: it can only SELECT. Referenced activities are
      // hydrated from Strava first, but that is an internal cache-fill the agent can't direct
      // and never mutates the user's plans/workouts.
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        const params = z.object({ sql: z.string().min(1).max(20_000), maxRows: z.number().int().min(1).max(500).optional() }).parse(input);

        const { hydrated, warnings: hydrationWarnings } = await hydrateForQuery(ctx, params.sql);

        const runQuery = async (): Promise<RunUserQueryPayload> => {
          const { data, error } = await ctx.supabase.rpc("run_user_query", {
            p_user_id: ctx.userId,
            p_sql: params.sql,
            p_max_rows: params.maxRows ?? 200,
          });
          if (error) throw new AppError("INTERNAL_ERROR", error.message);
          return data as RunUserQueryPayload;
        };

        let payload = await runQuery();

        // Sandbox roles are provisioned lazily on first use; retry once after provisioning.
        if (!payload.ok && payload.error_code === "SANDBOX_NOT_PROVISIONED") {
          const { error: provisionError } = await ctx.supabase.rpc("sandbox_ensure_user", { p_user_id: ctx.userId });
          if (provisionError) throw new AppError("INTERNAL_ERROR", provisionError.message);
          payload = await runQuery();
        }

        if (hydrated && hydrated.length > 0) {
          payload.hydrated = hydrated;
        }
        if (hydrationWarnings.length > 0) {
          payload.warnings = [...hydrationWarnings, ...(payload.warnings ?? [])];
        }

        if (!payload.ok) {
          return compactResult(payload, true);
        }

        const result = compactResult(payload);
        // Backstop only — the DB already caps results at 64 KB.
        if (result.content[0] && result.content[0].text.length > RUN_SQL_BYTE_BACKSTOP) {
          return compactResult(
            {
              ok: false,
              error_code: "RESULT_TOO_LARGE",
              message: `Result exceeds ${RUN_SQL_BYTE_BACKSTOP} bytes. Select fewer columns, round numerics, or aggregate further.`,
            },
            true,
          );
        }
        return result;
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
