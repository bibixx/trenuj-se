import { describe, test, expect } from "vitest";
import { resolvePlanId } from "../../server/mcp/context.ts";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { MOCK_USER_ID, MOCK_PLAN_ID, MOCK_TOKEN_ID } from "../helpers/mock-env.ts";
import type { McpContext } from "../../server/mcp/context.ts";

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

function makeCtx(mockSupabase: ReturnType<typeof createMockSupabase>): McpContext {
  return {
    supabase: mockSupabase.client,
    userId: MOCK_USER_ID,
    tokenId: MOCK_TOKEN_ID,
    bindings: {
      SUPABASE_SECRET_KEY: "mock",
    },
  };
}

// ─── resolvePlanId ──────────────────────────────────────────────────────────

describe("resolvePlanId", () => {
  test("with explicit planId — returns the plan for that ID + user", async () => {
    const mock = createMockSupabase({
      tables: {
        plans: { select: { data: MOCK_PLAN, error: null } },
      },
    });
    const ctx = makeCtx(mock);

    const result = await resolvePlanId(ctx, MOCK_PLAN_ID);

    expect(result.id).toBe(MOCK_PLAN_ID);
    expect(result.name).toBe("Test Plan");
  });

  test("with explicit planId — throws NOT_FOUND when plan doesn't exist", async () => {
    const mock = createMockSupabase({
      tables: {
        plans: { select: { data: null, error: null } },
      },
    });
    const ctx = makeCtx(mock);

    await expect(resolvePlanId(ctx, "nonexistent-id")).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Plan not found",
    });
  });

  test("with explicit planId — throws INTERNAL_ERROR on DB error", async () => {
    const mock = createMockSupabase({
      tables: {
        plans: { select: { data: null, error: { message: "connection lost" } } },
      },
    });
    const ctx = makeCtx(mock);

    await expect(resolvePlanId(ctx, MOCK_PLAN_ID)).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
  });

  test("without planId — resolves the active plan for the user", async () => {
    const mock = createMockSupabase({
      tables: {
        plans: { select: { data: MOCK_PLAN, error: null } },
      },
    });
    const ctx = makeCtx(mock);

    const result = await resolvePlanId(ctx);

    expect(result.id).toBe(MOCK_PLAN_ID);
    expect(result.status).toBe("active");
  });

  test("without planId — throws NOT_FOUND when no active plan", async () => {
    const mock = createMockSupabase({
      tables: {
        plans: { select: { data: null, error: null } },
      },
    });
    const ctx = makeCtx(mock);

    await expect(resolvePlanId(ctx)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "No active plan found",
    });
  });

  test("without planId — throws INTERNAL_ERROR on DB error", async () => {
    const mock = createMockSupabase({
      tables: {
        plans: { select: { data: null, error: { message: "timeout" } } },
      },
    });
    const ctx = makeCtx(mock);

    await expect(resolvePlanId(ctx)).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
  });
});
