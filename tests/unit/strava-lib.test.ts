import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  activityLocalDate,
  autoMatchActivityToWorkout,
  collapseStravaSportType,
  getStravaOauthConfig,
  getStravaVerifyToken,
  getValidStravaAccessToken,
  parseStravaTimezoneToIana,
  stravaFetch,
  upsertStravaActivity,
} from "../../server/lib/strava.ts";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { MOCK_USER_ID } from "../helpers/mock-env.ts";

const VALID_BINDINGS = {
  STRAVA_CLIENT_ID: "client-id",
  STRAVA_CLIENT_SECRET: "client-secret",
  PUBLIC_APP_URL: "https://example.com",
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

describe("upsertStravaActivity", () => {
  test("persists activities using the richer SportType values", async () => {
    const activityRow = {
      id: "activity-uuid",
      user_id: MOCK_USER_ID,
      strava_id: 12345,
      sport: "TrailRun",
      name: "Morning Trail Run",
    };
    const mock = createMockSupabase({
      tables: {
        activities: {
          upsert: { data: activityRow, error: null },
        },
      },
    });

    const result = await upsertStravaActivity(mock.client, MOCK_USER_ID, {
      id: 12345,
      sport_type: "TrailRun",
      name: "Morning Trail Run",
      start_date: "2024-06-15T07:00:00Z",
      elapsed_time: 3600,
      distance: 10000,
    });

    expect(result).toEqual(activityRow);
  });
});

describe("autoMatchActivityToWorkout", () => {
  test("matches workouts through label_activity_sports", async () => {
    const updatedWorkout = {
      id: "workout-uuid",
      title: "Run 10k",
      status: "completed",
      activity_id: "activity-uuid",
    };
    const mock = createMockSupabase({
      tables: {
        workouts: {
          select: { data: [{ id: "workout-uuid", label_id: "label-1", sort_order: 1 }], error: null },
          update: { data: updatedWorkout, error: null },
        },
        label_activity_sports: {
          select: { data: [{ label_id: "label-1", activity_sport: "TrailRun" }], error: null },
        },
      },
    });

    const result = await autoMatchActivityToWorkout(mock.client, MOCK_USER_ID, {
      id: "activity-uuid",
      sport: "TrailRun",
      date: "2024-06-15T07:00:00Z",
      timezone: "(GMT+02:00) Europe/Warsaw",
    });

    expect(result).toEqual(updatedWorkout);
  });

  test("returns null when no label supports the activity sport", async () => {
    const mock = createMockSupabase({
      tables: {
        workouts: {
          select: { data: [{ id: "workout-uuid", label_id: "label-1", sort_order: 1 }], error: null },
        },
        label_activity_sports: {
          select: { data: [], error: null },
        },
      },
    });

    await expect(
      autoMatchActivityToWorkout(mock.client, MOCK_USER_ID, {
        id: "activity-uuid",
        sport: "TrailRun",
        date: "2024-06-15T07:00:00Z",
        timezone: null,
      }),
    ).resolves.toBeNull();
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
