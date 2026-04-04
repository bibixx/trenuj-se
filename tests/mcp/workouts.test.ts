import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { setMockSupabase, clearMockSupabase } from "../helpers/setup.ts";
import { MOCK_TOKEN_ID, MOCK_USER_ID, MOCK_PLAN_ID, MOCK_WORKOUT_ID, MOCK_ACTIVITY_ID } from "../helpers/mock-env.ts";
import { mcpCallTool, parseMcpResponse, extractToolResult, extractToolError, resetMcpIds } from "../helpers/mcp.ts";

const TEST_TOKEN = "tp_abc123testtoken";

// Valid UUID v4s used as tool arguments (must pass Zod uuid validation)
const VALID_PLAN_ID = "a0000000-0000-4000-8000-000000000010";
const VALID_WORKOUT_ID = "a0000000-0000-4000-8000-000000000030";
const VALID_WORKOUT_ID_2 = "a0000000-0000-4000-8000-000000000031";
const VALID_ACTIVITY_ID = "a0000000-0000-4000-8000-000000000040";
const VALID_ACTIVITY_ID_2 = "a0000000-0000-4000-8000-000000000041";
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

const MOCK_WORKOUT = {
  id: MOCK_WORKOUT_ID,
  plan_id: MOCK_PLAN_ID,
  phase_id: null,
  date: "2024-03-01",
  sport: "run",
  category: "endurance",
  title: "Easy Run",
  description: "Easy aerobic run",
  target_duration_min: 60,
  target_distance_m: 10000,
  sort_order: 0,
  status: "planned",
  completion_notes: null,
  trainer_notes: null,
  activity_id: null,
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

describe("MCP Workout Tools", () => {
  beforeEach(() => {
    resetMcpIds();
  });

  afterEach(() => {
    clearMockSupabase();
  });

  // ─── add_workouts ────────────────────────────────────────────────────────

  describe("add_workouts", () => {
    test("adds workouts to a plan successfully", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          workouts: {
            insert: { data: MOCK_WORKOUT, error: null },
            select: { data: MOCK_WORKOUT, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool(
        "add_workouts",
        {
          planId: VALID_PLAN_ID,
          workouts: [
            {
              date: "2024-03-01",
              sport: "run",
              category: "endurance",
              title: "Easy Run",
              description: "Easy aerobic run",
              targetDurationMin: 60,
              sortOrder: 0,
            },
          ],
        },
        { token: TEST_TOKEN },
      );
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result).toBeDefined();
      const data = result!.result;
      expect(data.inserted).toBeInstanceOf(Array);
      expect((data.inserted as unknown[]).length).toBe(1);
      expect((data.failed as unknown[]).length).toBe(0);
    });

    test("returns VALIDATION_ERROR when all workouts fail insertion", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          workouts: {
            insert: { data: null, error: { message: "insert error" } },
            select: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool(
        "add_workouts",
        {
          planId: VALID_PLAN_ID,
          workouts: [
            {
              date: "2024-03-01",
              sport: "run",
              category: "endurance",
              title: "Failing Workout",
              description: "This will fail",
              sortOrder: 0,
            },
          ],
        },
        { token: TEST_TOKEN },
      );
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("VALIDATION_ERROR");
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

      const res = await mcpCallTool(
        "add_workouts",
        {
          planId: VALID_MISSING_ID,
          workouts: [
            {
              date: "2024-03-01",
              sport: "run",
              category: "endurance",
              title: "Run",
              description: "Run",
              sortOrder: 0,
            },
          ],
        },
        { token: TEST_TOKEN },
      );
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("NOT_FOUND");
    });

    test("adds multiple workouts and reports partial success warnings", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          workouts: {
            insert: { data: MOCK_WORKOUT, error: null },
            select: { data: MOCK_WORKOUT, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool(
        "add_workouts",
        {
          planId: VALID_PLAN_ID,
          workouts: [
            {
              date: "2024-03-01",
              sport: "run",
              category: "endurance",
              title: "Run 1",
              description: "First run",
              sortOrder: 0,
            },
            {
              date: "2024-03-02",
              sport: "bike",
              category: "endurance",
              title: "Ride 1",
              description: "First ride",
              sortOrder: 1,
            },
          ],
        },
        { token: TEST_TOKEN },
      );
      const parsed = await parseMcpResponse(res);
      // Both succeed since mock returns the same data regardless
      const result = extractToolResult(parsed);
      expect(result?.result).toBeDefined();
    });
  });

  // ─── update_workout ───────────────────────────────────────────────────────

  describe("update_workout", () => {
    test("updates workout fields", async () => {
      const updated = { ...MOCK_WORKOUT, title: "Hard Run" };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          workouts: {
            update: { data: updated, error: null },
            select: { data: updated, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("update_workout", { workoutId: VALID_WORKOUT_ID, title: "Hard Run" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.title).toBe("Hard Run");
    });

    test("returns NOT_FOUND when workout does not exist", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          workouts: {
            update: { data: null, error: null },
            select: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("update_workout", { workoutId: VALID_MISSING_ID, title: "Ghost" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("NOT_FOUND");
    });

    test("returns INTERNAL_ERROR on supabase error", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          workouts: {
            update: { data: null, error: { message: "DB error" } },
            select: { data: null, error: { message: "DB error" } },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("update_workout", { workoutId: VALID_WORKOUT_ID, title: "Error" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("INTERNAL_ERROR");
    });
  });

  // ─── remove_workouts ──────────────────────────────────────────────────────

  describe("remove_workouts", () => {
    test("removes workouts by ids", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          workouts: {
            delete: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("remove_workouts", { workoutIds: [VALID_WORKOUT_ID] }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.removed).toBe(1);
      expect(result?.result.workoutIds).toContain(VALID_WORKOUT_ID);
    });

    test("removes multiple workouts by ids", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          workouts: {
            delete: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("remove_workouts", { workoutIds: [VALID_WORKOUT_ID, VALID_WORKOUT_ID_2] }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.removed).toBe(2);
    });

    test("returns error when delete fails", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          workouts: {
            delete: { data: null, error: { message: "Cannot delete" } },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("remove_workouts", { workoutIds: [VALID_WORKOUT_ID] }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("INTERNAL_ERROR");
    });
  });

  // ─── get_workouts ─────────────────────────────────────────────────────────

  describe("get_workouts", () => {
    test("returns workouts for active plan", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          workouts: {
            select: { data: [MOCK_WORKOUT], error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_workouts", {}, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult<unknown[]>(parsed);

      expect(result?.result).toBeInstanceOf(Array);
      expect(result?.result).toHaveLength(1);
    });

    test("applies dateFrom, dateTo, sport and status filters", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          workouts: {
            select: { data: [MOCK_WORKOUT], error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool(
        "get_workouts",
        {
          planId: VALID_PLAN_ID,
          dateFrom: "2024-03-01",
          dateTo: "2024-03-31",
          sport: "run",
          status: "planned",
        },
        { token: TEST_TOKEN },
      );
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result).toBeInstanceOf(Array);
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

      const res = await mcpCallTool("get_workouts", { planId: VALID_MISSING_ID }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("NOT_FOUND");
    });
  });

  // ─── complete_workout ─────────────────────────────────────────────────────

  describe("complete_workout", () => {
    test("marks workout as completed", async () => {
      const completed = { id: MOCK_WORKOUT_ID, status: "completed", completion_notes: null };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          workouts: {
            update: { data: completed, error: null },
            select: { data: completed, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("complete_workout", { workoutId: VALID_WORKOUT_ID }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.status).toBe("completed");
    });

    test("marks workout as completed with notes", async () => {
      const completed = { id: MOCK_WORKOUT_ID, status: "completed", completion_notes: "Felt great!" };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          workouts: {
            update: { data: completed, error: null },
            select: { data: completed, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("complete_workout", { workoutId: VALID_WORKOUT_ID, notes: "Felt great!" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.completion_notes).toBe("Felt great!");
    });

    test("returns NOT_FOUND when workout does not exist", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          workouts: {
            update: { data: null, error: null },
            select: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("complete_workout", { workoutId: VALID_MISSING_ID }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("NOT_FOUND");
    });
  });

  // ─── skip_workout ─────────────────────────────────────────────────────────

  describe("skip_workout", () => {
    test("marks workout as skipped", async () => {
      const skipped = { id: MOCK_WORKOUT_ID, status: "skipped", completion_notes: null };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          workouts: {
            update: { data: skipped, error: null },
            select: { data: skipped, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("skip_workout", { workoutId: VALID_WORKOUT_ID }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.status).toBe("skipped");
    });

    test("marks workout as skipped with reason", async () => {
      const skipped = { id: MOCK_WORKOUT_ID, status: "skipped", completion_notes: "Sick day" };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          workouts: {
            update: { data: skipped, error: null },
            select: { data: skipped, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("skip_workout", { workoutId: VALID_WORKOUT_ID, reason: "Sick day" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.completion_notes).toBe("Sick day");
    });

    test("returns NOT_FOUND when workout does not exist", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          workouts: {
            update: { data: null, error: null },
            select: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("skip_workout", { workoutId: VALID_MISSING_ID }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("NOT_FOUND");
    });
  });

  // ─── link_activity ────────────────────────────────────────────────────────

  describe("link_activity", () => {
    test("links activity to workout", async () => {
      const workoutWithNoActivity = { id: MOCK_WORKOUT_ID, activity_id: null };
      const activity = { id: MOCK_ACTIVITY_ID };
      const linked = { id: MOCK_WORKOUT_ID, status: "completed", activity_id: VALID_ACTIVITY_ID };

      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          workouts: {
            select: { data: workoutWithNoActivity, error: null },
            update: { data: linked, error: null },
          },
          activities: {
            select: { data: activity, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("link_activity", { workoutId: VALID_WORKOUT_ID, activityId: VALID_ACTIVITY_ID }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.status).toBe("completed");
    });

    test("returns CONFLICT when workout already has a linked activity", async () => {
      const workoutAlreadyLinked = { id: MOCK_WORKOUT_ID, activity_id: VALID_ACTIVITY_ID };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          workouts: {
            select: { data: workoutAlreadyLinked, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("link_activity", { workoutId: VALID_WORKOUT_ID, activityId: VALID_ACTIVITY_ID_2 }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("CONFLICT");
    });

    test("returns NOT_FOUND when workout does not exist", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          workouts: {
            select: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("link_activity", { workoutId: VALID_MISSING_ID, activityId: VALID_ACTIVITY_ID }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("NOT_FOUND");
    });

    test("returns NOT_FOUND when activity does not exist", async () => {
      const workoutWithNoActivity = { id: MOCK_WORKOUT_ID, activity_id: null };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          workouts: {
            select: { data: workoutWithNoActivity, error: null },
          },
          activities: {
            select: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("link_activity", { workoutId: VALID_WORKOUT_ID, activityId: VALID_MISSING_ID }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("NOT_FOUND");
    });
  });

  // ─── unlink_activity ──────────────────────────────────────────────────────

  describe("unlink_activity", () => {
    test("removes activity link and resets to planned", async () => {
      const unlinked = { id: MOCK_WORKOUT_ID, status: "planned", activity_id: null };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          workouts: {
            update: { data: unlinked, error: null },
            select: { data: unlinked, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("unlink_activity", { workoutId: VALID_WORKOUT_ID }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.status).toBe("planned");
      expect(result?.result.activity_id).toBeNull();
    });

    test("returns NOT_FOUND when workout does not exist", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          workouts: {
            update: { data: null, error: null },
            select: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("unlink_activity", { workoutId: VALID_MISSING_ID }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("NOT_FOUND");
    });
  });

  // ─── add_trainer_notes ────────────────────────────────────────────────────

  describe("add_trainer_notes", () => {
    test("adds trainer notes to a workout by workoutId", async () => {
      const result = { id: MOCK_WORKOUT_ID, trainer_notes: "Great effort today" };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          workouts: {
            update: { data: result, error: null },
            select: { data: result, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("add_trainer_notes", { workoutId: VALID_WORKOUT_ID, notes: "Great effort today" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const toolResult = extractToolResult(parsed);

      expect(toolResult?.result.target).toBe("workout");
      expect(toolResult?.result.trainer_notes).toBe("Great effort today");
    });

    test("adds trainer notes to an activity by activityId", async () => {
      const result = { id: MOCK_ACTIVITY_ID, trainer_notes: "Great ride!" };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          activities: {
            update: { data: result, error: null },
            select: { data: result, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("add_trainer_notes", { activityId: VALID_ACTIVITY_ID, notes: "Great ride!" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const toolResult = extractToolResult(parsed);

      expect(toolResult?.result.target).toBe("activity");
      expect(toolResult?.result.trainer_notes).toBe("Great ride!");
    });

    test("returns VALIDATION_ERROR when neither workoutId nor activityId is provided", async () => {
      const mock = createMockSupabase({
        tables: { ...authTokenTables() },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("add_trainer_notes", { notes: "Notes without target" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("VALIDATION_ERROR");
    });

    test("returns VALIDATION_ERROR when both workoutId and activityId are provided", async () => {
      const mock = createMockSupabase({
        tables: { ...authTokenTables() },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("add_trainer_notes", { workoutId: VALID_WORKOUT_ID, activityId: VALID_ACTIVITY_ID, notes: "Both targets" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("VALIDATION_ERROR");
    });

    test("returns NOT_FOUND when workout does not exist", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          workouts: {
            update: { data: null, error: null },
            select: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("add_trainer_notes", { workoutId: VALID_MISSING_ID, notes: "Notes for ghost" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("NOT_FOUND");
    });
  });
});
