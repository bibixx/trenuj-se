import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  collapseStravaSportType,
  parseStravaTimezoneToIana,
  activityLocalDate,
  getStravaOauthConfig,
  getStravaVerifyToken,
  getValidStravaAccessToken,
  upsertStravaActivity,
  autoMatchActivityToWorkout,
  stravaFetch,
} from "../../server/lib/strava.ts";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { MOCK_USER_ID } from "../helpers/mock-env.ts";

// ---------------------------------------------------------------------------
// collapseStravaSportType
// ---------------------------------------------------------------------------

describe("collapseStravaSportType", () => {
  test("null → 'unknown'", () => {
    expect(collapseStravaSportType(null)).toBe("unknown");
  });

  test("undefined → 'unknown'", () => {
    expect(collapseStravaSportType(undefined)).toBe("unknown");
  });

  test("empty string → 'unknown' (falsy)", () => {
    expect(collapseStravaSportType("")).toBe("unknown");
  });

  test.each([
    ["Run", "run"],
    ["TrailRun", "run"],
    ["VirtualRun", "run"],
    ["Treadmill", "run"],
  ])("%s → 'run'", (input, expected) => {
    expect(collapseStravaSportType(input)).toBe(expected);
  });

  test.each([
    ["Ride", "bike"],
    ["GravelRide", "bike"],
    ["MountainBikeRide", "bike"],
    ["EBikeRide", "bike"],
    ["VirtualRide", "bike"],
    ["EMountainBikeRide", "bike"],
  ])("%s → 'bike'", (input, expected) => {
    expect(collapseStravaSportType(input)).toBe(expected);
  });

  test.each([
    ["Swim", "swim"],
    ["OpenWaterSwim", "swim"],
  ])("%s → 'swim'", (input, expected) => {
    expect(collapseStravaSportType(input)).toBe(expected);
  });

  test("WeightTraining → 'strength'", () => {
    expect(collapseStravaSportType("WeightTraining")).toBe("strength");
  });

  test("Yoga → 'yoga'", () => {
    expect(collapseStravaSportType("Yoga")).toBe("yoga");
  });

  test("Hike → 'hike'", () => {
    expect(collapseStravaSportType("Hike")).toBe("hike");
  });

  test("Walk → 'walk'", () => {
    expect(collapseStravaSportType("Walk")).toBe("walk");
  });

  test.each([
    ["Rowing", "rowing"],
    ["VirtualRowing", "rowing"],
  ])("%s → 'rowing'", (input, expected) => {
    expect(collapseStravaSportType(input)).toBe(expected);
  });

  test("unmapped camelCase 'CrossFit' → 'cross-fit' (kebab-case)", () => {
    expect(collapseStravaSportType("CrossFit")).toBe("cross-fit");
  });

  test("unmapped camelCase 'InlineSkate' → 'inline-skate'", () => {
    expect(collapseStravaSportType("InlineSkate")).toBe("inline-skate");
  });
});

// ---------------------------------------------------------------------------
// parseStravaTimezoneToIana
// ---------------------------------------------------------------------------

describe("parseStravaTimezoneToIana", () => {
  test("null → null", () => {
    expect(parseStravaTimezoneToIana(null)).toBeNull();
  });

  test("undefined → null", () => {
    expect(parseStravaTimezoneToIana(undefined)).toBeNull();
  });

  test("empty string → null (falsy)", () => {
    expect(parseStravaTimezoneToIana("")).toBeNull();
  });

  test("'(GMT-05:00) America/New_York' → 'America/New_York'", () => {
    expect(parseStravaTimezoneToIana("(GMT-05:00) America/New_York")).toBe("America/New_York");
  });

  test("'(GMT+01:00) Europe/Warsaw' → 'Europe/Warsaw'", () => {
    expect(parseStravaTimezoneToIana("(GMT+01:00) Europe/Warsaw")).toBe("Europe/Warsaw");
  });

  test("'Europe/London' (no parentheses) → 'Europe/London' as-is", () => {
    expect(parseStravaTimezoneToIana("Europe/London")).toBe("Europe/London");
  });
});

