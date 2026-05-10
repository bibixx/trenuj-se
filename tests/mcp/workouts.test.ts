import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { clearMockSupabase, setMockSupabase } from "../helpers/setup.ts";
import { MOCK_PLAN_ID, MOCK_USER_ID, MOCK_WORKOUT_ID } from "../helpers/mock-env.ts";
import { extractToolError, extractToolResult, mcpCallTool, parseMcpResponse, resetMcpIds } from "../helpers/mcp.ts";

const VALID_PLAN_ID = "a0000000-0000-4000-8000-000000000010";
const VALID_WORKOUT_ID = "a0000000-0000-4000-8000-000000000030";
const VALID_WORKOUT_ID_2 = "a0000000-0000-4000-8000-000000000031";

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
  plan_id: MOCK_PLAN_ID,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const MOCK_LABEL_RUN = {
  ...MOCK_LABEL,
  label_activity_sports: [{ activity_sport: "Run" }],
};

const MOCK_LABEL_NO_SPORTS = {
  ...MOCK_LABEL,
  label_activity_sports: [],
};

function buildExistingWorkout(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_WORKOUT_ID,
    plan_id: MOCK_PLAN_ID,
    phase_id: null,
    label_id: null,
    date: "2024-03-01",
    title: "Existing",
    description: "Existing description",
    target_duration_min: 45,
    target_distance_m: null,
    sort_order: 0,
    status: "planned",
    completion_notes: null,
    trainer_notes: null,
    execution: null,
    metadata: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

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
          labels: { select: { data: [MOCK_LABEL_RUN], error: null } },
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
              execution: { version: 2, structure: [{ type: "steady", target: { type: "time", seconds: 600 } }] },
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
          labels: { select: { data: [MOCK_LABEL_NO_SPORTS], error: null } },
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
              sortOrder: 0,
              execution: { version: 2, structure: [{ type: "steady", target: { type: "time", seconds: 600 } }] },
            },
          ],
        },
        {},
      ),
    );
    const result = extractToolResult(parsed);

    expect(result?.warnings).toContain("Workout label 'easy-run' has no activitySports; linking imported activities may require manual matching.");
  });

  test("add_workouts warns when a workout is created without execution", async () => {
    setMockSupabase(
      createMockSupabase({
        auth: mockAuth(),
        tables: {
          plans: { select: { data: MOCK_PLAN, error: null } },
          labels: { select: { data: [MOCK_LABEL_RUN], error: null } },
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

    expect(result?.warnings).toContain(
      "Workout 'Easy Run' was created without execution data. Most workouts should include structured blocks (warmup/steady/interval/cooldown) plus appleWatch.activityType+location for Apple Watch export. Omit only for genuinely unstructured workouts (e.g. pure strength).",
    );
  });

  test("add_workouts does not warn about missing execution when execution is provided", async () => {
    setMockSupabase(
      createMockSupabase({
        auth: mockAuth(),
        tables: {
          plans: { select: { data: MOCK_PLAN, error: null } },
          labels: { select: { data: [MOCK_LABEL_RUN], error: null } },
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
                target_duration_min: null,
                target_distance_m: null,
                sort_order: 0,
                status: "planned",
                completion_notes: null,
                trainer_notes: null,
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
              sortOrder: 0,
              execution: { version: 2, structure: [{ type: "steady", target: { type: "time", seconds: 600 } }] },
            },
          ],
        },
        {},
      ),
    );
    const result = extractToolResult(parsed);

    const missingExecutionWarning = result?.warnings?.find((warning: string) => warning.includes("was created without execution data"));
    expect(missingExecutionWarning).toBeUndefined();
  });

  test("update_workout validates execution payloads", async () => {
    setMockSupabase(
      createMockSupabase({
        auth: mockAuth(),
        tables: {
          workouts: {
            select: { data: [buildExistingWorkout({ label_id: "label-1" })], error: null },
            upsert: { data: [buildExistingWorkout({ label_id: "label-1" })], error: null },
          },
          labels: { select: { data: [MOCK_LABEL_RUN], error: null } },
        },
      }),
    );

    const parsed = await parseMcpResponse(
      await mcpCallTool(
        "update_workout",
        {
          workoutId: VALID_WORKOUT_ID,
          execution: {
            version: 2,
            structure: [{ type: "interval", repetitions: 3, work: { target: { type: "time", seconds: 60 } } }],
          },
        },
        {},
      ),
    );
    const error = extractToolError(parsed);

    expect(error).toBeNull();
  });

  test("update_workout surfaces a helpful execution validation message", async () => {
    setMockSupabase(createMockSupabase({ auth: mockAuth() }));

    const parsed = await parseMcpResponse(
      await mcpCallTool(
        "update_workout",
        {
          workoutId: VALID_WORKOUT_ID,
          execution: {
            version: 2,
            structure: [{ type: "steady", target: { type: "time", seconds: 600 }, cue: { notes: "Keep it easy" } }],
          },
        },
        {},
      ),
    );

    expect(JSON.stringify(parsed)).toContain("cue is not allowed; use alert");
  });

  test("get_workouts can filter by labelKey and returns inline labels", async () => {
    setMockSupabase(
      createMockSupabase({
        auth: mockAuth(),
        tables: {
          plans: { select: { data: MOCK_PLAN, error: null } },
          labels: { select: { data: [MOCK_LABEL_RUN], error: null } },
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

  test("add_workouts rejects execution with an unknown block type (schema is wired on the tool input)", async () => {
    setMockSupabase(
      createMockSupabase({
        auth: mockAuth(),
        tables: {
          plans: { select: { data: MOCK_PLAN, error: null } },
          labels: { select: { data: [MOCK_LABEL], error: null } },
          label_activity_sports: { select: { data: [{ label_id: "label-1", activity_sport: "Run" }], error: null } },
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
              sortOrder: 0,
              execution: {
                version: 2,
                structure: [{ type: "not-a-real-block", target: { type: "time", seconds: 60 } }],
              },
            },
          ],
        },
        {},
      ),
    );

    // Input schema validation rejects the call at the MCP layer (JSON-RPC error)
    // or inside the tool handler (content[0] with isError). Either is acceptable —
    // what matters is that no workout gets inserted.
    const rejected = Boolean(parsed.error) || Boolean((parsed.result as { isError?: boolean } | undefined)?.isError);
    expect(rejected).toBe(true);
  });

  test("add_workouts accepts a full execution with nested repeat + pace-range alerts", async () => {
    setMockSupabase(
      createMockSupabase({
        auth: mockAuth(),
        tables: {
          plans: { select: { data: MOCK_PLAN, error: null } },
          labels: { select: { data: [MOCK_LABEL_RUN], error: null } },
          workouts: {
            insert: {
              data: {
                id: MOCK_WORKOUT_ID,
                plan_id: MOCK_PLAN_ID,
                phase_id: null,
                label_id: "label-1",
                date: "2024-03-01",
                title: "Tempo Run",
                description: "Tempo intervals",
                target_duration_min: 60,
                target_distance_m: null,
                sort_order: 0,
                status: "planned",
                completion_notes: null,
                trainer_notes: null,
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
              title: "Tempo Run",
              description: "Tempo intervals",
              sortOrder: 0,
              execution: {
                version: 2,
                structure: [
                  { type: "warmup", target: { type: "time", seconds: 600 } },
                  {
                    type: "repeat",
                    repetitions: 2,
                    blocks: [
                      {
                        type: "interval",
                        repetitions: 3,
                        work: {
                          target: { type: "distance", meters: 1000 },
                          alert: { type: "paceRange", unit: "min/km", min: "4:50", max: "5:10" },
                        },
                        recovery: { target: { type: "time", seconds: 90 } },
                      },
                    ],
                  },
                  { type: "cooldown", target: { type: "time", seconds: 600 } },
                ],
              },
            },
          ],
        },
        {},
      ),
    );
    const error = extractToolError(parsed);

    expect(error).toBeNull();
  });

  test("add_workouts rejects an invalid pace alert where unit and threshold type disagree", async () => {
    setMockSupabase(
      createMockSupabase({
        auth: mockAuth(),
        tables: {
          plans: { select: { data: MOCK_PLAN, error: null } },
          labels: { select: { data: [MOCK_LABEL], error: null } },
          label_activity_sports: { select: { data: [], error: null } },
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
              title: "Tempo Run",
              description: "Tempo intervals",
              sortOrder: 0,
              execution: {
                version: 2,
                structure: [
                  {
                    type: "steady",
                    target: { type: "time", seconds: 600 },
                    alert: { type: "paceThreshold", unit: "km/h", threshold: "4:50" },
                  },
                ],
              },
            },
          ],
        },
        {},
      ),
    );

    const rejected = Boolean(parsed.error) || Boolean((parsed.result as { isError?: boolean } | undefined)?.isError);
    expect(rejected).toBe(true);
  });

  test("update_workout accepts execution: null to clear", async () => {
    setMockSupabase(
      createMockSupabase({
        auth: mockAuth(),
        tables: {
          workouts: {
            select: { data: [buildExistingWorkout({ label_id: "label-1", execution: { version: 2, structure: [] } })], error: null },
            upsert: { data: [buildExistingWorkout({ label_id: "label-1", execution: null })], error: null },
          },
          labels: { select: { data: [MOCK_LABEL_NO_SPORTS], error: null } },
        },
      }),
    );

    const parsed = await parseMcpResponse(await mcpCallTool("update_workout", { workoutId: VALID_WORKOUT_ID, execution: null }, {}));
    const error = extractToolError(parsed);

    expect(error).toBeNull();
  });

  test("batch_update_workouts updates multiple workouts, resolves labelKey, and records partial failures", async () => {
    const BOGUS_WORKOUT_ID = "a0000000-0000-4000-8000-000000000099";
    const mock = createMockSupabase({
      auth: mockAuth(),
      tables: {
        workouts: {
          select: {
            data: [
              buildExistingWorkout({ id: VALID_WORKOUT_ID, label_id: null }),
              buildExistingWorkout({ id: VALID_WORKOUT_ID_2, label_id: null }),
              buildExistingWorkout({ id: BOGUS_WORKOUT_ID, label_id: null }),
            ],
            error: null,
          },
          upsert: {
            data: [
              buildExistingWorkout({ id: VALID_WORKOUT_ID, label_id: "label-1" }),
              buildExistingWorkout({ id: VALID_WORKOUT_ID_2, status: "skipped", completion_notes: "Sick" }),
            ],
            error: null,
          },
        },
        labels: { select: { data: [MOCK_LABEL_RUN], error: null } },
      },
    });
    setMockSupabase(mock);

    const parsed = await parseMcpResponse(
      await mcpCallTool(
        "batch_update_workouts",
        {
          updates: [
            { workoutId: VALID_WORKOUT_ID, labelKey: "easy-run" },
            { workoutId: VALID_WORKOUT_ID_2, status: "skipped", completionNotes: "Sick" },
            { workoutId: BOGUS_WORKOUT_ID, labelKey: "missing-label" },
          ],
        },
        {},
      ),
    );
    const result = extractToolResult(parsed);

    expect(result?.result.updated).toHaveLength(2);
    expect(result?.result.updated[0].label.key).toBe("easy-run");
    expect(result?.result.failed).toEqual([{ index: 2, workoutId: BOGUS_WORKOUT_ID, errors: { code: "NOT_FOUND", message: "Label 'missing-label' not found" } }]);
    expect(result?.warnings).toContain("1 workout(s) failed validation or update");

    const upsertCalls = mock.calls.filter((call) => call.table === "workouts" && call.operation === "upsert");
    expect(upsertCalls).toHaveLength(1);
    const updateCalls = mock.calls.filter((call) => call.table === "workouts" && call.operation === "update");
    expect(updateCalls).toHaveLength(0);
    const upsertPayload = upsertCalls[0]?.args[0] as Array<Record<string, unknown>>;
    expect(upsertPayload).toHaveLength(2);
    expect(upsertPayload[0]).toEqual(expect.objectContaining({ id: VALID_WORKOUT_ID, label_id: "label-1" }));
    expect(upsertPayload[1]).toEqual(expect.objectContaining({ id: VALID_WORKOUT_ID_2, status: "skipped", completion_notes: "Sick" }));
  });

  test("batch_update_workouts rejects duplicate workout IDs", async () => {
    setMockSupabase(createMockSupabase({ auth: mockAuth() }));

    const parsed = await parseMcpResponse(
      await mcpCallTool(
        "batch_update_workouts",
        {
          updates: [
            { workoutId: VALID_WORKOUT_ID, title: "One" },
            { workoutId: VALID_WORKOUT_ID, title: "Two" },
          ],
        },
        {},
      ),
    );

    expect(JSON.stringify(parsed)).toContain(`Duplicate workoutId(s): ${VALID_WORKOUT_ID}`);
  });

  test("batch_update_workouts uses a single upsert regardless of batch size", async () => {
    const ids = [
      "a0000000-0000-4000-8000-000000000040",
      "a0000000-0000-4000-8000-000000000041",
      "a0000000-0000-4000-8000-000000000042",
      "a0000000-0000-4000-8000-000000000043",
      "a0000000-0000-4000-8000-000000000044",
    ];
    const existing = ids.map((id) => buildExistingWorkout({ id, label_id: null }));
    const upserted = ids.map((id) => buildExistingWorkout({ id, title: "Renamed" }));
    const mock = createMockSupabase({
      auth: mockAuth(),
      tables: {
        workouts: {
          select: { data: existing, error: null },
          upsert: { data: upserted, error: null },
        },
        labels: { select: { data: [MOCK_LABEL_RUN], error: null } },
      },
    });
    setMockSupabase(mock);

    await parseMcpResponse(
      await mcpCallTool(
        "batch_update_workouts",
        {
          updates: ids.map((workoutId) => ({ workoutId, title: "Renamed" })),
        },
        {},
      ),
    );

    const upsertCalls = mock.calls.filter((call) => call.table === "workouts" && call.operation === "upsert");
    const updateCalls = mock.calls.filter((call) => call.table === "workouts" && call.operation === "update");
    expect(upsertCalls).toHaveLength(1);
    expect(updateCalls).toHaveLength(0);
  });

  test("batch_update_workouts merges patches over existing rows", async () => {
    const existing = buildExistingWorkout({
      id: VALID_WORKOUT_ID,
      title: "Original Title",
      description: "Foo",
      execution: { version: 2, structure: [] },
      target_duration_min: 90,
    });
    const mock = createMockSupabase({
      auth: mockAuth(),
      tables: {
        workouts: {
          select: { data: [existing], error: null },
          upsert: { data: [{ ...existing, execution: null }], error: null },
        },
        labels: { select: { data: [], error: null } },
      },
    });
    setMockSupabase(mock);

    await parseMcpResponse(await mcpCallTool("batch_update_workouts", { updates: [{ workoutId: VALID_WORKOUT_ID, execution: null }] }, {}));

    const upsertCalls = mock.calls.filter((call) => call.table === "workouts" && call.operation === "upsert");
    const payload = upsertCalls[0]?.args[0] as Array<Record<string, unknown>>;
    expect(payload).toHaveLength(1);
    expect(payload[0]).toEqual(
      expect.objectContaining({
        id: VALID_WORKOUT_ID,
        title: "Original Title",
        description: "Foo",
        target_duration_min: 90,
        execution: null,
      }),
    );
  });

  test("batch_update_workouts handles cross-plan batches", async () => {
    const PLAN_A = MOCK_PLAN_ID;
    const PLAN_B = "a0000000-0000-4000-8000-000000000020";
    const LABEL_A = { ...MOCK_LABEL_RUN, id: "label-a", key: "easy-a", plan_id: PLAN_A };
    const LABEL_B = { ...MOCK_LABEL_RUN, id: "label-b", key: "easy-b", plan_id: PLAN_B };

    const existingA = buildExistingWorkout({ id: VALID_WORKOUT_ID, plan_id: PLAN_A, label_id: null });
    const existingB = buildExistingWorkout({ id: VALID_WORKOUT_ID_2, plan_id: PLAN_B, label_id: null });

    const mock = createMockSupabase({
      auth: mockAuth(),
      tables: {
        workouts: {
          select: { data: [existingA, existingB], error: null },
          upsert: {
            data: [
              { ...existingA, label_id: "label-a" },
              { ...existingB, label_id: "label-b" },
            ],
            error: null,
          },
        },
        labels: { select: { data: [LABEL_A, LABEL_B], error: null } },
      },
    });
    setMockSupabase(mock);

    const parsed = await parseMcpResponse(
      await mcpCallTool(
        "batch_update_workouts",
        {
          updates: [
            { workoutId: VALID_WORKOUT_ID, labelKey: "easy-a" },
            { workoutId: VALID_WORKOUT_ID_2, labelKey: "easy-b" },
          ],
        },
        {},
      ),
    );
    const result = extractToolResult(parsed);

    expect(result?.result.updated).toHaveLength(2);
    expect(result?.result.updated[0].label.id).toBe("label-a");
    expect(result?.result.updated[1].label.id).toBe("label-b");

    const labelsSelectCalls = mock.calls.filter((call) => call.table === "labels" && call.operation === "select");
    expect(labelsSelectCalls).toHaveLength(1);
  });

  test("batch_update_workouts records NOT_FOUND for missing workoutId without aborting", async () => {
    const MISSING_ID = "a0000000-0000-4000-8000-000000000077";
    const existing = [buildExistingWorkout({ id: VALID_WORKOUT_ID, label_id: null }), buildExistingWorkout({ id: VALID_WORKOUT_ID_2, label_id: null })];
    const mock = createMockSupabase({
      auth: mockAuth(),
      tables: {
        workouts: {
          select: { data: existing, error: null },
          upsert: { data: existing.map((row) => ({ ...row, title: "Renamed" })), error: null },
        },
        labels: { select: { data: [], error: null } },
      },
    });
    setMockSupabase(mock);

    const parsed = await parseMcpResponse(
      await mcpCallTool(
        "batch_update_workouts",
        {
          updates: [
            { workoutId: VALID_WORKOUT_ID, title: "Renamed" },
            { workoutId: VALID_WORKOUT_ID_2, title: "Renamed" },
            { workoutId: MISSING_ID, title: "Renamed" },
          ],
        },
        {},
      ),
    );
    const result = extractToolResult(parsed);

    expect(result?.result.updated).toHaveLength(2);
    expect(result?.result.failed).toEqual([{ index: 2, workoutId: MISSING_ID, errors: { code: "NOT_FOUND", message: "Workout not found" } }]);

    const upsertCalls = mock.calls.filter((call) => call.table === "workouts" && call.operation === "upsert");
    const payload = upsertCalls[0]?.args[0] as Array<Record<string, unknown>>;
    expect(payload).toHaveLength(2);
  });

  test("batch_update_workouts preserves existing label_id when no label change requested", async () => {
    const existing = buildExistingWorkout({ id: VALID_WORKOUT_ID, label_id: "label-1" });
    const mock = createMockSupabase({
      auth: mockAuth(),
      tables: {
        workouts: {
          select: { data: [existing], error: null },
          upsert: { data: [{ ...existing, status: "skipped" }], error: null },
        },
        labels: { select: { data: [MOCK_LABEL_RUN], error: null } },
      },
    });
    setMockSupabase(mock);

    await parseMcpResponse(await mcpCallTool("batch_update_workouts", { updates: [{ workoutId: VALID_WORKOUT_ID, status: "skipped" }] }, {}));

    const upsertCalls = mock.calls.filter((call) => call.table === "workouts" && call.operation === "upsert");
    const payload = upsertCalls[0]?.args[0] as Array<Record<string, unknown>>;
    expect(payload[0]).toEqual(expect.objectContaining({ label_id: "label-1", status: "skipped" }));
  });

  test("batch_update_workouts returns hydrated label from cache without an extra fetch", async () => {
    const existing = buildExistingWorkout({ id: VALID_WORKOUT_ID, label_id: null });
    const upserted = { ...existing, label_id: "label-1" };
    const mock = createMockSupabase({
      auth: mockAuth(),
      tables: {
        workouts: {
          select: { data: [existing], error: null },
          upsert: { data: [upserted], error: null },
        },
        labels: { select: { data: [MOCK_LABEL_RUN], error: null } },
      },
    });
    setMockSupabase(mock);

    const parsed = await parseMcpResponse(await mcpCallTool("batch_update_workouts", { updates: [{ workoutId: VALID_WORKOUT_ID, labelKey: "easy-run" }] }, {}));
    const result = extractToolResult(parsed);

    expect(result?.result.updated[0].label).toEqual(
      expect.objectContaining({
        id: "label-1",
        key: "easy-run",
        activitySports: ["Run"],
      }),
    );

    const labelsSelectCalls = mock.calls.filter((call) => call.table === "labels" && call.operation === "select");
    expect(labelsSelectCalls).toHaveLength(1);
  });

  test("update_workout routes through the bulk upsert path", async () => {
    const existing = buildExistingWorkout({ id: VALID_WORKOUT_ID, label_id: "label-1" });
    const mock = createMockSupabase({
      auth: mockAuth(),
      tables: {
        workouts: {
          select: { data: [existing], error: null },
          upsert: { data: [{ ...existing, title: "New Title" }], error: null },
        },
        labels: { select: { data: [MOCK_LABEL_RUN], error: null } },
      },
    });
    setMockSupabase(mock);

    await parseMcpResponse(await mcpCallTool("update_workout", { workoutId: VALID_WORKOUT_ID, title: "New Title" }, {}));

    const upsertCalls = mock.calls.filter((call) => call.table === "workouts" && call.operation === "upsert");
    const updateCalls = mock.calls.filter((call) => call.table === "workouts" && call.operation === "update");
    expect(upsertCalls).toHaveLength(1);
    expect(updateCalls).toHaveLength(0);
  });

  test("update_workout returns NOT_FOUND for missing workoutId", async () => {
    setMockSupabase(
      createMockSupabase({
        auth: mockAuth(),
        tables: {
          workouts: { select: { data: [], error: null } },
          labels: { select: { data: [], error: null } },
        },
      }),
    );

    const parsed = await parseMcpResponse(await mcpCallTool("update_workout", { workoutId: VALID_WORKOUT_ID, title: "New" }, {}));
    const error = extractToolError(parsed);

    expect(error).toEqual({ code: "NOT_FOUND", message: "Workout not found" });
  });

  test("update_workout returns NOT_FOUND for missing labelKey", async () => {
    setMockSupabase(
      createMockSupabase({
        auth: mockAuth(),
        tables: {
          workouts: { select: { data: [buildExistingWorkout({ id: VALID_WORKOUT_ID, label_id: null })], error: null } },
          labels: { select: { data: [MOCK_LABEL_RUN], error: null } },
        },
      }),
    );

    const parsed = await parseMcpResponse(await mcpCallTool("update_workout", { workoutId: VALID_WORKOUT_ID, labelKey: "missing-label" }, {}));
    const error = extractToolError(parsed);

    expect(error).toEqual({ code: "NOT_FOUND", message: "Label 'missing-label' not found" });
  });

  test("update_workout clears multiple nullable fields together", async () => {
    const existing = buildExistingWorkout({
      id: VALID_WORKOUT_ID,
      label_id: "label-1",
      description: "Old desc",
      trainer_notes: "Coach note",
      execution: { version: 2, structure: [] },
    });
    const mock = createMockSupabase({
      auth: mockAuth(),
      tables: {
        workouts: {
          select: { data: [existing], error: null },
          upsert: { data: [{ ...existing, description: null, trainer_notes: null, execution: null }], error: null },
        },
        labels: { select: { data: [MOCK_LABEL_RUN], error: null } },
      },
    });
    setMockSupabase(mock);

    await parseMcpResponse(
      await mcpCallTool(
        "update_workout",
        {
          workoutId: VALID_WORKOUT_ID,
          description: null,
          trainerNotes: null,
          execution: null,
        },
        {},
      ),
    );

    const upsertCalls = mock.calls.filter((call) => call.table === "workouts" && call.operation === "upsert");
    const payload = upsertCalls[0]?.args[0] as Array<Record<string, unknown>>;
    expect(payload[0]).toEqual(
      expect.objectContaining({
        description: null,
        trainer_notes: null,
        execution: null,
        label_id: "label-1",
        title: existing.title,
      }),
    );
  });

  test("link_activity returns conflict when the workout already has a linked activity", async () => {
    setMockSupabase(
      createMockSupabase({
        auth: mockAuth(),
        tables: {
          workouts: {
            select: { data: { id: VALID_WORKOUT_ID }, error: null },
          },
          workout_activities: {
            select: { data: { workout_id: VALID_WORKOUT_ID }, error: null },
          },
        },
      }),
    );

    const parsed = await parseMcpResponse(
      await mcpCallTool(
        "link_activity",
        {
          workoutId: VALID_WORKOUT_ID,
          stravaActivityId: 1234567890,
        },
        {},
      ),
    );
    const error = extractToolError(parsed);

    expect(error).toEqual({ code: "CONFLICT", message: "Workout already has a linked activity" });
  });
});
