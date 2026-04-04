import { describe, test, expect, afterEach } from "vitest";
import app from "../../server/index.ts";
import { MOCK_ENV, MOCK_PLAN_ID } from "../helpers/mock-env.ts";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { setMockSupabase, clearMockSupabase } from "../helpers/setup.ts";

const MOCK_SHARE_ID = "share-00000000-0000-0000-0000-000000000001";

const BASE_SHARE = {
  id: MOCK_SHARE_ID,
  plan_id: MOCK_PLAN_ID,
  active: true,
  include_workouts: false,
  include_activities: false,
  include_trainer_notes: false,
  include_plan_notes: false,
};

const MOCK_PLAN = {
  name: "Test Plan",
  goal: "Run a 5K",
  start_date: "2024-01-01",
  end_date: "2024-03-31",
  status: "active",
  color_by: "sport",
  metadata: null,
};

const MOCK_PHASES = [
  {
    id: "phase-1",
    name: "Base",
    description: null,
    start_date: "2024-01-01",
    end_date: "2024-01-31",
    sort_order: 1,
    metadata: null,
  },
];

const MOCK_WORKOUT_TYPES = [{ key: "run", label: "Run", hue: 200, icon: "run", sort_order: 1 }];

const MOCK_WORKOUTS = [
  {
    id: "workout-1",
    phase_id: "phase-1",
    date: "2024-01-15",
    sport: "run",
    category: "easy",
    title: "Easy Run",
    description: "Keep it easy",
    target_duration_min: 45,
    target_distance_m: 8000,
    sort_order: 1,
    status: "planned",
    completion_notes: null,
    metadata: null,
  },
];

const MOCK_PLAN_NOTES = [
  {
    id: "note-1",
    type: "general",
    content: "Remember to rest",
    metadata: null,
    created_at: "2024-01-01T10:00:00Z",
  },
];

type TableConfig = Parameters<typeof createMockSupabase>[0]["tables"];

function buildMock(shareOverrides: Partial<typeof BASE_SHARE> = {}, extraTables: TableConfig = {}) {
  const share = { ...BASE_SHARE, ...shareOverrides };
  return createMockSupabase({
    tables: {
      plan_shares: { select: { data: share, error: null } },
      plans: { select: { data: MOCK_PLAN, error: null } },
      phases: { select: { data: MOCK_PHASES, error: null } },
      workout_types: { select: { data: MOCK_WORKOUT_TYPES, error: null } },
      ...extraTables,
    },
  });
}