// ---------------------------------------------------------------------------
// activityLocalDate
// ---------------------------------------------------------------------------

describe("activityLocalDate", () => {
  test("null start_date → null", () => {
    expect(activityLocalDate({ start_date: null })).toBeNull();
  });

  test("missing start_date → null", () => {
    expect(activityLocalDate({})).toBeNull();
  });

  test("noon UTC in Warsaw (UTC+2) stays same calendar day", () => {
    expect(
      activityLocalDate({
        start_date: "2024-06-15T10:00:00Z",
        timezone: "(GMT+02:00) Europe/Warsaw",
      }),
    ).toBe("2024-06-15");
  });

  test("1am UTC in Warsaw (UTC+2) → 3am local, same calendar day", () => {
    expect(
      activityLocalDate({
        start_date: "2024-06-15T01:00:00Z",
        timezone: "(GMT+02:00) Europe/Warsaw",
      }),
    ).toBe("2024-06-15");
  });

  test("11pm UTC in Warsaw (UTC+2) → 1am local next day", () => {
    expect(
      activityLocalDate({
        start_date: "2024-06-14T23:00:00Z",
        timezone: "(GMT+02:00) Europe/Warsaw",
      }),
    ).toBe("2024-06-15");
  });

  test("null timezone falls back to UTC", () => {
    expect(
      activityLocalDate({
        start_date: "2024-06-15T10:00:00Z",
        timezone: null,
      }),
    ).toBe("2024-06-15");
  });

  test("invalid timezone falls back to ISO slice", () => {
    expect(
      activityLocalDate({
        start_date: "2024-06-15T10:00:00Z",
        timezone: "InvalidTimezone/Nowhere",
      }),
    ).toBe("2024-06-15");
  });
});

// ---------------------------------------------------------------------------
// getStravaOauthConfig
// ---------------------------------------------------------------------------

describe("getStravaOauthConfig", () => {
  const fullBindings = {
    STRAVA_CLIENT_ID: "client-id",
    STRAVA_CLIENT_SECRET: "client-secret",
    PUBLIC_APP_URL: "https://example.com",
  };

  test("all present → returns config object", () => {
    expect(getStravaOauthConfig(fullBindings)).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
      publicAppUrl: "https://example.com",
    });
  });

  test("missing STRAVA_CLIENT_ID → throws AppError", () => {
    expect(() => getStravaOauthConfig({ ...fullBindings, STRAVA_CLIENT_ID: undefined })).toThrow();
  });

  test("missing STRAVA_CLIENT_SECRET → throws AppError", () => {
    expect(() => getStravaOauthConfig({ ...fullBindings, STRAVA_CLIENT_SECRET: undefined })).toThrow();
  });

  test("missing PUBLIC_APP_URL → throws AppError", () => {
    expect(() => getStravaOauthConfig({ ...fullBindings, PUBLIC_APP_URL: undefined })).toThrow();
  });

  test("thrown error includes missing key name in message", () => {
    expect(() => getStravaOauthConfig({ ...fullBindings, STRAVA_CLIENT_ID: undefined })).toThrowError(/STRAVA_CLIENT_ID/);
  });
});

// ---------------------------------------------------------------------------
// getStravaVerifyToken
// ---------------------------------------------------------------------------

describe("getStravaVerifyToken", () => {
  test("missing token → throws AppError", () => {
    expect(() => getStravaVerifyToken({})).toThrow();
  });

  test("present → returns value", () => {
    expect(getStravaVerifyToken({ STRAVA_VERIFY_TOKEN: "secret-token" })).toBe("secret-token");
  });

  test("thrown error includes key name", () => {
    expect(() => getStravaVerifyToken({})).toThrowError(/STRAVA_VERIFY_TOKEN/);
  });
});

