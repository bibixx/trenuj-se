import { afterEach, describe, expect, test, vi } from "vitest";
import app from "../../server/index.ts";
import { MOCK_ENV, MOCK_PLAN_ID } from "../helpers/mock-env.ts";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { clearMockSupabase, setMockSupabase } from "../helpers/setup.ts";

const MOCK_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

vi.mock("../../server/lib/og-image.ts", () => ({
  renderOgImage: vi.fn(async () => MOCK_PNG),
}));

const MOCK_SHARE_ID = "share-00000000-0000-0000-0000-000000000001";

const BASE_SHARE = {
  plan_id: MOCK_PLAN_ID,
  active: true,
};

const MOCK_PLAN = {
  name: "Test Plan",
  goal: "Run a 5K",
  start_date: "2024-01-01",
  end_date: "2024-03-31",
};

const MOCK_PHASES = [{ name: "Base", start_date: "2024-01-01", end_date: "2024-01-31" }];
const MOCK_LABELS = [{ label: "Easy Run" }];

function buildMock(shareOverrides: Partial<typeof BASE_SHARE> = {}) {
  return createMockSupabase({
    tables: {
      plan_shares: { select: { data: { ...BASE_SHARE, ...shareOverrides }, error: null } },
      plans: { select: { data: MOCK_PLAN, error: null } },
      phases: { select: { data: MOCK_PHASES, error: null } },
      labels: { select: { data: MOCK_LABELS, error: null } },
      workouts: { select: { data: [], error: null, count: 12 } },
    },
  });
}

describe("GET /api/og/:shareId", () => {
  afterEach(() => clearMockSupabase());

  test("returns a PNG image with correct headers", async () => {
    setMockSupabase(buildMock());

    const res = await app.request(`/api/og/${MOCK_SHARE_ID}`, {}, MOCK_ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600, s-maxage=3600");

    const body = new Uint8Array(await res.arrayBuffer());
    expect(body).toEqual(MOCK_PNG);
  });

  test("returns 404 when the share is inactive", async () => {
    setMockSupabase(buildMock({ active: false }));

    const res = await app.request(`/api/og/${MOCK_SHARE_ID}`, {}, MOCK_ENV);
    expect(res.status).toBe(404);
  });

  test("returns 404 when the share does not exist", async () => {
    setMockSupabase(
      createMockSupabase({
        tables: {
          plan_shares: { select: { data: null, error: { message: "Not found" } } },
        },
      }),
    );

    const res = await app.request(`/api/og/${MOCK_SHARE_ID}`, {}, MOCK_ENV);
    expect(res.status).toBe(404);
  });

  test("returns 404 when the plan does not exist", async () => {
    setMockSupabase(
      createMockSupabase({
        tables: {
          plan_shares: { select: { data: BASE_SHARE, error: null } },
          plans: { select: { data: null, error: { message: "Not found" } } },
        },
      }),
    );

    const res = await app.request(`/api/og/${MOCK_SHARE_ID}`, {}, MOCK_ENV);
    expect(res.status).toBe(404);
  });
});
