import { afterEach, describe, expect, test, vi } from "vitest";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { MOCK_ENV, MOCK_USER_ID } from "../helpers/mock-env.ts";
import { hydrateActivities, stravaRateLimitedUntil, syncAthleteZones } from "../../server/lib/strava-sync.ts";

const FUTURE_EXPIRY = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const CREDENTIALS = {
  user_id: MOCK_USER_ID,
  access_token: "mock-access-token",
  refresh_token: "mock-refresh-token",
  token_expires_at: FUTURE_EXPIRY,
};

type FetchHandler = (url: string) => Response | Promise<Response>;

function stubFetch(handler: FetchHandler) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => handler(String(input)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, ...init });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("stravaRateLimitedUntil", () => {
  // 2026-08-09T10:07:00Z
  const NOW_MS = Date.UTC(2026, 7, 9, 10, 7, 0);

  test("15-minute limit: next quarter-hour boundary", () => {
    const headers = new Headers({ "X-RateLimit-Usage": "605,3000", "X-RateLimit-Limit": "600,30000" });
    expect(stravaRateLimitedUntil(headers, NOW_MS)).toBe("2026-08-09T10:15:00.000Z");
  });

  test("daily limit exceeded: next UTC midnight", () => {
    const headers = new Headers({ "X-RateLimit-Usage": "100,30050", "X-RateLimit-Limit": "600,30000" });
    expect(stravaRateLimitedUntil(headers, NOW_MS)).toBe("2026-08-10T00:00:00.000Z");
  });

  test("missing headers: falls back to the 15-minute boundary", () => {
    expect(stravaRateLimitedUntil(new Headers(), NOW_MS)).toBe("2026-08-09T10:15:00.000Z");
  });
});

describe("hydrateActivities", () => {
  test("hydrates detail then streams for an unknown activity", async () => {
    const fetchMock = stubFetch((url) => {
      if (url.includes("/streams")) {
        return jsonResponse([{ type: "time", data: [0, 1, 2] }]);
      }
      return jsonResponse({ id: 555, elapsed_time: 3600 });
    });
    const mock = createMockSupabase({
      tables: {
        strava_credentials: { select: { data: CREDENTIALS, error: null } },
        strava_sync_state: { select: { data: null, error: null } },
        activities: {
          select: [
            { data: null, error: null },
            { data: { elapsed_sec: 3600 }, error: null },
          ],
        },
      },
      rpc: {
        strava_ingest_activity_detail: { data: 1, error: null },
        strava_ingest_activity_streams: { data: 3, error: null },
      },
    });

    const results = await hydrateActivities(mock.client, MOCK_ENV, MOCK_USER_ID, [555]);

    expect(results).toEqual([{ stravaId: 555, status: "synced", samples: 3 }]);
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls[0]).toContain("/activities/555");
    expect(urls[1]).toContain("/activities/555/streams?keys=");
    expect(urls[1]).not.toContain("resolution=medium");
    const streamsRpc = mock.calls.find((c) => c.table === "rpc:strava_ingest_activity_streams");
    expect(streamsRpc?.args[0]).toMatchObject({ p_user_id: MOCK_USER_ID, p_strava_id: 555 });
  });

  test("requests medium resolution for very long activities", async () => {
    const fetchMock = stubFetch(() => jsonResponse([{ type: "time", data: [0, 1] }]));
    const mock = createMockSupabase({
      tables: {
        strava_credentials: { select: { data: CREDENTIALS, error: null } },
        strava_sync_state: { select: { data: null, error: null } },
        activities: { select: { data: { id: 1, elapsed_sec: 8 * 3600, detail_synced_at: "2026-08-01T00:00:00Z", streams_synced_at: null, streams_status: null }, error: null } },
      },
      rpc: { strava_ingest_activity_streams: { data: 2, error: null } },
    });

    const results = await hydrateActivities(mock.client, MOCK_ENV, MOCK_USER_ID, [777]);

    expect(results[0]?.status).toBe("synced");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("resolution=medium");
  });

  test("marks streams unavailable on a Strava 404", async () => {
    stubFetch(() => new Response("", { status: 404 }));
    const mock = createMockSupabase({
      tables: {
        strava_credentials: { select: { data: CREDENTIALS, error: null } },
        strava_sync_state: { select: { data: null, error: null } },
        activities: {
          select: { data: { id: 1, elapsed_sec: 3600, detail_synced_at: "2026-08-01T00:00:00Z", streams_synced_at: null, streams_status: null }, error: null },
          update: { data: null, error: null },
        },
      },
    });

    const results = await hydrateActivities(mock.client, MOCK_ENV, MOCK_USER_ID, [888]);

    expect(results[0]?.status).toBe("unavailable");
    const update = mock.calls.find((c) => c.table === "activities" && c.operation === "update");
    expect(update?.args[0]).toMatchObject({ streams_status: "unavailable" });
  });

  test("a 429 marks the remaining batch rate_limited", async () => {
    stubFetch(() => new Response("", { status: 429, headers: { "X-RateLimit-Usage": "700,100", "X-RateLimit-Limit": "600,30000" } }));
    const mock = createMockSupabase({
      tables: {
        strava_credentials: { select: { data: CREDENTIALS, error: null } },
        strava_sync_state: { select: { data: null, error: null }, upsert: { data: null, error: null } },
        activities: { select: { data: null, error: null } },
      },
    });

    const results = await hydrateActivities(mock.client, MOCK_ENV, MOCK_USER_ID, [1, 2]);

    expect(results.map((r) => r.status)).toEqual(["rate_limited", "rate_limited"]);
  });

  test("caps the batch and reports already-hydrated activities", async () => {
    const fetchMock = stubFetch(() => jsonResponse([]));
    const hydrated = { id: 1, elapsed_sec: 3600, detail_synced_at: "2026-08-01T00:00:00Z", streams_synced_at: "2026-08-01T00:00:00Z", streams_status: "synced" };
    const mock = createMockSupabase({
      tables: {
        strava_sync_state: { select: { data: null, error: null } },
        activities: { select: { data: hydrated, error: null } },
      },
    });

    const results = await hydrateActivities(mock.client, MOCK_ENV, MOCK_USER_ID, [1, 2, 3, 4, 5]);

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === "already")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("syncAthleteZones", () => {
  test("passes the raw zones payload to the ingest RPC", async () => {
    stubFetch(() => jsonResponse({ heart_rate: { zones: [{ min: 0, max: 120 }] } }));
    const mock = createMockSupabase({
      tables: {
        strava_credentials: { select: { data: CREDENTIALS, error: null } },
        strava_sync_state: { select: { data: null, error: null } },
      },
      rpc: { strava_ingest_athlete_zones: { data: 5, error: null } },
    });

    const result = await syncAthleteZones(mock.client, MOCK_ENV, MOCK_USER_ID);

    expect(result).toEqual({ status: "synced", inserted: 5 });
    const rpcCall = mock.calls.find((c) => c.table === "rpc:strava_ingest_athlete_zones");
    const rpcArgs = rpcCall?.args[0] as { p_payload?: unknown } | undefined;
    expect(typeof rpcArgs?.p_payload).toBe("string");
  });
});
