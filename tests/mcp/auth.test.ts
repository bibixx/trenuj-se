import { afterEach, describe, expect, test } from "vitest";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { clearMockSupabase, setMockSupabase } from "../helpers/setup.ts";
import { MOCK_USER_ID } from "../helpers/mock-env.ts";
import { mcpInitialize, parseMcpResponse } from "../helpers/mcp.ts";

describe("MCP OAuth Authentication", () => {
  afterEach(() => {
    clearMockSupabase();
  });

  test("missing Authorization header → 401", async () => {
    const response = await mcpInitialize({ token: false });
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.code).toBe("AUTH_ERROR");
  });

  test("malformed Authorization header (no Bearer prefix) → 401", async () => {
    const response = await mcpInitialize({ token: false });
    expect(response.status).toBe(401);
  });

  test("invalid token (getUser returns error) → 401", async () => {
    setMockSupabase(
      createMockSupabase({
        auth: {
          getUser: { data: { user: null }, error: { message: "Invalid token" } },
        },
      }),
    );

    const response = await mcpInitialize({ token: "invalid-jwt-token" });
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.code).toBe("AUTH_ERROR");
    expect(body.message).toBe("Invalid or expired access token");
  });

  test("expired token (getUser returns error) → 401", async () => {
    setMockSupabase(
      createMockSupabase({
        auth: {
          getUser: { data: { user: null }, error: { message: "Token expired" } },
        },
      }),
    );

    const response = await mcpInitialize({ token: "expired-jwt-token" });
    expect(response.status).toBe(401);
  });

  test("deactivated user (getUser returns null user) → 401", async () => {
    setMockSupabase(
      createMockSupabase({
        auth: {
          getUser: { data: { user: null }, error: null },
        },
      }),
    );

    const response = await mcpInitialize({ token: "valid-but-deactivated-user" });
    expect(response.status).toBe(401);
  });

  test("valid token → successful initialization", async () => {
    setMockSupabase(
      createMockSupabase({
        auth: {
          getUser: { data: { user: { id: MOCK_USER_ID } }, error: null },
        },
      }),
    );

    const response = await mcpInitialize({ token: "valid-oauth-jwt" });
    expect(response.status).toBe(200);

    const rpc = await parseMcpResponse(response);
    expect(rpc.result).toBeDefined();
    expect(rpc.error).toBeUndefined();
  });

  test("valid Claude connector token → successful initialization without OAuth lookup", async () => {
    const mock = createMockSupabase({
      tables: {
        mcp_connector_tokens: {
          select: {
            data: { id: "connector-token-id", user_id: MOCK_USER_ID },
            error: null,
          },
          update: {
            data: null,
            error: null,
          },
        },
      },
    });

    setMockSupabase(mock);

    const response = await mcpInitialize({ token: false, path: "/mcp/claude/valid-connector-token" });
    expect(response.status).toBe(200);
    expect(mock.auth.getUser).not.toHaveBeenCalled();

    const rpc = await parseMcpResponse(response);
    expect(rpc.result).toBeDefined();
    expect(rpc.error).toBeUndefined();
  });
});
