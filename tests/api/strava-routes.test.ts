import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

// Mock strava lib before other imports so vi.mock hoisting works
vi.mock("../../server/lib/strava.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../server/lib/strava.ts")>();
  return {
    ...original,
    stravaFetch: vi.fn(async () => []),
    upsertStravaActivity: vi.fn(async (_sb: unknown, _uid: string, _activity: unknown) => ({
      id: "activity-1",
      sport: "run",
      date: "2024-01-01T00:00:00Z",
      timezone: null,
    })),
    autoMatchActivityToWorkout: vi.fn(async () => null),
    getValidStravaAccessToken: vi.fn(async () => "mock-access-token"),
  };
});

vi.mock("../../server/lib/stream-tokens.ts", () => ({
  generateStreamToken: vi.fn(async () => "mock-stream-token"),
  consumeStreamToken: vi.fn(async () => MOCK_USER_ID),
}));

import app from "../../server/index.ts";
import { MOCK_ENV, MOCK_USER_ID } from "../helpers/mock-env.ts";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { setMockSupabase, clearMockSupabase } from "../helpers/setup.ts";
import { stravaFetch, upsertStravaActivity, autoMatchActivityToWorkout } from "../../server/lib/strava.ts";
import { consumeStreamToken } from "../../server/lib/stream-tokens.ts";

type TableConfig = Parameters<typeof createMockSupabase>[0]["tables"];

function makeAuthMock(tableOverrides: TableConfig = {}) {
  return createMockSupabase({
    auth: {
      getUser: { data: { user: { id: MOCK_USER_ID } }, error: null },
    },
    tables: tableOverrides,
  });
}

const AUTH_HEADER = { Authorization: "Bearer valid-jwt" };

// ─── GET /api/strava/profile ────────────────────────────────────────────────

describe("GET /api/strava/profile", () => {
  afterEach(() => {
    clearMockSupabase();
    vi.clearAllMocks();
  });

  test("401 without auth", async () => {
    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request("/api/strava/profile", {}, MOCK_ENV);
    expect(res.status).toBe(401);
  });

  test("200 returns profile with stravaConnected: true when strava_athlete_id is set", async () => {
    const profile = { id: MOCK_USER_ID, strava_athlete_id: 12345, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" };
    const mock = makeAuthMock({
      profiles: { select: { data: profile, error: null } },
      plans: { select: { data: null, error: null } },
    });
    setMockSupabase(mock);

    const res = await app.request("/api/strava/profile", { headers: AUTH_HEADER }, MOCK_ENV);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stravaConnected).toBe(true);
    expect(body.profile).toEqual(profile);
  });

  test("200 returns stravaConnected: false when strava_athlete_id is null", async () => {
    const profile = { id: MOCK_USER_ID, strava_athlete_id: null, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" };
    const mock = makeAuthMock({
      profiles: { select: { data: profile, error: null } },
      plans: { select: { data: null, error: null } },
    });
    setMockSupabase(mock);

    const res = await app.request("/api/strava/profile", { headers: AUTH_HEADER }, MOCK_ENV);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stravaConnected).toBe(false);
  });

  test("200 returns activePlan when an active plan exists", async () => {
    const profile = { id: MOCK_USER_ID, strava_athlete_id: null, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" };
    const activePlan = { id: "plan-1", name: "My Plan", status: "active", start_date: "2024-01-01", end_date: "2024-04-01" };
    const mock = makeAuthMock({
      profiles: { select: { data: profile, error: null } },
      plans: { select: { data: activePlan, error: null } },
    });
    setMockSupabase(mock);

    const res = await app.request("/api/strava/profile", { headers: AUTH_HEADER }, MOCK_ENV);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activePlan).toEqual(activePlan);
  });

  test("200 returns activePlan: null when no active plan", async () => {
    const profile = { id: MOCK_USER_ID, strava_athlete_id: null, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" };
    const mock = makeAuthMock({
      profiles: { select: { data: profile, error: null } },
      plans: { select: { data: null, error: null } },
    });
    setMockSupabase(mock);

    const res = await app.request("/api/strava/profile", { headers: AUTH_HEADER }, MOCK_ENV);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activePlan).toBeNull();
  });

  test("500 when profile query errors", async () => {
    const mock = makeAuthMock({
      profiles: { select: { data: null, error: { message: "DB connection failed" } } },
      plans: { select: { data: null, error: null } },
    });
    setMockSupabase(mock);

    const res = await app.request("/api/strava/profile", { headers: AUTH_HEADER }, MOCK_ENV);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("INTERNAL_ERROR");
  });

  test("500 when profile not found (null)", async () => {
    const mock = makeAuthMock({
      profiles: { select: { data: null, error: null } },
      plans: { select: { data: null, error: null } },
    });
    setMockSupabase(mock);

    const res = await app.request("/api/strava/profile", { headers: AUTH_HEADER }, MOCK_ENV);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("INTERNAL_ERROR");
  });
});

