import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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
    authorization_servers: [MOCK_ENV.PUBLIC_APP_URL],
    bearer_methods_supported: ["header"],
    resource_name: "Workout Planner MCP",
  };
}

const upstreamMetadata = {
  issuer: `${MOCK_ENV.VITE_SUPABASE_URL}/auth/v1`,
  authorization_endpoint: `${MOCK_ENV.VITE_SUPABASE_URL}/auth/v1/oauth/authorize`,
  token_endpoint: `${MOCK_ENV.VITE_SUPABASE_URL}/auth/v1/oauth/token`,
  registration_endpoint: `${MOCK_ENV.VITE_SUPABASE_URL}/auth/v1/oauth/clients/register`,
  jwks_uri: `${MOCK_ENV.VITE_SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
  code_challenge_methods_supported: ["S256", "plain"],
};

describe("MCP route registration", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

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

  test("GET /.well-known/oauth-authorization-server rewrites discovery metadata to same-origin endpoints", async () => {
    globalThis.fetch = vi.fn(async (input) => {
      expect(String(input)).toBe(`${MOCK_ENV.VITE_SUPABASE_URL}/.well-known/oauth-authorization-server/auth/v1`);
      return new Response(JSON.stringify(upstreamMetadata), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof globalThis.fetch;

    const res = await app.request("/.well-known/oauth-authorization-server", {}, MOCK_ENV);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ...upstreamMetadata,
      issuer: MOCK_ENV.PUBLIC_APP_URL,
      authorization_endpoint: `${MOCK_ENV.PUBLIC_APP_URL}/authorize`,
      token_endpoint: `${MOCK_ENV.PUBLIC_APP_URL}/token`,
      registration_endpoint: `${MOCK_ENV.PUBLIC_APP_URL}/register`,
    });
  });

  test("GET /.well-known/openid-configuration returns the same rewritten metadata", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify(upstreamMetadata), { status: 200, headers: { "Content-Type": "application/json" } }),
    ) as typeof globalThis.fetch;

    const res = await app.request("/.well-known/openid-configuration", {}, MOCK_ENV);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ...upstreamMetadata,
      issuer: MOCK_ENV.PUBLIC_APP_URL,
      authorization_endpoint: `${MOCK_ENV.PUBLIC_APP_URL}/authorize`,
      token_endpoint: `${MOCK_ENV.PUBLIC_APP_URL}/token`,
      registration_endpoint: `${MOCK_ENV.PUBLIC_APP_URL}/register`,
    });
  });

  test("GET /authorize redirects to Supabase authorize with the original query string", async () => {
    const res = await app.request("/authorize?response_type=code&client_id=claude&redirect_uri=https%3A%2F%2Fclaude.ai%2Fcallback&state=test-state", {}, MOCK_ENV);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      `${MOCK_ENV.VITE_SUPABASE_URL}/auth/v1/oauth/authorize?response_type=code&client_id=claude&redirect_uri=https%3A%2F%2Fclaude.ai%2Fcallback&state=test-state`,
    );
  });

  test("POST /register proxies the request body to Supabase registration", async () => {
    const fetchMock = vi.fn(async (_input, init) => {
      expect(init?.method).toBe("POST");
      expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe('{"client_name":"Claude"}');
      return new Response(JSON.stringify({ client_id: "client-123" }), { status: 201, headers: { "Content-Type": "application/json" } });
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const res = await app.request(
      "/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ client_name: "Claude" }),
      },
      MOCK_ENV,
    );

    expect(fetchMock).toHaveBeenCalledWith(`${MOCK_ENV.VITE_SUPABASE_URL}/auth/v1/oauth/clients/register`, expect.objectContaining({ method: "POST" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ client_id: "client-123" });
  });

  test("POST /token proxies the request body to Supabase token", async () => {
    const fetchMock = vi.fn(async (_input, init) => {
      expect(init?.method).toBe("POST");
      expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe("grant_type=authorization_code&code=test-code");
      return new Response(JSON.stringify({ access_token: "access-123" }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const res = await app.request(
      "/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: "grant_type=authorization_code&code=test-code",
      },
      MOCK_ENV,
    );

    expect(fetchMock).toHaveBeenCalledWith(`${MOCK_ENV.VITE_SUPABASE_URL}/auth/v1/oauth/token`, expect.objectContaining({ method: "POST" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ access_token: "access-123" });
  });
});
