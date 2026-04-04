import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { setMockSupabase, clearMockSupabase } from "../helpers/setup.ts";
import { MOCK_TOKEN_ID, MOCK_USER_ID, MOCK_PLAN_ID, MOCK_WORKOUT_ID, MOCK_ACTIVITY_ID } from "../helpers/mock-env.ts";
import { mcpCallTool, parseMcpResponse, extractToolResult, extractToolError, resetMcpIds } from "../helpers/mcp.ts";

vi.mock("../../server/lib/stream-tokens.ts", () => ({
  generateStreamToken: vi.fn(async () => "mock-stream-token"),
  consumeStreamToken: vi.fn(async () => MOCK_USER_ID),
}));

const TEST_TOKEN = "tp_abc123testtoken";

// Valid UUID v4s used as tool arguments (must pass Zod uuid validation)
const VALID_PLAN_ID = "a0000000-0000-4000-8000-000000000010";
const _VALID_WORKOUT_ID = "a0000000-0000-4000-8000-000000000030";
const VALID_ACTIVITY_ID = "a0000000-0000-4000-8000-000000000040";
const VALID_MISSING_ID = "a0000000-0000-4000-8000-000000000099";

const MOCK_PLAN = {
  id: MOCK_PLAN_ID,
  user_id: MOCK_USER_ID,
  status: "active",
  color_by: "sport",
  start_date: "2024-01-01",
  end_date: "2024-12-31",
  name: "Test Plan",
  goal: "Test goal",
  metadata: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const MOCK_ACTIVITY = {
  id: MOCK_ACTIVITY_ID,
  strava_id: 987654321,
  sport: "run",
  name: "Morning Run",
  date: "2024-03-15T08:00:00Z",
  timezone: "UTC",
  duration_sec: 3600,
  distance_m: 10000,
  elevation_m: 50,
  avg_hr: 145,
  max_hr: 168,
  avg_power: null,
  calories: 650,
  trainer_notes: null,
  created_at: "2024-03-15T09:00:00Z",
};

function authTokenTables() {
  return {
    api_tokens: {
      select: { data: { id: MOCK_TOKEN_ID, user_id: MOCK_USER_ID }, error: null },
      update: { data: null, error: null },
    },
  };
}

describe("MCP Activity Tools", () => {
  beforeEach(() => {
    resetMcpIds();
  });

  afterEach(() => {
    clearMockSupabase();
  });

  // ─── get_activities ───────────────────────────────────────────────────────

  describe("get_activities", () => {
    test("returns activities with linked workout info", async () => {
      const linkedWorkout = { id: MOCK_WORKOUT_ID, title: "Easy Run", activity_id: MOCK_ACTIVITY_ID };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          activities: {
            select: { data: [MOCK_ACTIVITY], error: null },
          },
          workouts: {
            select: { data: [linkedWorkout], error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_activities", {}, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult<Record<string, unknown>[]>(parsed);

      expect(result?.result).toBeInstanceOf(Array);
      const activities = result!.result;
      expect(activities).toHaveLength(1);
      expect(activities[0].linkedWorkout).toBeDefined();
      expect((activities[0].linkedWorkout as Record<string, unknown>).title).toBe("Easy Run");
    });

    test("returns activities without linked workout (null linkedWorkout)", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          activities: {
            select: { data: [MOCK_ACTIVITY], error: null },
          },
          workouts: {
            select: { data: [], error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_activities", {}, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult<Record<string, unknown>[]>(parsed);

      const activities = result!.result;
      expect(activities[0].linkedWorkout).toBeNull();
    });

    test("applies dateFrom, dateTo, and sport filters", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          activities: {
            select: { data: [MOCK_ACTIVITY], error: null },
          },
          workouts: {
            select: { data: [], error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool(
        "get_activities",
        {
          dateFrom: "2024-03-01",
          dateTo: "2024-03-31",
          sport: "run",
          limit: 10,
        },
        { token: TEST_TOKEN },
      );
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result).toBeInstanceOf(Array);
    });

    test("returns empty array when no activities found", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          activities: {
            select: { data: [], error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_activities", {}, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result).toEqual([]);
    });

    test("returns error when activities query fails", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          activities: {
            select: { data: null, error: { message: "query error" } },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_activities", {}, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("INTERNAL_ERROR");
    });
  });

  // ─── get_activity_streams ─────────────────────────────────────────────────

  describe("get_activity_streams", () => {
    test("returns stream URL with token for valid activity", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          activities: {
            select: { data: { id: MOCK_ACTIVITY_ID, strava_id: 987654321 }, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_activity_streams", { activityId: VALID_ACTIVITY_ID }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result).toBeDefined();
      expect(result?.result.url).toContain("987654321");
      expect(result?.result.url).toContain("mock-stream-token");
      expect(result?.result.expiresInSec).toBe(900);
    });

    test("returns NOT_FOUND when activity does not exist", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          activities: {
            select: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_activity_streams", { activityId: VALID_MISSING_ID }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("NOT_FOUND");
    });

    test("returns error when activity select fails", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          activities: {
            select: { data: null, error: { message: "DB error" } },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_activity_streams", { activityId: VALID_ACTIVITY_ID }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("INTERNAL_ERROR");
    });
  });

  // ─── get_week_summary ─────────────────────────────────────────────────────

  describe("get_week_summary", () => {
    test("returns week summary with planned vs actual aggregation", async () => {
      const workouts = [
        { id: "w1", sport: "run", status: "completed", target_duration_min: 60, target_distance_m: 10000, activity_id: null },
        { id: "w2", sport: "bike", status: "planned", target_duration_min: 90, target_distance_m: 30000, activity_id: null },
      ];
      const activities = [{ id: MOCK_ACTIVITY_ID, sport: "run", duration_sec: 3500, distance_m: 9800 }];
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          workouts: {
            select: { data: workouts, error: null },
          },
          activities: {
            select: { data: activities, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_week_summary", { weekDate: "2024-03-11" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result).toBeDefined();
      expect(result?.result.weekStart).toBeDefined();
      expect(result?.result.weekEnd).toBeDefined();
      expect(result?.result.plannedCount).toBe(2);
      expect(result?.result.completedCount).toBe(1);
      expect(result?.result.bySport).toBeInstanceOf(Array);
    });

    test("uses current week when no weekDate provided", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          workouts: {
            select: { data: [], error: null },
          },
          activities: {
            select: { data: [], error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_week_summary", {}, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result).toBeDefined();
      expect(result?.result.weekStart).toBeDefined();
      expect(result?.result.completionRate).toBe(0);
    });

    test("correctly calculates completionRate for the week", async () => {
      const workouts = [
        { id: "w1", sport: "run", status: "completed", target_duration_min: 60, target_distance_m: 10000, activity_id: null },
        { id: "w2", sport: "run", status: "completed", target_duration_min: 45, target_distance_m: 8000, activity_id: null },
        { id: "w3", sport: "bike", status: "planned", target_duration_min: 90, target_distance_m: 25000, activity_id: null },
        { id: "w4", sport: "bike", status: "skipped", target_duration_min: 60, target_distance_m: 20000, activity_id: null },
      ];
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          workouts: {
            select: { data: workouts, error: null },
          },
          activities: {
            select: { data: [], error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_week_summary", { weekDate: "2024-03-11" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.plannedCount).toBe(4);
      expect(result?.result.completedCount).toBe(2);
      expect(result?.result.skippedCount).toBe(1);
      expect(result?.result.completionRate).toBeCloseTo(0.5);
    });

    test("returns error when workouts query fails", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          workouts: {
            select: { data: null, error: { message: "workout query error" } },
          },
          activities: {
            select: { data: [], error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_week_summary", { weekDate: "2024-03-11" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("INTERNAL_ERROR");
    });
  });

  // ─── get_plan_progress ────────────────────────────────────────────────────

  describe("get_plan_progress", () => {
    test("returns progress metrics for the active plan", async () => {
      const workouts = [
        { id: "w1", status: "completed" },
        { id: "w2", status: "completed" },
        { id: "w3", status: "planned" },
        { id: "w4", status: "skipped" },
      ];
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          workouts: {
            select: { data: workouts, error: null },
          },
          phases: {
            select: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_plan_progress", {}, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result).toBeDefined();
      expect(result?.result.planId).toBe(MOCK_PLAN_ID);
      expect(result?.result.totalWorkouts).toBe(4);
      expect(result?.result.completedWorkouts).toBe(2);
      expect(result?.result.skippedWorkouts).toBe(1);
      expect(result?.result.remainingWorkouts).toBe(1);
      expect(result?.result.completionRate).toBeCloseTo(0.5);
      expect(result?.result.totalWeeks).toBeGreaterThan(0);
    });

    test("returns progress for explicit planId", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          workouts: {
            select: { data: [{ id: "w1", status: "completed" }], error: null },
          },
          phases: {
            select: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_plan_progress", { planId: VALID_PLAN_ID }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.planId).toBe(MOCK_PLAN_ID);
    });

    test("returns NOT_FOUND when plan does not exist", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_plan_progress", {}, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("NOT_FOUND");
    });

    test("returns error when workouts query fails", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          workouts: {
            select: { data: null, error: { message: "DB error" } },
          },
          phases: {
            select: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_plan_progress", {}, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("INTERNAL_ERROR");
    });
  });

  // ─── compare_planned_vs_actual ────────────────────────────────────────────

  describe("compare_planned_vs_actual", () => {
    test("returns per-workout comparison and aggregated totals", async () => {
      const workouts = [
        {
          id: MOCK_WORKOUT_ID,
          date: "2024-03-01",
          sport: "run",
          category: "endurance",
          title: "Easy Run",
          status: "completed",
          target_duration_min: 60,
          target_distance_m: 10000,
          activity_id: MOCK_ACTIVITY_ID,
        },
        {
          id: "w2",
          date: "2024-03-03",
          sport: "bike",
          category: "endurance",
          title: "Easy Ride",
          status: "planned",
          target_duration_min: 90,
          target_distance_m: 30000,
          activity_id: null,
        },
      ];
      const activities = [{ id: MOCK_ACTIVITY_ID, sport: "run", duration_sec: 3500, distance_m: 9800, name: "Morning Run", date: "2024-03-01" }];
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          workouts: {
            select: { data: workouts, error: null },
          },
          activities: {
            select: { data: activities, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("compare_planned_vs_actual", { planId: VALID_PLAN_ID }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result).toBeDefined();
      const data = result!.result;
      expect(data.perWorkout).toBeInstanceOf(Array);
      const perWorkout = data.perWorkout as Record<string, unknown>[];
      expect(perWorkout).toHaveLength(2);
      const aggregated = data.aggregated as Record<string, unknown>;
      expect(aggregated).toBeDefined();
      expect(aggregated.missedWorkouts).toBe(1);

      const linkedWorkout = perWorkout.find((w) => w.workoutId === MOCK_WORKOUT_ID);
      expect((linkedWorkout as Record<string, unknown>).activityName).toBe("Morning Run");
      expect((linkedWorkout as Record<string, unknown>).sportMatch).toBe(true);
    });

    test("applies dateFrom and dateTo filters", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          workouts: {
            select: { data: [], error: null },
          },
          activities: {
            select: { data: [], error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("compare_planned_vs_actual", { planId: VALID_PLAN_ID, dateFrom: "2024-03-01", dateTo: "2024-03-31" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      const data = result!.result;
      expect(data.perWorkout).toEqual([]);
      expect((data.aggregated as Record<string, unknown>).missedWorkouts).toBe(0);
    });

    test("returns NOT_FOUND when plan does not exist", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("compare_planned_vs_actual", {}, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("NOT_FOUND");
    });

    test("returns error when workouts query fails", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          workouts: {
            select: { data: null, error: { message: "DB error" } },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("compare_planned_vs_actual", {}, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("INTERNAL_ERROR");
    });
  });
});
