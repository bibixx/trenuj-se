import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  activityLocalDate,
  collapseStravaSportType,
  getStravaOauthConfig,
  getStravaVerifyToken,
  getValidStravaAccessToken,
  matchAndStoreActivity,
  parseStravaTimezoneToIana,
  stravaFetch,
} from "../../server/lib/strava.ts";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { MOCK_USER_ID } from "../helpers/mock-env.ts";

const VALID_BINDINGS = {
  STRAVA_CLIENT_ID: "client-id",
  STRAVA_CLIENT_SECRET: "client-secret",
  PUBLIC_APP_URL: "https://example.com",
};

const SAMPLE_STRAVA_ACTIVITY = {
  id: 12345,
  sport_type: "TrailRun",
  name: "Morning Trail Run",
  start_date: "2024-06-15T07:00:00Z",
  timezone: "(GMT+02:00) Europe/Warsaw",
  elapsed_time: 3600,
  distance: 10000,
};

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("collapseStravaSportType", () => {
  test("falls back to Workout for missing values", () => {
    expect(collapseStravaSportType(null)).toBe("Workout");
    expect(collapseStravaSportType(undefined)).toBe("Workout");
    expect(collapseStravaSportType("")).toBe("Workout");
  });

  test("preserves exact SportType values", () => {
    expect(collapseStravaSportType("Run")).toBe("Run");
    expect(collapseStravaSportType("TrailRun")).toBe("TrailRun");
    expect(collapseStravaSportType("GravelRide")).toBe("GravelRide");
    expect(collapseStravaSportType("WeightTraining")).toBe("WeightTraining");
  });

  test("maps known aliases into the supported SportType enum", () => {
    expect(collapseStravaSportType("CrossFit")).toBe("Crossfit");
    expect(collapseStravaSportType("OpenWaterSwim")).toBe("Swim");
    expect(collapseStravaSportType("Treadmill")).toBe("Run");
    expect(collapseStravaSportType("VirtualRowing")).toBe("VirtualRow");
  });

  test("falls back to Workout for unknown strings", () => {
    expect(collapseStravaSportType("TotallyUnknownSport")).toBe("Workout");
  });
});

describe("parseStravaTimezoneToIana", () => {
  test("extracts the IANA zone when Strava prefixes GMT text", () => {
    expect(parseStravaTimezoneToIana("(GMT+01:00) Europe/Warsaw")).toBe("Europe/Warsaw");
  });

  test("returns null for missing timezone", () => {
    expect(parseStravaTimezoneToIana(null)).toBeNull();
  });
});

describe("activityLocalDate", () => {
  test("converts UTC timestamps into the activity's local date", () => {
    expect(activityLocalDate({ start_date: "2024-06-14T23:00:00Z", timezone: "(GMT+02:00) Europe/Warsaw" })).toBe("2024-06-15");
  });

  test("returns null without a start date", () => {
    expect(activityLocalDate({})).toBeNull();
  });
});

describe("getStravaOauthConfig / getStravaVerifyToken", () => {
  test("returns config when all required bindings exist", () => {
    expect(getStravaOauthConfig(VALID_BINDINGS)).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
      publicAppUrl: "https://example.com",
    });
  });

  test("throws when verify token is missing", () => {
    expect(() => getStravaVerifyToken({})).toThrow(/STRAVA_VERIFY_TOKEN/);
  });
});

describe("getValidStravaAccessToken", () => {
  test("returns the existing token when it is still valid", async () => {
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const mock = createMockSupabase({
      tables: {
        strava_credentials: {
          select: {
            data: {
              user_id: MOCK_USER_ID,
              access_token: "existing-token",
              refresh_token: "existing-refresh",
              token_expires_at: futureExpiry,
            },
            error: null,
          },
        },
      },
    });

    globalThis.fetch = vi.fn();
    await expect(getValidStravaAccessToken(mock.client, VALID_BINDINGS, MOCK_USER_ID)).resolves.toBe("existing-token");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test("refreshes when the token is near expiry", async () => {
    const nearExpiry = new Date(Date.now() + 60 * 1000).toISOString();
    const mock = createMockSupabase({
      tables: {
        strava_credentials: {
          select: {
            data: {
              user_id: MOCK_USER_ID,
              access_token: "old-token",
              refresh_token: "old-refresh",
              token_expires_at: nearExpiry,
            },
            error: null,
          },
          update: { data: null, error: null },
        },
      },
    });

    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600 }), { status: 200 }),
    );

    await expect(getValidStravaAccessToken(mock.client, VALID_BINDINGS, MOCK_USER_ID)).resolves.toBe("new-access");
  });
});

