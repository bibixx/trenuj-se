import { afterEach, describe, expect, test } from "vitest";
import app from "../../server/index.ts";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { MOCK_ENV } from "../helpers/mock-env.ts";
import { clearMockSupabase, setMockSupabase } from "../helpers/setup.ts";

const protectedResourceMetadataUrl = `${MOCK_ENV.PUBLIC_APP_URL}/.well-known/oauth-protected-resource/mcp`;

describe("MCP route registration", () => {
  afterEach(() => {
    clearMockSupabase();
  });

  test("POST /mcp returns auth error plus OAuth challenge when unauthenticated", async () => {
    const res = await app.request("/mcp", { method: "POST" }, MOCK_ENV);

    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(`Bearer resource_metadata="${protectedResourceMetadataUrl}"`);
    expect(await res.json()).toEqual({
      code: "AUTH_ERROR",
      message: "Invalid or missing access token",
    });
  });

  test("POST /mcp/ returns the same auth error and challenge when unauthenticated", async () => {
    const res = await app.request("/mcp/", { method: "POST" }, MOCK_ENV);

    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(`Bearer resource_metadata="${protectedResourceMetadataUrl}"`);
    expect(await res.json()).toEqual({
      code: "AUTH_ERROR",
      message: "Invalid or missing access token",
    });
  });

  test("POST /mcp/claude/:token returns auth error without OAuth challenge when token is invalid", async () => {
    setMockSupabase(
      createMockSupabase({
        tables: {
          mcp_connector_tokens: {
            select: { data: null, error: null },
          },
        },
      }),
    );

    const res = await app.request("/mcp/claude/invalid-token", { method: "POST" }, MOCK_ENV);

    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBeNull();
    expect(await res.json()).toEqual({
      code: "AUTH_ERROR",
      message: "Invalid or revoked connector token",
    });
  });

  test("GET /.well-known/oauth-protected-resource/mcp returns protected resource metadata", async () => {
    const res = await app.request("/.well-known/oauth-protected-resource/mcp", {}, MOCK_ENV);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      resource: `${MOCK_ENV.PUBLIC_APP_URL}/mcp`,
      authorization_servers: [`${MOCK_ENV.VITE_SUPABASE_URL}/auth/v1`],
      bearer_methods_supported: ["header"],
      resource_name: "Workout Planner MCP",
    });
  });
});
