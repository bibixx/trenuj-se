import { afterEach, describe, expect, test } from "vitest";
import app from "../../server/index.ts";
import { MOCK_ENV, MOCK_PLAN_ID } from "../helpers/mock-env.ts";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { clearMockSupabase, setMockSupabase } from "../helpers/setup.ts";

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

const MOCK_LABELS = [
  { id: "label-1", key: "easy-run", label: "Easy Run", hue: 200, icon: "run", metadata: null, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" },
];
const MOCK_LABEL_ACTIVITY_SPORTS = [{ label_id: "label-1", activity_sport: "Run" }];

function buildMock(shareOverrides: Partial<typeof BASE_SHARE> = {}, extraTables: Parameters<typeof createMockSupabase>[0]["tables"] = {}) {
  return createMockSupabase({
    tables: {
      plan_shares: { select: { data: { ...BASE_SHARE, ...shareOverrides }, error: null } },
      plans: { select: { data: MOCK_PLAN, error: null } },
      phases: { select: { data: MOCK_PHASES, error: null } },
      labels: { select: { data: MOCK_LABELS, error: null } },
      label_activity_sports: { select: { data: MOCK_LABEL_ACTIVITY_SPORTS, error: null } },
      ...extraTables,
    },
  });
}

describe("GET /api/shares/:shareId", () => {
  afterEach(() => clearMockSupabase());

  test("returns labels alongside the shared plan", async () => {
    setMockSupabase(buildMock());

    const res = await app.request(`/api/shares/${MOCK_SHARE_ID}`, {}, MOCK_ENV);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.plan).toEqual(MOCK_PLAN);
    expect(body.phases).toEqual(MOCK_PHASES);
    expect(body.labels).toEqual([{ ...MOCK_LABELS[0], activitySports: ["Run"] }]);
    expect(body.workouts).toBeNull();
  });

  test("returns workouts with inline labels when share includes workouts", async () => {
    setMockSupabase(
      buildMock(
        { include_workouts: true },
        {
          workouts: {
            select: {
              data: [
                {
                  id: "workout-1",
                  phase_id: "phase-1",
                  label_id: "label-1",
                  date: "2024-01-15",
                  title: "Easy Run",
                  description: "Keep it easy",
                  target_duration_min: 45,
                  target_distance_m: 8000,
                  sort_order: 1,
                  status: "planned",
                  completion_notes: null,
                  execution: null,
                  metadata: null,
                },
              ],
              error: null,
            },
          },
        },
      ),
    );

    const res = await app.request(`/api/shares/${MOCK_SHARE_ID}`, {}, MOCK_ENV);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.workouts).toEqual([
      {
        id: "workout-1",
        phase_id: "phase-1",
        label_id: "label-1",
        date: "2024-01-15",
        title: "Easy Run",
        description: "Keep it easy",
        target_duration_min: 45,
        target_distance_m: 8000,
        sort_order: 1,
        status: "planned",
        completion_notes: null,
        execution: null,
        metadata: null,
        label: { ...MOCK_LABELS[0], activitySports: ["Run"] },
      },
    ]);
  });

  test("returns 404 when the share is inactive", async () => {
    setMockSupabase(buildMock({ active: false }));

    const res = await app.request(`/api/shares/${MOCK_SHARE_ID}`, {}, MOCK_ENV);
    expect(res.status).toBe(404);
  });
});
