import { describe, test, expect, afterEach, vi } from "vitest";
import app from "../../server/index.ts";
import { hashToken } from "../../server/mcp/context.ts";
import { MOCK_ENV, MOCK_TOKEN_ID, MOCK_USER_ID } from "../helpers/mock-env.ts";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { setMockSupabase, clearMockSupabase } from "../helpers/setup.ts";
import type { WorkoutExecution } from "../../shared/workout-execution.ts";

const RAW_TOKEN = "f".repeat(64);
const AUTH_HEADER = { Authorization: "Bearer valid-jwt" };
const WORKOUT_ID = "3f8a1c2e-0b7d-4e6a-9c11-2d4e6f8a0b12"; // valid RFC-4122 v4 uuid

const EXECUTION: WorkoutExecution = {
  version: 2,
  appleWatch: { activityType: "running", location: "outdoor" },
  structure: [{ type: "steady", displayName: "Easy", target: { type: "distance", meters: 5000 } }],
};

const TOKEN_ROW = {
  id: MOCK_TOKEN_ID,
  user_id: MOCK_USER_ID,
  name: "Bartek's Apple Watch",
  last_used_at: null,
  revoked_at: null,
  created_at: "2026-08-01T10:00:00.000Z",
};

type TableConfig = Parameters<typeof createMockSupabase>[0]["tables"];

function makeAuthMock(tables: TableConfig = {}) {
  return createMockSupabase({
    auth: { getUser: { data: { user: { id: MOCK_USER_ID } }, error: null } },
    tables,
  });
}

// Tables backing a feed request authenticated by RAW_TOKEN: the hash lookup resolves to the
// mock user, plus the last_used_at touch.
function feedTables(extra: TableConfig = {}): TableConfig {
  return {
    watch_tokens: {
      select: { data: { id: MOCK_TOKEN_ID, user_id: MOCK_USER_ID }, error: null },
      update: { data: null, error: null },
    },
    ...extra,
  };
}

afterEach(() => {
  clearMockSupabase();
  vi.clearAllMocks();
});

