import { afterEach, describe, expect, test } from "vitest";
import app from "../../server/index.ts";
import { hashToken } from "../../server/mcp/context.ts";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { MOCK_ENV, MOCK_TOKEN_ID, MOCK_USER_ID } from "../helpers/mock-env.ts";
import { clearMockSupabase, setMockSupabase } from "../helpers/setup.ts";

function authHeaders(token = "valid-session-jwt") {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

describe("MCP connector token routes", () => {
  afterEach(() => {
    clearMockSupabase();
  });

  test("GET /api/mcp/connector-tokens → 401 when Authorization header is missing", async () => {
    const response = await app.request("/api/mcp/connector-tokens", {}, MOCK_ENV);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      code: "AUTH_ERROR",
      message: "Missing bearer token",
    });
  });

  test("GET /api/mcp/connector-tokens lists connector tokens for the authenticated user", async () => {
    setMockSupabase(
      createMockSupabase({
        auth: {
          getUser: { data: { user: { id: MOCK_USER_ID } }, error: null },
        },
        tables: {
          mcp_connector_tokens: {
            select: {
              data: [
                {
                  id: MOCK_TOKEN_ID,
                  user_id: MOCK_USER_ID,
                  name: "Claude Desktop",
                  last_used_at: "2026-04-23T15:00:00.000Z",
                  revoked_at: null,
                  created_at: "2026-04-23T10:00:00.000Z",
                },
              ],
              error: null,
            },
          },
        },
      }),
    );

    const response = await app.request("/api/mcp/connector-tokens", { headers: authHeaders() }, MOCK_ENV);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      tokens: [
        {
          id: MOCK_TOKEN_ID,
          name: "Claude Desktop",
          lastUsedAt: "2026-04-23T15:00:00.000Z",
          revokedAt: null,
          createdAt: "2026-04-23T10:00:00.000Z",
        },
      ],
    });
  });

  test("POST /api/mcp/connector-tokens returns raw token once and stores only token_hash", async () => {
    const mock = createMockSupabase({
      auth: {
        getUser: { data: { user: { id: MOCK_USER_ID } }, error: null },
      },
      tables: {
        mcp_connector_tokens: {
          insert: {
            data: {
              id: MOCK_TOKEN_ID,
              user_id: MOCK_USER_ID,
              name: "Claude Desktop",
              last_used_at: null,
              revoked_at: null,
              created_at: "2026-04-23T10:00:00.000Z",
            },
            error: null,
          },
        },
      },
    });

    setMockSupabase(mock);

    const response = await app.request(
      "/api/mcp/connector-tokens",
      {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name: "Claude Desktop" }),
      },
      MOCK_ENV,
    );

    expect(response.status).toBe(201);

    const body = (await response.json()) as {
      token: { id: string; name: string; lastUsedAt: string | null; revokedAt: string | null; createdAt: string };
      rawToken: string;
      connectorUrl: string;
    };

    expect(body.token).toEqual({
      id: MOCK_TOKEN_ID,
      name: "Claude Desktop",
      lastUsedAt: null,
      revokedAt: null,
      createdAt: "2026-04-23T10:00:00.000Z",
    });
    expect(body.rawToken).toMatch(/^[0-9a-f]{64}$/);
    expect(body.connectorUrl).toBe(`${MOCK_ENV.PUBLIC_APP_URL}/mcp/claude/${body.rawToken}`);

    const insertCall = mock.calls.find((call) => call.table === "mcp_connector_tokens" && call.operation === "insert");
    expect(insertCall).toBeDefined();

    const payload = insertCall!.args[0] as Record<string, unknown>;
    expect(payload.user_id).toBe(MOCK_USER_ID);
    expect(payload.name).toBe("Claude Desktop");
    expect(payload.token_hash).toBe(await hashToken(body.rawToken));
    expect(String(payload.token_hash)).not.toBe(body.rawToken);
  });

  test("DELETE /api/mcp/connector-tokens/:id revokes the token", async () => {
    setMockSupabase(
      createMockSupabase({
        auth: {
          getUser: { data: { user: { id: MOCK_USER_ID } }, error: null },
        },
        tables: {
          mcp_connector_tokens: {
            update: {
              data: {
                id: MOCK_TOKEN_ID,
                user_id: MOCK_USER_ID,
                name: "Claude Desktop",
                last_used_at: null,
                revoked_at: "2026-04-23T16:00:00.000Z",
                created_at: "2026-04-23T10:00:00.000Z",
              },
              error: null,
            },
          },
        },
      }),
    );

    const response = await app.request(`/api/mcp/connector-tokens/${MOCK_TOKEN_ID}`, { method: "DELETE", headers: authHeaders() }, MOCK_ENV);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      token: {
        id: MOCK_TOKEN_ID,
        name: "Claude Desktop",
        lastUsedAt: null,
        revokedAt: "2026-04-23T16:00:00.000Z",
        createdAt: "2026-04-23T10:00:00.000Z",
      },
    });
  });
});