describe("GET /api/shares/:shareId", () => {
  afterEach(() => clearMockSupabase());

  test("404 when share is not found (supabase error)", async () => {
    const mock = createMockSupabase({
      tables: {
        plan_shares: { select: { data: null, error: { message: "No rows returned" } } },
      },
    });
    setMockSupabase(mock);

    const res = await app.request(`/api/shares/${MOCK_SHARE_ID}`, {}, MOCK_ENV);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Share not found");
  });

  test("404 when share data is null", async () => {
    const mock = createMockSupabase({
      tables: {
        plan_shares: { select: { data: null, error: null } },
      },
    });
    setMockSupabase(mock);

    const res = await app.request(`/api/shares/${MOCK_SHARE_ID}`, {}, MOCK_ENV);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Share not found");
  });

  test("404 when share is inactive (active: false)", async () => {
    const mock = buildMock({ active: false });
    setMockSupabase(mock);

    const res = await app.request(`/api/shares/${MOCK_SHARE_ID}`, {}, MOCK_ENV);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Share not found");
  });

  test("404 when plan is not found", async () => {
    const mock = createMockSupabase({
      tables: {
        plan_shares: { select: { data: BASE_SHARE, error: null } },
        plans: { select: { data: null, error: { message: "Not found" } } },
      },
    });
    setMockSupabase(mock);

    const res = await app.request(`/api/shares/${MOCK_SHARE_ID}`, {}, MOCK_ENV);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Share not found");
  });

  test("404 when plan data is null", async () => {
    const mock = createMockSupabase({
      tables: {
        plan_shares: { select: { data: BASE_SHARE, error: null } },
        plans: { select: { data: null, error: null } },
        phases: { select: { data: [], error: null } },
        workout_types: { select: { data: [], error: null } },
      },
    });
    setMockSupabase(mock);

    const res = await app.request(`/api/shares/${MOCK_SHARE_ID}`, {}, MOCK_ENV);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Share not found");
  });

  test("200 with basic share (include_workouts: false, include_plan_notes: false)", async () => {
    const mock = buildMock();
    setMockSupabase(mock);

    const res = await app.request(`/api/shares/${MOCK_SHARE_ID}`, {}, MOCK_ENV);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan).toEqual(MOCK_PLAN);
    expect(body.phases).toEqual(MOCK_PHASES);
    expect(body.workoutTypes).toEqual(MOCK_WORKOUT_TYPES);
    expect(body.workouts).toBeNull();
    expect(body.planNotes).toBeNull();
  });

  test("200 with empty phases and workout types", async () => {
    const mock = createMockSupabase({
      tables: {
        plan_shares: { select: { data: BASE_SHARE, error: null } },
        plans: { select: { data: MOCK_PLAN, error: null } },
        phases: { select: { data: [], error: null } },
        workout_types: { select: { data: [], error: null } },
      },
    });
    setMockSupabase(mock);

    const res = await app.request(`/api/shares/${MOCK_SHARE_ID}`, {}, MOCK_ENV);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.phases).toEqual([]);
    expect(body.workoutTypes).toEqual([]);
    expect(body.workouts).toBeNull();
    expect(body.planNotes).toBeNull();
  });

  test("200 with include_workouts: true returns workouts array", async () => {
    const mock = buildMock(
      { include_workouts: true },
      {
        workouts: { select: { data: MOCK_WORKOUTS, error: null } },
      },
    );
    setMockSupabase(mock);

    const res = await app.request(`/api/shares/${MOCK_SHARE_ID}`, {}, MOCK_ENV);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workouts).toEqual(MOCK_WORKOUTS);
    expect(body.planNotes).toBeNull();
  });

  test("200 with include_workouts: true returns empty array when no workouts", async () => {
    const mock = buildMock(
      { include_workouts: true },
      {
        workouts: { select: { data: [], error: null } },
      },
    );
    setMockSupabase(mock);

    const res = await app.request(`/api/shares/${MOCK_SHARE_ID}`, {}, MOCK_ENV);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workouts).toEqual([]);
  });

  test("200 with include_plan_notes: true returns planNotes array", async () => {
    const mock = buildMock(
      { include_plan_notes: true },
      {
        plan_notes: { select: { data: MOCK_PLAN_NOTES, error: null } },
      },
    );
    setMockSupabase(mock);

    const res = await app.request(`/api/shares/${MOCK_SHARE_ID}`, {}, MOCK_ENV);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workouts).toBeNull();
    expect(body.planNotes).toEqual(MOCK_PLAN_NOTES);
  });

  test("200 with include_workouts: true and include_activities: true returns workouts with activities", async () => {
    const workoutsWithActivities = [
      {
        ...MOCK_WORKOUTS[0],
        activity_id: "activity-1",
        activities: {
          id: "activity-1",
          sport: "run",
          name: "Morning Run",
          date: "2024-01-15T07:00:00Z",
          timezone: "America/New_York",
          duration_sec: 2700,
          distance_m: 8050,
          elevation_m: 50,
          avg_hr: 145,
          max_hr: 162,
          avg_power: null,
          calories: 420,
        },
      },
    ];

    const mock = buildMock(
      { include_workouts: true, include_activities: true },
      {
        workouts: { select: { data: workoutsWithActivities, error: null } },
      },
    );
    setMockSupabase(mock);

    const res = await app.request(`/api/shares/${MOCK_SHARE_ID}`, {}, MOCK_ENV);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workouts).toHaveLength(1);
    expect(body.workouts[0].activities).toBeDefined();
    expect(body.workouts[0].activities.sport).toBe("run");
  });

  test("200 with include_workouts: true and include_trainer_notes: true includes trainer_notes field", async () => {
    const workoutsWithTrainerNotes = [{ ...MOCK_WORKOUTS[0], trainer_notes: "Push harder on the last km" }];

    const mock = buildMock(
      { include_workouts: true, include_trainer_notes: true },
      {
        workouts: { select: { data: workoutsWithTrainerNotes, error: null } },
      },
    );
    setMockSupabase(mock);

    const res = await app.request(`/api/shares/${MOCK_SHARE_ID}`, {}, MOCK_ENV);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workouts[0].trainer_notes).toBe("Push harder on the last km");
  });

  test("200 with all includes enabled", async () => {
    const workoutsWithAll = [
      {
        ...MOCK_WORKOUTS[0],
        trainer_notes: "Coach notes here",
        activity_id: "activity-1",
        activities: {
          id: "activity-1",
          sport: "run",
          name: "Morning Run",
          date: "2024-01-15T07:00:00Z",
          timezone: null,
          duration_sec: 2700,
          distance_m: 8050,
          elevation_m: 50,
          avg_hr: 145,
          max_hr: 162,
          avg_power: null,
          calories: 420,
        },
      },
    ];

    const mock = buildMock(
      {
        include_workouts: true,
        include_activities: true,
        include_trainer_notes: true,
        include_plan_notes: true,
      },
      {
        workouts: { select: { data: workoutsWithAll, error: null } },
        plan_notes: { select: { data: MOCK_PLAN_NOTES, error: null } },
      },
    );
    setMockSupabase(mock);

    const res = await app.request(`/api/shares/${MOCK_SHARE_ID}`, {}, MOCK_ENV);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan).toEqual(MOCK_PLAN);
    expect(body.phases).toEqual(MOCK_PHASES);
    expect(body.workoutTypes).toEqual(MOCK_WORKOUT_TYPES);
    expect(body.workouts).toHaveLength(1);
    expect(body.workouts[0].trainer_notes).toBe("Coach notes here");
    expect(body.workouts[0].activities).toBeDefined();
    expect(body.planNotes).toEqual(MOCK_PLAN_NOTES);
  });
});
