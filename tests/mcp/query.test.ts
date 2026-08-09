import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Hydration internals are unit-tested in tests/unit/strava-sync.test.ts; here we assert the
// run_sql tool drives them correctly (inference, prefilter, degradation) via a module mock.
vi.mock("../../server/lib/strava-sync.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../server/lib/strava-sync.ts")>();
  return {
    ...original,
    hydrateActivities: vi.fn(async (_sb: unknown, _b: unknown, _uid: string, ids: number[]) => ids.map((stravaId) => ({ stravaId, status: "synced" as const, samples: 100 }))),
    syncAthleteZones: vi.fn(async () => ({ status: "synced" as const, inserted: 10 })),
  };
});

import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { clearMockSupabase, setMockSupabase } from "../helpers/setup.ts";
import { MOCK_USER_ID } from "../helpers/mock-env.ts";
import { mcpCallTool, parseMcpResponse, resetMcpIds } from "../helpers/mcp.ts";
import { extractHydrationCandidates } from "../../server/mcp/tools/query.ts";
import { hydrateActivities, syncAthleteZones } from "../../server/lib/strava-sync.ts";

function mockAuth() {
  return {
    getUser: { data: { user: { id: MOCK_USER_ID } }, error: null },
  };
}

const OK_PAYLOAD = { ok: true, rows: [{ week: "2026-07-27", km: 52.3 }], row_count: 1, warnings: [] };
const STRAVA_ID = 19620351399;

type RawToolResult = { content?: Array<{ type: string; text: string }>; structuredContent?: unknown; isError?: boolean };

async function callRunSql(args: Record<string, unknown>) {
  const response = await mcpCallTool("run_sql", args);
  const rpcResult = await parseMcpResponse(response);
  return rpcResult.result as RawToolResult;
}

function parsePayload(result: RawToolResult) {
  return JSON.parse(result.content?.[0]?.text ?? "{}") as Record<string, unknown>;
}

describe("extractHydrationCandidates", () => {
  test("picks up 10+ digit integer literals only", () => {
    const { ids } = extractHydrationCandidates(`SELECT * FROM activities WHERE strava_id = ${STRAVA_ID} LIMIT 200`);
    expect(ids).toEqual([STRAVA_ID]);
  });

  test("ignores small integers, decimals, and quoted dates", () => {
    const { ids } = extractHydrationCandidates("SELECT 123456789, 1234567890.5, '2026-08-05', width_bucket(hr, 100, 200, 5) FROM activities LIMIT 500");
    expect(ids).toEqual([]);
  });

  test("collects ids from a -- hydrate: comment and marks them explicit", () => {
    const { ids, explicit } = extractHydrationCandidates("SELECT count(*) FROM activity_streams\n-- hydrate: 19620351399, 19605843631");
    expect(ids).toEqual([19620351399, 19605843631]);
    expect(explicit.has(19620351399)).toBe(true);
    expect(explicit.has(19605843631)).toBe(true);
  });

  test("dedupes and caps at 3", () => {
    const { ids } = extractHydrationCandidates(`SELECT * FROM activities WHERE strava_id IN (1111111111, 1111111111, 2222222222, 3333333333, 4444444444)`);
    expect(ids).toEqual([1111111111, 2222222222, 3333333333]);
  });
});

