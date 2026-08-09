import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AppError, toolError, toolSuccess, type McpContext } from "../context";
import { hydrateActivities, MAX_HYDRATE_ACTIVITIES_PER_CALL, MAX_HYDRATE_ACTIVITIES_PER_TOOL_CALL, type HydrateResult } from "../../lib/strava-sync";
import { sqlSchemaGuideMarkdown } from "../resources/sql-schema";

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
  hydrated?: Array<Pick<HydrateResult, "stravaId" | "status" | "samples" | "channels">>;
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

// Workout-UUID literals are the natural key for "this workout's activity" queries, and they
// carry no integer literal for the id inference above. Extraction is deliberately regex over
// the raw SQL: a quoted UUID is a fixed-shape token invariant to formatting/casts, and a false
// positive (a plan/label/phase UUID) costs one no-op lookup in workout_activities.
export function extractWorkoutUuids(sql: string): string[] {
  const uuids = new Set<string>();
  for (const match of sql.matchAll(/'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'/gi)) {
    uuids.add(match[1]!.toLowerCase());
  }
  return [...uuids].slice(0, 5);
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
// activities that lack detail/streams. Degrades to a warning instead of failing the query —
// SQL over already-synced data must keep working when Strava is down or disconnected.
// `scopedAndComplete` = the query named specific activities and none of them is still pending,
// so the DB's global "N activities have no hydrated streams" hints are noise for this call.
async function hydrateForQuery(
  ctx: McpContext,
  sql: string,
): Promise<{ hydrated: RunUserQueryPayload["hydrated"]; warnings: string[]; scopedAndComplete: boolean; candidateIds: number[] }> {
  const warnings: string[] = [];
  let hydrated: RunUserQueryPayload["hydrated"];
  let scopedAndComplete = false;
  let candidateIds: number[] = [];

  try {
    const { ids: literalIds, explicit } = extractHydrationCandidates(sql);
    const ids = [...literalIds];

    // Workout-UUID-scoped queries (the natural "this workout's activity" shape) carry no id
    // literal — resolve their strava_ids through workout_activities. Skipped when the SQL
    // never touches activity data, and non-workout UUIDs simply match no rows.
    if (ids.length < MAX_HYDRATE_ACTIVITIES_PER_CALL && /activit/i.test(sql)) {
      const uuids = extractWorkoutUuids(sql);
      if (uuids.length > 0) {
        const { data: matches, error: uuidError } = await ctx.supabase.from("workout_activities").select("strava_id").eq("user_id", ctx.userId).in("workout_id", uuids);
        if (uuidError) throw new AppError("INTERNAL_ERROR", uuidError.message);
        for (const row of matches ?? []) {
          const id = row.strava_id as number;
          if (Number.isSafeInteger(id) && !ids.includes(id) && ids.length < MAX_HYDRATE_ACTIVITIES_PER_CALL) {
            ids.push(id);
          }
        }
      }
    }
    candidateIds = ids;

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

      if (needy.length === 0) {
        scopedAndComplete = true;
      } else {
        const results = await hydrateActivities(ctx.supabase, ctx.bindings, ctx.userId, needy);
        hydrated = results
          .filter((r) => r.status !== "not_found" || explicit.has(r.stravaId))
          .map(({ stravaId, status, samples, channels }) => ({ stravaId, status, ...(samples != null ? { samples } : {}), ...(channels ? { channels } : {}) }));
        for (const result of results) {
          const loud = explicit.has(result.stravaId) || result.status === "rate_limited";
          if (loud && result.status !== "synced" && result.status !== "already" && result.message) {
            warnings.push(`Hydration of activity ${result.stravaId}: ${result.message}`);
          }
        }
        // "unavailable" counts as settled (Strava has no streams; retrying won't change that).
        // "not_found" doesn't: the literal was probably not an activity id, so the query may
        // really be date-scoped and the global hints still apply.
        scopedAndComplete = results.every((r) => r.status === "synced" || r.status === "already" || r.status === "unavailable");
      }
    }
  } catch (error) {
    warnings.push(`Hydration skipped: ${error instanceof Error ? error.message : "unknown error"}. Query ran against already-synced data only.`);
  }

  return { hydrated, warnings, scopedAndComplete, candidateIds };
}

