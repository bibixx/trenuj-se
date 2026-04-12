import { vi } from "vitest";
import type { MockSupabase } from "./mock-supabase.ts";

// Shared mutable state — each test sets this before making requests
export let currentMockSupabase: MockSupabase["client"] | null = null;

export function setMockSupabase(mock: MockSupabase) {
  currentMockSupabase = mock.client;
}

export function clearMockSupabase() {
  currentMockSupabase = null;
}

vi.mock("../../server/lib/supabase.ts", () => ({
  createServerSupabase: vi.fn(() => {
    if (!currentMockSupabase) {
      throw new Error("Test error: currentMockSupabase not set. Call setMockSupabase() before making requests.");
    }
    return currentMockSupabase;
  }),
  getSupabaseUrl: vi.fn(() => "http://mock.supabase.local"),
}));
