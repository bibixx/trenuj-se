import { describe, expect, test } from "vitest";
import app from "../../server/index.ts";
import { MOCK_ENV } from "../helpers/mock-env.ts";

function protectedResourceMetadataUrl(resourcePath: "/mcp" | "/mcp2") {
  return `${MOCK_ENV.PUBLIC_APP_URL}/.well-known/oauth-protected-resource/${resourcePath.slice(1)}`;
}

function authChallenge(resourcePath: "/mcp" | "/mcp2") {
  return `Bearer realm="OAuth", resource_metadata="${protectedResourceMetadataUrl(resourcePath)}", error="invalid_token", error_description="Missing or invalid access token"`;
}

function expectedProtectedResourceMetadata(resourcePath: "/mcp" | "/mcp2") {
  return {
    resource: `${MOCK_ENV.PUBLIC_APP_URL}${resourcePath}`,
    authorization_servers: [`${MOCK_ENV.VITE_SUPABASE_URL}/auth/v1`],
    bearer_methods_supported: ["header"],
    resource_name: "Workout Planner MCP",
  };
}

describe("MCP route registration", () => {
  test("POST /mcp returns auth error plus OAuth challenge when unauthenticated", async () => {
    const res = await app.request("/mcp", { method: "POST" }, MOCK_ENV);

    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(authChallenge("/mcp"));
    expect(await res.json()).toEqual({
      error: "invalid_token",
      error_description: "Missing or invalid access token",
    });
  });

  test("POST /mcp/ returns the same auth error and challenge when unauthenticated", async () => {
    const res = await app.request("/mcp/", { method: "POST" }, MOCK_ENV);

    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(authChallenge("/mcp"));
    expect(await res.json()).toEqual({
      error: "invalid_token",
      error_description: "Missing or invalid access token",
    });
  });

  test("POST /mcp2 returns an auth error plus the /mcp2 OAuth challenge when unauthenticated", async () => {
    const res = await app.request("/mcp2", { method: "POST" }, MOCK_ENV);

    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(authChallenge("/mcp2"));
    expect(await res.json()).toEqual({
      error: "invalid_token",
      error_description: "Missing or invalid access token",
    });
  });

  test("POST /mcp2/ returns the same auth error and /mcp2 challenge when unauthenticated", async () => {
    const res = await app.request("/mcp2/", { method: "POST" }, MOCK_ENV);

    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(authChallenge("/mcp2"));
    expect(await res.json()).toEqual({
      error: "invalid_token",
      error_description: "Missing or invalid access token",
    });
  });

  test("GET /.well-known/oauth-protected-resource/mcp returns protected resource metadata", async () => {
    const res = await app.request("/.well-known/oauth-protected-resource/mcp", {}, MOCK_ENV);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expectedProtectedResourceMetadata("/mcp"));
  });

  test("GET /.well-known/oauth-protected-resource/mcp2 returns protected resource metadata for /mcp2", async () => {
    const res = await app.request("/.well-known/oauth-protected-resource/mcp2", {}, MOCK_ENV);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expectedProtectedResourceMetadata("/mcp2"));
  });
});
