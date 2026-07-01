import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

// Mock strava lib before other imports so vi.mock hoisting works
vi.mock("../../server/lib/strava.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../server/lib/strava.ts")>();
  return {
    ...original,
    stravaFetch: vi.fn(async () => []),
    matchAndStoreActivity: vi.fn(async () => null),
    linkActivityToWorkout: vi.fn(async (_sb: unknown, _b: unknown, _uid: string, workoutId: string) => ({ workoutId })),
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
import { stravaFetch, linkActivityToWorkout } from "../../server/lib/strava.ts";
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

// ─── GET /api/strava/recent-activities ──────────────────────────────────────

describe("GET /api/strava/recent-activities", () => {
  afterEach(() => {
    clearMockSupabase();
    vi.clearAllMocks();
  });

  test("401 without auth", async () => {
    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request("/api/strava/recent-activities", {}, MOCK_ENV);
    expect(res.status).toBe(401);
  });

  test("200 returns shaped activities with linked ones filtered out", async () => {
    vi.mocked(stravaFetch).mockResolvedValueOnce([
      { id: 1001, sport_type: "Run", name: "Easy Run", start_date: "2024-01-01T07:00:00Z", elapsed_time: 1800, distance: 5000 },
      { id: 1002, sport_type: "Ride", name: "Spin", start_date: "2024-01-02T17:00:00Z", elapsed_time: 3600, distance: 30000 },
    ] as unknown[]);

    const mock = makeAuthMock({
      workout_activities: { select: { data: [{ strava_id: 1001 }], error: null } },
    });
    setMockSupabase(mock);

    const res = await app.request("/api/strava/recent-activities", { headers: AUTH_HEADER }, MOCK_ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { activities: Array<{ stravaId: number; name: string; sport: string }> };
    expect(body.activities).toHaveLength(1);
    expect(body.activities[0]?.stravaId).toBe(1002);
    expect(body.activities[0]?.name).toBe("Spin");
  });
});

// ─── POST /api/strava/link ──────────────────────────────────────────────────

describe("POST /api/strava/link", () => {
  afterEach(() => {
    clearMockSupabase();
    vi.clearAllMocks();
  });

  test("401 without auth", async () => {
    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request(
      "/api/strava/link",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workoutId: "a0000000-0000-4000-8000-000000000001", stravaActivityId: 1001 }),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(401);
  });

  test("200 when link succeeds", async () => {
    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request(
      "/api/strava/link",
      {
        method: "POST",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify({ workoutId: "a0000000-0000-4000-8000-000000000001", stravaActivityId: 1001 }),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(linkActivityToWorkout).toHaveBeenCalledOnce();
  });

  test("400 when body validation fails", async () => {
    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request(
      "/api/strava/link",
      {
        method: "POST",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify({ workoutId: "not-a-uuid", stravaActivityId: -1 }),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(400);
  });

  test("409 when linkActivityToWorkout throws CONFLICT", async () => {
    const { AppError } = await import("../../server/mcp/context.ts");
    vi.mocked(linkActivityToWorkout).mockRejectedValueOnce(new AppError("CONFLICT", "Workout already has a linked activity"));

    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request(
      "/api/strava/link",
      {
        method: "POST",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify({ workoutId: "a0000000-0000-4000-8000-000000000001", stravaActivityId: 1001 }),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("CONFLICT");
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

// ─── GET /api/strava/fit/:workoutId ──────────────────────────────────────────

describe("GET /api/strava/fit/:workoutId", () => {
  const WORKOUT_ID = "a0000000-0000-4000-8000-000000000001";
  // The stored DetailedActivity (raw_data) carries the summary metrics + laps — the route reads them without an extra API call.
  const RAW_DATA = {
    moving_time: 1750,
    average_speed: 2.78,
    max_speed: 4.2,
    average_cadence: 88,
    weighted_average_watts: 255,
    max_watts: 400,
    average_temp: 21,
    kilojoules: 500,
    elev_high: 220,
    elev_low: 180,
    laps: [
      {
        start_date: "2026-06-20T06:00:00Z",
        elapsed_time: 300,
        moving_time: 295,
        distance: 1000,
        average_heartrate: 165,
        max_heartrate: 178,
        average_speed: 3.33,
        max_speed: 4.1,
        average_cadence: 90,
        average_watts: 260,
        total_elevation_gain: 12,
      },
      {
        start_date: "2026-06-20T06:05:00Z",
        elapsed_time: 120,
        moving_time: 120,
        distance: 200,
        average_heartrate: 130,
        max_heartrate: 150,
        average_speed: 1.67,
        max_speed: 2.0,
        average_cadence: 78,
        average_watts: 150,
        total_elevation_gain: 0,
      },
    ],
  };
  const ACTIVITY_ROW = {
    strava_id: 12345,
    sport: "Run",
    start_date: "2026-06-20T06:00:00Z",
    duration_sec: 1800,
    distance_m: 5000,
    elevation_m: 40,
    avg_hr: 150,
    max_hr: 175,
    avg_power: 240,
    calories: 350,
    raw_data: RAW_DATA,
  };

  afterEach(() => {
    clearMockSupabase();
    vi.clearAllMocks();
  });

  test("401 without auth", async () => {
    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request(`/api/strava/fit/${WORKOUT_ID}`, {}, MOCK_ENV);
    expect(res.status).toBe(401);
  });

  test("400 when workoutId is not a uuid", async () => {
    const mock = makeAuthMock();
    setMockSupabase(mock);

    const res = await app.request("/api/strava/fit/not-a-uuid", { headers: AUTH_HEADER }, MOCK_ENV);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  test("404 when the workout has no linked activity", async () => {
    const mock = makeAuthMock({ workout_activities: { select: { data: null, error: null } } });
    setMockSupabase(mock);

    const res = await app.request(`/api/strava/fit/${WORKOUT_ID}`, { headers: AUTH_HEADER }, MOCK_ENV);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("NOT_FOUND");
  });

  test("200 returns a FIT attachment built from the activity streams", async () => {
    vi.mocked(stravaFetch).mockResolvedValueOnce([
      {
        type: "latlng",
        data: [
          [50.06, 19.93],
          [50.07, 19.94],
        ],
      },
      { type: "time", data: [0, 5] },
      { type: "heartrate", data: [138, 140] },
    ] as unknown[]);

    const mock = makeAuthMock({ workout_activities: { select: { data: ACTIVITY_ROW, error: null } } });
    setMockSupabase(mock);

    const res = await app.request(`/api/strava/fit/${WORKOUT_ID}`, { headers: AUTH_HEADER }, MOCK_ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/vnd.ant.fit");
    expect(res.headers.get("content-disposition")).toContain(".fit");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(12);
    // The FIT header carries the ".FIT" signature at bytes 8–11.
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe(".FIT");
  });

  test("200 for an indoor activity with no GPS (no latlng stream still exports)", async () => {
    vi.mocked(stravaFetch).mockResolvedValueOnce([
      { type: "time", data: [0, 1, 2] },
      { type: "heartrate", data: [120, 121, 122] },
    ] as unknown[]);

    const mock = makeAuthMock({ workout_activities: { select: { data: { ...ACTIVITY_ROW, sport: "Ride" }, error: null } } });
    setMockSupabase(mock);

    const res = await app.request(`/api/strava/fit/${WORKOUT_ID}`, { headers: AUTH_HEADER }, MOCK_ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/vnd.ant.fit");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe(".FIT");
  });

  test("200 sources laps + summary from raw_data with a single Strava call (streams only)", async () => {
    vi.mocked(stravaFetch).mockResolvedValueOnce([
      { type: "time", data: [0, 5, 10] },
      { type: "heartrate", data: [140, 150, 160] },
      { type: "distance", data: [0, 500, 1000] },
    ] as unknown[]);

    const mock = makeAuthMock({ workout_activities: { select: { data: ACTIVITY_ROW, error: null } } });
    setMockSupabase(mock);

    const res = await app.request(`/api/strava/fit/${WORKOUT_ID}`, { headers: AUTH_HEADER }, MOCK_ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/vnd.ant.fit");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe(".FIT");
    // Only streams — laps + summary come from the stored raw_data.
    expect(stravaFetch).toHaveBeenCalledTimes(1);
  });

  test("200 falls back to /laps when raw_data is absent (legacy row → 2nd Strava call)", async () => {
    vi.mocked(stravaFetch)
      .mockResolvedValueOnce([
        { type: "time", data: [0, 5, 10] },
        { type: "heartrate", data: [140, 150, 160] },
        { type: "distance", data: [0, 500, 1000] },
      ] as unknown[])
      .mockResolvedValueOnce([
        { start_date: "2026-06-20T06:00:00Z", elapsed_time: 300, moving_time: 295, distance: 1000, average_heartrate: 165, max_heartrate: 178 },
        { start_date: "2026-06-20T06:05:00Z", elapsed_time: 120, moving_time: 120, distance: 200, average_heartrate: 130, max_heartrate: 150 },
      ] as unknown[]);

    const mock = makeAuthMock({ workout_activities: { select: { data: { ...ACTIVITY_ROW, raw_data: null }, error: null } } });
    setMockSupabase(mock);

    const res = await app.request(`/api/strava/fit/${WORKOUT_ID}`, { headers: AUTH_HEADER }, MOCK_ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/vnd.ant.fit");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe(".FIT");
    // streams + /laps fallback
    expect(stravaFetch).toHaveBeenCalledTimes(2);
  });
});
