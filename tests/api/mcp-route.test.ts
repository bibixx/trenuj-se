import { describe, expect, test } from "vitest";
import app from "../../server/index.ts";
import { MOCK_ENV } from "../helpers/mock-env.ts";

const protectedResourceMetadataUrl = `${MOCK_ENV.PUBLIC_APP_URL}/.well-known/oauth-protected-resource/mcp`;
const authChallenge = `Bearer realm="OAuth", resource_metadata="${protectedResourceMetadataUrl}", error="invalid_token", error_description="Invalid or missing access token"`;

describe("MCP route registration", () => {
  test("POST /mcp returns auth error plus OAuth challenge when unauthenticated", async () => {
    const res = await app.request("/mcp", { method: "POST" }, MOCK_ENV);

    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(authChallenge);
    expect(await res.json()).toEqual({
      code: "AUTH_ERROR",
      message: "Invalid or missing access token",
      error: "invalid_token",
      error_description: "Invalid or missing access token",
    });
  });

  test("POST /mcp/ returns the same auth error and challenge when unauthenticated", async () => {
    const res = await app.request("/mcp/", { method: "POST" }, MOCK_ENV);

    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(authChallenge);
    expect(await res.json()).toEqual({
      code: "AUTH_ERROR",
      message: "Invalid or missing access token",
      error: "invalid_token",
      error_description: "Invalid or missing access token",
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
