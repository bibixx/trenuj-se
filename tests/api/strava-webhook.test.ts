import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

// Mock strava lib before other imports so vi.mock hoisting works
vi.mock("../../server/lib/strava.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../server/lib/strava.ts")>();
  return {
    ...original,
    stravaFetch: vi.fn(async () => ({
      id: 12345,
      sport_type: "Run",
      name: "Morning Run",
      start_date: "2024-01-15T07:00:00Z",
      timezone: "(GMT-05:00) America/New_York",
      elapsed_time: 2700,
      distance: 8050,
      total_elevation_gain: 50,
      average_heartrate: 145,
      max_heartrate: 162,
      calories: 420,
    })),
    upsertStravaActivity: vi.fn(async () => ({
      id: "activity-uuid-1",
      sport: "run",
      date: "2024-01-15T07:00:00Z",
      timezone: "America/New_York",
    })),
    autoMatchActivityToWorkout: vi.fn(async () => null),
    getValidStravaAccessToken: vi.fn(async () => "mock-access-token"),
  };
});

import app from "../../server/index.ts";
import { MOCK_ENV, MOCK_USER_ID } from "../helpers/mock-env.ts";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { setMockSupabase, clearMockSupabase } from "../helpers/setup.ts";
import { stravaFetch, upsertStravaActivity, autoMatchActivityToWorkout } from "../../server/lib/strava.ts";

const VALID_SECRET = MOCK_ENV.STRAVA_WEBHOOK_PATH_SECRET; // "mock-webhook-secret"
const VALID_VERIFY_TOKEN = MOCK_ENV.STRAVA_VERIFY_TOKEN; // "mock-verify-token"
const MOCK_ATHLETE_ID = 98765;

const MOCK_PROFILE = {
  id: MOCK_USER_ID,
  strava_athlete_id: MOCK_ATHLETE_ID,
};

function makeActivityCreateEvent(overrides: Record<string, unknown> = {}) {
  return {
    object_type: "activity",
    object_id: 12345,
    aspect_type: "create",
    owner_id: MOCK_ATHLETE_ID,
    updates: {},
    ...overrides,
  };
}

describe("GET /api/strava/webhook/:secret — verification", () => {
  beforeEach(() => {
    const mock = createMockSupabase();
    setMockSupabase(mock);
  });
  afterEach(() => clearMockSupabase());

  test("404 when secret param does not match STRAVA_WEBHOOK_PATH_SECRET", async () => {
    const res = await app.request("/api/strava/webhook/wrong-secret?hub.verify_token=mock-verify-token&hub.challenge=abc123", {}, MOCK_ENV);
    expect(res.status).toBe(404);
  });

  test("401 when hub.verify_token does not match", async () => {
    const res = await app.request(`/api/strava/webhook/${VALID_SECRET}?hub.verify_token=wrong-token&hub.challenge=abc123`, {}, MOCK_ENV);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("AUTH_ERROR");
    expect(body.message).toMatch(/invalid webhook verification token/i);
  });

  test("401 when hub.verify_token is missing", async () => {
    const res = await app.request(`/api/strava/webhook/${VALID_SECRET}?hub.challenge=abc123`, {}, MOCK_ENV);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("AUTH_ERROR");
  });

  test("401 when hub.challenge is missing", async () => {
    const res = await app.request(`/api/strava/webhook/${VALID_SECRET}?hub.verify_token=${VALID_VERIFY_TOKEN}`, {}, MOCK_ENV);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("AUTH_ERROR");
  });

  test("200 echoes back hub.challenge when valid", async () => {
    const challenge = "challenge-xyz-789";
    const res = await app.request(`/api/strava/webhook/${VALID_SECRET}?hub.verify_token=${VALID_VERIFY_TOKEN}&hub.challenge=${challenge}`, {}, MOCK_ENV);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body["hub.challenge"]).toBe(challenge);
  });
});

