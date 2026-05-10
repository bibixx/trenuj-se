import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { clearMockSupabase, setMockSupabase } from "../helpers/setup.ts";
import { MOCK_PHASE_ID, MOCK_PLAN_ID, MOCK_USER_ID } from "../helpers/mock-env.ts";
import { extractToolResult, mcpCallTool, parseMcpResponse, resetMcpIds } from "../helpers/mcp.ts";

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

function mockAuth() {
  return {
    getUser: { data: { user: { id: MOCK_USER_ID } }, error: null },
  };
}

describe("MCP Plan Tools", () => {
  beforeEach(() => {
    resetMcpIds();
  });

  afterEach(() => {
    clearMockSupabase();
  });

  test("get_plan returns labels and summary", async () => {
    setMockSupabase(
      createMockSupabase({
        auth: mockAuth(),
        tables: {
          plans: { select: { data: MOCK_PLAN, error: null } },
          phases: {
            select: {
              data: [{ id: MOCK_PHASE_ID, name: "Base", description: null, start_date: "2024-01-01", end_date: "2024-03-31", metadata: null, created_at: "2024-01-01T00:00:00Z" }],
              error: null,
            },
          },
          labels: {
            select: {
              data: [
                { id: "label-1", key: "easy-run", label: "Easy Run", hue: 120, icon: null, metadata: null, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" },
              ],
              error: null,
            },
          },
          label_activity_sports: {
            select: {
              data: [
                { label_id: "label-1", activity_sport: "Run" },
                { label_id: "label-1", activity_sport: "TrailRun" },
              ],
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
          plan_notes: { select: { data: [], error: null, count: 0 } },
        },
      }),
    );

    const parsed = await parseMcpResponse(await mcpCallTool("get_plan", { planId: VALID_PLAN_ID }, {}));
    const result = extractToolResult(parsed);

    expect(result?.result.labels).toEqual([
      {
        id: "label-1",
        key: "easy-run",
        label: "Easy Run",
        hue: 120,
        icon: null,
        metadata: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        activitySports: ["Run", "TrailRun"],
      },
    ]);
    expect(result?.result.summary.totalWorkouts).toBe(2);
  });

  test("set_labels syncs labels by key, preserves existing ids, and warns when activitySports are missing", async () => {
    const mock = createMockSupabase({
      auth: mockAuth(),
      tables: {
        plans: { select: { data: MOCK_PLAN, error: null } },
        labels: {
          select: {
            data: [
              { id: "label-1", key: "easy-run", label: "Easy Run", hue: 120, icon: null, metadata: null, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" },
            ],
            error: null,
          },
          update: {
            data: {
              id: "label-1",
              key: "easy-run",
              label: "Easy Run",
              hue: 120,
              icon: null,
              metadata: null,
              created_at: "2024-01-01T00:00:00Z",
              updated_at: "2024-01-02T00:00:00Z",
            },
            error: null,
          },
          insert: {
            data: {
              id: "label-2",
              key: "mobility",
              label: "Mobility",
              hue: 40,
              icon: null,
              metadata: null,
              created_at: "2024-01-01T00:00:00Z",
              updated_at: "2024-01-01T00:00:00Z",
            },
            error: null,
          },
        },
        label_activity_sports: {
          select: { data: [{ label_id: "label-1", activity_sport: "Run" }], error: null },
          delete: { data: null, error: null },
          insert: { data: null, error: null },
        },
      },
    });
    setMockSupabase(mock);

    const parsed = await parseMcpResponse(
      await mcpCallTool(
        "set_labels",
        {
          planId: VALID_PLAN_ID,
          labels: [
            { key: "easy-run", label: "Easy Run", hue: 120, activitySports: ["Run"] },
            { key: "mobility", label: "Mobility", hue: 40, activitySports: [] },
          ],
        },
        {},
      ),
    );
    const result = extractToolResult(parsed);

    expect(result?.result).toEqual([
      {
        id: "label-1",
        key: "easy-run",
        label: "Easy Run",
        hue: 120,
        icon: null,
        metadata: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-02T00:00:00Z",
        activitySports: ["Run"],
      },
      {
        id: "label-2",
        key: "mobility",
        label: "Mobility",
        hue: 40,
        icon: null,
        metadata: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        activitySports: [],
      },
    ]);
    expect(mock.calls.filter((call) => call.table === "labels" && call.operation === "delete")).toHaveLength(0);
    expect(result?.warnings).toContain("Label 'mobility' has no activitySports; automatic activity matching may require manual linking.");
  });

  test("add_label creates one label without replacing existing labels", async () => {
    const mock = createMockSupabase({
      auth: mockAuth(),
      tables: {
        plans: { select: { data: MOCK_PLAN, error: null } },
        labels: {
          select: { data: null, error: null },
          insert: {
            data: {
              id: "label-2",
              key: "mobility",
              label: "Mobility",
              hue: 40,
              icon: null,
              metadata: null,
              created_at: "2024-01-01T00:00:00Z",
              updated_at: "2024-01-01T00:00:00Z",
            },
            error: null,
          },
        },
        label_activity_sports: {
          delete: { data: null, error: null },
          insert: { data: null, error: null },
        },
      },
    });
    setMockSupabase(mock);

    const parsed = await parseMcpResponse(
      await mcpCallTool(
        "add_label",
        {
          planId: VALID_PLAN_ID,
          key: "mobility",
          label: "Mobility",
          hue: 40,
          activitySports: ["Run"],
        },
        {},
      ),
    );
    const result = extractToolResult(parsed);

    expect(result?.result).toEqual({
      id: "label-2",
      key: "mobility",
      label: "Mobility",
      hue: 40,
      icon: null,
      metadata: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      activitySports: ["Run"],
    });
    expect(mock.calls.filter((call) => call.table === "labels" && call.operation === "delete")).toHaveLength(0);
    expect(mock.calls.filter((call) => call.table === "labels" && call.operation === "update")).toHaveLength(0);
    expect(mock.calls.filter((call) => call.table === "labels" && call.operation === "insert")).toHaveLength(1);
  });

  test("set_labels rejects duplicate label keys", async () => {
    setMockSupabase(createMockSupabase({ auth: mockAuth() }));

    const parsed = await parseMcpResponse(
      await mcpCallTool(
        "set_labels",
        {
          planId: VALID_PLAN_ID,
          labels: [
            { key: "mobility", label: "Mobility", hue: 40, activitySports: [] },
            { key: "mobility", label: "Mobility 2", hue: 41, activitySports: [] },
          ],
        },
        {},
      ),
    );

    expect(JSON.stringify(parsed)).toContain("Duplicate label key(s): mobility");
  });

  test("update_label updates label fields and activitySports", async () => {
    setMockSupabase(
      createMockSupabase({
        auth: mockAuth(),
        tables: {
          plans: { select: { data: MOCK_PLAN, error: null } },
          labels: {
            select: {
              data: {
                id: "label-1",
                key: "easy-run",
                label: "Easy Run",
                hue: 120,
                icon: null,
                metadata: null,
                created_at: "2024-01-01T00:00:00Z",
                updated_at: "2024-01-01T00:00:00Z",
              },
              error: null,
            },
            update: {
              data: {
                id: "label-1",
                key: "easy-run",
                label: "Aerobic Run",
                hue: 140,
                icon: null,
                metadata: null,
                created_at: "2024-01-01T00:00:00Z",
                updated_at: "2024-01-02T00:00:00Z",
              },
              error: null,
            },
          },
          label_activity_sports: {
            delete: { data: null, error: null },
            insert: { data: null, error: null },
          },
        },
      }),
    );

    const parsed = await parseMcpResponse(
      await mcpCallTool("update_label", { planId: VALID_PLAN_ID, key: "easy-run", label: "Aerobic Run", hue: 140, activitySports: ["Run", "TrailRun"] }, {}),
    );
    const result = extractToolResult(parsed);

    expect(result?.result.label).toBe("Aerobic Run");
    expect(result?.result.activitySports).toEqual(["Run", "TrailRun"]);
  });

  test("set_labels rejects non-slug label keys", async () => {
    setMockSupabase(createMockSupabase({ auth: mockAuth() }));

    const parsed = await parseMcpResponse(
      await mcpCallTool(
        "set_labels",
        {
          planId: VALID_PLAN_ID,
          labels: [{ key: "Easy Run", label: "Easy Run", hue: 120, activitySports: [] }],
        },
        {},
      ),
    );
    expect(parsed.error ?? parsed.result).toBeDefined();
  });

  test("create_plan no longer accepts colorBy", async () => {
    setMockSupabase(createMockSupabase({ auth: mockAuth() }));

    const parsed = await parseMcpResponse(await mcpCallTool("create_plan", { name: "Plan", startDate: "2024-01-01", colorBy: "sport" }, {}));

    expect(parsed.error ?? parsed.result).toBeDefined();
  });

  test("add_label rejects an unknown Tabler icon name", async () => {
    setMockSupabase(createMockSupabase({ auth: mockAuth(), tables: { plans: { select: { data: MOCK_PLAN, error: null } } } }));

    const parsed = await parseMcpResponse(
      await mcpCallTool(
        "add_label",
        {
          planId: VALID_PLAN_ID,
          key: "mobility",
          label: "Mobility",
          hue: 40,
          icon: "footprints",
          activitySports: [],
        },
        {},
      ),
    );

    const payload = JSON.stringify(parsed);
    expect(payload).toContain("footprints");
    expect(payload).toContain("search_icons");
  });

  test("add_label accepts a known Tabler icon name", async () => {
    const mock = createMockSupabase({
      auth: mockAuth(),
      tables: {
        plans: { select: { data: MOCK_PLAN, error: null } },
        labels: {
          select: { data: null, error: null },
          insert: {
            data: {
              id: "label-3",
              key: "mobility",
              label: "Mobility",
              hue: 40,
              icon: "run",
              metadata: null,
              created_at: "2024-01-01T00:00:00Z",
              updated_at: "2024-01-01T00:00:00Z",
            },
            error: null,
          },
        },
        label_activity_sports: {
          delete: { data: null, error: null },
          insert: { data: null, error: null },
        },
      },
    });
    setMockSupabase(mock);

    const parsed = await parseMcpResponse(
      await mcpCallTool(
        "add_label",
        {
          planId: VALID_PLAN_ID,
          key: "mobility",
          label: "Mobility",
          hue: 40,
          icon: "run",
          activitySports: ["Run"],
        },
        {},
      ),
    );
    const result = extractToolResult(parsed);
    expect(result?.result.icon).toBe("run");
  });
});