// ─── POST /api/strava/disconnect ────────────────────────────────────────────

describe("POST /api/strava/disconnect", () => {
  afterEach(() => {
    clearMockSupabase();
    vi.clearAllMocks();
  });

  test("401 without auth", async () => {
    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request("/api/strava/disconnect", { method: "POST" }, MOCK_ENV);
    expect(res.status).toBe(401);
  });

  test("200 returns { ok: true } on success", async () => {
    const mock = makeAuthMock({
      strava_credentials: { delete: { data: null, error: null } },
      profiles: { update: { data: null, error: null } },
    });
    setMockSupabase(mock);

    const res = await app.request("/api/strava/disconnect", { method: "POST", headers: AUTH_HEADER }, MOCK_ENV);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("500 when credentials delete fails", async () => {
    const mock = makeAuthMock({
      strava_credentials: { delete: { data: null, error: { message: "Delete failed" } } },
      profiles: { update: { data: null, error: null } },
    });
    setMockSupabase(mock);

    const res = await app.request("/api/strava/disconnect", { method: "POST", headers: AUTH_HEADER }, MOCK_ENV);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("INTERNAL_ERROR");
  });

  test("500 when profile update fails", async () => {
    const mock = makeAuthMock({
      strava_credentials: { delete: { data: null, error: null } },
      profiles: { update: { data: null, error: { message: "Update failed" } } },
    });
    setMockSupabase(mock);

    const res = await app.request("/api/strava/disconnect", { method: "POST", headers: AUTH_HEADER }, MOCK_ENV);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("INTERNAL_ERROR");
  });
});

// ─── POST /api/strava/sync ──────────────────────────────────────────────────

describe("POST /api/strava/sync", () => {
  afterEach(() => {
    clearMockSupabase();
    vi.clearAllMocks();
  });

  test("401 without auth", async () => {
    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request(
      "/api/strava/sync",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(401);
  });

  test("200 with default days, returns { ok: true, synced: 0, matchedWorkouts: 0 } when no activities", async () => {
    vi.mocked(stravaFetch).mockResolvedValueOnce([] as unknown[]);

    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request(
      "/api/strava/sync",
      {
        method: "POST",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.synced).toBe(0);
    expect(body.matchedWorkouts).toBe(0);
  });

  test("200 syncs activities, upsertStravaActivity called once per activity", async () => {
    const activities = [
      { id: 1001, sport_type: "Run" },
      { id: 1002, sport_type: "Run" },
    ];
    vi.mocked(stravaFetch)
      .mockResolvedValueOnce(activities as unknown[])
      .mockResolvedValueOnce([] as unknown[]);

    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request(
      "/api/strava/sync",
      {
        method: "POST",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify({ days: 7 }),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.synced).toBe(2);
    expect(upsertStravaActivity).toHaveBeenCalledTimes(2);
  });

  test("200 counts matchedWorkouts when autoMatchActivityToWorkout returns a workout", async () => {
    const activities = [{ id: 1001, sport_type: "Run" }];
    vi.mocked(stravaFetch)
      .mockReset()
      .mockResolvedValueOnce(activities as unknown[])
      .mockResolvedValueOnce([] as unknown[]);
    vi.mocked(autoMatchActivityToWorkout)
      .mockReset()
      .mockResolvedValueOnce({ id: "workout-matched-1" } as Record<string, unknown>);
    vi.mocked(upsertStravaActivity)
      .mockReset()
      .mockResolvedValue({
        id: "activity-1",
        sport: "run",
        date: "2024-01-01T00:00:00Z",
        timezone: null,
      } as Record<string, unknown>);

    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request(
      "/api/strava/sync",
      {
        method: "POST",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.synced).toBe(1);
    expect(body.matchedWorkouts).toBe(1);
  });

  test("200 with 0 synced when stravaFetch immediately returns empty array", async () => {
    vi.mocked(stravaFetch)
      .mockReset()
      .mockResolvedValue([] as unknown[]);
    vi.mocked(upsertStravaActivity).mockReset();

    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request(
      "/api/strava/sync",
      {
        method: "POST",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify({ days: 30 }),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.synced).toBe(0);
    expect(body.matchedWorkouts).toBe(0);
    expect(upsertStravaActivity).not.toHaveBeenCalled();
  });
});

// ─── GET /api/strava/streams/:stravaActivityId ───────────────────────────────

describe("GET /api/strava/streams/:stravaActivityId", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearMockSupabase();
    vi.clearAllMocks();
  });

  test("401 when no token query param", async () => {
    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request("/api/strava/streams/12345", {}, MOCK_ENV);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("AUTH_ERROR");
  });

  test("401 when stravaActivityId is not a number", async () => {
    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request("/api/strava/streams/not-a-number?token=sometoken", {}, MOCK_ENV);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("AUTH_ERROR");
  });

  test("200 returns stream data on success", async () => {
    const streamData = [{ type: "time", data: [0, 1, 2] }];
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(streamData), { status: 200 })) as typeof globalThis.fetch;

    vi.mocked(consumeStreamToken).mockResolvedValueOnce(MOCK_USER_ID);

    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request("/api/strava/streams/12345?token=mock-stream-token", {}, MOCK_ENV);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(streamData);
  });

  test("401 when consumeStreamToken throws AUTH_ERROR", async () => {
    const { AppError } = await import("../../server/mcp/context.ts");
    vi.mocked(consumeStreamToken).mockRejectedValueOnce(new AppError("AUTH_ERROR", "Invalid or expired stream token"));

    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request("/api/strava/streams/12345?token=bad-token", {}, MOCK_ENV);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("AUTH_ERROR");
  });

  test("500 when strava API returns non-ok response", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 })) as typeof globalThis.fetch;

    vi.mocked(consumeStreamToken).mockResolvedValueOnce(MOCK_USER_ID);

    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request("/api/strava/streams/12345?token=valid", {}, MOCK_ENV);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("INTERNAL_ERROR");
  });
});

