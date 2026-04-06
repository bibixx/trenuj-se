import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createMockSupabase } from "../helpers/mock-supabase.ts";
import { setMockSupabase, clearMockSupabase } from "../helpers/setup.ts";
import { MOCK_TOKEN_ID, MOCK_USER_ID, MOCK_PLAN_ID, MOCK_NOTE_ID } from "../helpers/mock-env.ts";
import { mcpCallTool, parseMcpResponse, extractToolResult, extractToolError, resetMcpIds } from "../helpers/mcp.ts";

const TEST_TOKEN = "tp_abc123testtoken";

// Valid UUID v4s used as tool arguments (must pass Zod uuid validation)
const VALID_PLAN_ID = "a0000000-0000-4000-8000-000000000010";
const VALID_NOTE_ID = "a0000000-0000-4000-8000-000000000060";
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

const MOCK_NOTE = {
  id: MOCK_NOTE_ID,
  plan_id: MOCK_PLAN_ID,
  type: "note",
  content: "This is a test note",
  metadata: null,
  created_at: "2024-01-15T00:00:00Z",
  updated_at: "2024-01-15T00:00:00Z",
};

function authTokenTables() {
  return {
    api_tokens: {
      select: { data: { id: MOCK_TOKEN_ID, user_id: MOCK_USER_ID }, error: null },
      update: { data: null, error: null },
    },
  };
}