// ---------------------------------------------------------------------------
// getValidStravaAccessToken
// ---------------------------------------------------------------------------

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

describe("getValidStravaAccessToken", () => {
  test("no credentials found → throws NOT_FOUND", async () => {
    const mock = createMockSupabase({
      tables: {
        strava_credentials: {
          select: { data: null, error: null },
        },
      },
    });

    await expect(getValidStravaAccessToken(mock.client, VALID_BINDINGS, MOCK_USER_ID)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("select error → throws INTERNAL_ERROR", async () => {
    const mock = createMockSupabase({
      tables: {
        strava_credentials: {
          select: { data: null, error: { message: "DB read error" } },
        },
      },
    });

    await expect(getValidStravaAccessToken(mock.client, VALID_BINDINGS, MOCK_USER_ID)).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });

  test("token not expired → returns existing access_token without refresh", async () => {
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now
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

    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const result = await getValidStravaAccessToken(mock.client, VALID_BINDINGS, MOCK_USER_ID);
    expect(result).toBe("existing-token");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("token expired → refreshes via fetch, updates DB, returns new token", async () => {
    const pastExpiry = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
    const mock = createMockSupabase({
      tables: {
        strava_credentials: {
          select: {
            data: {
              user_id: MOCK_USER_ID,
              access_token: "old-token",
              refresh_token: "old-refresh",
              token_expires_at: pastExpiry,
            },
            error: null,
          },
          update: { data: null, error: null },
        },
      },
    });

    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "new-access",
            refresh_token: "new-refresh",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          }),
          { status: 200 },
        ),
    );

    const result = await getValidStravaAccessToken(mock.client, VALID_BINDINGS, MOCK_USER_ID);
    expect(result).toBe("new-access");

    const updateCall = mock.calls.find((c) => c.table === "strava_credentials" && c.operation === "update");
    expect(updateCall).toBeDefined();
  });

  test("token near expiry (within 5 min) → refreshes", async () => {
    const nearExpiry = new Date(Date.now() + 3 * 60 * 1000).toISOString(); // 3 min from now
    const mock = createMockSupabase({
      tables: {
        strava_credentials: {
          select: {
            data: {
              user_id: MOCK_USER_ID,
              access_token: "near-expiry-token",
              refresh_token: "near-refresh",
              token_expires_at: nearExpiry,
            },
            error: null,
          },
          update: { data: null, error: null },
        },
      },
    });

    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "refreshed-token",
            refresh_token: "refreshed-refresh",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          }),
          { status: 200 },
        ),
    );

    const result = await getValidStravaAccessToken(mock.client, VALID_BINDINGS, MOCK_USER_ID);
    expect(result).toBe("refreshed-token");
  });

  test("refresh fails with non-ok response → throws INTERNAL_ERROR", async () => {
    const pastExpiry = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const mock = createMockSupabase({
      tables: {
        strava_credentials: {
          select: {
            data: {
              user_id: MOCK_USER_ID,
              access_token: "old-token",
              refresh_token: "old-refresh",
              token_expires_at: pastExpiry,
            },
            error: null,
          },
        },
      },
    });

    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 401 }));

    await expect(getValidStravaAccessToken(mock.client, VALID_BINDINGS, MOCK_USER_ID)).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });

  test("DB update after refresh fails → throws INTERNAL_ERROR", async () => {
    const pastExpiry = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const mock = createMockSupabase({
      tables: {
        strava_credentials: {
          select: {
            data: {
              user_id: MOCK_USER_ID,
              access_token: "old-token",
              refresh_token: "old-refresh",
              token_expires_at: pastExpiry,
            },
            error: null,
          },
          update: { data: null, error: { message: "Update failed" } },
        },
      },
    });

    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "new-access",
            refresh_token: "new-refresh",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          }),
          { status: 200 },
        ),
    );

    await expect(getValidStravaAccessToken(mock.client, VALID_BINDINGS, MOCK_USER_ID)).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// upsertStravaActivity
