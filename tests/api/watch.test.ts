import { describe, test, expect, afterEach, vi } from "vitest";
import app from "../../server/index.ts";
import { MOCK_ENV, MOCK_USER_ID } from "../helpers/mock-env.ts";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { setMockSupabase, clearMockSupabase } from "../helpers/setup.ts";
import { createWatchToken } from "../../server/lib/watch-tokens.ts";
import type { WorkoutExecution } from "../../shared/workout-execution.ts";

const WATCH_SECRET = "mock-watch-secret";
const AUTH_HEADER = { Authorization: "Bearer valid-jwt" };
const WORKOUT_ID = "3f8a1c2e-0b7d-4e6a-9c11-2d4e6f8a0b12"; // valid RFC-4122 v4 uuid

const EXECUTION: WorkoutExecution = {
  version: 2,
  appleWatch: { activityType: "running", location: "outdoor" },
  structure: [{ type: "steady", displayName: "Easy", target: { type: "distance", meters: 5000 } }],
};

type TableConfig = Parameters<typeof createMockSupabase>[0]["tables"];

function makeAuthMock(tables: TableConfig = {}) {
  return createMockSupabase({
    auth: { getUser: { data: { user: { id: MOCK_USER_ID } }, error: null } },
    tables,
  });
}

afterEach(() => {
  clearMockSupabase();
  vi.clearAllMocks();
});

describe("GET /api/watch/token", () => {
  test("401 without auth", async () => {
    setMockSupabase(makeAuthMock());
    const res = await app.request("/api/watch/token", {}, MOCK_ENV);
    expect(res.status).toBe(401);
  });

  test("200 returns a token embedding the user id", async () => {
    setMockSupabase(makeAuthMock());
    const res = await app.request("/api/watch/token", { headers: AUTH_HEADER }, MOCK_ENV);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.token).toBe("string");
    expect(body.token.startsWith(`${MOCK_USER_ID}.`)).toBe(true);
  });
});

describe("GET /api/watch/index.json", () => {
  test("401 without a token", async () => {
    setMockSupabase(makeAuthMock());
    const res = await app.request("/api/watch/index.json", {}, MOCK_ENV);
    expect(res.status).toBe(401);
  });

  test("401 with an invalid token", async () => {
    setMockSupabase(makeAuthMock());
    const res = await app.request("/api/watch/index.json?token=not-a-real-token", {}, MOCK_ENV);
    expect(res.status).toBe(401);
  });

  test("200 lists upcoming workouts pointing at relative .workout files", async () => {
    const token = await createWatchToken(WATCH_SECRET, MOCK_USER_ID);
    const rows = [{ id: WORKOUT_ID, title: "Easy Run", date: "2026-07-27", execution: EXECUTION }];
    setMockSupabase(makeAuthMock({ workouts: { select: { data: rows, error: null } } }));

    const res = await app.request(`/api/watch/index.json?token=${token}`, {}, MOCK_ENV);
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

  test("omits workouts that have no execution", async () => {
    const token = await createWatchToken(WATCH_SECRET, MOCK_USER_ID);
    const rows = [
      { id: WORKOUT_ID, title: "Easy Run", date: "2026-07-27", execution: EXECUTION },
      { id: "aa11bb22-cc33-4d44-8e55-ff6677889900", title: "Rest day", date: "2026-07-28", execution: null },
    ];
    setMockSupabase(makeAuthMock({ workouts: { select: { data: rows, error: null } } }));

    const res = await app.request(`/api/watch/index.json?token=${token}`, {}, MOCK_ENV);
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
    const token = await createWatchToken(WATCH_SECRET, MOCK_USER_ID);
    const row = { id: WORKOUT_ID, title: "Easy Run", date: "2026-07-27", execution: EXECUTION };
    setMockSupabase(makeAuthMock({ workouts: { select: { data: row, error: null } } }));

    const res = await app.request(`/api/watch/w/${WORKOUT_ID}.workout?token=${token}`, {}, MOCK_ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/octet-stream");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  test("404 when the workout doesn't exist", async () => {
    const token = await createWatchToken(WATCH_SECRET, MOCK_USER_ID);
    setMockSupabase(makeAuthMock({ workouts: { select: { data: null, error: null } } }));

    const res = await app.request(`/api/watch/w/${WORKOUT_ID}.workout?token=${token}`, {}, MOCK_ENV);
    expect(res.status).toBe(404);
  });
});
