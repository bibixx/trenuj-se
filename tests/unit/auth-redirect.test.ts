import { describe, expect, test } from "vitest";
import { buildReturnTo, getPostAuthRedirect, parseAuthRouteSearch, sanitizeReturnTo } from "../../src/lib/auth-redirect.ts";

describe("sanitizeReturnTo", () => {
  test("accepts relative in-app paths with query and hash", () => {
    expect(sanitizeReturnTo("/oauth/consent?authorization_id=abc#step-1")).toBe("/oauth/consent?authorization_id=abc#step-1");
  });

  test("rejects external absolute urls", () => {
    expect(sanitizeReturnTo("https://evil.example/steal")).toBeUndefined();
  });

  test("rejects protocol-relative urls", () => {
    expect(sanitizeReturnTo("//evil.example/steal")).toBeUndefined();
  });

  test("rejects empty and non-string values", () => {
    expect(sanitizeReturnTo("")).toBeUndefined();
    expect(sanitizeReturnTo("   ")).toBeUndefined();
    expect(sanitizeReturnTo(null)).toBeUndefined();
  });
});

describe("getPostAuthRedirect", () => {
  test("falls back to the home page when returnTo is missing or unsafe", () => {
    expect(getPostAuthRedirect(undefined)).toBe("/");
    expect(getPostAuthRedirect("https://evil.example/steal")).toBe("/");
  });

  test("returns a sanitized in-app return target", () => {
    expect(getPostAuthRedirect("/oauth/consent?authorization_id=abc")).toBe("/oauth/consent?authorization_id=abc");
  });
});

describe("buildReturnTo", () => {
  test("preserves pathname, query, and hash", () => {
    expect(buildReturnTo("/oauth/consent", "?authorization_id=abc", "#details")).toBe("/oauth/consent?authorization_id=abc#details");
  });
});

describe("parseAuthRouteSearch", () => {
  test("extracts email and a safe returnTo", () => {
    expect(parseAuthRouteSearch({ email: "bartek@example.com", returnTo: "/oauth/consent?authorization_id=abc" })).toEqual({
      email: "bartek@example.com",
      returnTo: "/oauth/consent?authorization_id=abc",
    });
  });

  test("drops unsafe returnTo values", () => {
    expect(parseAuthRouteSearch({ email: "bartek@example.com", returnTo: "https://evil.example/steal" })).toEqual({
      email: "bartek@example.com",
      returnTo: undefined,
    });
  });
});