describe("matchAndStoreActivity", () => {
  test("inserts a workout_activities row and flips the matched workout to completed", async () => {
    const mock = createMockSupabase({
      tables: {
        workout_activities: {
          select: [
            { data: null, error: null }, // no existing row for this strava_id
            { data: [], error: null }, // no candidate workouts already matched
          ],
          insert: { data: null, error: null },
        },
        plans: {
          select: { data: { id: "plan-1" }, error: null },
        },
        workouts: {
          select: { data: [{ id: "workout-uuid", title: "Long Trail Run", label_id: "label-1", sort_order: 1 }], error: null },
          update: { data: null, error: null },
        },
        label_activity_sports: {
          select: { data: [{ label_id: "label-1", activity_sport: "TrailRun" }], error: null },
        },
      },
    });

    const result = await matchAndStoreActivity(mock.client, MOCK_USER_ID, SAMPLE_STRAVA_ACTIVITY);

    expect(result).toEqual({ workoutId: "workout-uuid", workoutTitle: "Long Trail Run" });
    const insertCall = mock.calls.find((c) => c.table === "workout_activities" && c.operation === "insert");
    expect(insertCall).toBeDefined();
    const updateCall = mock.calls.find((c) => c.table === "workouts" && c.operation === "update");
    expect(updateCall).toBeDefined();
  });

  test("returns null when no label supports the activity sport", async () => {
    const mock = createMockSupabase({
      tables: {
        workout_activities: {
          select: [
            { data: null, error: null },
            { data: [], error: null },
          ],
        },
        plans: {
          select: { data: { id: "plan-1" }, error: null },
        },
        workouts: {
          select: { data: [{ id: "workout-uuid", title: "Long Trail Run", label_id: "label-1", sort_order: 1 }], error: null },
        },
        label_activity_sports: {
          select: { data: [], error: null },
        },
      },
    });

    await expect(matchAndStoreActivity(mock.client, MOCK_USER_ID, SAMPLE_STRAVA_ACTIVITY)).resolves.toBeNull();
  });

  test("returns null when the activity is already linked to a workout", async () => {
    const mock = createMockSupabase({
      tables: {
        workout_activities: {
          select: { data: { workout_id: "existing-workout-uuid" }, error: null },
        },
      },
    });

    await expect(matchAndStoreActivity(mock.client, MOCK_USER_ID, SAMPLE_STRAVA_ACTIVITY)).resolves.toBeNull();
  });

  test("returns null when the user has no active plan", async () => {
    const mock = createMockSupabase({
      tables: {
        workout_activities: {
          select: { data: null, error: null },
        },
        plans: {
          select: { data: null, error: null },
        },
      },
    });

    await expect(matchAndStoreActivity(mock.client, MOCK_USER_ID, SAMPLE_STRAVA_ACTIVITY)).resolves.toBeNull();

    const workoutsSelectCall = mock.calls.find((c) => c.table === "workouts" && c.operation === "select");
    expect(workoutsSelectCall).toBeUndefined();
    const insertCall = mock.calls.find((c) => c.table === "workout_activities" && c.operation === "insert");
    expect(insertCall).toBeUndefined();
  });
});

describe("stravaFetch", () => {
  test("returns parsed JSON for successful requests", async () => {
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const mock = createMockSupabase({
      tables: {
        strava_credentials: {
          select: {
            data: {
              user_id: MOCK_USER_ID,
              access_token: "valid-token",
              refresh_token: "refresh",
              token_expires_at: futureExpiry,
            },
            error: null,
          },
        },
      },
    });

    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ id: 12345, name: "My Activity" }), { status: 200 }));

    await expect(stravaFetch(mock.client, VALID_BINDINGS, MOCK_USER_ID, "/activities/12345")).resolves.toEqual({ id: 12345, name: "My Activity" });
  });
});