// ---------------------------------------------------------------------------

describe("upsertStravaActivity", () => {
  test("successful upsert returns activity row", async () => {
    const activityRow = {
      id: "activity-uuid",
      user_id: MOCK_USER_ID,
      strava_id: 12345,
      sport: "run",
      name: "Morning Run",
    };
    const mock = createMockSupabase({
      tables: {
        activities: {
          upsert: { data: activityRow, error: null },
        },
      },
    });

    const activity = {
      id: 12345,
      sport_type: "Run",
      name: "Morning Run",
      start_date: "2024-06-15T07:00:00Z",
      elapsed_time: 3600,
      distance: 10000,
    };

    const result = await upsertStravaActivity(mock.client, MOCK_USER_ID, activity);
    expect(result).toEqual(activityRow);
  });

  test("activity with minimal fields (no optional fields) upserts successfully", async () => {
    const activityRow = {
      id: "activity-uuid-2",
      user_id: MOCK_USER_ID,
      strava_id: 99999,
      sport: "yoga",
      name: "Untitled activity",
    };
    const mock = createMockSupabase({
      tables: {
        activities: {
          upsert: { data: activityRow, error: null },
        },
      },
    });

    // Only id and sport_type; no name, no heartrate, no timezone, etc.
    const activity = {
      id: 99999,
      sport_type: "Yoga",
    };

    const result = await upsertStravaActivity(mock.client, MOCK_USER_ID, activity);
    expect(result).toEqual(activityRow);

    const upsertCall = mock.calls.find((c) => c.table === "activities" && c.operation === "upsert");
    expect(upsertCall).toBeDefined();
    // Verify defaults applied: name falls back, numeric fields are null
    const row = upsertCall!.args[0] as Record<string, unknown>;
    expect(row.name).toBe("Untitled activity");
    expect(row.timezone).toBeNull();
    expect(row.avg_hr).toBeNull();
    expect(row.max_hr).toBeNull();
    expect(row.distance_m).toBeNull();
    expect(row.elevation_m).toBeNull();
    expect(row.avg_power).toBeNull();
    expect(row.calories).toBeNull();
  });

  test("upsert error → throws INTERNAL_ERROR", async () => {
    const mock = createMockSupabase({
      tables: {
        activities: {
          upsert: { data: null, error: { message: "Upsert failed" } },
        },
      },
    });

    await expect(upsertStravaActivity(mock.client, MOCK_USER_ID, { id: 1, sport_type: "Run" })).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });

  test("upsert returns null data (no error) → throws INTERNAL_ERROR", async () => {
    const mock = createMockSupabase({
      tables: {
        activities: {
          upsert: { data: null, error: null },
        },
      },
    });

    await expect(upsertStravaActivity(mock.client, MOCK_USER_ID, { id: 1, sport_type: "Run" })).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });

  test("numeric fields are rounded on upsert", async () => {
    const activityRow = { id: "a", user_id: MOCK_USER_ID };
    const mock = createMockSupabase({
      tables: {
        activities: {
          upsert: { data: activityRow, error: null },
        },
      },
    });

    const activity = {
      id: 1,
      sport_type: "Ride",
      distance: 10050.7,
      total_elevation_gain: 123.9,
      average_heartrate: 142.6,
      max_heartrate: 175.2,
      average_watts: 210.4,
      calories: 650.8,
    };

    await upsertStravaActivity(mock.client, MOCK_USER_ID, activity);

    const upsertCall = mock.calls.find((c) => c.table === "activities" && c.operation === "upsert");
    const row = upsertCall!.args[0] as Record<string, unknown>;
    expect(row.distance_m).toBe(10051);
    expect(row.elevation_m).toBe(124);
    expect(row.avg_hr).toBe(143);
    expect(row.max_hr).toBe(175);
    expect(row.avg_power).toBe(210);
    expect(row.calories).toBe(651);
  });
});

