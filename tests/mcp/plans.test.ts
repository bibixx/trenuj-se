import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { setMockSupabase, clearMockSupabase } from "../helpers/setup.ts";
import { MOCK_TOKEN_ID, MOCK_USER_ID, MOCK_PLAN_ID, MOCK_PHASE_ID } from "../helpers/mock-env.ts";
import { mcpCallTool, parseMcpResponse, extractToolResult, extractToolError, resetMcpIds } from "../helpers/mcp.ts";

const TEST_TOKEN = "tp_abc123testtoken";

// Valid UUID v4s used as tool arguments (passed through Zod uuid validation)
const VALID_PLAN_ID = "a0000000-0000-4000-8000-000000000010";
const VALID_PHASE_ID = "a0000000-0000-4000-8000-000000000020";
const VALID_PLAN_ID_MISSING = "a0000000-0000-4000-8000-000000000099";

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

function authTokenTables() {
  return {
    api_tokens: {
      select: { data: { id: MOCK_TOKEN_ID, user_id: MOCK_USER_ID }, error: null },
      update: { data: null, error: null },
    },
  };
}

describe("MCP Plan Tools", () => {
  beforeEach(() => {
    resetMcpIds();
  });

  afterEach(() => {
    clearMockSupabase();
  });

  // ─── list_plans ──────────────────────────────────────────────────────────

  describe("list_plans", () => {
    test("returns list of plans", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: {
              data: [
                { ...MOCK_PLAN, name: "Plan A" },
                { ...MOCK_PLAN, id: "a0000000-0000-4000-8000-000000000011", name: "Plan B", status: "inactive" },
              ],
              error: null,
            },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("list_plans", {}, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult<unknown[]>(parsed);

      expect(parsed.result).toBeDefined();
      expect(result?.result).toBeInstanceOf(Array);
      expect(result?.result).toHaveLength(2);
    });

    test("filters plans by status", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: [MOCK_PLAN], error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("list_plans", { status: "active" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result).toBeInstanceOf(Array);
    });

    test("returns error when supabase select fails", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: null, error: { message: "Database error" } },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("list_plans", {}, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err).not.toBeNull();
      expect(err?.code).toBe("INTERNAL_ERROR");
    });
  });

  // ─── get_plan ────────────────────────────────────────────────────────────

  describe("get_plan", () => {
    test("returns plan with phases, workout types, and summary (active plan)", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          phases: {
            select: {
              data: [
                {
                  id: MOCK_PHASE_ID,
                  name: "Base",
                  description: "Base phase",
                  start_date: "2024-01-01",
                  end_date: "2024-03-31",
                  sort_order: 0,
                  metadata: null,
                  created_at: "2024-01-01T00:00:00Z",
                },
              ],
              error: null,
            },
          },
          workout_types: {
            select: {
              data: [{ id: "wt-1", key: "run", label: "Running", hue: 120, icon: null, sort_order: 0 }],
              error: null,
            },
          },
          workouts: {
            select: {
              data: [
                { id: "w1", status: "completed", phase_id: MOCK_PHASE_ID },
                { id: "w2", status: "planned", phase_id: MOCK_PHASE_ID },
              ],
              error: null,
            },
          },
          plan_notes: {
            select: { data: [], error: null, count: 0 },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_plan", {}, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result).toBeDefined();
      const plan = result!.result;
      expect(plan.id).toBe(MOCK_PLAN_ID);
      expect(plan.phases).toBeInstanceOf(Array);
      expect(plan.workoutTypes).toBeInstanceOf(Array);
      expect(plan.summary).toBeDefined();
    });

    test("returns plan by explicit planId", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          phases: {
            select: { data: [], error: null },
          },
          workout_types: {
            select: { data: [], error: null },
          },
          workouts: {
            select: { data: [], error: null },
          },
          plan_notes: {
            select: { data: [], error: null, count: 0 },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_plan", { planId: VALID_PLAN_ID }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.id).toBe(MOCK_PLAN_ID);
    });

    test("returns NOT_FOUND when no active plan exists", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_plan", {}, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("NOT_FOUND");
    });

    test("returns error when phases query fails", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          phases: {
            select: { data: null, error: { message: "phases error" } },
          },
          workout_types: {
            select: { data: [], error: null },
          },
          workouts: {
            select: { data: [], error: null },
          },
          plan_notes: {
            select: { data: [], error: null, count: 0 },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_plan", {}, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("INTERNAL_ERROR");
    });
  });

  // ─── create_plan ─────────────────────────────────────────────────────────

  describe("create_plan", () => {
    test("creates a plan and deactivates the existing active plan", async () => {
      const newPlan = {
        id: "a0000000-0000-4000-8000-000000000099",
        name: "New Plan",
        goal: "Win",
        status: "active",
        start_date: "2025-01-01",
        end_date: "2025-12-31",
        color_by: "sport",
        metadata: null,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            update: { data: null, error: null },
            insert: { data: newPlan, error: null },
            select: { data: newPlan, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool(
        "create_plan",
        {
          name: "New Plan",
          goal: "Win",
          startDate: "2025-01-01",
          endDate: "2025-12-31",
          colorBy: "sport",
        },
        { token: TEST_TOKEN },
      );
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result).toBeDefined();
      expect(result?.result.name).toBe("New Plan");
    });

    test("returns VALIDATION_ERROR when endDate is before startDate", async () => {
      const mock = createMockSupabase({
        tables: { ...authTokenTables() },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool(
        "create_plan",
        {
          name: "Bad Plan",
          startDate: "2025-06-01",
          endDate: "2025-01-01",
          colorBy: "sport",
        },
        { token: TEST_TOKEN },
      );
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("VALIDATION_ERROR");
    });

    test("returns error when insert fails", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            update: { data: null, error: null },
            insert: { data: null, error: { message: "insert error" } },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool(
        "create_plan",
        {
          name: "Failing Plan",
          startDate: "2025-01-01",
          colorBy: "sport",
        },
        { token: TEST_TOKEN },
      );
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("INTERNAL_ERROR");
    });
  });

  // ─── update_plan ─────────────────────────────────────────────────────────

  describe("update_plan", () => {
    test("updates plan fields (partial update)", async () => {
      const updatedPlan = { ...MOCK_PLAN, name: "Updated Name" };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
            update: { data: updatedPlan, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("update_plan", { planId: VALID_PLAN_ID, name: "Updated Name" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.name).toBe("Updated Name");
    });

    test("updates active plan without planId", async () => {
      const updatedPlan = { ...MOCK_PLAN, goal: "New goal" };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
            update: { data: updatedPlan, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("update_plan", { goal: "New goal" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.goal).toBe("New goal");
    });

    test("returns NOT_FOUND for non-existent plan", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("update_plan", { planId: VALID_PLAN_ID_MISSING, name: "X" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("NOT_FOUND");
    });

    test("returns VALIDATION_ERROR when endDate before startDate", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("update_plan", { planId: VALID_PLAN_ID, startDate: "2025-06-01", endDate: "2025-01-01" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("VALIDATION_ERROR");
    });
  });

  // ─── deactivate_plan ─────────────────────────────────────────────────────

  describe("deactivate_plan", () => {
    test("deactivates the active plan", async () => {
      const deactivatedPlan = { id: MOCK_PLAN_ID, name: "Test Plan", status: "inactive" };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
            update: { data: deactivatedPlan, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("deactivate_plan", {}, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.status).toBe("inactive");
    });

    test("deactivates a plan by explicit planId", async () => {
      const deactivatedPlan = { id: MOCK_PLAN_ID, name: "Test Plan", status: "inactive" };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
            update: { data: deactivatedPlan, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("deactivate_plan", { planId: VALID_PLAN_ID }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.status).toBe("inactive");
    });

    test("returns NOT_FOUND when no active plan", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("deactivate_plan", {}, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("NOT_FOUND");
    });
  });

  // ─── set_workout_types ───────────────────────────────────────────────────

  describe("set_workout_types", () => {
    test("replaces all workout types and returns them", async () => {
      const insertedTypes = [
        { id: "wt-1", key: "run", label: "Running", hue: 120, icon: null, sort_order: 0 },
        { id: "wt-2", key: "bike", label: "Cycling", hue: 200, icon: null, sort_order: 1 },
      ];
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          workouts: {
            select: { data: [{ sport: "run" }, { sport: "bike" }], error: null },
          },
          workout_types: {
            delete: { data: null, error: null },
            insert: { data: insertedTypes, error: null },
            select: { data: insertedTypes, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool(
        "set_workout_types",
        {
          planId: VALID_PLAN_ID,
          types: [
            { key: "run", label: "Running", hue: 120, sortOrder: 0 },
            { key: "bike", label: "Cycling", hue: 200, sortOrder: 1 },
          ],
        },
        { token: TEST_TOKEN },
      );
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result).toBeInstanceOf(Array);
    });

    test("includes warnings for unmatched workout type keys", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          workouts: {
            select: { data: [{ sport: "run" }], error: null },
          },
          workout_types: {
            delete: { data: null, error: null },
            insert: {
              data: [{ id: "wt-1", key: "swim", label: "Swimming", hue: 220, icon: null, sort_order: 0 }],
              error: null,
            },
            select: { data: [], error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool(
        "set_workout_types",
        {
          planId: VALID_PLAN_ID,
          types: [{ key: "swim", label: "Swimming", hue: 220, sortOrder: 0 }],
        },
        { token: TEST_TOKEN },
      );
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.warnings).toBeInstanceOf(Array);
      expect((result?.warnings ?? []).length).toBeGreaterThan(0);
    });
  });

  // ─── update_workout_type ─────────────────────────────────────────────────

  describe("update_workout_type", () => {
    test("updates a workout type by key", async () => {
      const updatedType = { id: "wt-1", key: "run", label: "Road Running", hue: 130, icon: null, sort_order: 0 };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          workout_types: {
            update: { data: updatedType, error: null },
            select: { data: updatedType, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("update_workout_type", { planId: VALID_PLAN_ID, key: "run", label: "Road Running", hue: 130 }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.label).toBe("Road Running");
    });

    test("returns NOT_FOUND when workout type key does not exist", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          workout_types: {
            update: { data: null, error: null },
            select: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("update_workout_type", { planId: VALID_PLAN_ID, key: "nonexistent" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("NOT_FOUND");
    });
  });

  // ─── add_phase ───────────────────────────────────────────────────────────

  describe("add_phase", () => {
    test("adds a phase to the plan", async () => {
      const newPhase = {
        id: MOCK_PHASE_ID,
        name: "Base Phase",
        description: null,
        start_date: "2024-01-01",
        end_date: "2024-03-31",
        sort_order: 0,
        metadata: null,
        created_at: "2024-01-01T00:00:00Z",
      };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          phases: {
            insert: { data: newPhase, error: null },
            select: { data: newPhase, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool(
        "add_phase",
        {
          planId: VALID_PLAN_ID,
          name: "Base Phase",
          startDate: "2024-01-01",
          endDate: "2024-03-31",
          sortOrder: 0,
        },
        { token: TEST_TOKEN },
      );
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.name).toBe("Base Phase");
    });

    test("returns VALIDATION_ERROR when phase endDate before startDate", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool(
        "add_phase",
        {
          planId: VALID_PLAN_ID,
          name: "Bad Phase",
          startDate: "2024-06-01",
          endDate: "2024-01-01",
          sortOrder: 0,
        },
        { token: TEST_TOKEN },
      );
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("VALIDATION_ERROR");
    });

    test("returns VALIDATION_ERROR when phase dates are outside plan range", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool(
        "add_phase",
        {
          planId: VALID_PLAN_ID,
          name: "Out-of-range Phase",
          startDate: "2023-01-01",
          endDate: "2023-06-01",
          sortOrder: 0,
        },
        { token: TEST_TOKEN },
      );
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("VALIDATION_ERROR");
    });
  });

  // ─── update_phase ─────────────────────────────────────────────────────────

  describe("update_phase", () => {
    test("updates phase fields", async () => {
      const existingPhase = {
        id: MOCK_PHASE_ID,
        plan_id: MOCK_PLAN_ID,
        user_id: MOCK_USER_ID,
        start_date: "2024-01-01",
        end_date: "2024-03-31",
      };
      const updatedPhase = {
        id: MOCK_PHASE_ID,
        name: "Updated Phase",
        description: "New description",
        start_date: "2024-01-01",
        end_date: "2024-03-31",
        sort_order: 1,
        metadata: null,
        created_at: "2024-01-01T00:00:00Z",
      };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          phases: {
            select: { data: existingPhase, error: null },
            update: { data: updatedPhase, error: null },
          },
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("update_phase", { phaseId: VALID_PHASE_ID, name: "Updated Phase", description: "New description" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.name).toBe("Updated Phase");
    });

    test("returns NOT_FOUND when phase does not exist", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          phases: {
            select: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("update_phase", { phaseId: VALID_PLAN_ID_MISSING, name: "Ghost Phase" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("NOT_FOUND");
    });
  });

  // ─── remove_phase ─────────────────────────────────────────────────────────

  describe("remove_phase", () => {
    test("removes a phase by id", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          phases: {
            delete: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("remove_phase", { phaseId: VALID_PHASE_ID }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.removed).toBe(true);
      expect(result?.result.phaseId).toBe(VALID_PHASE_ID);
    });

    test("returns error when delete fails", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          phases: {
            delete: { data: null, error: { message: "Cannot delete phase" } },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("remove_phase", { phaseId: VALID_PHASE_ID }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("INTERNAL_ERROR");
    });
  });
});