// ─── GET /api/strava/auth ─────────────────────────────────────────────────────

describe("GET /api/strava/auth", () => {
  afterEach(() => {
    clearMockSupabase();
    vi.clearAllMocks();
  });

  test("401 without auth", async () => {
    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request("/api/strava/auth", {}, MOCK_ENV);
    expect(res.status).toBe(401);
  });

  test("returns JSON with Strava OAuth URL", async () => {
    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request("/api/strava/auth", { headers: AUTH_HEADER }, MOCK_ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toContain("strava.com/oauth/authorize");
    expect(body.url).toContain("client_id=mock-strava-id");
    expect(body.url).toContain("scope=activity%3Aread_all");
  });

  test("includes callback in state param", async () => {
    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request("/api/strava/auth?callback=/dashboard/plan", { headers: AUTH_HEADER }, MOCK_ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    const url = new URL(body.url);
    const state = url.searchParams.get("state")!;
    const [, encodedCallback] = state.split(":");
    expect(decodeURIComponent(encodedCallback)).toBe("/dashboard/plan");
  });

  test("sanitizes dangerous callback paths", async () => {
    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request("/api/strava/auth?callback=//evil.com/steal", { headers: AUTH_HEADER }, MOCK_ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    const url = new URL(body.url);
    const state = url.searchParams.get("state")!;
    const [, encodedCallback] = state.split(":");
    expect(decodeURIComponent(encodedCallback)).toBe("/settings?strava=connected");
  });

  test("sanitizes /api/ callback paths", async () => {
    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request("/api/strava/auth?callback=/api/tokens", { headers: AUTH_HEADER }, MOCK_ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    const url = new URL(body.url);
    const state = url.searchParams.get("state")!;
    const [, encodedCallback] = state.split(":");
    expect(decodeURIComponent(encodedCallback)).toBe("/settings?strava=connected");
  });

  test("sanitizes /mcp callback path", async () => {
    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request("/api/strava/auth?callback=/mcp", { headers: AUTH_HEADER }, MOCK_ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    const url = new URL(body.url);
    const state = url.searchParams.get("state")!;
    const [, encodedCallback] = state.split(":");
    expect(decodeURIComponent(encodedCallback)).toBe("/settings?strava=connected");
  });

  test("sanitizes non-path callback", async () => {
    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request("/api/strava/auth?callback=https://evil.com", { headers: AUTH_HEADER }, MOCK_ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    const url = new URL(body.url);
    const state = url.searchParams.get("state")!;
    const [, encodedCallback] = state.split(":");
    expect(decodeURIComponent(encodedCallback)).toBe("/settings?strava=connected");
  });
});

// ─── GET /api/strava/callback ─────────────────────────────────────────────────

describe("GET /api/strava/callback", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearMockSupabase();
    vi.clearAllMocks();
  });

  test("redirects to error page when missing parameters", async () => {
    const mock = makeAuthMock();
    setMockSupabase(mock);

    // No code, no state, no cookie
    const res = await app.request("/api/strava/callback", {}, MOCK_ENV);
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toContain("strava=error");
  });

  test("redirects to error when cookie state is invalid JSON", async () => {
    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request("/api/strava/callback?state=abc123&code=mock-code", { headers: { Cookie: "strava_oauth_state=not-json" } }, MOCK_ENV);
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toContain("strava=error");
  });

  test("redirects to error when state doesn't match", async () => {
    const mock = makeAuthMock();
    setMockSupabase(mock);

    const cookie = JSON.stringify({ state: "correct-state", userId: MOCK_USER_ID });
    const res = await app.request("/api/strava/callback?state=wrong-state&code=mock-code", { headers: { Cookie: `strava_oauth_state=${cookie}` } }, MOCK_ENV);
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toContain("strava=error");
  });

  test("redirects to error when Strava token exchange fails", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })) as typeof globalThis.fetch;

    const mock = makeAuthMock();
    setMockSupabase(mock);

    const state = "valid-state";
    const cookie = JSON.stringify({ state, userId: MOCK_USER_ID });
    const res = await app.request(`/api/strava/callback?state=${state}&code=mock-code`, { headers: { Cookie: `strava_oauth_state=${cookie}` } }, MOCK_ENV);
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toContain("strava=error");
  });

  test("302 redirects to success page on valid callback", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "strava-access",
            refresh_token: "strava-refresh",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            athlete: { id: 99999 },
          }),
          { status: 200 },
        ),
    ) as typeof globalThis.fetch;

    const mock = makeAuthMock({
      strava_credentials: { upsert: { data: null, error: null } },
      profiles: { update: { data: null, error: null } },
    });
    setMockSupabase(mock);

    const state = "valid-state";
    const callback = "/dashboard/plan";
    const cookieValue = encodeURIComponent(JSON.stringify({ state, userId: MOCK_USER_ID }));
    const res = await app.request(
      `/api/strava/callback?state=${state}:${encodeURIComponent(callback)}&code=mock-code`,
      { headers: { Cookie: `strava_oauth_state=${cookieValue}` } },
      MOCK_ENV,
    );
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toContain("/dashboard/plan");
    expect(location).toContain("strava=connected");
  });

  test("redirects to error when credential upsert fails", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "strava-access",
            refresh_token: "strava-refresh",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            athlete: { id: 99999 },
          }),
          { status: 200 },
        ),
    ) as typeof globalThis.fetch;

    const mock = makeAuthMock({
      strava_credentials: { upsert: { data: null, error: { message: "Upsert failed" } } },
      profiles: { update: { data: null, error: null } },
    });
    setMockSupabase(mock);

    const state = "valid-state";
    const cookie = JSON.stringify({ state, userId: MOCK_USER_ID });
    const res = await app.request(`/api/strava/callback?state=${state}&code=mock-code`, { headers: { Cookie: `strava_oauth_state=${cookie}` } }, MOCK_ENV);
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toContain("strava=error");
  });

  test("redirects to error when profile update fails", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "strava-access",
            refresh_token: "strava-refresh",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            athlete: { id: 99999 },
          }),
          { status: 200 },
        ),
    ) as typeof globalThis.fetch;

    const mock = makeAuthMock({
      strava_credentials: { upsert: { data: null, error: null } },
      profiles: { update: { data: null, error: { message: "Profile update failed" } } },
    });
    setMockSupabase(mock);

    const state = "valid-state";
    const cookie = JSON.stringify({ state, userId: MOCK_USER_ID });
    const res = await app.request(`/api/strava/callback?state=${state}&code=mock-code`, { headers: { Cookie: `strava_oauth_state=${cookie}` } }, MOCK_ENV);
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toContain("strava=error");
  });
});
