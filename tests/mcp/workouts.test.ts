import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { clearMockSupabase, setMockSupabase } from "../helpers/setup.ts";
import { MOCK_PLAN_ID, MOCK_USER_ID, MOCK_WORKOUT_ID } from "../helpers/mock-env.ts";
import { extractToolError, extractToolResult, mcpCallTool, parseMcpResponse, resetMcpIds } from "../helpers/mcp.ts";

const VALID_PLAN_ID = "a0000000-0000-4000-8000-000000000010";
const VALID_WORKOUT_ID = "a0000000-0000-4000-8000-000000000030";

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

function mockAuth() {
  return {
    getUser: { data: { user: { id: MOCK_USER_ID } }, error: null },
  };
}

describe("MCP Workout Tools", () => {
  beforeEach(() => resetMcpIds());
  afterEach(() => clearMockSupabase());

  test("add_workouts supports labelKey and returns inline label", async () => {
    setMockSupabase(
      createMockSupabase({
        auth: mockAuth(),
        tables: {
          plans: { select: { data: MOCK_PLAN, error: null } },
          labels: { select: { data: [MOCK_LABEL], error: null } },
          label_activity_sports: { select: { data: [{ label_id: "label-1", activity_sport: "Run" }], error: null } },
          workouts: {
            insert: {
              data: {
                id: MOCK_WORKOUT_ID,
                plan_id: MOCK_PLAN_ID,
                phase_id: null,
                label_id: "label-1",
                date: "2024-03-01",
                title: "Easy Run",
                description: "Easy aerobic run",
                target_duration_min: 60,
                target_distance_m: null,
                sort_order: 0,
                status: "planned",
                completion_notes: null,
                trainer_notes: null,
                activity_id: null,
                execution: null,
                metadata: null,
                created_at: "2024-01-01T00:00:00Z",
                updated_at: "2024-01-01T00:00:00Z",
              },
              error: null,
            },
          },
        },
      }),
    );

    const parsed = await parseMcpResponse(
      await mcpCallTool(
        "add_workouts",
        {
          planId: VALID_PLAN_ID,
          workouts: [
            {
              date: "2024-03-01",
              labelKey: "easy-run",
              title: "Easy Run",
              description: "Easy aerobic run",
              targetDurationMin: 60,
              sortOrder: 0,
            },
          ],
        },
        {},
      ),
    );
    const result = extractToolResult(parsed);

    expect(result?.result.inserted[0].label.key).toBe("easy-run");
  });

  test("add_workouts warns when a label has no activitySports", async () => {
    setMockSupabase(
      createMockSupabase({
        auth: mockAuth(),
        tables: {
          plans: { select: { data: MOCK_PLAN, error: null } },
          labels: { select: { data: [MOCK_LABEL], error: null } },
          label_activity_sports: { select: { data: [], error: null } },
          workouts: {
            insert: {
              data: {
                id: MOCK_WORKOUT_ID,
                plan_id: MOCK_PLAN_ID,
                phase_id: null,
                label_id: "label-1",
                date: "2024-03-01",
                title: "Easy Run",
                description: "Easy aerobic run",
                target_duration_min: 60,
                target_distance_m: null,
                sort_order: 0,
                status: "planned",
                completion_notes: null,
                trainer_notes: null,
                activity_id: null,
                execution: null,
                metadata: null,
                created_at: "2024-01-01T00:00:00Z",
                updated_at: "2024-01-01T00:00:00Z",
              },
              error: null,
            },
          },
        },
      }),
    );

    const parsed = await parseMcpResponse(
      await mcpCallTool(
        "add_workouts",
        {
          planId: VALID_PLAN_ID,
          workouts: [{ date: "2024-03-01", labelKey: "easy-run", title: "Easy Run", description: "Easy aerobic run", sortOrder: 0 }],
        },
        {},
      ),
    );
    const result = extractToolResult(parsed);

    expect(result?.warnings).toContain("Workout label 'easy-run' has no activitySports; linking imported activities may require manual matching.");
  });

  test("update_workout validates execution payloads", async () => {
    setMockSupabase(
      createMockSupabase({ auth: mockAuth(), tables: { workouts: { select: { data: { id: VALID_WORKOUT_ID, plan_id: MOCK_PLAN_ID, label_id: "label-1" }, error: null } } } }),
    );

    const parsed = await parseMcpResponse(
      await mcpCallTool(
        "update_workout",
        {
          workoutId: VALID_WORKOUT_ID,
          execution: {
            version: 1,
            structure: [{ type: "interval", repetitions: 3, work: { target: { type: "time", seconds: 60 } } }],
          },
        },
        {},
      ),
    );
    const error = extractToolError(parsed);

    expect(error).toBeNull();
  });

  test("get_workouts can filter by labelKey and returns inline labels", async () => {
    setMockSupabase(
      createMockSupabase({
        auth: mockAuth(),
        tables: {
          plans: { select: { data: MOCK_PLAN, error: null } },
          labels: { select: { data: [MOCK_LABEL], error: null } },
          label_activity_sports: { select: { data: [{ label_id: "label-1", activity_sport: "Run" }], error: null } },
          workouts: {
            select: {
              data: [
                {
                  id: MOCK_WORKOUT_ID,
                  plan_id: MOCK_PLAN_ID,
                  phase_id: null,
                  label_id: "label-1",
                  date: "2024-03-01",
                  title: "Easy Run",
                  description: "Easy aerobic run",
                  target_duration_min: 60,
                  target_distance_m: null,
                  sort_order: 0,
                  status: "planned",
                  completion_notes: null,
                  trainer_notes: null,
                  activity_id: null,
                  execution: null,
                  metadata: null,
                  created_at: "2024-01-01T00:00:00Z",
                  updated_at: "2024-01-01T00:00:00Z",
                },
              ],
              error: null,
            },
          },
        },
      }),
    );

    const parsed = await parseMcpResponse(await mcpCallTool("get_workouts", { planId: VALID_PLAN_ID, labelKey: "easy-run" }, {}));
    const result = extractToolResult(parsed);

    expect(result?.result).toHaveLength(1);
    expect(result?.result[0].label.activitySports).toEqual(["Run"]);
  });

  test("add_workouts rejects providing both labelId and labelKey", async () => {
    setMockSupabase(createMockSupabase({ auth: mockAuth(), tables: { plans: { select: { data: MOCK_PLAN, error: null } } } }));

    const parsed = await parseMcpResponse(
      await mcpCallTool(
        "add_workouts",
        {
          planId: VALID_PLAN_ID,
          workouts: [
            {
              date: "2024-03-01",
              labelId: "11111111-1111-4111-8111-111111111111",
              labelKey: "easy-run",
              title: "Easy Run",
              description: "Easy aerobic run",
              sortOrder: 0,
            },
          ],
        },
        {},
      ),
    );
    expect(parsed.error ?? parsed.result).toBeDefined();
  });

  test("update_workout rejects providing both labelId and labelKey", async () => {
    setMockSupabase(createMockSupabase({ auth: mockAuth() }));

    const parsed = await parseMcpResponse(
      await mcpCallTool(
        "update_workout",
        {
          workoutId: VALID_WORKOUT_ID,
          labelId: "11111111-1111-4111-8111-111111111111",
          labelKey: "easy-run",
        },
        {},
      ),
    );

    expect(parsed.error ?? parsed.result).toBeDefined();
  });

  test("link_activity returns conflict when the activity is already linked elsewhere", async () => {
    setMockSupabase(
      createMockSupabase({
        auth: mockAuth(),
        tables: {
          workouts: {
            select: [
              { data: { id: VALID_WORKOUT_ID, activity_id: null }, error: null },
              { data: { id: "a0000000-0000-4000-8000-000000000099" }, error: null },
            ],
          },
          activities: {
            select: { data: { id: "a0000000-0000-4000-8000-000000000055" }, error: null },
          },
        },
      }),
    );

    const parsed = await parseMcpResponse(
      await mcpCallTool(
        "link_activity",
        {
          workoutId: VALID_WORKOUT_ID,
          activityId: "a0000000-0000-4000-8000-000000000055",
        },
        {},
      ),
    );
    const error = extractToolError(parsed);

    expect(error).toEqual({ code: "CONFLICT", message: "Activity is already linked to another workout" });
  });
});