describe("watch token management routes", () => {
  test("GET /api/watch/tokens → 401 without auth", async () => {
    setMockSupabase(makeAuthMock());
    const res = await app.request("/api/watch/tokens", {}, MOCK_ENV);
    expect(res.status).toBe(401);
  });

  test("GET /api/watch/tokens lists the user's tokens", async () => {
    setMockSupabase(makeAuthMock({ watch_tokens: { select: { data: [TOKEN_ROW], error: null } } }));

    const res = await app.request("/api/watch/tokens", { headers: AUTH_HEADER }, MOCK_ENV);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      tokens: [
        {
          id: MOCK_TOKEN_ID,
          name: "Bartek's Apple Watch",
          lastUsedAt: null,
          revokedAt: null,
          createdAt: "2026-08-01T10:00:00.000Z",
        },
      ],
    });
  });

  test("POST /api/watch/tokens returns the raw token once and stores only its hash", async () => {
    const mock = makeAuthMock({ watch_tokens: { insert: { data: TOKEN_ROW, error: null } } });
    setMockSupabase(mock);

    const res = await app.request(
      "/api/watch/tokens",
      { method: "POST", headers: { ...AUTH_HEADER, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Bartek's Apple Watch" }) },
      MOCK_ENV,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { token: { id: string }; rawToken: string };
    expect(body.token.id).toBe(MOCK_TOKEN_ID);
    expect(body.rawToken).toMatch(/^[0-9a-f]{64}$/);

    const insertCall = mock.calls.find((call) => call.table === "watch_tokens" && call.operation === "insert");
    expect(insertCall).toBeDefined();
    const payload = insertCall!.args[0] as Record<string, unknown>;
    expect(payload.user_id).toBe(MOCK_USER_ID);
    expect(payload.name).toBe("Bartek's Apple Watch");
    expect(payload.token_hash).toBe(await hashToken(body.rawToken));
    expect(String(payload.token_hash)).not.toBe(body.rawToken);
  });

  test("POST /api/watch/tokens → 400 when the name is empty", async () => {
    setMockSupabase(makeAuthMock());

    const res = await app.request(
      "/api/watch/tokens",
      { method: "POST", headers: { ...AUTH_HEADER, "Content-Type": "application/json" }, body: JSON.stringify({ name: "" }) },
      MOCK_ENV,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  test("DELETE /api/watch/tokens/:tokenId revokes the token", async () => {
    setMockSupabase(makeAuthMock({ watch_tokens: { update: { data: { ...TOKEN_ROW, revoked_at: "2026-08-09T18:00:00.000Z" }, error: null } } }));

    const res = await app.request(`/api/watch/tokens/${MOCK_TOKEN_ID}`, { method: "DELETE", headers: AUTH_HEADER }, MOCK_ENV);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token.revokedAt).toBe("2026-08-09T18:00:00.000Z");
  });

  test("DELETE /api/watch/tokens/:tokenId → 404 when already revoked or missing", async () => {
    setMockSupabase(makeAuthMock({ watch_tokens: { update: { data: null, error: null } } }));

    const res = await app.request(`/api/watch/tokens/${MOCK_TOKEN_ID}`, { method: "DELETE", headers: AUTH_HEADER }, MOCK_ENV);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/watch/index.json", () => {
  test("401 without a token", async () => {
    setMockSupabase(makeAuthMock());
    const res = await app.request("/api/watch/index.json", {}, MOCK_ENV);
    expect(res.status).toBe(401);
  });

  test("401 when the token is unknown or revoked", async () => {
    setMockSupabase(makeAuthMock({ watch_tokens: { select: { data: null, error: null } } }));
    const res = await app.request("/api/watch/index.json?token=not-a-real-token", {}, MOCK_ENV);
    expect(res.status).toBe(401);
  });

  test("500 when touching last_used_at fails", async () => {
    setMockSupabase(
      makeAuthMock({
        watch_tokens: {
          select: { data: { id: MOCK_TOKEN_ID, user_id: MOCK_USER_ID }, error: null },
          update: { data: null, error: { message: "boom" } },
        },
      }),
    );
    const res = await app.request(`/api/watch/index.json?token=${RAW_TOKEN}`, {}, MOCK_ENV);
    expect(res.status).toBe(500);
  });

  test("200 lists upcoming workouts pointing at relative .workout files (?token=)", async () => {
    const rows = [{ id: WORKOUT_ID, title: "Easy Run", date: "2026-07-27", execution: EXECUTION }];
    setMockSupabase(makeAuthMock(feedTables({ workouts: { select: { data: rows, error: null } } })));

    const res = await app.request(`/api/watch/index.json?token=${RAW_TOKEN}`, {}, MOCK_ENV);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe(1);
    expect(body.workouts).toHaveLength(1);
    expect(body.workouts[0]).toMatchObject({
      id: WORKOUT_ID,
      url: `w/${WORKOUT_ID}.workout`,
      date: "2026-07-27T07:00:00",
      type: "workout",
      title: "Easy Run",
    });
  });

  test("200 with the token in the Authorization header", async () => {
    const rows = [{ id: WORKOUT_ID, title: "Easy Run", date: "2026-07-27", execution: EXECUTION }];
    setMockSupabase(makeAuthMock(feedTables({ workouts: { select: { data: rows, error: null } } })));

    const res = await app.request("/api/watch/index.json", { headers: { Authorization: `Bearer ${RAW_TOKEN}` } }, MOCK_ENV);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workouts).toHaveLength(1);
  });

  test("omits workouts that have no execution", async () => {
    const rows = [
      { id: WORKOUT_ID, title: "Easy Run", date: "2026-07-27", execution: EXECUTION },
      { id: "aa11bb22-cc33-4d44-8e55-ff6677889900", title: "Rest day", date: "2026-07-28", execution: null },
    ];
    setMockSupabase(makeAuthMock(feedTables({ workouts: { select: { data: rows, error: null } } })));

    const res = await app.request(`/api/watch/index.json?token=${RAW_TOKEN}`, {}, MOCK_ENV);
    const body = await res.json();
    expect(body.workouts).toHaveLength(1);
  });
});

describe("GET /api/watch/w/:file", () => {
  test("401 without a token", async () => {
    setMockSupabase(makeAuthMock());
    const res = await app.request(`/api/watch/w/${WORKOUT_ID}.workout`, {}, MOCK_ENV);
    expect(res.status).toBe(401);
  });

  test("200 returns raw .workout bytes", async () => {
    const row = { id: WORKOUT_ID, title: "Easy Run", date: "2026-07-27", execution: EXECUTION };
    setMockSupabase(makeAuthMock(feedTables({ workouts: { select: { data: row, error: null } } })));

    const res = await app.request(`/api/watch/w/${WORKOUT_ID}.workout?token=${RAW_TOKEN}`, {}, MOCK_ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/octet-stream");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  test("404 when the workout doesn't exist", async () => {
    setMockSupabase(makeAuthMock(feedTables({ workouts: { select: { data: null, error: null } } })));

    const res = await app.request(`/api/watch/w/${WORKOUT_ID}.workout?token=${RAW_TOKEN}`, {}, MOCK_ENV);
    expect(res.status).toBe(404);
  });
});