// Result-driven hydration: when the SQL carried no usable literal (found the activity by
// date/name/join) but the RESULT rows expose a strava_id column, Postgres has effectively done
// the extraction for us. Hydrate what the query was demonstrably about, then re-run once.
// All ids here are inferred (silent 404s); `skip` holds the pre-query candidates so nothing is
// attempted twice in one call.
async function hydrateFromResults(ctx: McpContext, rows: unknown[], skip: Set<number>): Promise<{ hydrated: NonNullable<RunUserQueryPayload["hydrated"]>; rerun: boolean }> {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const value = (row as Record<string, unknown>)["strava_id"];
    const id = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
    if (Number.isSafeInteger(id) && id >= STRAVA_ID_MIN && !skip.has(id) && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  if (ids.length === 0) return { hydrated: [], rerun: false };

  const { data: existing, error } = await ctx.supabase
    .from("activities")
    .select("strava_id, detail_synced_at, streams_synced_at, streams_status")
    .eq("user_id", ctx.userId)
    .in("strava_id", ids);
  if (error) throw new AppError("INTERNAL_ERROR", error.message);

  const byId = new Map((existing ?? []).map((row) => [row.strava_id as number, row]));
  const needy = ids
    .filter((id) => {
      const row = byId.get(id);
      return !row || !row.detail_synced_at || (!row.streams_synced_at && row.streams_status !== "unavailable");
    })
    .slice(0, MAX_HYDRATE_ACTIVITIES_PER_CALL);
  if (needy.length === 0) return { hydrated: [], rerun: false };

  const results = await hydrateActivities(ctx.supabase, ctx.bindings, ctx.userId, needy);
  const hydrated = results
    .filter((r) => r.status !== "not_found")
    .map(({ stravaId, status, samples, channels }) => ({ stravaId, status, ...(samples != null ? { samples } : {}), ...(channels ? { channels } : {}) }));
  return { hydrated, rerun: results.some((r) => r.status === "synced") };
}

// Matches exec_impl's warehouse-wide hydration hints (migration 0016).
const GLOBAL_HYDRATION_HINT = /known activities have no (hydrated streams|synced detail)/;
const BULK_HYDRATION_SUFFIX = " Or hydrate in bulk with the hydrate_activities tool (up to 10 ids per call).";

export function registerQueryTools(server: McpServer, ctx: McpContext) {
  server.registerTool(
    "run_sql",
    {
      title: "Run SQL",
      description:
        "Run one read-only SELECT over YOUR workout data in Postgres. Tables (all pre-scoped to you — never filter by user_id): " +
        "activities (all Strava activities, hydrated on demand; stream_channels lists which stream columns have data), activity_laps, activity_streams (one row per ~1s sample: time_s, dt_s, distance_m, velocity_mps, hr, watts, cadence, altitude_m, grade_pct), " +
        "activity_best_efforts, strava_sync_state, plans, phases, workouts, labels, label_activity_sports, plan_notes, workout_activities. " +
        "Hydration is automatic: any Strava activity id or workout UUID appearing in the SQL gets its detail/laps/streams pulled from Strava first (max " +
        `${MAX_HYDRATE_ACTIVITIES_PER_CALL} per call), and queries whose results return strava_id rows hydrate those and re-run once — or add a ` +
        '"-- hydrate: id1, id2" comment to force specific ids. ' +
        "Key joins: workout_activities ↔ activities on strava_id (there is no activity_id FK); streams/laps ↔ activities on activity_id = activities.id. " +
        "Call get_sql_guide first for the full column reference, join keys, analysis pitfalls, and worked examples. " +
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

        const { hydrated: preHydrated, warnings: hydrationWarnings, scopedAndComplete, candidateIds } = await hydrateForQuery(ctx, params.sql);
        let hydrated = preHydrated ?? [];

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

        // Result-driven pass: the query may have found activities by date/name that no static
        // inference could see. Hydrate them off the returned strava_id column and re-run once.
        if (payload.ok && Array.isArray(payload.rows) && payload.rows.length > 0) {
          try {
            const post = await hydrateFromResults(ctx, payload.rows, new Set(candidateIds));
            if (post.hydrated.length > 0) {
              hydrated = [...hydrated, ...post.hydrated];
            }
            if (post.rerun) {
              payload = await runQuery();
            }
          } catch (error) {
            hydrationWarnings.push(`Hydration skipped: ${error instanceof Error ? error.message : "unknown error"}. Results reflect already-synced data only.`);
          }
        }

        if (hydrated.length > 0) {
          payload.hydrated = hydrated;
        }
        // A query scoped to specific, fully-hydrated activities doesn't care that OTHER
        // activities are unhydrated — drop the warehouse-wide hints so they only show up on
        // date/name-scoped queries, where they drive the "-- hydrate:" loop. Hints that do
        // survive additionally point at the bulk tool.
        if (payload.warnings) {
          payload.warnings = payload.warnings
            .filter((warning) => !(scopedAndComplete && GLOBAL_HYDRATION_HINT.test(warning)))
            .map((warning) => (GLOBAL_HYDRATION_HINT.test(warning) ? warning + BULK_HYDRATION_SUFFIX : warning));
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

  // Duplicates the guide://sql-schema resource as a tool: chat surfaces (claude.ai) expose MCP
  // tools only, so a resource-only guide is invisible to exactly the agent that needs it.
  server.registerTool(
    "get_sql_guide",
    {
      title: "SQL Guide",
      description:
        "The reference for run_sql: full column list per table, join keys, the hydration model, analysis pitfalls, and worked examples. Read this before writing non-trivial SQL.",
      inputSchema: z.object({}).optional(),
      annotations: { readOnlyHint: true },
    },
    async () => ({ content: [{ type: "text" as const, text: sqlSchemaGuideMarkdown }] }),
  );

  server.registerTool(
    "hydrate_activities",
    {
      title: "Hydrate Activities",
      description:
        "Bulk-pull detail, laps, and per-second streams from Strava for up to " +
        `${MAX_HYDRATE_ACTIVITIES_PER_TOOL_CALL} activities, ahead of cross-session stream analysis with run_sql. ` +
        "Get ids from run_sql warnings or SELECT strava_id FROM activities WHERE streams_synced_at IS NULL AND coalesce(streams_status,'') <> 'unavailable'. " +
        "Prefer summary columns (activities) or activity_laps for fleet-wide questions — hydrate streams only when per-second data is genuinely needed. " +
        "Idempotent: already-hydrated ids report 'already' without touching Strava.",
      inputSchema: z.object({
        stravaIds: z
          .array(z.number().int().positive())
          .min(1)
          .max(MAX_HYDRATE_ACTIVITIES_PER_TOOL_CALL)
          .describe(`Strava activity ids to hydrate (1-${MAX_HYDRATE_ACTIVITIES_PER_TOOL_CALL}).`),
      }),
      annotations: { idempotentHint: true },
    },
    async (input) => {
      try {
        const params = z.object({ stravaIds: z.array(z.number().int().positive()).min(1).max(MAX_HYDRATE_ACTIVITIES_PER_TOOL_CALL) }).parse(input);
        const results = await hydrateActivities(ctx.supabase, ctx.bindings, ctx.userId, [...new Set(params.stravaIds)], MAX_HYDRATE_ACTIVITIES_PER_TOOL_CALL);
        return toolSuccess({
          results: results.map(({ stravaId, status, samples, channels, message }) => ({
            stravaId,
            status,
            ...(samples != null ? { samples } : {}),
            ...(channels ? { channels } : {}),
            ...(message ? { message } : {}),
          })),
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
