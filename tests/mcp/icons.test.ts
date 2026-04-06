import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { clearMockSupabase, setMockSupabase } from "../helpers/setup.ts";
import { MOCK_TOKEN_ID, MOCK_USER_ID } from "../helpers/mock-env.ts";
import { extractToolResult, mcpCallTool, parseMcpResponse, resetMcpIds } from "../helpers/mcp.ts";

const TEST_TOKEN = "tp_abc123testtoken";

function authTokenTables() {
  return {
    api_tokens: {
      select: { data: { id: MOCK_TOKEN_ID, user_id: MOCK_USER_ID }, error: null },
      update: { data: null, error: null },
    },
  };
}

describe("MCP Icon Tools", () => {
  beforeEach(() => resetMcpIds());
  afterEach(() => clearMockSupabase());

  function setup() {
    setMockSupabase(createMockSupabase({ tables: authTokenTables() }));
  }

  test("search_icons returns results matching icon name", async () => {
    setup();
    const parsed = await parseMcpResponse(await mcpCallTool("search_icons", { query: "run" }, { token: TEST_TOKEN }));
    const data = extractToolResult<{ total: number; icons: Array<{ name: string; category: string; tags: string[] }> }>(parsed);

    expect(data).not.toBeNull();
    expect(data!.result.icons.length).toBeGreaterThan(0);
    expect(data!.result.icons[0]!.name).toBe("run");
  });

  test("search_icons returns results matching tag", async () => {
    setup();
    const parsed = await parseMcpResponse(await mcpCallTool("search_icons", { query: "cycling" }, { token: TEST_TOKEN }));
    const data = extractToolResult<{ total: number; icons: Array<{ name: string; category: string; tags: string[] }> }>(parsed);

    expect(data).not.toBeNull();
    const names = data!.result.icons.map((i) => i.name);
    expect(names).toContain("bike");
  });

  test("search_icons respects limit parameter", async () => {
    setup();
    const parsed = await parseMcpResponse(await mcpCallTool("search_icons", { query: "a", limit: 3 }, { token: TEST_TOKEN }));
    const data = extractToolResult<{ total: number; icons: Array<{ name: string }> }>(parsed);

    expect(data).not.toBeNull();
    expect(data!.result.icons.length).toBeLessThanOrEqual(3);
  });

  test("search_icons returns empty for nonsense query", async () => {
    setup();
    const parsed = await parseMcpResponse(await mcpCallTool("search_icons", { query: "xyzzyplugh" }, { token: TEST_TOKEN }));
    const data = extractToolResult<{ total: number; icons: Array<{ name: string }> }>(parsed);

    expect(data).not.toBeNull();
    expect(data!.result.icons).toHaveLength(0);
  });

  test("search_icons rejects empty query", async () => {
    setup();
    const parsed = await parseMcpResponse(await mcpCallTool("search_icons", { query: "" }, { token: TEST_TOKEN }));

    // Empty string fails Zod's min(1) — SDK returns isError response
    const result = parsed.result as Record<string, unknown> | undefined;
    expect(result?.isError).toBe(true);
  });
});
