import { describe, expect, test } from "vitest";
import { describeScopes } from "../../src/lib/oauth-scopes.ts";

describe("describeScopes", () => {
  test("returns an empty list for empty or whitespace-only scope strings", () => {
    expect(describeScopes("")).toEqual([]);
    expect(describeScopes("   ")).toEqual([]);
  });

  test("labels known Supabase identity scopes", () => {
    expect(describeScopes("openid email")).toEqual([
      { scope: "openid", label: "Confirm your identity" },
      { scope: "email", label: "View your email address" },
    ]);
  });

  test("falls back to a null label for unknown scopes", () => {
    expect(describeScopes("email custom:thing")).toEqual([
      { scope: "email", label: "View your email address" },
      { scope: "custom:thing", label: null },
    ]);
  });
});
