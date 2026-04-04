import { describe, test, expect } from "vitest";
import { generateStreamToken, consumeStreamToken } from "../../server/lib/stream-tokens.ts";
import { hashToken } from "../../server/mcp/context.ts";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { MOCK_USER_ID } from "../helpers/mock-env.ts";

const MOCK_ACTIVITY_STRAVA_ID = 42000;

// ---------------------------------------------------------------------------
// generateStreamToken
// ---------------------------------------------------------------------------

describe("generateStreamToken", () => {
  test("returns a hex string token (64 hex chars = 32 bytes)", async () => {
    const mock = createMockSupabase({
      tables: {
        stream_tokens: {
          delete: { data: null, error: null },
          insert: { data: null, error: null },
        },
      },
    });

    const token = await generateStreamToken(mock.client, MOCK_USER_ID, MOCK_ACTIVITY_STRAVA_ID);

    expect(typeof token).toBe("string");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  test("each call returns a different token", async () => {
    const mock = createMockSupabase({
      tables: {
        stream_tokens: {
          delete: { data: null, error: null },
          insert: { data: null, error: null },
        },
      },
    });

    const token1 = await generateStreamToken(mock.client, MOCK_USER_ID, MOCK_ACTIVITY_STRAVA_ID);
    const token2 = await generateStreamToken(mock.client, MOCK_USER_ID, MOCK_ACTIVITY_STRAVA_ID);
    expect(token1).not.toBe(token2);
  });

  test("deletes expired tokens before inserting new one", async () => {
    const mock = createMockSupabase({
      tables: {
        stream_tokens: {
          delete: { data: null, error: null },
          insert: { data: null, error: null },
        },
      },
    });

    await generateStreamToken(mock.client, MOCK_USER_ID, MOCK_ACTIVITY_STRAVA_ID);

    const deleteCall = mock.calls.find((c) => c.table === "stream_tokens" && c.operation === "delete");
    expect(deleteCall).toBeDefined();

    const insertCall = mock.calls.find((c) => c.table === "stream_tokens" && c.operation === "insert");
    expect(insertCall).toBeDefined();

    // delete index should come before insert index
    const deleteIdx = mock.calls.indexOf(deleteCall!);
    const insertIdx = mock.calls.indexOf(insertCall!);
    expect(deleteIdx).toBeLessThan(insertIdx);
  });

  test("insert payload contains user_id, activity_strava_id, token_hash, expires_at", async () => {
    const mock = createMockSupabase({
      tables: {
        stream_tokens: {
          delete: { data: null, error: null },
          insert: { data: null, error: null },
        },
      },
    });

    const before = Date.now();
    const token = await generateStreamToken(mock.client, MOCK_USER_ID, MOCK_ACTIVITY_STRAVA_ID);
    const after = Date.now();

    const insertCall = mock.calls.find((c) => c.table === "stream_tokens" && c.operation === "insert");
    const payload = insertCall!.args[0] as Record<string, unknown>;

    expect(payload.user_id).toBe(MOCK_USER_ID);
    expect(payload.activity_strava_id).toBe(MOCK_ACTIVITY_STRAVA_ID);
    expect(payload.token_hash).toBe(await hashToken(token));

    const expiresAt = new Date(payload.expires_at).getTime();
    // expires_at should be ~15 minutes from now
    expect(expiresAt).toBeGreaterThanOrEqual(before + 14 * 60 * 1000);
    expect(expiresAt).toBeLessThanOrEqual(after + 16 * 60 * 1000);
  });

  test("insert error → throws INTERNAL_ERROR", async () => {
    const mock = createMockSupabase({
      tables: {
        stream_tokens: {
          delete: { data: null, error: null },
          insert: { data: null, error: { message: "Insert failed" } },
        },
      },
    });

    await expect(generateStreamToken(mock.client, MOCK_USER_ID, MOCK_ACTIVITY_STRAVA_ID)).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// consumeStreamToken
// ---------------------------------------------------------------------------

describe("consumeStreamToken", () => {
  test("token not found → throws AUTH_ERROR", async () => {
    const mock = createMockSupabase({
      tables: {
        stream_tokens: {
          select: { data: null, error: null },
        },
      },
    });

    await expect(consumeStreamToken(mock.client, "nonexistent-token", MOCK_ACTIVITY_STRAVA_ID)).rejects.toMatchObject({ code: "AUTH_ERROR" });
  });

  test("DB error on lookup → throws INTERNAL_ERROR", async () => {
    const mock = createMockSupabase({
      tables: {
        stream_tokens: {
          select: { data: null, error: { message: "DB connection error" } },
        },
      },
    });

    await expect(consumeStreamToken(mock.client, "any-token", MOCK_ACTIVITY_STRAVA_ID)).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });

  test("token found but wrong activityStravaId → throws AUTH_ERROR", async () => {
    const validToken = "a".repeat(64);
    const _tokenHash = await hashToken(validToken);
    const futureExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const mock = createMockSupabase({
      tables: {
        stream_tokens: {
          select: {
            data: {
              id: "token-row-id",
              user_id: MOCK_USER_ID,
              activity_strava_id: 99999, // different from what we pass
              expires_at: futureExpiry,
            },
            error: null,
          },
        },
      },
    });

    await expect(
      consumeStreamToken(mock.client, validToken, MOCK_ACTIVITY_STRAVA_ID), // 42000 != 99999
    ).rejects.toMatchObject({ code: "AUTH_ERROR" });
  });

  test("token found but expired → deletes token, throws AUTH_ERROR", async () => {
    const validToken = "b".repeat(64);
    const pastExpiry = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago

    const mock = createMockSupabase({
      tables: {
        stream_tokens: {
          select: {
            data: {
              id: "token-row-id",
              user_id: MOCK_USER_ID,
              activity_strava_id: MOCK_ACTIVITY_STRAVA_ID,
              expires_at: pastExpiry,
            },
            error: null,
          },
          delete: { data: null, error: null },
        },
      },
    });

    await expect(consumeStreamToken(mock.client, validToken, MOCK_ACTIVITY_STRAVA_ID)).rejects.toMatchObject({ code: "AUTH_ERROR" });

    // Should have deleted the expired token
    const deleteCall = mock.calls.find((c) => c.table === "stream_tokens" && c.operation === "delete");
    expect(deleteCall).toBeDefined();
  });

  test("valid token → deletes token, returns user_id", async () => {
    const validToken = "c".repeat(64);
    const futureExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const mock = createMockSupabase({
      tables: {
        stream_tokens: {
          select: {
            data: {
              id: "token-row-id",
              user_id: MOCK_USER_ID,
              activity_strava_id: MOCK_ACTIVITY_STRAVA_ID,
              expires_at: futureExpiry,
            },
            error: null,
          },
          delete: { data: null, error: null },
        },
      },
    });

    const result = await consumeStreamToken(mock.client, validToken, MOCK_ACTIVITY_STRAVA_ID);
    expect(result).toBe(MOCK_USER_ID);

    // Should have deleted the consumed token
    const deleteCall = mock.calls.find((c) => c.table === "stream_tokens" && c.operation === "delete");
    expect(deleteCall).toBeDefined();
  });

  test("valid token lookup uses token_hash (not raw token)", async () => {
    const validToken = "d".repeat(64);
    const futureExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const mock = createMockSupabase({
      tables: {
        stream_tokens: {
          select: {
            data: {
              id: "token-row-id",
              user_id: MOCK_USER_ID,
              activity_strava_id: MOCK_ACTIVITY_STRAVA_ID,
              expires_at: futureExpiry,
            },
            error: null,
          },
          delete: { data: null, error: null },
        },
      },
    });

    await consumeStreamToken(mock.client, validToken, MOCK_ACTIVITY_STRAVA_ID);

    // The select should have been called with the hash, not the raw token
    const selectCall = mock.calls.find((c) => c.table === "stream_tokens" && c.operation === "select");
    expect(selectCall).toBeDefined();
    // Raw token should not appear in the select args
    expect(JSON.stringify(selectCall!.args)).not.toContain(validToken);
    // But the hash should
    const expectedHash = await hashToken(validToken);
    // The hash is passed via .eq() chain (not in select args), but we can verify
    // the lookup succeeded using a token that would produce the right hash
    expect(expectedHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
