import { describe, expect, test } from "vitest";
import { initialAuthState, parseStoredSession } from "../../src/lib/auth-session.ts";

const validSession = JSON.stringify({
  access_token: "token-123",
  user: { id: "user-1", email: "bartek@example.com" },
});

describe("parseStoredSession", () => {
  test("parses a valid stored session", () => {
    const result = parseStoredSession(validSession);
    expect(result?.user.id).toBe("user-1");
    expect(result?.session.access_token).toBe("token-123");
  });

  test("returns null for missing, garbage, or incomplete data", () => {
    expect(parseStoredSession(null)).toBeNull();
    expect(parseStoredSession("not json")).toBeNull();
    expect(parseStoredSession(JSON.stringify({ user: { id: "user-1" } }))).toBeNull();
    expect(parseStoredSession(JSON.stringify({ access_token: "token-123" }))).toBeNull();
  });
});

describe("initialAuthState", () => {
  test("cached session hydrates synchronously without loading", () => {
    const state = initialAuthState(validSession);
    expect(state.user?.id).toBe("user-1");
    expect(state.loading).toBe(false);
  });

  test("no cached session starts in loading until supabase resolves", () => {
    expect(initialAuthState(null)).toEqual({ user: null, session: null, loading: true });
    expect(initialAuthState("garbage")).toEqual({ user: null, session: null, loading: true });
  });
});