describe("POST /api/strava/webhook/:secret — events", () => {
  afterEach(() => {
    clearMockSupabase();
    vi.clearAllMocks();
  });

  test("404 when secret param does not match", async () => {
    const mock = createMockSupabase();
    setMockSupabase(mock);

    const res = await app.request(
      "/api/strava/webhook/bad-secret",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeActivityCreateEvent()),
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(404);
  });

  test("ignores event when no profile matches owner_id (unknown athlete)", async () => {
    const mock = createMockSupabase({
      tables: {
        profiles: { select: { data: null, error: null } },
      },
    });
    setMockSupabase(mock);

    const res = await app.request(
      `/api/strava/webhook/${VALID_SECRET}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeActivityCreateEvent({ owner_id: 99999 })),
      },
      MOCK_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.ignored).toBe(true);
  });

  test("ignores non-activity object type (returns ok: true, ignored: true)", async () => {
    const mock = createMockSupabase({
      tables: {
        profiles: { select: { data: MOCK_PROFILE, error: null } },
      },
    });
    setMockSupabase(mock);

    const res = await app.request(
      `/api/strava/webhook/${VALID_SECRET}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          object_type: "gear",
          object_id: 555,
          aspect_type: "update",
          owner_id: MOCK_ATHLETE_ID,
          updates: {},
        }),
      },
      MOCK_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.ignored).toBe(true);
  });

  test("activity create: fetches activity, upserts, and auto-matches workout", async () => {
    const mock = createMockSupabase({
      tables: {
        profiles: { select: { data: MOCK_PROFILE, error: null } },
      },
    });
    setMockSupabase(mock);

    const res = await app.request(
      `/api/strava/webhook/${VALID_SECRET}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeActivityCreateEvent()),
      },
      MOCK_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.ignored).toBeUndefined();

    expect(stravaFetch).toHaveBeenCalledOnce();
    expect(stravaFetch).toHaveBeenCalledWith(expect.anything(), MOCK_ENV, MOCK_USER_ID, "/activities/12345");
    expect(upsertStravaActivity).toHaveBeenCalledOnce();
    expect(autoMatchActivityToWorkout).toHaveBeenCalledOnce();
  });

  test("activity update: treated same as create — fetches, upserts, auto-matches", async () => {
    const mock = createMockSupabase({
      tables: {
        profiles: { select: { data: MOCK_PROFILE, error: null } },
      },
    });
    setMockSupabase(mock);

    const res = await app.request(
      `/api/strava/webhook/${VALID_SECRET}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeActivityCreateEvent({ aspect_type: "update", object_id: 12345 })),
      },
      MOCK_ENV,
    );

    expect(res.status).toBe(200);
    expect(stravaFetch).toHaveBeenCalledOnce();
    expect(upsertStravaActivity).toHaveBeenCalledOnce();
    expect(autoMatchActivityToWorkout).toHaveBeenCalledOnce();
  });

  test("activity delete: deletes activity from activities table", async () => {
    const mock = createMockSupabase({
      tables: {
        profiles: { select: { data: MOCK_PROFILE, error: null } },
        activities: { delete: { data: null, error: null } },
      },
    });
    setMockSupabase(mock);

    const res = await app.request(
      `/api/strava/webhook/${VALID_SECRET}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeActivityCreateEvent({ aspect_type: "delete" })),
      },
      MOCK_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // stravaFetch should NOT be called for delete events
    expect(stravaFetch).not.toHaveBeenCalled();

    // Verify delete was recorded
    const activitiesDeleteCall = mock.calls.find((c) => c.table === "activities" && c.operation === "delete");
    expect(activitiesDeleteCall).toBeDefined();
  });

  test("athlete deauthorize event: deletes credentials and nulls strava_athlete_id", async () => {
    const mock = createMockSupabase({
      tables: {
        profiles: {
          select: { data: MOCK_PROFILE, error: null },
          update: { data: null, error: null },
        },
        strava_credentials: {
          delete: { data: null, error: null },
        },
      },
    });
    setMockSupabase(mock);

    const res = await app.request(
      `/api/strava/webhook/${VALID_SECRET}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          object_type: "athlete",
          object_id: MOCK_ATHLETE_ID,
          aspect_type: "update",
          owner_id: MOCK_ATHLETE_ID,
          updates: { authorized: "false" },
        }),
      },
      MOCK_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const credentialsDeleteCall = mock.calls.find((c) => c.table === "strava_credentials" && c.operation === "delete");
    expect(credentialsDeleteCall).toBeDefined();

    const profileUpdateCall = mock.calls.find((c) => c.table === "profiles" && c.operation === "update");
    expect(profileUpdateCall).toBeDefined();

    // No activity fetching should occur
    expect(stravaFetch).not.toHaveBeenCalled();
  });

  test("athlete update without deauthorize is ignored", async () => {
    const mock = createMockSupabase({
      tables: {
        profiles: { select: { data: MOCK_PROFILE, error: null } },
      },
    });
    setMockSupabase(mock);

    const res = await app.request(
      `/api/strava/webhook/${VALID_SECRET}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          object_type: "athlete",
          object_id: MOCK_ATHLETE_ID,
          aspect_type: "update",
          owner_id: MOCK_ATHLETE_ID,
          updates: { firstname: "John" },
        }),
      },
      MOCK_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    // athlete + update without authorized=false falls through to non-activity check
    expect(body.ok).toBe(true);
    expect(body.ignored).toBe(true);
  });

  test("500 when profiles lookup fails", async () => {
    const mock = createMockSupabase({
      tables: {
        profiles: {
          select: { data: null, error: { message: "Database error" } },
        },
      },
    });
    setMockSupabase(mock);

    const res = await app.request(
      `/api/strava/webhook/${VALID_SECRET}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeActivityCreateEvent()),
      },
      MOCK_ENV,
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body.message).toBe("Database error");
  });

  test("autoMatchActivityToWorkout receives the upserted activity", async () => {
    const upsertedActivity = {
      id: "activity-uuid-1",
      sport: "run",
      date: "2024-01-15T07:00:00Z",
      timezone: "America/New_York",
    };
    vi.mocked(upsertStravaActivity).mockResolvedValueOnce(upsertedActivity as Record<string, unknown>);

    const mock = createMockSupabase({
      tables: {
        profiles: { select: { data: MOCK_PROFILE, error: null } },
      },
    });
    setMockSupabase(mock);

    await app.request(
      `/api/strava/webhook/${VALID_SECRET}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeActivityCreateEvent()),
      },
      MOCK_ENV,
    );

    expect(autoMatchActivityToWorkout).toHaveBeenCalledWith(expect.anything(), MOCK_USER_ID, upsertedActivity);
  });
});
