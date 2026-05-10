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
    matchAndStoreActivity: vi.fn(async () => null),
    refreshWorkoutActivityFromStrava: vi.fn(async () => undefined),
    getValidStravaAccessToken: vi.fn(async () => "mock-access-token"),
  };
});

import app from "../../server/index.ts";
import { MOCK_ENV, MOCK_USER_ID } from "../helpers/mock-env.ts";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { setMockSupabase, clearMockSupabase } from "../helpers/setup.ts";
import { stravaFetch, matchAndStoreActivity, refreshWorkoutActivityFromStrava } from "../../server/lib/strava.ts";
import { buildStravaSignatureHeader, computeStravaSignature } from "../helpers/strava-signature.ts";

const VALID_SECRET = MOCK_ENV.STRAVA_WEBHOOK_PATH_SECRET; // "mock-webhook-secret"
const VALID_SIGNING_SECRET = MOCK_ENV.STRAVA_WEBHOOK_SIGNING_SECRET ?? ""; // "mock-signing-secret"
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

type PostWebhookOptions = {
  body: unknown;
  pathSecret?: string;
  env?: typeof MOCK_ENV;
  // Override the X-Strava-Signature header. `null` omits it entirely; a string sets it verbatim;
  // omitting the field signs the request with `env.STRAVA_WEBHOOK_SIGNING_SECRET` (or no header
  // if that env var is empty — soft-fail path).
  rawHeader?: string | null;
  // Override the secret used for signing (defaults to env's signing secret)
  signingSecret?: string;
  // Override the timestamp used for signing (defaults to now)
  tSec?: number;
};