describe("MCP run_sql tool", () => {
  beforeEach(() => resetMcpIds());
  afterEach(() => {
    clearMockSupabase();
    vi.clearAllMocks();
  });

  test("forwards the query to run_user_query scoped to the authenticated user", async () => {
    const mock = createMockSupabase({
      auth: mockAuth(),
      rpc: { run_user_query: { data: OK_PAYLOAD, error: null } },
    });
    setMockSupabase(mock);

    const result = await callRunSql({ sql: "SELECT 1 AS one", maxRows: 300 });

    const rpcCall = mock.calls.find((c) => c.table === "rpc:run_user_query");
    expect(rpcCall?.args[0]).toEqual({ p_user_id: MOCK_USER_ID, p_sql: "SELECT 1 AS one", p_max_rows: 300 });

    expect(result.isError).toBeUndefined();
    // Compact single serialization: no pretty-printing, no structuredContent duplicate.
    expect(result.structuredContent).toBeUndefined();
    expect(result.content?.[0]?.text).toBe(JSON.stringify(OK_PAYLOAD));
    // No candidate ids -> no hydration machinery touched.
    expect(hydrateActivities).not.toHaveBeenCalled();
  });

  test("defaults maxRows to 200", async () => {
    const mock = createMockSupabase({
      auth: mockAuth(),
      rpc: { run_user_query: { data: OK_PAYLOAD, error: null } },
    });
    setMockSupabase(mock);

    await callRunSql({ sql: "SELECT 1" });

    const rpcCall = mock.calls.find((c) => c.table === "rpc:run_user_query");
    const rpcArgs = rpcCall?.args[0] as { p_max_rows?: number } | undefined;
    expect(rpcArgs?.p_max_rows).toBe(200);
  });

  test("hydrates activities referenced by strava_id before running the query", async () => {
    const mock = createMockSupabase({
      auth: mockAuth(),
      tables: { activities: { select: { data: [], error: null } } },
      rpc: { run_user_query: { data: { ...OK_PAYLOAD }, error: null } },
    });
    setMockSupabase(mock);

    const result = await callRunSql({ sql: `SELECT avg(hr) FROM activity_streams s JOIN activities a ON a.id = s.activity_id WHERE a.strava_id = ${STRAVA_ID}` });

    expect(hydrateActivities).toHaveBeenCalledWith(expect.anything(), expect.anything(), MOCK_USER_ID, [STRAVA_ID]);
    const payload = parsePayload(result);
    expect(payload.hydrated).toEqual([{ stravaId: STRAVA_ID, status: "synced", samples: 100 }]);
  });

  test("skips Strava entirely when referenced activities are already hydrated", async () => {
    const mock = createMockSupabase({
      auth: mockAuth(),
      tables: {
        activities: {
          select: { data: [{ strava_id: STRAVA_ID, detail_synced_at: "2026-08-01T00:00:00Z", streams_synced_at: "2026-08-01T00:00:00Z", streams_status: "synced" }], error: null },
        },
      },
      rpc: { run_user_query: { data: OK_PAYLOAD, error: null } },
    });
    setMockSupabase(mock);

    const result = await callRunSql({ sql: `SELECT 1 FROM activities WHERE strava_id = ${STRAVA_ID}` });

    expect(hydrateActivities).not.toHaveBeenCalled();
    expect(parsePayload(result).hydrated).toBeUndefined();
  });

  test("hydrates ids from a -- hydrate: comment and reports explicit failures as warnings", async () => {
    vi.mocked(hydrateActivities).mockResolvedValueOnce([{ stravaId: STRAVA_ID, status: "not_found", message: "Activity not found on Strava" }]);
    const mock = createMockSupabase({
      auth: mockAuth(),
      tables: { activities: { select: { data: [], error: null } } },
      rpc: { run_user_query: { data: { ...OK_PAYLOAD }, error: null } },
    });
    setMockSupabase(mock);

    const result = await callRunSql({ sql: `SELECT count(*) FROM activity_streams\n-- hydrate: ${STRAVA_ID}` });

    expect(hydrateActivities).toHaveBeenCalledWith(expect.anything(), expect.anything(), MOCK_USER_ID, [STRAVA_ID]);
    const payload = parsePayload(result);
    expect(payload.hydrated).toEqual([{ stravaId: STRAVA_ID, status: "not_found" }]);
    expect(payload.warnings).toEqual([expect.stringContaining("Activity not found on Strava")]);
  });

  test("silently drops inferred ids that turn out not to exist on Strava", async () => {
    vi.mocked(hydrateActivities).mockResolvedValueOnce([{ stravaId: 1720000000, status: "not_found", message: "Activity not found on Strava" }]);
    const mock = createMockSupabase({
      auth: mockAuth(),
      tables: { activities: { select: { data: [], error: null } } },
      rpc: { run_user_query: { data: { ...OK_PAYLOAD }, error: null } },
    });
    setMockSupabase(mock);

    // Epoch-like literal: plausible false positive for the id heuristic.
    const result = await callRunSql({ sql: "SELECT * FROM activities WHERE extract(epoch FROM start_date) > 1720000000" });

    const payload = parsePayload(result);
    expect(payload.hydrated).toBeUndefined();
    expect(payload.warnings).toEqual([]);
  });

  test("syncs zones when athlete_zones is empty on first use", async () => {
    setMockSupabase(
      createMockSupabase({
        auth: mockAuth(),
        tables: { athlete_zones: { select: { data: [], error: null } } },
        rpc: { run_user_query: { data: OK_PAYLOAD, error: null } },
      }),
    );

    await callRunSql({ sql: "SELECT * FROM athlete_zones" });
    expect(syncAthleteZones).toHaveBeenCalledOnce();
  });

  test("does not sync zones when athlete_zones already has rows", async () => {
    setMockSupabase(
      createMockSupabase({
        auth: mockAuth(),
        tables: { athlete_zones: { select: { data: [{ id: 1 }], error: null } } },
        rpc: { run_user_query: { data: OK_PAYLOAD, error: null } },
      }),
    );

    await callRunSql({ sql: "SELECT * FROM athlete_zones" });
    expect(syncAthleteZones).not.toHaveBeenCalled();
  });

  test("degrades to a warning when hydration fails; the query still runs", async () => {
    vi.mocked(hydrateActivities).mockRejectedValueOnce(new Error("Strava is not connected for this user"));
    const mock = createMockSupabase({
      auth: mockAuth(),
      tables: { activities: { select: { data: [], error: null } } },
      rpc: { run_user_query: { data: { ...OK_PAYLOAD }, error: null } },
    });
    setMockSupabase(mock);

    const result = await callRunSql({ sql: `SELECT 1 FROM activities WHERE strava_id = ${STRAVA_ID}` });

    expect(result.isError).toBeUndefined();
    const payload = parsePayload(result);
    expect(payload.warnings).toEqual([expect.stringContaining("Strava is not connected")]);
    expect(payload.rows).toEqual(OK_PAYLOAD.rows);
  });

  test("provisions the sandbox lazily and retries once", async () => {
    const mock = createMockSupabase({
      auth: mockAuth(),
      rpc: {
        run_user_query: [
          { data: { ok: false, error_code: "SANDBOX_NOT_PROVISIONED", message: "not provisioned" }, error: null },
          { data: OK_PAYLOAD, error: null },
        ],
        sandbox_ensure_user: { data: null, error: null },
      },
    });
    setMockSupabase(mock);

    const result = await callRunSql({ sql: "SELECT 1" });

    const rpcOrder = mock.calls.filter((c) => c.table.startsWith("rpc:")).map((c) => c.table);
    expect(rpcOrder).toEqual(["rpc:run_user_query", "rpc:sandbox_ensure_user", "rpc:run_user_query"]);
    const provisionCall = mock.calls.find((c) => c.table === "rpc:sandbox_ensure_user");
    expect(provisionCall?.args[0]).toEqual({ p_user_id: MOCK_USER_ID });
    expect(result.content?.[0]?.text).toBe(JSON.stringify(OK_PAYLOAD));
  });

  test("SQL errors pass through verbatim as tool errors", async () => {
    const errorPayload = { ok: false, error_code: "SQL_ERROR", sqlstate: "42703", message: 'column "hrr" does not exist' };
    setMockSupabase(
      createMockSupabase({
        auth: mockAuth(),
        rpc: { run_user_query: { data: errorPayload, error: null } },
      }),
    );

    const result = await callRunSql({ sql: "SELECT hrr FROM activities" });

    expect(result.isError).toBe(true);
    expect(parsePayload(result)).toEqual(errorPayload);
  });

  test("TOO_MANY_ROWS overflow error passes through", async () => {
    const overflow = { ok: false, error_code: "TOO_MANY_ROWS", row_limit: 200, message: "More than 200 rows." };
    setMockSupabase(
      createMockSupabase({
        auth: mockAuth(),
        rpc: { run_user_query: { data: overflow, error: null } },
      }),
    );

    const result = await callRunSql({ sql: "SELECT * FROM activity_streams" });

    expect(result.isError).toBe(true);
    expect(parsePayload(result).error_code).toBe("TOO_MANY_ROWS");
  });

  test("worker-side byte backstop rejects oversized payloads", async () => {
    const huge = { ok: true, rows: [{ blob: "x".repeat(120_000) }], row_count: 1, warnings: [] };
    setMockSupabase(
      createMockSupabase({
        auth: mockAuth(),
        rpc: { run_user_query: { data: huge, error: null } },
      }),
    );

    const result = await callRunSql({ sql: "SELECT raw FROM activities" });

    expect(result.isError).toBe(true);
    expect(parsePayload(result).error_code).toBe("RESULT_TOO_LARGE");
  });

  test("rejects invalid input (empty sql) at the protocol layer", async () => {
    setMockSupabase(createMockSupabase({ auth: mockAuth() }));

    const response = await mcpCallTool("run_sql", { sql: "" });
    const rpcResult = await parseMcpResponse(response);
    // The MCP SDK validates inputSchema before the handler runs — this surfaces as an isError
    // tool result with a plain-text "MCP error ..." message, not our JSON error payload.
    const result = rpcResult.result as RawToolResult;
    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toMatch(/invalid/i);
  });

  test("sync_activity_data no longer exists", async () => {
    setMockSupabase(createMockSupabase({ auth: mockAuth() }));

    const response = await mcpCallTool("sync_activity_data", { syncZones: true });
    const rpcResult = await parseMcpResponse(response);
    // Unknown tool surfaces as a JSON-RPC error or an isError result with a plain-text
    // "MCP error ... not found" message — either way it is not a successful call.
    const text = (rpcResult.result as RawToolResult | undefined)?.content?.[0]?.text ?? rpcResult.error?.message ?? "";
    expect(text).toMatch(/not found|unknown tool|invalid/i);
  });
});
