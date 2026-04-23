import { describe, expect, test } from "vitest";
import {
  authenticateMcpConnectorToken,
  buildClaudeMcpUrl,
  createMcpConnectorToken,
  listMcpConnectorTokens,
  revokeMcpConnectorToken,
} from "../../server/lib/mcp-connector-tokens.ts";
import { hashToken } from "../../server/mcp/context.ts";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { MOCK_ENV, MOCK_TOKEN_ID, MOCK_USER_ID } from "../helpers/mock-env.ts";

describe("buildClaudeMcpUrl", () => {
  test("builds the Claude MCP path under PUBLIC_APP_URL", () => {
    expect(buildClaudeMcpUrl(MOCK_ENV, "abc123")).toBe(`${MOCK_ENV.PUBLIC_APP_URL}/mcp/claude/abc123`);
  });
});

describe("createMcpConnectorToken", () => {
  test("returns a raw token and stores only token_hash", async () => {
    const mock = createMockSupabase({
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

    const result = await createMcpConnectorToken(mock.client, MOCK_ENV, MOCK_USER_ID, "Claude Desktop");

    expect(result.rawToken).toMatch(/^[0-9a-f]{64}$/);
    expect(result.connectorUrl).toBe(`${MOCK_ENV.PUBLIC_APP_URL}/mcp/claude/${result.rawToken}`);
    expect(result.token).toEqual({
      id: MOCK_TOKEN_ID,
      name: "Claude Desktop",
      lastUsedAt: null,
      revokedAt: null,
      createdAt: "2026-04-23T10:00:00.000Z",
    });

    const insertCall = mock.calls.find((call) => call.table === "mcp_connector_tokens" && call.operation === "insert");
    expect(insertCall).toBeDefined();

    const payload = insertCall!.args[0] as Record<string, unknown>;
    expect(payload.user_id).toBe(MOCK_USER_ID);
    expect(payload.name).toBe("Claude Desktop");
    expect(payload.token_hash).toBe(await hashToken(result.rawToken));
    expect(String(payload.token_hash)).not.toBe(result.rawToken);
  });
});

describe("listMcpConnectorTokens", () => {
  test("maps stored connector tokens to API-friendly camelCase fields", async () => {
    const mock = createMockSupabase({
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
    });

    await expect(listMcpConnectorTokens(mock.client, MOCK_USER_ID)).resolves.toEqual([
      {
        id: MOCK_TOKEN_ID,
        name: "Claude Desktop",
        lastUsedAt: "2026-04-23T15:00:00.000Z",
        revokedAt: null,
        createdAt: "2026-04-23T10:00:00.000Z",
      },
    ]);
  });
});

describe("revokeMcpConnectorToken", () => {
  test("token not found → throws NOT_FOUND", async () => {
    const mock = createMockSupabase({
      tables: {
        mcp_connector_tokens: {
          update: {
            data: null,
            error: null,
          },
        },
      },
    });

    await expect(revokeMcpConnectorToken(mock.client, MOCK_USER_ID, MOCK_TOKEN_ID)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("authenticateMcpConnectorToken", () => {
  test("valid token → returns user id and updates last_used_at", async () => {
    const rawToken = "a".repeat(64);
    const mock = createMockSupabase({
      tables: {
        mcp_connector_tokens: {
          select: {
            data: {
              id: MOCK_TOKEN_ID,
              user_id: MOCK_USER_ID,
            },
            error: null,
          },
          update: {
            data: null,
            error: null,
          },
        },
      },
    });

    await expect(authenticateMcpConnectorToken(mock.client, rawToken)).resolves.toBe(MOCK_USER_ID);

    const selectCall = mock.calls.find((call) => call.table === "mcp_connector_tokens" && call.operation === "select");
    expect(selectCall).toBeDefined();
    expect(JSON.stringify(selectCall!.args)).not.toContain(rawToken);
    expect(await hashToken(rawToken)).toMatch(/^[0-9a-f]{64}$/);

    const updateCall = mock.calls.find((call) => call.table === "mcp_connector_tokens" && call.operation === "update");
    expect(updateCall).toBeDefined();
    expect(updateCall!.args[0]).toMatchObject({ last_used_at: expect.any(String) });
  });

  test("missing token row → throws AUTH_ERROR", async () => {
    const mock = createMockSupabase({
      tables: {
        mcp_connector_tokens: {
          select: {
            data: null,
            error: null,
          },
        },
      },
    });

    await expect(authenticateMcpConnectorToken(mock.client, "missing-token")).rejects.toMatchObject({ code: "AUTH_ERROR" });
  });
});
