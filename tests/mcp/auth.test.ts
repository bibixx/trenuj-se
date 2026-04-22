import { afterEach, describe, expect, test } from "vitest";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { clearMockSupabase, setMockSupabase } from "../helpers/setup.ts";
import { MOCK_ENV, MOCK_USER_ID } from "../helpers/mock-env.ts";
import { mcpInitialize, parseMcpResponse } from "../helpers/mcp.ts";

const protectedResourceMetadataUrl = `${MOCK_ENV.PUBLIC_APP_URL}/.well-known/oauth-protected-resource/mcp`;

describe("MCP OAuth Authentication", () => {
  afterEach(() => {
    clearMockSupabase();
  });

  test("missing Authorization header → 401", async () => {
    const response = await mcpInitialize({ token: false });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      `Bearer realm="OAuth", resource_metadata="${protectedResourceMetadataUrl}", error="invalid_token", error_description="Invalid or missing access token"`,
    );

    const body = await response.json();
    expect(body.code).toBe("AUTH_ERROR");
    expect(body.error).toBe("invalid_token");
    expect(body.error_description).toBe("Invalid or missing access token");
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
    expect(body.error).toBe("invalid_token");
    expect(body.error_description).toBe("Invalid or expired access token");
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
});
