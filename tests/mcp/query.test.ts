import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createMockSupabase, type MockSupabase } from "../helpers/mock-supabase.ts";
import { clearMockSupabase, setMockSupabase } from "../helpers/setup.ts";
import { MOCK_USER_ID } from "../helpers/mock-env.ts";
import { extractToolError, mcpCallTool, parseMcpResponse, resetMcpIds } from "../helpers/mcp.ts";

function mockAuth() {
  return {
    getUser: { data: { user: { id: MOCK_USER_ID } }, error: null },
  };
}

const OK_PAYLOAD = { ok: true, rows: [{ week: "2026-07-27", km: 52.3 }], row_count: 1, warnings: [] };

type RawToolResult = { content?: Array<{ type: string; text: string }>; structuredContent?: unknown; isError?: boolean };

async function callRunSql(args: Record<string, unknown>) {
  const response = await mcpCallTool("run_sql", args);
  const rpcResult = await parseMcpResponse(response);
  return rpcResult.result as RawToolResult;
}

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
    expect(JSON.parse(result.content?.[0]?.text ?? "{}")).toEqual(errorPayload);
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
    expect(JSON.parse(result.content?.[0]?.text ?? "{}").error_code).toBe("TOO_MANY_ROWS");
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
    expect(JSON.parse(result.content?.[0]?.text ?? "{}").error_code).toBe("RESULT_TOO_LARGE");
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
});

describe("MCP sync_activity_data tool", () => {
  beforeEach(() => resetMcpIds());
  afterEach(() => {
    clearMockSupabase();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  function mockWithSyncTables(extra: Parameters<typeof createMockSupabase>[0] = {}): MockSupabase {
    return createMockSupabase({
      auth: mockAuth(),
      tables: {
        strava_credentials: {
          select: {
            data: { user_id: MOCK_USER_ID, access_token: "tok", refresh_token: "ref", token_expires_at: new Date(Date.now() + 3_600_000).toISOString() },
            error: null,
          },
        },
        strava_sync_state: { select: { data: null, error: null }, upsert: { data: null, error: null } },
        ...(extra.tables ?? {}),
      },
      rpc: extra.rpc ?? {},
    });
  }

  test("requires at least one action", async () => {
    setMockSupabase(mockWithSyncTables());

    const response = await mcpCallTool("sync_activity_data", {});
    const error = extractToolError(await parseMcpResponse(response));
    expect(error?.code).toBe("VALIDATION_ERROR");
  });

  test("range sync reports summary coverage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify([{ id: 1 }]), { status: 200 })),
    );
    setMockSupabase(
      mockWithSyncTables({
        rpc: {
          strava_ingest_activity_summaries: { data: [{ ingested: 10, oldest: "2026-05-01T00:00:00Z", newest: "2026-08-01T00:00:00Z" }], error: null },
        },
      }),
    );

    const response = await mcpCallTool("sync_activity_data", { range: { from: "2026-05-01" } });
    const rpcResult = await parseMcpResponse(response);
    const parsed = JSON.parse(((rpcResult.result as RawToolResult).content?.[0]?.text ?? "{}") as string) as {
      result: { summaries: { status: string; ingested: number } };
    };

    expect(parsed.result.summaries.status).toBe("synced");
    expect(parsed.result.summaries.ingested).toBe(10);
  });

  test("hydrateStreams reports per-activity status", async () => {
    setMockSupabase(
      mockWithSyncTables({
        tables: {
          activities: {
            select: {
              data: { id: 1, elapsed_sec: 3600, detail_synced_at: "2026-08-01T00:00:00Z", streams_synced_at: "2026-08-01T00:00:00Z", streams_status: "synced" },
              error: null,
            },
          },
        },
      }),
    );

    const response = await mcpCallTool("sync_activity_data", { hydrateStreams: [123] });
    const rpcResult = await parseMcpResponse(response);
    const parsed = JSON.parse(((rpcResult.result as RawToolResult).content?.[0]?.text ?? "{}") as string) as {
      result: { hydration: Array<{ stravaId: number; status: string }> };
    };

    expect(parsed.result.hydration).toEqual([{ stravaId: 123, status: "already" }]);
  });
});
