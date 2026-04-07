import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { setMockSupabase, clearMockSupabase } from "../helpers/setup.ts";
import { MOCK_USER_ID, MOCK_PLAN_ID } from "../helpers/mock-env.ts";
import { mcpCallTool, parseMcpResponse, extractToolResult, extractToolError, resetMcpIds } from "../helpers/mcp.ts";

const MOCK_PROFILE = {
  id: MOCK_USER_ID,
  strava_athlete_id: 12345678,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const MOCK_ACTIVE_PLAN = {
  id: MOCK_PLAN_ID,
  name: "Test Plan",
  status: "active",
  start_date: "2024-01-01",
  end_date: "2024-12-31",
};

function mockAuth() {
  return {
    getUser: { data: { user: { id: MOCK_USER_ID } }, error: null },
  };
}

describe("MCP Athlete Tools", () => {
  beforeEach(() => {
    resetMcpIds();
  });

  afterEach(() => {
    clearMockSupabase();
  });

  // ─── get_profile ──────────────────────────────────────────────────────────

  describe("get_profile", () => {
    test("returns profile with strava connected and active plan summary", async () => {
      const workouts = [{ status: "completed" }, { status: "completed" }, { status: "planned" }];
      const mock = createMockSupabase({
        auth: mockAuth(),
        tables: {
          profiles: {
            select: { data: MOCK_PROFILE, error: null },
          },
          plans: {
            select: { data: MOCK_ACTIVE_PLAN, error: null },
          },
          workouts: {
            select: { data: workouts, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_profile", {}, {});
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result).toBeDefined();
      const data = result!.result;
      const profile = data.profile as Record<string, unknown>;
      const activePlan = data.activePlan as Record<string, unknown>;
      const progress = activePlan.progress as Record<string, unknown>;
      expect(profile).toBeDefined();
      expect(profile.id).toBe(MOCK_USER_ID);
      expect(data.stravaConnected).toBe(true);
      expect(activePlan).toBeDefined();
      expect(activePlan.id).toBe(MOCK_PLAN_ID);
      expect(progress.totalWorkouts).toBe(3);
      expect(progress.completedWorkouts).toBe(2);
      expect(progress.completionRate).toBeCloseTo(2 / 3);
    });

    test("returns profile with activePlan null when no active plan exists", async () => {
      const mock = createMockSupabase({
        auth: mockAuth(),
        tables: {
          profiles: {
            select: { data: MOCK_PROFILE, error: null },
          },
          plans: {
            select: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_profile", {}, {});
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result).toBeDefined();
      const data = result!.result;
      expect((data.profile as Record<string, unknown>).id).toBe(MOCK_USER_ID);
      expect(data.stravaConnected).toBe(true);
      expect(data.activePlan).toBeNull();
    });

    test("returns stravaConnected: false when no strava_athlete_id on profile", async () => {
      const profileWithoutStrava = { ...MOCK_PROFILE, strava_athlete_id: null };
      const mock = createMockSupabase({
        auth: mockAuth(),
        tables: {
          profiles: {
            select: { data: profileWithoutStrava, error: null },
          },
          plans: {
            select: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_profile", {}, {});
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      const data = result!.result;
      expect(data.stravaConnected).toBe(false);
    });

    test("returns NOT_FOUND when profile does not exist", async () => {
      const mock = createMockSupabase({
        auth: mockAuth(),
        tables: {
          profiles: {
            select: { data: null, error: null },
          },
          plans: {
            select: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_profile", {}, {});
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("NOT_FOUND");
    });

    test("returns INTERNAL_ERROR when profile query fails", async () => {
      const mock = createMockSupabase({
        auth: mockAuth(),
        tables: {
          profiles: {
            select: { data: null, error: { message: "DB error" } },
          },
          plans: {
            select: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_profile", {}, {});
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("INTERNAL_ERROR");
    });

    test("returns INTERNAL_ERROR when plan query fails", async () => {
      const mock = createMockSupabase({
        auth: mockAuth(),
        tables: {
          profiles: {
            select: { data: MOCK_PROFILE, error: null },
          },
          plans: {
            select: { data: null, error: { message: "plan query error" } },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_profile", {}, {});
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("INTERNAL_ERROR");
    });

    test("returns INTERNAL_ERROR when workouts query fails when active plan exists", async () => {
      const mock = createMockSupabase({
        auth: mockAuth(),
        tables: {
          profiles: {
            select: { data: MOCK_PROFILE, error: null },
          },
          plans: {
            select: { data: MOCK_ACTIVE_PLAN, error: null },
          },
          workouts: {
            select: { data: null, error: { message: "workouts error" } },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_profile", {}, {});
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("INTERNAL_ERROR");
    });

    test("returns zero completionRate when plan has no workouts", async () => {
      const mock = createMockSupabase({
        auth: mockAuth(),
        tables: {
          profiles: {
            select: { data: MOCK_PROFILE, error: null },
          },
          plans: {
            select: { data: MOCK_ACTIVE_PLAN, error: null },
          },
          workouts: {
            select: { data: [], error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_profile", {}, {});
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      const data = result!.result;
      const activePlan = data.activePlan as Record<string, unknown>;
      const progress = activePlan.progress as Record<string, unknown>;
      expect(progress.completionRate).toBe(0);
      expect(progress.totalWorkouts).toBe(0);
    });
  });
});