async function postWebhook(opts: PostWebhookOptions) {
  const env = opts.env ?? MOCK_ENV;
  const pathSecret = opts.pathSecret ?? VALID_SECRET;
  const rawBody = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (opts.rawHeader === null) {
    // intentionally omit
  } else if (typeof opts.rawHeader === "string") {
    headers["x-strava-signature"] = opts.rawHeader;
  } else {
    const secret = opts.signingSecret ?? env.STRAVA_WEBHOOK_SIGNING_SECRET;
    if (secret) {
      const { header } = await buildStravaSignatureHeader({ secret, rawBody, tSec: opts.tSec });
      headers["x-strava-signature"] = header;
    }
  }

  return app.request(`/api/strava/webhook/${pathSecret}`, { method: "POST", headers, body: rawBody }, env);
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

    const res = await postWebhook({ body: makeActivityCreateEvent(), pathSecret: "bad-secret" });
    expect(res.status).toBe(404);
  });

  test("ignores event when no profile matches owner_id (unknown athlete)", async () => {
    const mock = createMockSupabase({
      tables: {
        profiles: { select: { data: null, error: null } },
      },
    });
    setMockSupabase(mock);

    const res = await postWebhook({ body: makeActivityCreateEvent({ owner_id: 99999 }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("ignores non-activity object type (returns ok: true, ignored: true)", async () => {
    const mock = createMockSupabase({
      tables: {
        profiles: { select: { data: MOCK_PROFILE, error: null } },
      },
    });
    setMockSupabase(mock);

    const res = await postWebhook({
      body: {
        object_type: "gear",
        object_id: 555,
        aspect_type: "update",
        owner_id: MOCK_ATHLETE_ID,
        updates: {},
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("activity create: fetches activity and runs match-and-store", async () => {
    const mock = createMockSupabase({
      tables: {
        profiles: { select: { data: MOCK_PROFILE, error: null } },
      },
    });
    setMockSupabase(mock);

    const res = await postWebhook({ body: makeActivityCreateEvent() });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    expect(stravaFetch).toHaveBeenCalledOnce();
    expect(stravaFetch).toHaveBeenCalledWith(expect.anything(), MOCK_ENV, MOCK_USER_ID, "/activities/12345");
    expect(matchAndStoreActivity).toHaveBeenCalledOnce();
  });

  test("activity update on unmatched activity: falls through to match-and-store", async () => {
    const mock = createMockSupabase({
      tables: {
        profiles: { select: { data: MOCK_PROFILE, error: null } },
        workout_activities: { select: { data: null, error: null } },
      },
    });
    setMockSupabase(mock);

    const res = await postWebhook({ body: makeActivityCreateEvent({ aspect_type: "update", object_id: 12345 }) });

    expect(res.status).toBe(200);
    expect(stravaFetch).toHaveBeenCalledOnce();
    expect(matchAndStoreActivity).toHaveBeenCalledOnce();
    expect(refreshWorkoutActivityFromStrava).not.toHaveBeenCalled();
  });

  test("activity update on already-linked activity: refreshes the stored row instead of re-matching", async () => {
    const mock = createMockSupabase({
      tables: {
        profiles: { select: { data: MOCK_PROFILE, error: null } },
        workout_activities: { select: { data: { workout_id: "workout-uuid-42" }, error: null } },
      },
    });
    setMockSupabase(mock);

    const res = await postWebhook({ body: makeActivityCreateEvent({ aspect_type: "update", object_id: 12345 }) });

    expect(res.status).toBe(200);
    expect(stravaFetch).toHaveBeenCalledOnce();
    expect(refreshWorkoutActivityFromStrava).toHaveBeenCalledOnce();
    expect(refreshWorkoutActivityFromStrava).toHaveBeenCalledWith(expect.anything(), MOCK_USER_ID, "workout-uuid-42", expect.objectContaining({ id: 12345 }));
    expect(matchAndStoreActivity).not.toHaveBeenCalled();
  });

  test("activity delete: removes the workout_activities row and resets the workout to planned", async () => {
    const mock = createMockSupabase({
      tables: {
        profiles: { select: { data: MOCK_PROFILE, error: null } },
        workout_activities: {
          select: { data: { workout_id: "workout-uuid-1" }, error: null },
          delete: { data: null, error: null },
        },
        workouts: { update: { data: null, error: null } },
      },
    });
    setMockSupabase(mock);

    const res = await postWebhook({ body: makeActivityCreateEvent({ aspect_type: "delete" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    expect(stravaFetch).not.toHaveBeenCalled();
    const deleteCall = mock.calls.find((c) => c.table === "workout_activities" && c.operation === "delete");
    expect(deleteCall).toBeDefined();
    const updateCall = mock.calls.find((c) => c.table === "workouts" && c.operation === "update");
    expect(updateCall).toBeDefined();
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

    const res = await postWebhook({
      body: {
        object_type: "athlete",
        object_id: MOCK_ATHLETE_ID,
        aspect_type: "update",
        owner_id: MOCK_ATHLETE_ID,
        updates: { authorized: "false" },
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const credentialsDeleteCall = mock.calls.find((c) => c.table === "strava_credentials" && c.operation === "delete");
    expect(credentialsDeleteCall).toBeDefined();

    const profileUpdateCall = mock.calls.find((c) => c.table === "profiles" && c.operation === "update");
    expect(profileUpdateCall).toBeDefined();

    expect(stravaFetch).not.toHaveBeenCalled();
  });

  test("athlete update without deauthorize is ignored", async () => {
    const mock = createMockSupabase({
      tables: {
        profiles: { select: { data: MOCK_PROFILE, error: null } },
      },
    });
    setMockSupabase(mock);

    const res = await postWebhook({
      body: {
        object_type: "athlete",
        object_id: MOCK_ATHLETE_ID,
        aspect_type: "update",
        owner_id: MOCK_ATHLETE_ID,
        updates: { firstname: "John" },
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("returns 200 even when handler throws — error is logged, Strava keeps subscription", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mock = createMockSupabase({
      tables: {
        profiles: {
          select: { data: null, error: { message: "Database error" } },
        },
      },
    });
    setMockSupabase(mock);

    const res = await postWebhook({ body: makeActivityCreateEvent() });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test("matchAndStoreActivity receives the detailed activity from stravaFetch", async () => {
    const detailedActivity = {
      id: 12345,
      sport_type: "Run",
      start_date: "2024-01-15T07:00:00Z",
      timezone: "(GMT-05:00) America/New_York",
      elapsed_time: 2700,
    };
    vi.mocked(stravaFetch).mockResolvedValueOnce(detailedActivity as Record<string, unknown>);

    const mock = createMockSupabase({
      tables: {
        profiles: { select: { data: MOCK_PROFILE, error: null } },
      },
    });
    setMockSupabase(mock);

    await postWebhook({ body: makeActivityCreateEvent() });

    expect(matchAndStoreActivity).toHaveBeenCalledWith(expect.anything(), MOCK_USER_ID, detailedActivity);
  });
});

describe("POST /api/strava/webhook/:secret — signature verification", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mock = createMockSupabase({
      tables: {
        profiles: { select: { data: MOCK_PROFILE, error: null } },
      },
    });
    setMockSupabase(mock);
  });

  afterEach(() => {
    clearMockSupabase();
    vi.clearAllMocks();
    warnSpy.mockRestore();
  });

  test("401 when X-Strava-Signature header is missing (and signing secret configured)", async () => {
    const res = await postWebhook({ body: makeActivityCreateEvent(), rawHeader: null });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("AUTH_ERROR");
    expect(body.message).toMatch(/invalid signature/i);
    expect(stravaFetch).not.toHaveBeenCalled();
  });

  test("401 when X-Strava-Signature header is malformed", async () => {
    const res = await postWebhook({ body: makeActivityCreateEvent(), rawHeader: "garbage-no-equals" });
    expect(res.status).toBe(401);
    expect(stravaFetch).not.toHaveBeenCalled();
  });

  test("401 when timestamp is outside tolerance (older than 300s)", async () => {
    const staleT = Math.floor(Date.now() / 1000) - 600;
    const res = await postWebhook({ body: makeActivityCreateEvent(), tSec: staleT });
    expect(res.status).toBe(401);
    expect(stravaFetch).not.toHaveBeenCalled();
  });

  test("401 when signature was computed with a different secret", async () => {
    const res = await postWebhook({ body: makeActivityCreateEvent(), signingSecret: "wrong-signing-secret" });
    expect(res.status).toBe(401);
    expect(stravaFetch).not.toHaveBeenCalled();
  });

  test("401 when body is tampered with after signing", async () => {
    const original = makeActivityCreateEvent();
    const rawBody = JSON.stringify(original);
    const t = Math.floor(Date.now() / 1000);
    const v1 = await computeStravaSignature(VALID_SIGNING_SECRET, t, rawBody);
    // Send a different body but the signature for `rawBody`
    const tampered = JSON.stringify({ ...original, object_id: 99999 });
    const res = await app.request(
      `/api/strava/webhook/${VALID_SECRET}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-strava-signature": `t=${t},v1=${v1}` },
        body: tampered,
      },
      MOCK_ENV,
    );
    expect(res.status).toBe(401);
    expect(stravaFetch).not.toHaveBeenCalled();
  });

  test("200 when signature is valid", async () => {
    const res = await postWebhook({ body: makeActivityCreateEvent() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(stravaFetch).toHaveBeenCalledOnce();
  });

  test("soft-fail: when STRAVA_WEBHOOK_SIGNING_SECRET is unset, request without header is accepted and a warning is logged", async () => {
    const envWithoutSecret = { ...MOCK_ENV, STRAVA_WEBHOOK_SIGNING_SECRET: undefined };
    const res = await postWebhook({ body: makeActivityCreateEvent(), env: envWithoutSecret, rawHeader: null });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("STRAVA_WEBHOOK_SIGNING_SECRET not configured"));
    expect(stravaFetch).toHaveBeenCalledOnce();
  });

  test("path-secret check runs before signature check (404 still wins for unknown path)", async () => {
    const res = await postWebhook({ body: makeActivityCreateEvent(), pathSecret: "wrong-path-secret", rawHeader: null });
    expect(res.status).toBe(404);
  });
});
