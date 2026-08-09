import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AppError, toolError, toolSuccess, type McpContext } from "../context";
import { parseUserFlags } from "../../../shared/user-flags";
import { hydrateActivities, syncActivitySummaries, syncAthleteZones, MAX_HYDRATE_ACTIVITIES_PER_CALL } from "../../lib/strava-sync";

const RUN_SQL_BYTE_BACKSTOP = 100_000;

async function requireSqlQueriesFlag(ctx: McpContext) {
  const { data, error } = await ctx.supabase.from("profiles").select("user_flags").eq("id", ctx.userId).maybeSingle();
  if (error) throw new AppError("INTERNAL_ERROR", error.message);
  if (!parseUserFlags(data?.user_flags).sql_queries) {
    throw new AppError("FORBIDDEN", "SQL queries are not enabled for this account (user flag 'sql_queries').");
  }
}

type RunUserQueryPayload = {
  ok: boolean;
  error_code?: string;
  message?: string;
  sqlstate?: string;
  rows?: unknown[];
  row_count?: number;
  warnings?: string[];
  [key: string]: unknown;
};

// run_sql payloads bypass toolSuccess on purpose: it pretty-prints AND duplicates the payload
// into structuredContent, doubling the wire size — irrelevant for small tool results, wasteful
// for query results near the 64 KB cap.
function compactResult(payload: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    ...(isError ? { isError: true } : {}),
  };
}

export function registerQueryTools(server: McpServer, ctx: McpContext) {
  server.registerTool(
    "run_sql",
    {
      title: "Run SQL",
      description:
        "Run one read-only SELECT over YOUR workout data in Postgres. Tables (all pre-scoped to you — never filter by user_id): " +
        "activities (all Strava activities, lazily synced), activity_laps, activity_streams (one row per ~1s sample: time_s, dt_s, distance_m, velocity_mps, hr, watts, cadence, altitude_m, grade_pct), " +
        "activity_best_efforts, athlete_zones, strava_sync_state, plans, phases, workouts, labels, label_activity_sports, plan_notes, workout_activities. " +
        "Full column reference, join keys, and worked examples: read the guide://sql-schema resource (or query information_schema.columns). " +
        "CTEs, window functions, FILTER, width_bucket, ntile, generate_series, lateral joins, regr_*/corr all work. " +
        "Aggregate server-side; results are capped at maxRows rows and 64 KB. One statement only, no semicolons. " +
        "Data is hydrated lazily: check the hydration warnings in responses and call sync_activity_data to pull missing summaries/streams from Strava first.",
      inputSchema: z.object({
        sql: z.string().min(1).max(20_000).describe("A single SELECT (or WITH ... SELECT) statement. No semicolons."),
        maxRows: z.number().int().min(1).max(500).optional().describe("Row cap for this query (default 200, max 500). Prefer aggregating over raising this."),
      }),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        const params = z.object({ sql: z.string().min(1).max(20_000), maxRows: z.number().int().min(1).max(500).optional() }).parse(input);
        await requireSqlQueriesFlag(ctx);

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

  server.registerTool(
    "sync_activity_data",
    {
      title: "Sync Activity Data",
      description:
        "Pull Strava data into the SQL warehouse on demand (data is never synced automatically). " +
        "range: sync activity summaries so every activity in the date range has a row in `activities`. " +
        `hydrateStreams: fetch per-second streams + laps + best efforts for specific activities by strava_id (max ${MAX_HYDRATE_ACTIVITIES_PER_CALL} per call — call repeatedly for more). ` +
        "syncZones: refresh HR/power zone boundaries into `athlete_zones`. " +
        "Query `strava_sync_state` and `activities.streams_synced_at`/`detail_synced_at` via run_sql to see current coverage. " +
        "Respects Strava rate limits: on rate_limited results, retry after the returned timestamp.",
      inputSchema: z.object({
        range: z
          .object({
            from: z.string().date().describe("Sync summaries from this date (YYYY-MM-DD)."),
            to: z.string().date().optional().describe("Optional end date; defaults to now."),
          })
          .optional(),
        hydrateStreams: z
          .array(z.number().int().positive())
          .min(1)
          .max(MAX_HYDRATE_ACTIVITIES_PER_CALL)
          .optional()
          .describe(`Strava activity ids to hydrate streams/laps for (max ${MAX_HYDRATE_ACTIVITIES_PER_CALL}).`),
        syncZones: z.boolean().optional().describe("Also refresh athlete HR/power zones."),
      }),
    },
    async (input) => {
      try {
        const params = z
          .object({
            range: z.object({ from: z.string().date(), to: z.string().date().optional() }).optional(),
            hydrateStreams: z.array(z.number().int().positive()).min(1).max(MAX_HYDRATE_ACTIVITIES_PER_CALL).optional(),
            syncZones: z.boolean().optional(),
          })
          .parse(input ?? {});

        if (!params.range && !params.hydrateStreams && !params.syncZones) {
          throw new AppError("VALIDATION_ERROR", "Provide at least one of range, hydrateStreams, or syncZones.");
        }

        await requireSqlQueriesFlag(ctx);

        const result: {
          summaries?: Awaited<ReturnType<typeof syncActivitySummaries>>;
          hydration?: Awaited<ReturnType<typeof hydrateActivities>>;
          zones?: Awaited<ReturnType<typeof syncAthleteZones>>;
        } = {};
        const warnings: string[] = [];

        if (params.range) {
          const summaries = await syncActivitySummaries(ctx.supabase, ctx.bindings, ctx.userId, {
            from: `${params.range.from}T00:00:00Z`,
            ...(params.range.to ? { to: `${params.range.to}T23:59:59Z` } : {}),
          });
          result.summaries = summaries;
          if (summaries.status === "partial") {
            warnings.push(
              `Summary sync is partial (page budget spent); coverage now starts at ${summaries.coveredFrom}. Call sync_activity_data again with the same range to continue.`,
            );
          }
          if (summaries.status === "rate_limited") {
            warnings.push(`Strava rate limit hit; retry after ${summaries.rateLimitedUntil}.`);
          }
        }

        if (params.hydrateStreams) {
          const hydration = await hydrateActivities(ctx.supabase, ctx.bindings, ctx.userId, params.hydrateStreams);
          result.hydration = hydration;
          const rateLimited = hydration.find((item) => item.status === "rate_limited");
          if (rateLimited) {
            warnings.push(rateLimited.message ?? "Strava rate limit hit during hydration; retry later.");
          }
        }

        if (params.syncZones) {
          const zones = await syncAthleteZones(ctx.supabase, ctx.bindings, ctx.userId);
          result.zones = zones;
          if (zones.status === "rate_limited") {
            warnings.push(`Strava rate limit hit; retry zones sync after ${zones.rateLimitedUntil}.`);
          }
        }

        return toolSuccess(result, warnings.length > 0 ? warnings : undefined);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
