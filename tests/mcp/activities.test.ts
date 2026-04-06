import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { clearMockSupabase, setMockSupabase } from "../helpers/setup.ts";
import { MOCK_PLAN_ID, MOCK_TOKEN_ID, MOCK_USER_ID } from "../helpers/mock-env.ts";
import { extractToolResult, mcpCallTool, parseMcpResponse, resetMcpIds } from "../helpers/mcp.ts";

const TEST_TOKEN = "tp_abc123testtoken";
const VALID_PLAN_ID = "a0000000-0000-4000-8000-000000000010";

const MOCK_PLAN = {
  id: MOCK_PLAN_ID,
  user_id: MOCK_USER_ID,
  status: "active",
  start_date: "2024-01-01",
  end_date: "2024-12-31",
  name: "Test Plan",
  goal: "Test goal",
  metadata: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const MOCK_LABEL = {
  id: "label-1",
  key: "easy-run",
  label: "Easy Run",
  hue: 120,
  icon: null,
  metadata: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
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
  beforeEach(() => resetMcpIds());
  afterEach(() => clearMockSupabase());

  test("get_week_summary returns byLabel and byActivitySport buckets", async () => {
    setMockSupabase(
      createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: { select: { data: MOCK_PLAN, error: null } },
          labels: { select: { data: [MOCK_LABEL], error: null } },
          label_activity_sports: { select: { data: [{ label_id: "label-1", activity_sport: "Run" }], error: null } },
          workouts: {
            select: {
              data: [
                { id: "w1", label_id: "label-1", status: "completed", target_duration_min: 60, target_distance_m: 10000, activity_id: "a1" },
                { id: "w2", label_id: "label-1", status: "planned", target_duration_min: 45, target_distance_m: 8000, activity_id: null },
              ],
              error: null,
            },
          },
          activities: {
            select: {
              data: [{ id: "a1", sport: "Run", duration_sec: 3600, distance_m: 10000 }],
              error: null,
            },
          },
        },
      }),
    );

    const parsed = await parseMcpResponse(await mcpCallTool("get_week_summary", { planId: VALID_PLAN_ID, weekDate: "2024-03-04" }, { token: TEST_TOKEN }));
    const result = extractToolResult(parsed);

    expect(result?.result.byLabel[0].key).toBe("easy-run");
    expect(result?.result.byActivitySport[0].sport).toBe("Run");
  });

  test("compare_planned_vs_actual matches activity sport against label activitySports", async () => {
    setMockSupabase(
      createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: { select: { data: MOCK_PLAN, error: null } },
          labels: { select: { data: [MOCK_LABEL], error: null } },
          label_activity_sports: { select: { data: [{ label_id: "label-1", activity_sport: "Run" }], error: null } },
          workouts: {
            select: {
              data: [
                { id: "w1", date: "2024-03-04", label_id: "label-1", title: "Easy Run", status: "completed", target_duration_min: 60, target_distance_m: 10000, activity_id: "a1" },
              ],
              error: null,
            },
          },
          activities: {
            select: {
              data: [{ id: "a1", sport: "Run", duration_sec: 3500, distance_m: 9800, name: "Morning Run", date: "2024-03-04T07:00:00Z" }],
              error: null,
            },
          },
        },
      }),
    );

    const parsed = await parseMcpResponse(await mcpCallTool("compare_planned_vs_actual", { planId: VALID_PLAN_ID }, { token: TEST_TOKEN }));
    const result = extractToolResult(parsed);

    expect(result?.result.perWorkout[0].sportMatch).toBe(true);
    expect(result?.result.perWorkout[0].label.key).toBe("easy-run");
  });
});