// ---------------------------------------------------------------------------
// autoMatchActivityToWorkout
// ---------------------------------------------------------------------------

describe("autoMatchActivityToWorkout", () => {
  test("no matching workout → returns null", async () => {
    const mock = createMockSupabase({
      tables: {
        workouts: {
          select: { data: [], error: null },
        },
      },
    });

    const activity = {
      id: "activity-uuid",
      sport: "run",
      date: "2024-06-15T07:00:00Z",
      timezone: "(GMT+02:00) Europe/Warsaw",
    };

    const result = await autoMatchActivityToWorkout(mock.client, MOCK_USER_ID, activity);
    expect(result).toBeNull();
  });

  test("null localDate (no start_date) → returns null immediately", async () => {
    const mock = createMockSupabase();

    const activity = {
      id: "activity-uuid",
      sport: "run",
      date: null as unknown as string,
      timezone: null,
    };

    const result = await autoMatchActivityToWorkout(mock.client, MOCK_USER_ID, activity);
    expect(result).toBeNull();
    // Should not have queried DB at all
    expect(mock.calls).toHaveLength(0);
  });

  test("matching workout found → updates to completed with activity_id", async () => {
    const matchedWorkout = { id: "workout-uuid", sort_order: 1 };
    const updatedWorkout = {
      id: "workout-uuid",
      title: "Run 10k",
      status: "completed",
      activity_id: "activity-uuid",
    };
    const mock = createMockSupabase({
      tables: {
        workouts: {
          select: { data: [matchedWorkout], error: null },
          update: { data: updatedWorkout, error: null },
        },
      },
    });

    const activity = {
      id: "activity-uuid",
      sport: "run",
      date: "2024-06-15T07:00:00Z",
      timezone: "(GMT+02:00) Europe/Warsaw",
    };

    const result = await autoMatchActivityToWorkout(mock.client, MOCK_USER_ID, activity);
    expect(result).toEqual(updatedWorkout);

    const updateCall = mock.calls.find((c) => c.table === "workouts" && c.operation === "update");
    expect(updateCall).toBeDefined();
    expect(updateCall!.args[0]).toMatchObject({
      activity_id: "activity-uuid",
      status: "completed",
    });
  });

  test("workout select error → throws INTERNAL_ERROR", async () => {
    const mock = createMockSupabase({
      tables: {
        workouts: {
          select: { data: null, error: { message: "Select failed" } },
        },
      },
    });

    const activity = {
      id: "activity-uuid",
      sport: "run",
      date: "2024-06-15T07:00:00Z",
      timezone: null,
    };

    await expect(autoMatchActivityToWorkout(mock.client, MOCK_USER_ID, activity)).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });

  test("update error → throws INTERNAL_ERROR", async () => {
    const matchedWorkout = { id: "workout-uuid", sort_order: 1 };
    const mock = createMockSupabase({
      tables: {
        workouts: {
          select: { data: [matchedWorkout], error: null },
          update: { data: null, error: { message: "Update failed" } },
        },
      },
    });

    const activity = {
      id: "activity-uuid",
      sport: "run",
      date: "2024-06-15T07:00:00Z",
      timezone: null,
    };

    await expect(autoMatchActivityToWorkout(mock.client, MOCK_USER_ID, activity)).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// stravaFetch
// ---------------------------------------------------------------------------

describe("stravaFetch", () => {
  test("successful fetch returns parsed JSON", async () => {
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

    const apiPayload = { id: 12345, name: "My Activity" };
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(apiPayload), { status: 200 }));

    const result = await stravaFetch(mock.client, VALID_BINDINGS, MOCK_USER_ID, "/activities/12345");
    expect(result).toEqual(apiPayload);
  });

  test("non-ok response → throws INTERNAL_ERROR", async () => {
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

    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ message: "Rate Limit Exceeded" }), { status: 429 }));

    await expect(stravaFetch(mock.client, VALID_BINDINGS, MOCK_USER_ID, "/activities/12345")).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });
});