describe("MCP Note Tools", () => {
  beforeEach(() => {
    resetMcpIds();
  });

  afterEach(() => {
    clearMockSupabase();
  });

  // ─── add_plan_note ────────────────────────────────────────────────────────

  describe("add_plan_note", () => {
    test("adds a note with type and content", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          plan_notes: {
            insert: { data: MOCK_NOTE, error: null },
            select: { data: MOCK_NOTE, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool(
        "add_plan_note",
        {
          planId: VALID_PLAN_ID,
          type: "note",
          content: "This is a test note",
        },
        { token: TEST_TOKEN },
      );
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result).toBeDefined();
      expect(result?.result.type).toBe("note");
      expect(result?.result.content).toBe("This is a test note");
    });

    test("adds a summary note for active plan", async () => {
      const summaryNote = { ...MOCK_NOTE, id: MOCK_NOTE_ID, type: "summary", content: "Week 1 summary" };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          plan_notes: {
            insert: { data: summaryNote, error: null },
            select: { data: summaryNote, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool(
        "add_plan_note",
        {
          type: "summary",
          content: "Week 1 summary",
        },
        { token: TEST_TOKEN },
      );
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.type).toBe("summary");
    });

    test("adds a recommendation note", async () => {
      const recNote = { ...MOCK_NOTE, type: "recommendation", content: "Consider adding more rest days" };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          plan_notes: {
            insert: { data: recNote, error: null },
            select: { data: recNote, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool(
        "add_plan_note",
        {
          type: "recommendation",
          content: "Consider adding more rest days",
        },
        { token: TEST_TOKEN },
      );
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.type).toBe("recommendation");
    });

    test("adds an adjustment note with metadata", async () => {
      const adjNote = { ...MOCK_NOTE, type: "adjustment", content: "Reduced volume", metadata: { reason: "fatigue" } };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          plan_notes: {
            insert: { data: adjNote, error: null },
            select: { data: adjNote, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool(
        "add_plan_note",
        {
          type: "adjustment",
          content: "Reduced volume",
          metadata: { reason: "fatigue" },
        },
        { token: TEST_TOKEN },
      );
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.type).toBe("adjustment");
    });

    test("adds a note with numeric week metadata", async () => {
      const note = { ...MOCK_NOTE, metadata: { week: 5, source: "coach" } };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          plan_notes: {
            insert: { data: note, error: null },
            select: { data: note, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool(
        "add_plan_note",
        {
          type: "note",
          content: "Week note",
          metadata: { week: 5, source: "coach" },
        },
        { token: TEST_TOKEN },
      );
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.metadata).toEqual({ week: 5, source: "coach" });
    });

    test("rejects add metadata when week is invalid", async () => {
      setMockSupabase(createMockSupabase({ tables: { ...authTokenTables() } }));

      const res = await mcpCallTool(
        "add_plan_note",
        {
          type: "note",
          content: "Broken week",
          metadata: { week: false },
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
        "add_plan_note",
        {
          planId: VALID_MISSING_ID,
          type: "note",
          content: "Note for ghost plan",
        },
        { token: TEST_TOKEN },
      );
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("NOT_FOUND");
    });

    test("returns error when insert fails", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          plan_notes: {
            insert: { data: null, error: { message: "insert failed" } },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool(
        "add_plan_note",
        {
          type: "note",
          content: "Failing note",
        },
        { token: TEST_TOKEN },
      );
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("INTERNAL_ERROR");
    });
  });

  // ─── update_plan_note ─────────────────────────────────────────────────────

  describe("update_plan_note", () => {
    test("updates note content", async () => {
      const updatedNote = { ...MOCK_NOTE, content: "Updated note content" };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plan_notes: {
            update: { data: updatedNote, error: null },
            select: { data: updatedNote, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("update_plan_note", { noteId: VALID_NOTE_ID, content: "Updated note content" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.content).toBe("Updated note content");
    });

    test("updates note type", async () => {
      const updatedNote = { ...MOCK_NOTE, type: "adjustment" };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plan_notes: {
            update: { data: updatedNote, error: null },
            select: { data: updatedNote, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("update_plan_note", { noteId: VALID_NOTE_ID, type: "adjustment" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.type).toBe("adjustment");
    });

    test("updates note metadata", async () => {
      const updatedNote = { ...MOCK_NOTE, metadata: { week: 5 } };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plan_notes: {
            update: { data: updatedNote, error: null },
            select: { data: updatedNote, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("update_plan_note", { noteId: VALID_NOTE_ID, metadata: { week: 5 } }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.metadata).toEqual({ week: 5 });
    });

    test("updates note metadata with legacy ISO week", async () => {
      const updatedNote = { ...MOCK_NOTE, metadata: { week: "2026-W15", source: "migration" } };
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plan_notes: {
            update: { data: updatedNote, error: null },
            select: { data: updatedNote, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("update_plan_note", { noteId: VALID_NOTE_ID, metadata: { week: "2026-W15", source: "migration" } }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.metadata).toEqual({ week: "2026-W15", source: "migration" });
    });

    test("rejects update metadata when week is invalid", async () => {
      setMockSupabase(createMockSupabase({ tables: { ...authTokenTables() } }));

      const res = await mcpCallTool("update_plan_note", { noteId: VALID_NOTE_ID, metadata: { week: 0 } }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("VALIDATION_ERROR");
    });

    test("returns NOT_FOUND when note does not exist", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plan_notes: {
            update: { data: null, error: null },
            select: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("update_plan_note", { noteId: VALID_MISSING_ID, content: "Ghost note" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("NOT_FOUND");
    });

    test("returns INTERNAL_ERROR on supabase error", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plan_notes: {
            update: { data: null, error: { message: "DB error" } },
            select: { data: null, error: { message: "DB error" } },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("update_plan_note", { noteId: VALID_NOTE_ID, content: "Failing update" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("INTERNAL_ERROR");
    });
  });

  // ─── delete_plan_note ─────────────────────────────────────────────────────

  describe("delete_plan_note", () => {
    test("deletes a note by id", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plan_notes: {
            delete: { data: null, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("delete_plan_note", { noteId: VALID_NOTE_ID }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result.deleted).toBe(true);
      expect(result?.result.noteId).toBe(VALID_NOTE_ID);
    });

    test("returns error when delete fails", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plan_notes: {
            delete: { data: null, error: { message: "Cannot delete note" } },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("delete_plan_note", { noteId: VALID_NOTE_ID }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("INTERNAL_ERROR");
    });
  });

  // ─── get_plan_notes ───────────────────────────────────────────────────────

  describe("get_plan_notes", () => {
    test("returns all notes for the active plan", async () => {
      const notes = [MOCK_NOTE, { ...MOCK_NOTE, id: MOCK_NOTE_ID, type: "summary", content: "Week summary" }];
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          plan_notes: {
            select: { data: notes, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_plan_notes", {}, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult<unknown[]>(parsed);

      expect(result?.result).toBeInstanceOf(Array);
      expect(result?.result).toHaveLength(2);
    });

    test("filters notes by type", async () => {
      const summaryNotes = [{ ...MOCK_NOTE, type: "summary", content: "Week 1 summary" }];
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          plan_notes: {
            select: { data: summaryNotes, error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_plan_notes", { type: "summary" }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result).toBeInstanceOf(Array);
    });

    test("returns notes for explicit planId", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          plan_notes: {
            select: { data: [MOCK_NOTE], error: null },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_plan_notes", { planId: VALID_PLAN_ID }, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const result = extractToolResult(parsed);

      expect(result?.result).toBeInstanceOf(Array);
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

      const res = await mcpCallTool("get_plan_notes", {}, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("NOT_FOUND");
    });

    test("returns error when select fails", async () => {
      const mock = createMockSupabase({
        tables: {
          ...authTokenTables(),
          plans: {
            select: { data: MOCK_PLAN, error: null },
          },
          plan_notes: {
            select: { data: null, error: { message: "Query error" } },
          },
        },
      });
      setMockSupabase(mock);

      const res = await mcpCallTool("get_plan_notes", {}, { token: TEST_TOKEN });
      const parsed = await parseMcpResponse(res);
      const err = extractToolError(parsed);

      expect(err?.code).toBe("INTERNAL_ERROR");
    });
  });
});
