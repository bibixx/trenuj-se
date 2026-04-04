import { describe, test, expect, beforeEach, afterEach } from "vitest";
import app from "../../server/index.ts";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { setMockSupabase, clearMockSupabase } from "../helpers/setup.ts";
import { MOCK_TOKEN_ID, MOCK_USER_ID, MOCK_ENV } from "../helpers/mock-env.ts";
import { mcpInitialize, parseMcpResponse, resetMcpIds } from "../helpers/mcp.ts";

const TEST_TOKEN = "tp_abc123testtoken";

function makeBody(method = "initialize") {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: 99,
    method,
    params: method === "initialize" ? { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test-client", version: "0.0.1" } } : {},
  });
}

describe("MCP Authentication", () => {
  beforeEach(() => {
    resetMcpIds();
  });

  afterEach(() => {
    clearMockSupabase();
  });

  test("returns 401 without Authorization header", async () => {
    const mock = createMockSupabase({});
    setMockSupabase(mock);

    const res = await app.request(
      "/mcp",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: makeBody(),
      },
      MOCK_ENV,
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("AUTH_ERROR");
  });

  test("returns 401 with Basic auth (non-Bearer)", async () => {
    const mock = createMockSupabase({});
    setMockSupabase(mock);

    const res = await app.request(
      "/mcp",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: "Basic dXNlcjpwYXNz",
        },
        body: makeBody(),
      },
      MOCK_ENV,
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("AUTH_ERROR");
  });

  test("returns 401 with Bearer token that does not start with tp_", async () => {
    const mock = createMockSupabase({});
    setMockSupabase(mock);

    const res = await app.request(
      "/mcp",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: "Bearer sk_notvalid123",
        },
        body: makeBody(),
      },
      MOCK_ENV,
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("AUTH_ERROR");
  });

  test("returns 401 with Bearer prefix only (no token value)", async () => {
    const mock = createMockSupabase({});
    setMockSupabase(mock);

    const res = await app.request(
      "/mcp",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: "Bearer ",
        },
        body: makeBody(),
      },
      MOCK_ENV,
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("AUTH_ERROR");
  });

  test("returns 401 when token hash is not found in api_tokens (select returns null)", async () => {
    const mock = createMockSupabase({
      tables: {
        api_tokens: {
          select: { data: null, error: null },
        },
      },
    });
    setMockSupabase(mock);

    const res = await app.request(
      "/mcp",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${TEST_TOKEN}`,
        },
        body: makeBody(),
      },
      MOCK_ENV,
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("AUTH_ERROR");
  });

  test("returns 401 when api_tokens select returns a database error", async () => {
    const mock = createMockSupabase({
      tables: {
        api_tokens: {
          select: { data: null, error: { message: "DB error" } },
        },
      },
    });
    setMockSupabase(mock);

    const res = await app.request(
      "/mcp",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${TEST_TOKEN}`,
        },
        body: makeBody(),
      },
      MOCK_ENV,
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("AUTH_ERROR");
  });

  test("succeeds and returns initialize result with valid tp_ token", async () => {
    const mock = createMockSupabase({
      tables: {
        api_tokens: {
          select: { data: { id: MOCK_TOKEN_ID, user_id: MOCK_USER_ID }, error: null },
          update: { data: null, error: null },
        },
      },
    });
    setMockSupabase(mock);

    const res = await mcpInitialize({ token: TEST_TOKEN });

    expect(res.status).toBe(200);
    const parsed = await parseMcpResponse(res);
    expect(parsed.result).toBeDefined();
    const initResult = parsed.result as Record<string, unknown>;
    const serverInfo = initResult.serverInfo as Record<string, unknown> | undefined;
    expect(serverInfo?.name).toBe("training-plan-platform");
  });

  test("updates last_used_at in api_tokens after successful authentication", async () => {
    const mock = createMockSupabase({
      tables: {
        api_tokens: {
          select: { data: { id: MOCK_TOKEN_ID, user_id: MOCK_USER_ID }, error: null },
          update: { data: null, error: null },
        },
      },
    });
    setMockSupabase(mock);

    await mcpInitialize({ token: TEST_TOKEN });

    const updateCalls = mock.calls.filter((c) => c.table === "api_tokens" && c.operation === "update");
    expect(updateCalls.length).toBeGreaterThan(0);
  });

  test("tools/list is accessible after successful auth", async () => {
    const mock = createMockSupabase({
      tables: {
        api_tokens: {
          select: { data: { id: MOCK_TOKEN_ID, user_id: MOCK_USER_ID }, error: null },
          update: { data: null, error: null },
        },
      },
    });
    setMockSupabase(mock);

    const res = await app.request(
      "/mcp",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${TEST_TOKEN}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      },
      MOCK_ENV,
    );

    expect(res.status).toBe(200);
    const parsed = await parseMcpResponse(res);
    expect(parsed.result).toBeDefined();
    const tools = (parsed.result as Record<string, unknown>).tools;
    expect(tools).toBeInstanceOf(Array);
    expect(tools.length).toBeGreaterThan(0);
  });
});
